/**
 * The API HTTP layer for the admin web app.
 *
 * Pure helpers (`joinUrl`, `parseApiError`) are unit-tested; `ApiClient` wraps
 * `fetch` with the base URL, bearer token and the backend's single error
 * envelope, so pages branch on a stable `code`, never a raw message.
 */
export interface ApiErrorShape {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: string[];
  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.statusCode = shape.statusCode;
    this.code = shape.code;
    this.details = shape.details;
  }
  get isNetwork(): boolean {
    return this.code === "NETWORK";
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function parseApiError(status: number, body: unknown): ApiErrorShape {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.code === "string" && typeof b.message === "string") {
      return {
        statusCode: typeof b.statusCode === "number" ? b.statusCode : status,
        code: b.code,
        message: b.message,
        details: Array.isArray(b.details) ? (b.details as string[]) : undefined,
      };
    }
  }
  return {
    statusCode: status,
    code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
    message: "Something went wrong. Please try again.",
  };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  public?: boolean;
}

/**
 * How long to wait for the API before giving up.
 *
 * Without a deadline a hung connection leaves the screen spinning for ever
 * with no error and no retry — `fetch` has no timeout of its own, so the
 * request simply never settles. 15 seconds is longer than any healthy call
 * here and short enough that a person has not yet decided the app is broken.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Longer, for a photo: see `ApiClient.upload`. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Runs `fetch` with a deadline, and reports a timeout as the same NETWORK
 * failure every screen already handles — "no connection" is what a request
 * that never answered means to the person waiting.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
    private readonly onUnauthorized: () => void,
  ) {}

/**
   * Sends one file as `multipart/form-data`.
   *
   * Separate from `request` for two reasons that both bite if you reuse it.
   * The browser must set `Content-Type` itself — it appends the multipart
   * boundary, and a hand-set header produces a body the server cannot parse.
   * And the deadline is longer: 15 seconds is generous for JSON and mean for a
   * six-megabyte photo on a branch's uplink, where a timeout means the owner
   * re-picks the same file and waits again.
   */
  async upload<T>(path: string, file: File, field = "file"): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const form = new FormData();
    form.append(field, file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    const url = joinUrl(this.baseUrl, path);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: form,
        signal: controller.signal,
      });
    } catch (e) {
      // The same honest diagnosis the JSON path gives. A `fetch` throw here is
      // not proof the owner's connection is bad — on the deployed build it is
      // most often the API being unreachable or refusing this origin (CORS),
      // or the request taking too long. Telling an owner on a working
      // connection to "check your network" sends them to fix the wrong thing;
      // this names the host and points at the real causes.
      throw new ApiError({
        statusCode: 0,
        code: "NETWORK",
        message: networkErrorMessage(e, url),
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json: unknown = text ? safeParse(text) : undefined;
    if (!res.ok) {
      throw new ApiError(parseApiError(res.status, json));
    }
    return json as T;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const token = options.public ? null : this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = joinUrl(this.baseUrl, path);

    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (e) {
      throw new ApiError({
        statusCode: 0,
        code: "NETWORK",
        // Naming the host is the single most useful thing here: a wrong
        // VITE_API_BASE_URL is otherwise invisible and looks identical to an
        // outage.
        message: networkErrorMessage(e, url),
      });
    }

    if (res.status === 401 && !options.public) {
      if (!options.method || options.method === "GET") {
        this.onUnauthorized();
      }
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    const json: unknown = text ? safeParse(text) : undefined;
    if (!res.ok) {
      throw new ApiError(parseApiError(res.status, json));
    }
    return json as T;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Describes a failed request without inventing a cause.
 *
 * A browser **deliberately** withholds the reason a cross-origin request was
 * blocked: `fetch` rejects with an opaque `TypeError: Failed to fetch` and the
 * real explanation goes to the devtools console only, never to JavaScript.
 * That is a security property of the web platform, not something to work
 * around.
 *
 * The consequence is that a CORS rejection and a genuinely offline browser are
 * indistinguishable here. An earlier version of this function had a `/cors/i`
 * branch that could therefore never run, so every blocked request fell through
 * to "check your internet connection" — sending whoever hit it to look at
 * their router while the actual fault was one unset server variable. That is
 * worse than saying nothing: a confident wrong diagnosis costs more time than
 * an honest "I don't know".
 *
 * So: state what is actually known — which host did not answer — name the two
 * real possibilities, and say plainly that the browser will not tell us which.
 * `navigator.onLine` is checked because it is the one case we *can* rule in.
 */
function networkErrorMessage(e: unknown, url: string): string {
  const raw = e instanceof Error ? e.message : "";

  if (/abort/i.test(raw) || /timeout/i.test(raw)) {
    return `The server took too long to answer (${hostOf(url)}). It may be starting up — try again in a moment.`;
  }

  // The one diagnosis we can make with confidence.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Reconnect and try again.";
  }

  return (
    `Could not reach ${hostOf(url)}. ` +
    "Either the API is down or it is not allowing requests from this site " +
    "(a server CORS setting). The browser does not reveal which — the exact " +
    "reason is in the browser console."
  );
}

/** Host of a URL, for a message. Falls back to the whole string if unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
