import { describe, expect, it } from 'vitest';

import { ApiClient, ApiError, joinUrl, parseApiError } from './http';

describe('joinUrl', () => {
  it('joins base and path with a single slash', () => {
    expect(joinUrl('https://api.test', 'branches')).toBe('https://api.test/branches');
    expect(joinUrl('https://api.test/', '/branches')).toBe('https://api.test/branches');
    expect(joinUrl('https://api.test///', '///branches')).toBe('https://api.test/branches');
  });

  it('keeps interior slashes untouched', () => {
    expect(joinUrl('https://api.test', 'branches/abc/settings')).toBe('https://api.test/branches/abc/settings');
  });
});

describe('parseApiError', () => {
  it('passes through the backend error envelope', () => {
    const shape = parseApiError(400, { statusCode: 400, code: 'VALIDATION', message: 'Bad input', details: ['x'] });
    expect(shape).toEqual({ statusCode: 400, code: 'VALIDATION', message: 'Bad input', details: ['x'] });
  });

  it('falls back to a generic 5xx code and hides the raw message', () => {
    const shape = parseApiError(500, '<html>crash</html>');
    expect(shape.code).toBe('INTERNAL_ERROR');
    expect(shape.statusCode).toBe(500);
    expect(shape.message).not.toContain('crash');
  });

  it('falls back for a non-envelope 4xx body', () => {
    const shape = parseApiError(404, undefined);
    expect(shape.code).toBe('REQUEST_FAILED');
    expect(shape.statusCode).toBe(404);
  });

  it('uses the outer status when the envelope omits statusCode', () => {
    const shape = parseApiError(403, { code: 'FORBIDDEN', message: 'No' });
    expect(shape.statusCode).toBe(403);
    expect(shape.code).toBe('FORBIDDEN');
  });
});

/**
 * The failure message must not invent a cause.
 *
 * A browser deliberately hides why a cross-origin request was blocked, so a
 * CORS rejection is indistinguishable from an outage here. The old message
 * guessed "check your internet connection" for both — which sent someone to
 * look at their router while the real fault was one unset server variable.
 */
describe("network failure messages", () => {
  const online = globalThis.navigator?.onLine;
  afterEach(() => {
    if (online !== undefined) {
      Object.defineProperty(globalThis.navigator, "onLine", {
        value: online,
        configurable: true,
      });
    }
  });

  async function messageFor(err: Error, base = "https://api.example.test/api/v1") {
    const failing = () => Promise.reject(err);
    const original = globalThis.fetch;
    globalThis.fetch = failing as unknown as typeof fetch;
    try {
      const client = new ApiClient(base, () => null, () => {});
      await client.request("/auth/login", { method: "POST", body: {} });
      throw new Error("expected the request to reject");
    } catch (e) {
      return (e as ApiError).message;
    } finally {
      globalThis.fetch = original;
    }
  }

  it("names the host it could not reach", async () => {
    const msg = await messageFor(new TypeError("Failed to fetch"));
    // A wrong VITE_API_BASE_URL is otherwise invisible — it looks exactly like
    // an outage until someone opens devtools.
    expect(msg).toContain("api.example.test");
  });

  it("does not blame the user's connection when it cannot know", async () => {
    const msg = await messageFor(new TypeError("Failed to fetch"));
    expect(msg).not.toMatch(/check your internet/i);
    // Both real possibilities are named, and neither is asserted.
    expect(msg).toMatch(/CORS/);
    expect(msg).toMatch(/down/);
  });

  it("says so plainly when the browser reports being offline", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const msg = await messageFor(new TypeError("Failed to fetch"));
    expect(msg).toMatch(/offline/i);
  });

  it("distinguishes a timeout, which is a different fix", async () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const msg = await messageFor(abort);
    expect(msg).toMatch(/too long/i);
    expect(msg).toContain("api.example.test");
  });
});
