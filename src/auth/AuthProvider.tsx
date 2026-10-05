import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { API_BASE_URL } from '../api/config';
import { Api } from '../api/endpoints';
import { ApiClient } from '../api/http';
import { CurrentActor } from '../api/types';

const TOKEN_KEY = 'rami.admin.tokens';

interface Stored {
  accessToken: string;
  refreshToken: string;
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  api: Api;
  isAuthenticated: boolean;
  /** Null while `/auth/me` is loading, then the resolved actor. */
  actor: CurrentActor | null;
  isOwner: boolean;
  isBranchAdmin: boolean;
  hasRole: (role: string) => boolean;
  hasPermission: (code: string) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the staff session (token in localStorage), the single Api instance and
 * the current actor (loaded from /auth/me). The actor tells the nav which
 * links to render — role-based UI on top of the backend's role-based data
 * enforcement.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [tokens, setTokens] = useState<Stored | null>(() => load());
  const [actor, setActor] = useState<CurrentActor | null>(null);

  const persist = useCallback((next: Stored | null): void => {
    setTokens(next);
    if (next) {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setActor(null);
    }
  }, []);

  const api = useMemo(() => {
    const client = new ApiClient(
      API_BASE_URL,
      () => load()?.accessToken ?? null,
      () => persist(null),
    );
    return new Api(client);
  }, [persist]);

  // Load /auth/me whenever the token appears (fresh login or reload).
  useEffect(() => {
    if (!tokens) {
      setActor(null);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((a) => {
        if (!cancelled) setActor(a);
      })
      .catch(() => {
        // 401 already clears the token via ApiClient.onUnauthorized.
      });
    return () => {
      cancelled = true;
    };
  }, [api, tokens]);

  const value = useMemo<AuthContextValue>(() => {
    const roles = actor?.roles ?? [];
    const permissions = actor?.permissions ?? [];
    return {
      api,
      isAuthenticated: !!tokens,
      actor,
      isOwner: roles.includes('OWNER'),
      isBranchAdmin: roles.includes('BRANCH_ADMIN'),
      hasRole: (role) => roles.includes(role),
      hasPermission: (code) => permissions.includes(code),
      signIn: async (email, password) => {
        const t = await api.login(email, password);
        persist(t);
      },
      /**
       * Ends the session on the server, then locally.
       *
       * Dropping the token locally is not signing out: the refresh token stays
       * valid for its full lifetime, so the next person at this machine could
       * resume the session. The local clear happens regardless of the result —
       * signing out must never fail because the network did.
       */
      signOut: async () => {
        const refreshToken = tokens?.refreshToken;
        if (refreshToken) {
          try {
            await api.logout(refreshToken);
          } catch {
            // Already expired, revoked, or offline. Nothing more to do here.
          }
        }
        persist(null);
      },
    };
  }, [api, tokens, actor, persist]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
