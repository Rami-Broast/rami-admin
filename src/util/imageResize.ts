/**
 * Shrink an image in the browser before it is uploaded.
 *
 * ## Why this exists
 *
 * Uploaded bytes go into Postgres and are capped at 6 MB server-side, and the
 * upload travels over a branch's own uplink. A photo straight off a phone
 * camera is routinely 3–8 MB — so it either bounces off the cap or takes long
 * enough on a slow connection that the request is dropped, which reaches the
 * owner as "could not upload". A menu photo does not need to be 4000 px wide to
 * look right in a card, so reducing it before it leaves the device removes both
 * failures at once.
 *
 * ## The rules that keep it safe
 *
 * - **It never makes the upload worse.** Any failure — an unsupported format, a
 *   browser without canvas, a re-encode that comes out *larger* — falls back to
 *   the original `File`. The worst case is exactly today's behaviour.
 * - **It preserves the format**, so a PNG logo keeps its transparency rather
 *   than being flattened onto a JPEG background. Only the dimensions and the
 *   encoding change.
 * - **It respects EXIF orientation** (`imageOrientation: 'from-image'`), so a
 *   portrait phone photo is not uploaded on its side.
 * - **GIF is left untouched**: re-drawing it would drop the animation, and an
 *   animated menu photo is not worth a silent flatten.
 */

/** The longest edge we keep. 1600 px is sharp in any card or detail view. */
const MAX_DIMENSION = 1600;
/** Below this, re-encoding buys little and risks making a small file bigger. */
const SIZE_FLOOR_BYTES = 1_000_000;
/** JPEG/WebP quality. High enough that food photography does not visibly suffer. */
const QUALITY = 0.82;

/** Formats we can safely redraw. GIF and SVG are deliberately excluded. */
const RESIZABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * The dimensions to draw at: the image unchanged if it already fits, otherwise
 * scaled so its longer edge is `maxDim`, preserving aspect ratio. Pure, so the
 * only arithmetic in here is unit-tested without a canvas.
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxDim: number = MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0 || longest <= maxDim) {
    return { width, height };
  }
  const scale = maxDim / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Returns a smaller version of `file` when that is both possible and worthwhile,
 * and the original `file` otherwise. Never throws.
 */
export async function downscaleImage(file: File): Promise<File> {
  try {
    if (!RESIZABLE_TYPES.has(file.type)) {
      return file;
    }

    const decoded = await loadBitmap(file);
    if (!decoded) {
      return file;
    }

    const { width, height } = scaledDimensions(decoded.width, decoded.height);
    const alreadySmallEnough = width === decoded.width && file.size <= SIZE_FLOOR_BYTES;
    if (alreadySmallEnough) {
      decoded.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      decoded.close?.();
      return file;
    }
    ctx.drawImage(decoded.source, 0, 0, width, height);
    decoded.close?.();

    const blob = await canvasToBlob(canvas, file.type, QUALITY);
    // If re-encoding did not actually save anything (already-optimised images
    // can grow), keep the original — the point was to send fewer bytes.
    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
  } catch {
    // Any failure at all: upload exactly what the owner picked.
    return file;
  }
}

interface Decoded {
  /** What `drawImage` is given. */
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  close?: () => void;
}

async function loadBitmap(file: File): Promise<Decoded | null> {
  // createImageBitmap is the path that honours EXIF orientation; fall back to an
  // <img> element where it is missing.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // fall through to the <img> path
    }
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return null;
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = objectUrl;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
