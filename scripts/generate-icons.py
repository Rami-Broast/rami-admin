"""
Generate the admin panel's PWA icons from the Rami Broast logo.

Run: python3 scripts/generate-icons.py   (needs Pillow)

The Rami Broast logo is a self-contained brand tile — the gold "R" mark and
wordmark on the brand maroon ground — so the icon is simply that logo centred on
a maroon square. Two shapes are emitted, and the difference matters:

- `icon-*.png`  — "any" purpose. Art fills ~82% of the square; the OS rounds the
  corners.
- `icon-maskable-*.png` — "maskable" purpose. Android and Chrome crop this to a
  circle or squircle, cutting up to ~20% off each edge, so the art is kept inside
  the centre ~62% on the full-bleed maroon ground. Shipping only an "any" icon
  gets it letterboxed into a white pillbox on those surfaces.

The committed PNGs can also be produced with ImageMagick (see the repo history):
  convert -size SxS xc:'#752E2A' \\( logo.jpeg -resize NxN \\) \\
    -gravity center -composite -background '#752E2A' -flatten -strip out.png
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "..", "public")

MAROON = (117, 46, 42)  # #752E2A — Rami Broast brand maroon, sampled from the logo.


def build(size, maskable):
    """One icon: the logo centred on the maroon ground, inside the safe zone."""
    canvas = Image.new("RGB", (size, size), MAROON)
    logo = Image.open(os.path.join(PUBLIC, "logo.jpeg")).convert("RGB")
    frac = 0.62 if maskable else 0.82
    target = max(1, round(size * frac))
    w, h = logo.size
    scale = min(target / w, target / h)
    resized = logo.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def main():
    outputs = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-192.png", 192, True),
        ("icon-maskable-512.png", 512, True),
        # iOS ignores the manifest and reads this for "Add to Home Screen".
        # It is never masked, so it uses the "any" art.
        ("apple-touch-icon.png", 180, False),
        ("favicon-32.png", 32, False),
    ]
    for name, size, maskable in outputs:
        path = os.path.join(PUBLIC, name)
        build(size, maskable).save(path, "PNG")
        print(name, Image.open(path).size, Image.open(path).mode)


if __name__ == "__main__":
    main()
