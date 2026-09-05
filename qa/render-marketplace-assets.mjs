import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [visualDirectory, pluginDirectory, appIconPath, outputDirectory, sharpModulePath] =
  process.argv.slice(2);

if (!visualDirectory || !pluginDirectory || !appIconPath || !outputDirectory || !sharpModulePath) {
  throw new Error(
    "Usage: node qa/render-marketplace-assets.mjs <visual-directory> <plugin-directory> <app-icon.png> <output-directory> <sharp-module-path>",
  );
}

const sharpModule = await import(pathToFileURL(sharpModulePath).href);
const sharp = sharpModule.default;
await mkdir(outputDirectory, { recursive: true });

const opaqueBackground = "#05090d";

const appIconForeground = await sharp(appIconPath)
  .resize(288, 288)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 288,
    height: 288,
    channels: 3,
    background: "#0b2230",
  },
})
  .composite([{ input: appIconForeground, blend: "screen" }])
  .flatten({ background: "#0b2230" })
  .removeAlpha()
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(`${outputDirectory}/Rhao92-The-Bus-Stream-Deck-Plugin-App-Icon-288.png`);

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const dataUri = async (filePath, mimeType) => {
  const source = await readFile(filePath);
  return `data:${mimeType};base64,${source.toString("base64")}`;
};

const visualSvg = (name) => dataUri(`${visualDirectory}/${name}.svg`, "image/svg+xml");
const pluginPng = (relativePath) => dataUri(`${pluginDirectory}/${relativePath}`, "image/png");

const appIcon = await dataUri(appIconPath, "image/png");
const timetable = await visualSvg("12-fullpanel-timetable-bright");
const vehicle = await visualSvg("13-fullpanel-vehicle");
const navigation = await visualSvg("16-fullpanel-navigation");
const navigationPause = await visualSvg("17-fullpanel-navigation-pause");

const telemetryKeys = await Promise.all([
  "03-button-stop-bright",
  "04b-button-ingame",
  "05-speed-normal",
  "08-limit",
  "09-power",
  "10-battery",
].map(visualSvg));

const controlKeys = await Promise.all([
  "imgs/actions/all-doors/mixed.png",
  "imgs/actions/door-clearance/active.png",
  "imgs/actions/kneeling/active.png",
  "imgs/actions/ramp/active.png",
  "imgs/actions/indicator-left/active.png",
  "imgs/actions/warning-lights/active.png",
  "imgs/actions/ignition/engine.png",
  "imgs/actions/passenger-lights/bright.png",
].map(pluginPng));

const navigationKeys = await Promise.all([
  "18-navigation-pause",
  "19-navigation-pause-target",
  "20-navigation-total-distance",
  "21-navigation-remaining-distance",
].map(visualSvg));

const defs = `
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#05090d"/>
      <stop offset=".52" stop-color="#101820"/>
      <stop offset="1" stop-color="#030608"/>
    </linearGradient>
    <radialGradient id="cyanGlow" cx="72%" cy="32%" r="66%">
      <stop offset="0" stop-color="#38c9ff" stop-opacity=".23"/>
      <stop offset=".55" stop-color="#38c9ff" stop-opacity=".035"/>
      <stop offset="1" stop-color="#38c9ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="amberGlow" cx="18%" cy="88%" r="64%">
      <stop offset="0" stop-color="#ffc21d" stop-opacity=".12"/>
      <stop offset="1" stop-color="#ffc21d" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity=".78"/>
    </filter>
    <filter id="softCyan" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#38c9ff" flood-opacity=".34"/>
    </filter>
  </defs>`;

const background = `
  <rect width="1920" height="960" fill="url(#background)"/>
  <rect width="1920" height="960" fill="url(#cyanGlow)"/>
  <rect width="1920" height="960" fill="url(#amberGlow)"/>
  <path d="M0 868H1920" stroke="#38c9ff" stroke-opacity=".14" stroke-width="2"/>
  <path d="M0 92H1920" stroke="#ffffff" stroke-opacity=".06" stroke-width="2"/>`;

const brand = (section) => `
  <text x="96" y="68" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="800" letter-spacing="1.8" fill="#ffc21d">THE BUS CONTROL CENTER</text>
  <text x="1824" y="68" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700" letter-spacing="2.2" fill="#8ca0ae">${escapeXml(section)}</text>`;

const pill = (x, y, width, label, color = "#38c9ff") => `
  <rect x="${x}" y="${y}" width="${width}" height="44" rx="22" fill="${color}" fill-opacity=".09" stroke="${color}" stroke-opacity=".56"/>
  <text x="${x + width / 2}" y="${y + 29}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="800" fill="${color}">${escapeXml(label)}</text>`;

const panelFrame = (x, y, width, height) => `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="28" fill="#111922" stroke="#486171" stroke-opacity=".72" stroke-width="2" filter="url(#shadow)"/>
  <rect x="${x + 10}" y="${y + 10}" width="${width - 20}" height="${height - 20}" rx="21" fill="#060a0e" stroke="#ffffff" stroke-opacity=".04"/>`;

const keyRow = (images, x, y, size, gap) => images.map((href, index) => `
  <rect x="${x + index * (size + gap) - 7}" y="${y - 7}" width="${size + 14}" height="${size + 14}" rx="26" fill="#111820" stroke="#38c9ff" stroke-opacity=".25" filter="url(#shadow)"/>
  <image href="${href}" x="${x + index * (size + gap)}" y="${y}" width="${size}" height="${size}"/>`).join("");

const render = async (name, body) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960" viewBox="0 0 1920 960">${defs}${background}${body}</svg>`;
  await sharp(Buffer.from(svg))
    .flatten({ background: opaqueBackground })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(`${outputDirectory}/${name}`);
};

await render("Marketplace-Thumbnail-1920x960.png", `
  ${brand("FREE COMMUNITY PLUGIN")}
  <image href="${appIcon}" x="112" y="184" width="276" height="276" filter="url(#shadow)"/>
  <text x="112" y="548" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="900" fill="#ffffff">LIVE TELEMETRY.</text>
  <text x="112" y="614" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="900" fill="#ffffff">REAL FEEDBACK.</text>
  <text x="112" y="676" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="700" fill="#8fdfff">Controls, navigation and full-panel displays</text>
  ${pill(112, 730, 178, "WINDOWS")}
  ${pill(306, 730, 222, "STREAM DECK")}
  ${pill(544, 730, 270, "MOBILE", "#ffc21d")}
  ${panelFrame(730, 146, 1092, 510)}
  <image href="${navigation}" x="760" y="178" width="1032" height="129"/>
  <image href="${timetable}" x="760" y="325" width="1032" height="129"/>
  <image href="${vehicle}" x="760" y="472" width="1032" height="129"/>
  ${keyRow(telemetryKeys, 852, 700, 116, 30)}
  <text x="1824" y="914" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#7e909d">Independent and unofficial · Version 2.17.0</text>`);

await render("Marketplace-Gallery-01-Live-Telemetry-1920x960.png", `
  ${brand("LIVE TELEMETRY & FULL PANELS")}
  <text x="96" y="190" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900" fill="#ffffff">LIVE DATA.</text>
  <text x="96" y="250" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900" fill="#38c9ff">CLEAR FEEDBACK.</text>
  <text x="98" y="310" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="700" fill="#b4c2cc">Confirmed game telemetry.</text>
  <text x="98" y="341" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="700" fill="#8ca0ae">Designed for a quick glance.</text>

  <rect x="98" y="392" width="8" height="64" rx="4" fill="#ffc21d"/>
  <text x="132" y="414" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="#ffffff">TIMETABLE</text>
  <text x="132" y="449" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#8ca0ae">Next stop, arrival, departure and delta</text>

  <rect x="98" y="496" width="8" height="64" rx="4" fill="#38c9ff"/>
  <text x="132" y="518" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="#ffffff">VEHICLE STATUS</text>
  <text x="132" y="553" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#8ca0ae">Speed, battery, gear, doors and kneeling</text>

  <rect x="98" y="600" width="8" height="64" rx="4" fill="#78d83a"/>
  <text x="132" y="622" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="#ffffff">TRIP CONSUMPTION</text>
  <text x="132" y="657" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#8ca0ae">Persistent average from confirmed energy data</text>

  ${pill(98, 730, 252, "STREAM DECK +")}
  ${pill(368, 730, 218, "MOBILE", "#ffc21d")}

  ${panelFrame(690, 140, 1136, 700)}
  <text x="738" y="196" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="800" letter-spacing="2" fill="#8ca0ae">FULL-PANEL VIEW</text>
  <image href="${timetable}" x="738" y="230" width="1040" height="130"/>
  <image href="${vehicle}" x="738" y="390" width="1040" height="130"/>
  <text x="738" y="584" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="800" letter-spacing="2" fill="#8ca0ae">KEY TELEMETRY</text>
  ${keyRow(telemetryKeys, 780, 620, 116, 34)}
  <text x="1824" y="914" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="#7e909d">Unknown values remain neutral — no invented states</text>`);

await render("Marketplace-Gallery-02-Vehicle-Controls-1920x960.png", `
  ${brand("VEHICLE CONTROLS")}
  <text x="96" y="192" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="#ffffff">CONTROL THE BUS.</text>
  <text x="96" y="260" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="#ffc21d">SEE THE REAL STATE.</text>
  <text x="98" y="322" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#b4c2cc">Doors, kneeling, access, lighting and driving controls react to game feedback.</text>
  ${keyRow(controlKeys.slice(0, 4), 140, 420, 150, 52)}
  ${keyRow(controlKeys.slice(4), 1030, 420, 150, 52)}
  <text x="518" y="640" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="800" fill="#38c9ff">DOORS &amp; ACCESS</text>
  <text x="1408" y="640" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="800" fill="#ffc21d">DRIVING &amp; LIGHTING</text>
  ${pill(282, 720, 216, "DOOR ALL")}
  ${pill(514, 720, 202, "KNEELING")}
  ${pill(1094, 720, 210, "INDICATORS", "#ffc21d")}
  ${pill(1320, 720, 214, "IGNITION", "#ffc21d")}
  <text x="960" y="878" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700" fill="#8ca0ae">Compatible actions for keys, dials and Stream Deck Mobile</text>`);

await render("Marketplace-Gallery-03-Navigation-1920x960.png", `
  ${brand("EXPERIMENTAL NAVIGATION")}
  <text x="96" y="192" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="#ffffff">ROUTE-AWARE GUIDANCE.</text>
  <text x="96" y="260" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="#38c9ff">SAFE WHEN DATA IS UNCERTAIN.</text>
  <text x="98" y="322" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#b4c2cc">Maneuvers, next stop, line progress, ETA and confirmed operational pause points.</text>
  ${panelFrame(94, 382, 1732, 264)}
  <image href="${navigation}" x="132" y="420" width="1656" height="207"/>
  ${keyRow(navigationKeys, 248, 710, 146, 98)}
  <image href="${navigationPause}" x="1160" y="704" width="620" height="78"/>
  <text x="1160" y="842" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700" fill="#b4c2cc">Manual 60-second diagnostics only after pressing the debug action.</text>
  <text x="1160" y="880" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" fill="#7e909d">Unconfirmed guidance is deliberately hidden.</text>`);

console.log(pathToFileURL(`${outputDirectory}/`).href);
