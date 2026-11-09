# Fonts

The blog serves its own fonts, so a visit makes no request to a third party.
They are declared at the top of `blog/assets/css/extended/custom.css`.

| File                                | Size  | What it is                              | Licence                 |
| ----------------------------------- | ----- | --------------------------------------- | ----------------------- |
| `Geist-latin-400.woff2`             | 33 KB | Geist Sans 1.002, Regular, Latin        | `Geist-LICENSE.txt`     |
| `Geist-latin-500.woff2`             | 34 KB | Geist Sans 1.002, Medium, Latin         | `Geist-LICENSE.txt`     |
| `Geist-latin-600.woff2`             | 35 KB | Geist Sans 1.002, SemiBold, Latin       | `Geist-LICENSE.txt`     |
| `JetBrainsMono-Regular-latin.woff2` | 18 KB | JetBrains Mono 2.304, Regular, cut down | `JetBrainsMono-OFL.txt` |

Both families are under the SIL Open Font License 1.1. Neither declares a
Reserved Font Name, so a modified file may keep the family's name.

## Geist

By Vercel and basement.studio, <https://github.com/vercel/geist-font>. The
three files are the static Latin cuts of version 1.002 from the npm package
`@fontsource/geist-sans` 5.3.0 (`files/geist-sans-latin-<weight>-normal.woff2`),
renamed and otherwise unchanged. There is no italic in the family at this version,
so `<em>` is slanted by the browser (see `font-synthesis` in `custom.css`).

## JetBrains Mono

By JetBrains, <https://github.com/JetBrains/JetBrainsMono>. The file is made
from `JetBrainsMono-Regular.woff2`, version 2.304, as packaged by Debian and
Ubuntu in `fonts-jetbrains-mono-web` (89 KB, SHA-256
`1e9cbb3b62d3028af5316095a4786981b5e1ab82be6da04e1edddc16d98ed496`). The
project's own release of the same version works too, but gives different bytes.
It keeps Latin, common punctuation, arrows and box drawing, keeps the hinting
and the name table, and drops the coding ligatures, which the blog turns off.

To rebuild it, with [fonttools](https://github.com/fonttools/fonttools) 4.67
and `brotli` installed:

```bash
pyftsubset JetBrainsMono-Regular.woff2 \
  --output-file=JetBrainsMono-Regular-latin.woff2 \
  --flavor=woff2 \
  --layout-features=ccmp,locl,zero,case \
  --name-IDs='*' \
  --unicodes=U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2010-2015,U+2018-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2190-2199,U+21D0-21D4,U+2212,U+2248,U+2260,U+2264-2265,U+2500-257F,U+2713,U+2717
```

The same list is the `unicode-range` of the `@font-face` rule in `custom.css`.
If one changes, change the other. A character outside it falls back to the
reader's own monospace font.
