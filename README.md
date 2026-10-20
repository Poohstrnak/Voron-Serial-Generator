# Voron Serial Plate Generator

Web page that generates serial plate STLs: pick a printer and extrusion profile, enter a 1 to 4 digit number, download `VT.1234.stl`.

| Printer | Plate reads | Logo | Default extrusion |
|---|---|---|---|
| V0 | V0.1234 | Voron | 1515 |
| V2 | V2.1234 | Voron | 2020 |
| Legacy | VL.1234 | Voron | 2020 |
| Micron | μ.1234 | none: the μ (`symbol_micron.stl`, cut from `logo_2020_micron.stl`) replaces the prefix | 1515 |
| Salad Fork | (fork).1234 | none: the fork (`symbol_saladfork.stl`, cut from `logo_2020_saladfork.stl`) replaces the prefix | 1515 |
| Switchwire | VS.1234 | Voron | 3030 |
| Trident | VT.1234 | Voron | 2020 |

The logo and text are recessed into (or embossed on) the plate and centered on it as a block, so shorter numbers stay centered.

Plates come in three sizes, all with the same mounting holes, with the logo and text scaled to match:

| Extrusion | Plate | Logo and text |
|---|---|---|
| 1515 | 82 × 15 mm | 75% |
| 2020 | 100 × 20 mm (the original) | 100% |
| 3030 | 136 × 30 mm | 150% |

Micron and Salad Fork plates have no logo, so their plates are shorter, sized for their text the same way (`base_<extrusion>_<micron|saladfork>[_no_holes].stl`, made from the standard plates by `tools/make_short_bases.py`):

| Extrusion | Voron, holes / no holes | Micron | Salad Fork |
|---|---|---|---|
| 1515 | 82 / 53 mm | 71 / 40 mm | 65 / 35 mm |
| 2020 | 100 / 70 mm | 84 / 54 mm | 77 / 46 mm |
| 3030 | 136 / 105 mm | 112 / 80 mm | 101 / 69 mm |

Picking a printer selects its default extrusion; the Extrusion dropdown can override it. The Screw holes dropdown (default Yes) can leave out the mounting holes, for mounting with adhesive. Without holes the plate only has to fit the text, so it is shorter (53, 70 and 105 mm for 1515, 2020 and 3030) and 2.4 mm thick instead of 5.05 mm.

## Run

```sh
cd web && python3 -m http.server 8765
```

Open http://127.0.0.1:8765. It needs to be served over HTTP (not opened as a file) because it fetches the base plate and font. Everything runs in the browser, so any static host works.

## Files

- `Serial Plate.stl`: the original plate.
- `tools/make_base.py`: cuts the raised logo and text off the original and writes a logo (`web/logo_<extrusion>.stl`) and a blank plate per extrusion, `web/base_<extrusion>.stl`, plus `web/base_<extrusion>_no_holes.stl` with the screw holes filled, shortened to fit the text and thinned to a 2 mm base. The 1515 and 3030 plates are made by removing or stretching plain bands of the 2020 plate (between the holes and the border, and across the middle) so the holes, border and ends keep their shape. Rerun it if the original changes:
  `python3 -m venv .venv && .venv/bin/pip install trimesh manifold3d scipy networkx shapely && .venv/bin/python tools/make_base.py`
- `web/plate.js`: builds the plate. Text layout constants (character positions, digit spacing, cap height, text height) were measured from the original.
- `web/fonts/Saira-<weight>-subset.ttf`: Saira (SIL Open Font License, see `OFL.txt`) at weights 400, 450 and 550, subset to `VTLS.0-9`, made by `tools/make_fonts.py` from the variable font. It's a close match to the original's font, not an exact one.

## Printing

The Text dropdown chooses whether the logo and text are recessed 0.4 mm (two 0.2 mm layers) into the plate face (the default) or embossed 0.4 mm above it, level with the border. Either way each plate is exported as a single solid. The logo and text are cut out of or merged into the plate in the browser with [Manifold](https://github.com/elalish/manifold) (`manifold-3d`, loaded from a CDN like three.js and opentype.js).

Features are sized for a 0.4 mm nozzle: every stroke of the text and logo is at least 0.9 mm wide (two 0.45 mm lines) on every plate size. Smaller plates use a heavier weight of Saira (550 on 1515, 450 on 2020, 400 on 3030), the "." is at least 1.6 mm across, and the 1515 logo's outer edge is grown 0.15 mm so the band between its slots and edge stays 0.9 mm.

# License

GNU General Public License v3.0
