import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { API_BASE_URL } from '../api/config';
import { useAuth } from '../auth/AuthProvider';

/** The four server-pushed events (see backend realtime/README.md). */
export type RealtimeEvent =
  | 'order.awaiting'
  | 'order.transitioned'
  | 'delivery.assigned'
  /** A delivery came back off its driver — it belongs in the unassigned column again. */
  | 'delivery.unassigned'
  | 'driver.location'
  /**
   * A driver went on or off shift, stepped away, took a job or finished one.
   *
   * It is what turns the driver picker from a snapshot into a live list: a
   * counter reading "no drivers on shift" learns that somebody has started
   * theirs, instead of having to close and reopen the dialog to find out.
   */
  | 'driver.status';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type Handler = (payload: unknown) => void;

interface RealtimeContextValue {
  status: ConnectionStatus;
  /** Subscribe to one server event. Returns an unsubscribe function. */
  subscribe: (event: RealtimeEvent, handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** The API base is `<origin>/api/v1`; the socket lives at `<origin>` path `/realtime`. */
function socketOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return window.location.origin;
  }
}

/**
 * Owns a single authenticated socket.io connection for the staff session and
 * fans server events out to any subscribed component. Auth mirrors HTTP: the
 * access token rides in the handshake, resolved fresh on every (re)connect, so
 * a rotated or revoked token is honoured. Emission is one-directional — the
 * client only listens; every write still goes through the REST choke points.
 *
 * This replaces the per-page polling loops: pages subscribe to the events they
 * care about and reload on them, and also catch up on `connect` (covering any
 * event missed while briefly disconnected).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');
    const socket = io(socketOrigin(), {
      path: '/realtime',
      transports: ['websocket', 'polling'],
      // Re-read the token on every (re)connect so a refreshed token is used.
      auth: (cb) => {
        const raw = localStorage.getItem('rami.admin.tokens');
        const token = raw ? (JSON.parse(raw) as { accessToken?: string }).accessToken : undefined;
        cb({ token: token ?? '' });
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('disconnected'));
    // The server disconnects an unauthorised socket after emitting this.
    socket.on('unauthorized', () => setStatus('disconnected'));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      subscribe: (event, handler) => {
        const socket = socketRef.current;
        if (!socket) return () => undefined;
        socket.on(event, handler);
        return () => {
          socket.off(event, handler);
        };
      },
    }),
    // `status` is included so a subscribe made before connect re-binds once the
    // socket exists (the effect recreates the socket, but ref stays current).
    [status],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return ctx;
}

/**
 * Subscribe to one or more realtime events and run `onEvent` when any fires,
 * plus once on (re)connect to catch up on anything missed. Intended to drive a
 * list `reload()`.
 */
export function useRealtimeReload(events: RealtimeEvent[], onEvent: () => void): ConnectionStatus {
  const { status, subscribe } = useRealtime();
  const cb = useRef(onEvent);
  cb.current = onEvent;

  // Bind/unbind the event listeners. `status` in deps re-binds after the socket
  // is (re)created so the listeners attach to the live socket.
  useEffect(() => {
    const unsubs = events.map((e) => subscribe(e, () => cb.current()));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, status, events.join(',')]);

  // Catch up once whenever we (re)connect.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (status === 'connected' && !wasConnected.current) {
      wasConnected.current = true;
      cb.current();
    } else if (status !== 'connected') {
      wasConnected.current = false;
    }
  }, [status]);

  return status;
}
