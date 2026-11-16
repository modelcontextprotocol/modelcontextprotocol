# Share cards

The files here are what `layouts/partials/og/image.html` draws a page's share
card from: the 1200x630 picture a site shows when someone posts a link to the
blog (`og:image`). Hugo makes the cards when it builds the site. Nothing here
is published as it is, and a new post needs no picture made for it.

The partial's opening comment says how a card is put together. This file says
where each of these files came from, so that any of them can be made again.

## Pictures

All four are PNGs drawn in a browser and saved at one image pixel per CSS
pixel. The colors are the blog's dark theme, from the token block of
`assets/css/extended/custom.css`.

- `base.png`, 1200x630. The ground, `#09090b`, with the blog's name on it: the
  mark from `hugo.toml` at 40px with a 13-unit stroke, then "Model Context
  Protocol Blog" in Geist SemiBold at 30px with -0.01em of letter spacing,
  14px to the right of the mark. Both are `#fafafa`, and the mark's top left
  corner is at (80, 72).
- `stripe-ink.png`, `stripe-mid.png` and `stripe-low.png`, 732x732 with a
  transparent ground. Each is one line from (14, 718) to (718, 14), 26px thick
  with round ends, in `#fafafa`, `#2e2e33` and `#1f1f23`. As SVG:
  `<line x1="14" y1="718" x2="718" y2="14" stroke-width="26" stroke-linecap="round"/>`.
  The partial counts on these numbers: 704 is its `$span`, and 14 is the
  distance from the picture's edge to the centre of a round end.
- `blank.png`, 1200x630 and fully transparent. Text that has to wrap or be
  placed by itself is drawn on a piece of this, and the piece is laid on the
  card.

## Fonts

Hugo's text filter reads TrueType and OpenType files and not WOFF2, so these
are the blog's own Geist files from `static/fonts/` in the other wrapping. The
licence is `static/fonts/Geist-LICENSE.txt`.

- `Geist-latin-400.otf` and `Geist-latin-500.otf` are `Geist-latin-400.woff2`
  and `Geist-latin-500.woff2`, unwrapped and otherwise unchanged. They set the
  date and the authors.
- `Geist-latin-600-tight.otf` is `Geist-latin-600.woff2` with every glyph's
  advance width made 30 units narrower. The text filter has no letter spacing,
  and the blog sets its titles at -0.03em, which in this font is 30 units. It
  sets the title.
- `advances.json` lists the advance width of each character in
  `Geist-latin-600-tight.otf`. The partial uses it to work out how wide a
  title is, so that it can break the lines evenly.

To make all four again, with [fonttools](https://github.com/fonttools/fonttools)
and `brotli` installed, from `blog/`:

```python
import json
from fontTools.ttLib import TTFont

for weight in (400, 500):
    font = TTFont(f"static/fonts/Geist-latin-{weight}.woff2")
    font.flavor = None
    font.save(f"assets/og/Geist-latin-{weight}.otf")

font = TTFont("static/fonts/Geist-latin-600.woff2")
font.flavor = None
widths = font["hmtx"]
for glyph in font.getGlyphOrder():
    advance, bearing = widths[glyph]
    if advance > 0:
        widths[glyph] = (max(advance - 30, 0), bearing)
font.save("assets/og/Geist-latin-600-tight.otf")

keep = {0xA0, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026}
advances = {
    chr(code): widths[glyph][0]
    for code, glyph in sorted(font.getBestCmap().items())
    if 0x20 <= code < 0x7F or code in keep
}
with open("assets/og/advances.json", "w", encoding="utf-8", newline="\n") as out:
    json.dump({"unitsPerEm": font["head"].unitsPerEm, "advances": advances}, out, ensure_ascii=False, indent=0)
```
