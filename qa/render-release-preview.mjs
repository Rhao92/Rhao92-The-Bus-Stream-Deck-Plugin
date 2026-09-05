import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [visualDirectory, outputPath, sharpModulePath] = process.argv.slice(2);
if (!visualDirectory || !outputPath || !sharpModulePath) {
  throw new Error(
    "Usage: node qa/render-release-preview.mjs <visual-directory> <output.jpg> <sharp-module-path>",
  );
}

const sharpModule = await import(pathToFileURL(sharpModulePath).href);
const sharp = sharpModule.default;

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const embeddedSvg = async (name) => {
  const source = await readFile(`${visualDirectory}/${name}.svg`);
  return `data:image/svg+xml;base64,${source.toString("base64")}`;
};

const panelNavigation = await embeddedSvg("16-fullpanel-navigation");
const panelTimetable = await embeddedSvg("12-fullpanel-timetable-bright");
const panelVehicle = await embeddedSvg("13-fullpanel-vehicle");
const keys = await Promise.all([
  "03-button-stop-bright",
  "04b-button-ingame",
  "05-speed-normal",
  "08-limit",
  "09-power",
  "10-battery",
  "18-navigation-pause",
  "21-navigation-remaining-distance",
].map(embeddedSvg));

const keyAccents = [
  "#ffc21d",
  "#ffc21d",
  "#38c9ff",
  "#ff3345",
  "#78d83a",
  "#78d83a",
  "#38c9ff",
  "#38c9ff",
];

const keyMarkup = keys.map((href, index) => {
  const x = 80 + index * 144;
  const accent = keyAccents[index];
  return `
    <rect x="${x - 12}" y="500" width="136" height="136" rx="30" fill="none" stroke="${accent}" stroke-width="12" stroke-opacity=".13"/>
    <rect x="${x - 6}" y="506" width="124" height="124" rx="25" fill="#111820" stroke="${accent}" stroke-width="3.5" stroke-opacity=".9"/>
    <image href="${href}" x="${x}" y="512" width="112" height="112"/>`;
}).join("");

const productName = escapeXml("Rhao92's The Bus Stream Deck Plugin");
const preview = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#071018"/>
      <stop offset="0.55" stop-color="#11171d"/>
      <stop offset="1" stop-color="#05090d"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0" r="85%">
      <stop offset="0" stop-color="#18c9ff" stop-opacity=".22"/>
      <stop offset=".55" stop-color="#18c9ff" stop-opacity=".04"/>
      <stop offset="1" stop-color="#18c9ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-10%" y="-40%" width="120%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="13" flood-color="#000" flood-opacity=".75"/>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#background)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <text x="640" y="48" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" fill="#fff">${productName}</text>
  <text x="640" y="76" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" letter-spacing="2.5" fill="#43d7ff">LIVE TELEMETRY · VEHICLE CONTROLS · NAVIGATION</text>
  <g filter="url(#shadow)">
    <rect x="143" y="92" width="994" height="390" rx="25" fill="#171d23" stroke="#35434f" stroke-width="3"/>
    <image href="${panelNavigation}" x="160" y="104" width="960" height="120"/>
    <image href="${panelTimetable}" x="160" y="228" width="960" height="120"/>
    <image href="${panelVehicle}" x="160" y="352" width="960" height="120"/>
  </g>
  <g filter="url(#shadow)">${keyMarkup}</g>
  <text x="640" y="684" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" fill="#c8d3dc">Version 2.17.0 · Free for Elgato Stream Deck and Stream Deck Mobile</text>
</svg>`;

await sharp(Buffer.from(preview))
  .flatten({ background: "#071018" })
  .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
  .toFile(outputPath);

console.log(outputPath);
