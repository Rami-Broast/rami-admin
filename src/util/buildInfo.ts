/**
 * Which build of this app is running.
 *
 * ## Why this exists
 *
 * A change was merged, its CI went green, and the owner still could not tell
 * whether the panel in front of them contained it — because the Vercel project
 * for this app had stopped deploying and nothing on screen said so. "Is this
 * the new build?" was an unanswerable question, and every bug report made under
 * that uncertainty cost a round trip.
 *
 * The values come from `vite.config.ts` at build time. Vercel exposes the
 * commit as `VERCEL_GIT_COMMIT_SHA`; a local build has none, so it says
 * "local". Nothing here is a secret: the commit is public in the repository,
 * and the build time is the fact the reader actually wants.
 */

declare const __BUILD_SHA__: string;
declare const __BUILT_AT__: string;

/** Short commit SHA, or 'local' for a build made outside CI. */
export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'local';

/** ISO timestamp of the build. */
export const BUILT_AT: string = typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : '';

/**
 * "a3f9c21 · 5 Sep, 14:23" — enough to compare against a merge without asking
 * anyone to read an ISO string.
 *
 * Pure and takes `now` so the relative part is testable. A build older than a
 * day drops the "today/yesterday" shorthand and shows the date, because that is
 * when the question changes from "did my change land" to "how stale is this".
 */
export function buildLabel(
  sha: string = BUILD_SHA,
  builtAt: string = BUILT_AT,
  now: Date = new Date(),
): string {
  const when = builtAt ? new Date(builtAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return sha;
  }

  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sameDay = when.toDateString() === now.toDateString();
  if (sameDay) {
    return `${sha} · today ${time}`;
  }

  const date = when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${sha} · ${date} ${time}`;
}
