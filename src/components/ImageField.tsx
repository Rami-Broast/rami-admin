import React, { useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { ApiError } from '../api/http';
import { downscaleImage } from '../util/imageResize';
import { resolveImageUrl } from '../util/imageUrl';

/**
 * Pick an image from this device and upload it.
 *
 * ## Why this replaced a text box
 *
 * Every image in the admin panel used to be a URL the owner typed or pasted:
 * menu photography, offer artwork, banners. That asked a restaurant owner to
 * host their own files somewhere and produce a direct link to them — which in
 * practice means a link to somewhere nobody here controls, so any of them could
 * 404 into a customer's menu at any time and nobody would know until a customer
 * mentioned it. It also made the obvious thing, "use the photo I just took",
 * impossible.
 *
 * The field now uploads to our own API and stores the path it returns.
 * `accept="image/*"` is what makes a phone offer the camera roll directly.
 *
 * ## Two things it must keep doing
 *
 * **It shows what is currently set, including a legacy pasted URL.** An owner
 * editing a product needs to see the picture that is on it now, whether that
 * came from an upload or from the old text box, or they cannot tell whether
 * they are about to replace something.
 *
 * **A failed upload leaves the old value alone.** The value only changes once
 * the server has the bytes and has given us an id back. A control that cleared
 * the field first and then failed would quietly delete a working image.
 */
export function ImageField({
  label,
  value,
  onChange,
  hint,
  height = 120,
}: {
  label: string;
  /** What is stored on the record: an uploaded path, or a legacy pasted URL. */
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  height?: number;
}): React.JSX.Element {
  const { api } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = resolveImageUrl(value);

  const pick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // Shrink a large photo in the browser first: a phone camera's 3–8 MB
      // image otherwise bounces off the 6 MB server cap or times out on a
      // branch's uplink. This never makes things worse — it returns the
      // original file on any failure (see `downscaleImage`).
      const prepared = await downscaleImage(file);
      const asset = await api.uploadImage(prepared);
      onChange(asset.url);
    } catch (e) {
      // The backend's message names the actual problem — too large, not an
      // image — so it is shown rather than replaced with a generic failure.
      setError(e instanceof ApiError ? e.message : 'Could not upload that image.');
    } finally {
      setBusy(false);
      // Cleared so picking the *same* file again still fires a change event,
      // which is what someone does after a failure.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <label style={{ display: 'block' }}>
      <span>{label}</span>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 6 }}>
        <div
          aria-hidden={!preview}
          style={{
            width: height * 1.4,
            height,
            flexShrink: 0,
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'var(--surface-2)',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              // A legacy pasted URL can be dead. Saying so beats a broken-image
              // glyph the owner has to interpret.
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                setError('That image could not be loaded. Choose a new one.');
              }}
            />
          ) : (
            <span>No image</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <input
            ref={input}
            type="file"
            // The whole point: on a phone this opens the gallery and the camera.
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? 'Uploading…' : preview ? 'Replace image' : 'Choose image'}
            </button>
            {value ? (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  onChange('');
                  setError(null);
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          {error ? (
            <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>
          ) : hint ? (
            <span className="muted" style={{ fontSize: 12 }}>
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    </label>
  );
}
