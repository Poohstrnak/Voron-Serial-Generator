// Builds a serial plate STL: the blank base plate with the logo and "<prefix>.<number>" text
// recessed into or embossed on its face, with the logo-and-text block centered on the plate.
// Runs in the browser and in Node tests; callers pass in THREE (for glyph curves), an opentype.js
// Font, and the initialized manifold-3d module (for joining the logo and text to the plate).

// Printers in dropdown order: the name shown, the prefix printed on the plate, the extrusion it
// uses by default, and its logo. "voron" is logo_<extrusion>.stl; any other logo is a single
// logo_2020_<logo>.stl, scaled like the text for 1515 and 3030; null means no logo. A printer
// with a `symbol` has symbol_<symbol>.stl drawn in place of its prefix letters (the prefix is
// still used for the status line, and for the file name unless the printer sets `file`). A printer with a `base` uses the shorter plates
// base_<extrusion>_<base>[_no_holes].stl, sized for its text (see tools/make_short_bases.py).
export const PRINTERS = [
  { name: "V0", prefix: "V0", extrusion: "1515", logo: "voron" },
  { name: "V2", prefix: "V2", extrusion: "2020", logo: "voron" },
  { name: "Legacy", prefix: "VL", extrusion: "2020", logo: "voron" },
  { name: "Micron", prefix: "μ", file: "micron", extrusion: "1515", logo: null, symbol: "micron", base: "micron" },
  { name: "Salad Fork", prefix: "SaladFork", extrusion: "1515", logo: null, symbol: "saladfork", base: "saladfork" },
  { name: "Switchwire", prefix: "VS", extrusion: "3030", logo: "voron" },
  { name: "Trident", prefix: "VT", extrusion: "2020", logo: "voron" },
];
const PREFIXES = [...new Set(PRINTERS.map((p) => p.prefix))];
// The height in a symbol file that sits on the text's baseline; by default its bottom. The μ's tail
// hangs below the baseline like a descender, with the bottom of its bowl level with the ".".
const SYMBOL_BASELINE = { micron: -1.206 };

// Extrusion profiles a plate can be made for. Plates
// are as wide as the extrusion (the 2020 plate is the original), and the logo and text scale by
// the same ratio to keep their margins; the mounting holes don't change.
export const EXTRUSIONS = ["1515", "2020", "3030"];
const BLOCK_SCALE = { 1515: 15 / 20, 2020: 1, 3030: 30 / 20 };
// Saira weight for each plate's text, the lightest that keeps every stroke at least 0.9 mm wide
// (two 0.45 mm lines from a 0.4 mm nozzle) at that plate's scale. The fonts are made by
// tools/make_fonts.py, and each plate has its own logo file (see tools/make_base.py).
export const FONT_WEIGHT = { 1515: 550, 2020: 450, 3030: 400 };
// The "." is the smallest feature, so it is enlarged where needed to print cleanly with a 0.4 mm
// nozzle (4 line widths). At its natural size it is 1.2 mm on the 2020 plate.
const DOT = ".";
const MIN_DOT_SIZE = 1.6;

// Layout measured from the original "Serial Plate.stl" (mm), before centering. Each character
// is centered on the slot the matching character of "VT.2050" occupied; digits are evenly
// spaced, so numbers shorter than 4 digits just use fewer slots.
const PREFIX_SLOT_X = [-20.39, -12.35, -6.885]; // the two prefix letters and the "."
const DIGIT_SLOT_X = -1.45;
const DIGIT_PITCH = 7.54;
export const MAX_DIGITS = 4;
const CAP_HEIGHT = 8.43; // height of the original "V"
const BASELINE_Y = -4.39; // bottom of the original "V"
// The logo and text are laid out with the plate face at FACE_Z, then moved to the actual plate's
// face, which is BORDER_HEIGHT below its top. That way plate files can be exported at any height.
const FACE_Z = 2.0;
const BORDER_HEIGHT = 0.4; // the raised border around the face
const RECESS_DEPTH = 0.4; // two 0.2 mm layers
const EMBOSS_HEIGHT = 0.4; // as on the original plate, level with the border
// The logo and text are cut into the face (recessed) or raised from it (embossed). Each style's
// solids span [bottom, top] in z: recess cutters rise past the face so the cut is clean, and
// embossed solids start below it so they merge into the plate.
export const STYLES = ["recessed", "embossed"];
const STYLE_Z = {
  recessed: [FACE_Z - RECESS_DEPTH, FACE_Z + 1],
  embossed: [FACE_Z - 0.1, FACE_Z + EMBOSS_HEIGHT],
};
const CURVE_SEGMENTS = 8;

export function validate(prefix, number) {
  if (!PREFIXES.includes(prefix)) return `Prefix must be one of ${PREFIXES.join(", ")}`;
  if (!new RegExp(`^\\d{1,${MAX_DIGITS}}$`).test(number)) return `Number must be 1 to ${MAX_DIGITS} digits`;
  return null;
}

export function plateLabel(prefix, number) {
  return `${prefix}.${number}`;
}

// Returns a Float32Array of triangle vertex positions (9 floats per triangle). `mf` is the
// initialized manifold-3d module. `font` and the logo should be the ones for the extrusion
// (FONT_WEIGHT, logo_<extrusion>.stl). `style` is one of STYLES. `bases` maps each extrusion in
// EXTRUSIONS to its blank plate (with or without screw holes). The logo is passed in at its
// original position on the 2020 plate and moves with the text, or is null for no logo. If
// `symbol` ({ name, triangles }) is given, that symbol is drawn instead of the prefix letters.
export function buildPlate(THREE, mf, font, bases, logoTriangles, extrusion, style, prefix, number, symbol = null) {
  const error = validate(prefix, number);
  if (error) throw new Error(error);

  const v = font.charToGlyph("V").getBoundingBox();
  const scale = CAP_HEIGHT / (v.y2 - v.y1);
  const baseline = BASELINE_Y - v.y1 * scale;

  const slots = [...PREFIX_SLOT_X, ...[...number].map((_, i) => DIGIT_SLOT_X + i * DIGIT_PITCH)];
  const dot = font.charToGlyph(DOT).getBoundingBox();
  const dotSize = Math.min(dot.x2 - dot.x1, dot.y2 - dot.y1) * scale * BLOCK_SCALE[extrusion];
  const dotScale = scale * Math.max(1, MIN_DOT_SIZE / dotSize);
  const z = styleZ(style);
  const shapes = logoTriangles ? [logoSolid(mf, logoTriangles, z)] : [];
  const chars = [...(symbol ? "" : prefix), DOT, ...number];
  const charSlots = symbol ? slots.slice(PREFIX_SLOT_X.length - 1) : slots; // start at the "."
  chars.forEach((ch, i) => {
    const glyph = font.charToGlyph(ch);
    const bb = glyph.getBoundingBox();
    const s = ch === DOT ? dotScale : scale;
    const dx = charSlots[i] - ((bb.x1 + bb.x2) / 2) * s;
    const dy = baseline + bb.y1 * (scale - s); // a scaled-up dot still sits on the baseline
    shapes.push(glyphSolid(THREE, mf, glyph, s, dx, dy, z));
  });
  if (symbol) {
    // As tall as the capitals, sitting on the baseline at SYMBOL_BASELINE, and ending as far left
    // of the "." as a "T" would.
    const { triangles: symbolTriangles } = symbol;
    const t = font.charToGlyph("T").getBoundingBox();
    const dotLeft = PREFIX_SLOT_X[2] - ((dot.x2 - dot.x1) / 2) * dotScale;
    const gap = dotLeft - (PREFIX_SLOT_X[1] + ((t.x2 - t.x1) / 2) * scale);
    const [x1, x2] = range(symbolTriangles, 0), [y1, y2] = range(symbolTriangles, 1);
    const s = CAP_HEIGHT / (y2 - y1);
    const sitsOn = SYMBOL_BASELINE[symbol.name] ?? y1;
    shapes.push(logoSolid(mf, placeXY(symbolTriangles, s, dotLeft - gap - x2 * s, BASELINE_Y - sitsOn * s), z));
  }

  return assemble(mf, bases, extrusion, style, shapes);
}

// The plate with just the logo (if any), for previewing before a number is entered.
export function buildBlank(mf, bases, logoTriangles, extrusion, style) {
  return assemble(mf, bases, extrusion, style, logoTriangles ? [logoSolid(mf, logoTriangles, styleZ(style))] : []);
}

function styleZ(style) {
  if (!STYLES.includes(style)) throw new Error(`Style must be one of ${STYLES.join(", ")}`);
  return STYLE_Z[style];
}

// Scales the logo and text solids for the extrusion's plate and centers them as a block, from the
// logo's left edge to the last character's right edge, then cuts them out of the plate (recessed)
// or adds them to it (embossed).
function assemble(mf, bases, extrusion, style, shapes) {
  if (!EXTRUSIONS.includes(extrusion)) throw new Error(`Extrusion must be one of ${EXTRUSIONS.join(", ")}`);
  const base = bases[extrusion], scale = BLOCK_SCALE[extrusion];
  if (!shapes.length) return toTriangles(plateManifold(mf, base)); // a blank plate with no logo
  const [plateX1, plateX2] = range(base, 0), [plateY1, plateY2] = range(base, 1), [, plateTop] = range(base, 2);
  const toX = (plateX1 + plateX2) / 2, midY = (plateY1 + plateY2) / 2;
  const faceShift = plateTop - BORDER_HEIGHT - FACE_Z;

  const block = mf.Manifold.union(shapes);
  const { min, max } = block.boundingBox();
  const fromX = (min[0] + max[0]) / 2;
  const placed = block.translate([-fromX, -midY, 0]).scale([scale, scale, 1]).translate([toX, midY, faceShift]);
  const blank = plateManifold(mf, base);
  const plate = style === "embossed" ? blank.add(placed) : blank.subtract(placed);
  const out = toTriangles(plate);
  for (const m of [...shapes, block, placed, plate]) m.delete();
  return out;
}

// Logo solid spanning [bottom, top] in z. The logo files are a flat extrusion rising from the face
// (FACE_Z), so their bottom and top vertices are moved to those heights.
// Copy of a triangle soup scaled by `s` in x and y, then moved by (dx, dy).
function placeXY(triangles, s, dx, dy) {
  const out = Float32Array.from(triangles);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = out[i] * s + dx;
    out[i + 1] = out[i + 1] * s + dy;
  }
  return out;
}

function logoSolid(mf, triangles, [bottom, top]) {
  const solid = Float32Array.from(triangles);
  for (let i = 2; i < solid.length; i += 3) solid[i] = solid[i] <= FACE_Z + 1e-4 ? bottom : top;
  return toManifold(mf, solid);
}

// A glyph's outline, scaled by `s` and moved by (dx, dy), extruded over [bottom, top] in z. The
// NonZero fill rule copes with overlapping contours, which variable-font instances often have.
function glyphSolid(THREE, mf, glyph, s, dx, dy, [bottom, top]) {
  const path = new THREE.ShapePath();
  for (const c of glyph.path.commands) {
    if (c.type === "M") path.moveTo(c.x, c.y);
    else if (c.type === "L") path.lineTo(c.x, c.y);
    else if (c.type === "Q") path.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
    else if (c.type === "C") path.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
  }
  const contours = path.subPaths.map((sub) => sub.getPoints(CURVE_SEGMENTS).map((q) => [q.x * s + dx, q.y * s + dy]));
  const section = new mf.CrossSection(contours, "NonZero");
  const solid = section.extrude(top - bottom).translate([0, 0, bottom]);
  section.delete();
  return solid;
}

// Blank plates are reused for every update, so convert each one once.
const plateManifolds = new WeakMap();
function plateManifold(mf, triangles) {
  if (!plateManifolds.has(triangles)) plateManifolds.set(triangles, toManifold(mf, triangles));
  return plateManifolds.get(triangles);
}

// Triangle soup (as read from an STL) to a Manifold, joining triangles at shared vertices.
function toManifold(mf, triangles) {
  const index = new Map(), verts = [], triVerts = new Uint32Array(triangles.length / 3);
  for (let i = 0; i < triangles.length; i += 3) {
    const key = `${triangles[i]},${triangles[i + 1]},${triangles[i + 2]}`;
    let v = index.get(key);
    if (v === undefined) {
      v = verts.length / 3;
      index.set(key, v);
      verts.push(triangles[i], triangles[i + 1], triangles[i + 2]);
    }
    triVerts[i / 3] = v;
  }
  const mesh = new mf.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts });
  mesh.merge();
  return new mf.Manifold(mesh);
}

function toTriangles(manifold) {
  const { numProp, vertProperties, triVerts } = manifold.getMesh();
  const out = new Float32Array(triVerts.length * 3);
  triVerts.forEach((v, i) => out.set(vertProperties.subarray(v * numProp, v * numProp + 3), i * 3));
  return out;
}

// [min, max] of the vertices along an axis (0 = x, 1 = y, 2 = z).
function range(triangles, axis) {
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < triangles.length; i += 3) {
    lo = Math.min(lo, triangles[i]);
    hi = Math.max(hi, triangles[i]);
  }
  return [lo, hi];
}

export function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  if (84 + count * 50 !== buffer.byteLength) throw new Error("Not a binary STL");
  const out = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const at = 84 + i * 50 + 12; // skip the stored normal
    for (let j = 0; j < 9; j++) out[i * 9 + j] = view.getFloat32(at + j * 4, true);
  }
  return out;
}

export function writeBinarySTL(triangles, header = "serial plate") {
  const count = triangles.length / 9;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  const name = new TextEncoder().encode(header.slice(0, 80));
  new Uint8Array(buffer, 0, name.length).set(name);
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const t = triangles.subarray(i * 9, i * 9 + 9);
    const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2];
    const vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const at = 84 + i * 50;
    [nx / len, ny / len, nz / len, ...t].forEach((f, j) => view.setFloat32(at + j * 4, f, true));
  }
  return buffer;
}
