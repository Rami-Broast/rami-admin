import { API_BASE_URL } from '../api/config';
import { joinUrl } from '../api/http';

/**
 * Turns whatever is stored in an `imageUrl` column into something an `<img>`
 * can load.
 *
 * There are two kinds of value in that column and there will be for a long
 * time. Images uploaded through the app are stored as the **path** the backend
 * returns (`/assets/<id>`), which every client resolves against its own API
 * base — so the same row works from the admin panel, the customer app and a
 * local dev build without anything knowing the API's public hostname. Images
 * from before uploading existed are absolute URLs an owner pasted in, pointing
 * at somewhere nobody here controls; those are passed through untouched, and
 * they keep working until someone replaces them.
 *
 * Pure, and tested, because getting it wrong shows up as a broken image on a
 * menu rather than as an error anyone would notice in a log.
 */
export function resolveImageUrl(stored: string | null | undefined): string | null {
  const value = stored?.trim();
  if (!value) {
    return null;
  }
  // Absolute, protocol-relative, or already a data URI: it addresses itself.
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) {
    return value;
  }
  return joinUrl(API_BASE_URL, value);
}
