import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import opentype from "opentype.js";
import Manifold from "manifold-3d";
import { EXTRUSIONS, FONT_WEIGHT, MAX_DIGITS, PRINTERS, buildBlank, buildPlate, parseBinarySTL, plateLabel, validate, writeBinarySTL } from "./plate.js?v=28";

const VERSION = 27; // bump when any fetched file changes, so Cloudflare serves the new one

const form = document.getElementById("form");
const printerEl = document.getElementById("printer");
const extrusionEl = document.getElementById("extrusion");
const holesEl = document.getElementById("holes");
const styleEl = document.getElementById("style");
const numberEl = document.getElementById("number");
const downloadEl = document.getElementById("download");
const statusEl = document.getElementById("status");
const viewer = document.getElementById("viewer");

const printers = Object.fromEntries(PRINTERS.map((p) => [p.name, p]));
for (const p of PRINTERS) printerEl.add(new Option(p.name, p.name));
for (const e of EXTRUSIONS) extrusionEl.add(new Option(e, e));
extrusionEl.value = printers[printerEl.value].extrusion;

// Preview
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
viewer.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 1000);
camera.up.set(0, 0, 1);
camera.position.set(0, -110, 120);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-6, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(-60, -80, 100);
scene.add(sun);
const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x8a9bb0, roughness: 0.6 }));
scene.add(mesh);

function resize() {
  const { clientWidth: w, clientHeight: h } = viewer;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Generation
let loaded = false, mf, triangles;
// Per extrusion: the text font, each logo, and the blank plate with ("yes") or without ("no")
// screw holes. The Voron logo has a file per extrusion; other logos are one file, used for every
// extrusion and scaled like the plate's text. Symbols replace a printer's prefix letters.
// Blank plates are grouped by plate set ("" for the standard plates, else a printer's `base`),
// then by screw holes ("yes"/"no"), then by extrusion.
const fonts = {}, logos = { voron: {} }, bases = {}, symbols = {};
const plateSets = ["", ...new Set(PRINTERS.map((p) => p.base).filter(Boolean))];
const otherLogos = [...new Set(PRINTERS.map((p) => p.logo))].filter((l) => l && l !== "voron");
const symbolNames = [...new Set(PRINTERS.map((p) => p.symbol))].filter(Boolean);

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function showMesh(positions) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = geom;
}

function update() {
  numberEl.value = numberEl.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
  const printer = printers[printerEl.value], prefix = printer.prefix;
  const extrusion = extrusionEl.value, number = numberEl.value;
  const plates = bases[printer.base ?? ""][holesEl.value], style = styleEl.value, logo = printer.logo ? logos[printer.logo][extrusion] : null;
  triangles = null;
  downloadEl.disabled = true;
  if (!loaded) return;
  const error = validate(prefix, number);
  if (error) {
    showMesh(buildBlank(mf, plates, logo, extrusion, style));
    setStatus(number ? error : "Select your Voron. Enter your cerial", Boolean(number));
    return;
  }
  triangles = buildPlate(THREE, mf, fonts[extrusion], plates, logo, extrusion, style, prefix, number,
    printer.symbol ? { name: printer.symbol, triangles: symbols[printer.symbol] } : null);
  showMesh(triangles);
  downloadEl.disabled = false;
  setStatus(`${plateLabel(prefix, number)} ready (${(triangles.length / 9).toLocaleString()} triangles).`);
}

// Picking a printer selects its usual extrusion; the extrusion can still be changed after.
// This runs before the form's listener, which sees the event as it bubbles up.
printerEl.addEventListener("input", () => (extrusionEl.value = printers[printerEl.value].extrusion));
form.addEventListener("input", update);
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!triangles) return;
  const printer = printers[printerEl.value];
  const name = plateLabel(printer.file ?? printer.prefix, numberEl.value);
  const url = URL.createObjectURL(new Blob([writeBinarySTL(triangles, name)], { type: "model/stl" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.stl` });
  a.click();
  URL.revokeObjectURL(url);
});

try {
  // Retry a few times: requests made while the server is waking from standby can fail.
  const load = async (path) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${path}?v=${VERSION}`);
        if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
        return await res.arrayBuffer();
      } catch (err) {
        if (attempt === 4) throw err;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  };
  const weights = [...new Set(Object.values(FONT_WEIGHT))];
  const plateFiles = plateSets.flatMap((set) => ["yes", "no"].flatMap((holes) => EXTRUSIONS.map((e) =>
    [set, holes, e, `base_${e}${set && `_${set}`}${holes === "no" ? "_no_holes" : ""}.stl`])));
  const [wasm, symbolBufs, otherLogoBufs, fontBufs, logoBufs, plateBufs] = await Promise.all([
    Manifold(),
    Promise.all(symbolNames.map((n) => load(`symbol_${n}.stl`))),
    Promise.all(otherLogos.map((l) => load(`logo_2020_${l}.stl`))),
    Promise.all(weights.map((w) => load(`fonts/Saira-${w}-subset.ttf`))),
    Promise.all(EXTRUSIONS.map((e) => load(`logo_${e}.stl`))),
    Promise.all(plateFiles.map(([, , , path]) => load(path))),
  ]);
  mf = wasm;
  mf.setup();
  const fontByWeight = Object.fromEntries(weights.map((w, i) => [w, opentype.parse(fontBufs[i])]));
  EXTRUSIONS.forEach((e, i) => {
    fonts[e] = fontByWeight[FONT_WEIGHT[e]];
    logos.voron[e] = parseBinarySTL(logoBufs[i]);
  });
  plateFiles.forEach(([set, holes, e], i) => {
    bases[set] ??= { yes: {}, no: {} };
    bases[set][holes][e] = parseBinarySTL(plateBufs[i]);
  });
  symbolNames.forEach((n, i) => (symbols[n] = parseBinarySTL(symbolBufs[i])));
  otherLogos.forEach((l, i) => {
    const logo = parseBinarySTL(otherLogoBufs[i]);
    logos[l] = Object.fromEntries(EXTRUSIONS.map((e) => [e, logo]));
  });
  loaded = true;
  update();
} catch (err) {
  setStatus(`${err.message}. Serve this folder over HTTP (see README).`, true);
}
