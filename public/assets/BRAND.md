# Supplied brand artwork

The site operator supplied this artwork on 2026-09-27 and explicitly requested
its use as the Kommandekollen logo. It depicts a turquoise house outline and
chimney containing a pale-mint radar arc, turquoise center and pink wedge.
No authorship, ownership, Creative Commons or other public reuse license is
asserted. This is separate from the Unsplash inspiration photo documented in
`ATTRIBUTION.md`; the photo's license does not apply to the logo.

Source: user-attached RGB PNG, 1254 x 1254 pixels, 1,046,504 bytes.
SHA-256: `9aaf702011d857ce88c2e7bf68c42facaf05a260c6c46d061549e8fd309163be`.

Local processing with Pillow 11.3.0:

- Crop `(188, 177, 1060, 1049)` (left, top, right, bottom; right/bottom
  exclusive), yielding an 872 x 872 square. Only the outer blank canvas is
  removed. The house's saturated bounds are `(232, 197)` to `(1015, 1027)`,
  leaving at least 20 source pixels of padding.
- Resize using Lanczos and save optimized, lossless RGB PNG without source
  metadata: `brand-mark-80.png` (80 x 80, 5,622 bytes) and `favicon-32.png`
  (32 x 32, 1,609 bytes).
- No background thresholding, transparency extraction, palette quantization,
  redrawing, stylistic filters or recoloring. The pale arc, pink wedge, soft edges and
  light textured backing remain part of the supplied image.

The header uses the 80px image at 40px (36px on narrow phones), retaining a
small light backing in dark mode rather than damaging pale details or inverting
the logo. The favicon uses the 32px derivative. The original full-size attachment
is not downloaded by visitors.
