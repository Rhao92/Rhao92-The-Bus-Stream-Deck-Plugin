import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

let Resvg;
try {
  ({ Resvg } = await import("@resvg/resvg-js"));
} catch {
  // PNG-Ausgabe ist optional. Die SVG-Vorschauen bleiben ohne Zusatzpaket
  // vollständig prüfbar und werden weiterhin erzeugt.
}

const outputDirectory = process.argv[2] ?? "/tmp/rhao92-the-bus-stream-deck-plugin-2.17.0-visual";
const previewLanguage = process.argv[3] === "en" ? "en" : "de";
await mkdir(outputDirectory, { recursive: true });

const sourceUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
const importSource = async (source) => import(sourceUrl(source));

const localizationSource = await readFile(
  new URL("../src/core/localization.ts", import.meta.url),
  "utf8",
);
const localizationModule = sourceUrl(localizationSource);
const localization = await import(localizationModule);
localization.setDisplayLanguage(previewLanguage);

const rendererSource = (await readFile(
  new URL("../src/fullpanel/renderers.ts", import.meta.url),
  "utf8",
)).replace(
  'from "../core/localization";',
  `from "${localizationModule}";`,
);
const rendererModule = sourceUrl(rendererSource);
const renderers = await import(rendererModule);

const fullpanelTypeScript = await readFile(
  new URL("../src/fullpanel/fullpanel-renderer.ts", import.meta.url),
  "utf8"
);
const fullpanelJavaScript = ts.transpileModule(fullpanelTypeScript, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
  .replace('from "./renderers";', `from "${rendererModule}";`)
  .replace('from "../core/localization";', `from "${localizationModule}";`);
const fullpanel = await importSource(fullpanelJavaScript);

const offlineTypeScript = await readFile(
  new URL("../src/core/offline-renderer.ts", import.meta.url),
  "utf8"
);
const offlineJavaScript = ts.transpileModule(offlineTypeScript, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const offlineModule = `data:text/javascript;base64,${Buffer.from(
  offlineJavaScript,
  "utf8"
).toString("base64")}`;
const navigationTypeScript = await readFile(
  new URL("../src/navigation/navigation-renderer.ts", import.meta.url),
  "utf8"
);
const navigationJavaScript = ts.transpileModule(navigationTypeScript, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
  .replace(
    'from "../core/offline-renderer"',
    `from "${offlineModule}"`,
  )
  .replace(
    'from "../core/localization"',
    `from "${localizationModule}"`,
  );
const navigation = await importSource(navigationJavaScript);

const liveView = {
  language: previewLanguage,
  runtimeState: "mission-ready",
  online: true,
  inVehicle: true,
  connectionLabel: "LIVE",
  stopName: "S+U Zoologischer Garten",
  arrival: "15:18",
  departure: "15:17",
  deltaText: "−1:02",
  deltaSeconds: -62,
  deltaSource: "MISSION",
  status: previewLanguage === "en" ? "EARLY" : "VERFRÜHT",
  ingameTime: "15:16:58",
  stopRequest: true,
  speed: 50,
  allowedSpeed: 50,
  speedOverLimit: 0,
  speedLevel: "normal",
  gear: "D",
  batteryPercent: 78,
  doors: previewLanguage === "en" ? "CLOSED" : "GESCHLOSSEN",
  parkingBrake: previewLanguage === "en" ? "OFF" : "AUS",
  autoKneeling: false,
  mechanicalKneeling: "READY",
  power: previewLanguage === "en" ? "18.7 kWh/100 km" : "18,7 kWh/100 km",
  powerSource: "average-consumption",
};

const decodeDataUri = (value) => Buffer.from(value.split(",", 2)[1], "base64");
const saveSvgAndPng = async (name, svg) => {
  await writeFile(`${outputDirectory}/${name}.svg`, svg);
  if (Resvg) {
    const rendered = new Resvg(svg, { fitTo: { mode: "original" } }).render();
    await writeFile(`${outputDirectory}/${name}.png`, rendered.asPng());
  }
};
const saveDataUri = (name, value) => saveSvgAndPng(name, decodeDataUri(value));
const saveSvg = (name, value) => saveSvgAndPng(name, value);

const navigationModel = {
  online: true,
  inVehicle: true,
  status: "live",
  nextManeuver: "right",
  maneuverDistance: 105,
  activeManeuver: { id: "preview-right", kind: "right", distance: 105 },
  nextRelevantStop: "Invalidenpark",
  nextRelevantStopDistance: 105,
  totalRouteDistance: 14_000,
  remainingRouteDistance: 3_500,
  routeDistanceEstimated: true,
  routeProgress: 0.75,
  estimatedArrivalTime: "15:24",
  predictedScheduleDelta: -228,
  predictionConfidence: "high",
  routeLaneCount: 1,
};

const terminalPauseModel = {
  ...navigationModel,
  nextManeuver: "pause",
  activeManeuver: { id: "preview-terminal-pause", kind: "pause", distance: 0 },
  nextRelevantStop: "Hertzallee",
  nextRelevantStopDistance: 0,
  nextTargetKind: "terminal-pause",
  totalRouteDistance: 11_300,
  remainingRouteDistance: 11_300,
  routeDistanceEstimated: true,
};

await Promise.all([
  saveDataUri("01-single-stop-bright", renderers.renderSinglePanel(liveView, "stop", true)),
  saveDataUri("02-single-status-dim", renderers.renderSinglePanel(liveView, "status", false)),
  saveDataUri("03-button-stop-bright", renderers.renderTimetableKeypad({ ...liveView, stopRequest: false }, "stop", true)),
  saveDataUri("04-button-arrival", renderers.renderTimetableKeypad({ ...liveView, stopRequest: false }, "arrival", false)),
  saveDataUri("04b-button-ingame", renderers.renderTimetableKeypad({ ...liveView, stopRequest: false }, "ingame", true)),
  saveDataUri("05-speed-normal", renderers.renderKeypad(liveView, "speed")),
  saveDataUri("06-speed-warning", renderers.renderKeypad({ ...liveView, speed: 54, speedOverLimit: 4, speedLevel: "warning" }, "speed")),
  saveDataUri("07-speed-critical", renderers.renderKeypad({ ...liveView, speed: 55, speedOverLimit: 5, speedLevel: "critical" }, "speed")),
  saveDataUri("08-limit", renderers.renderKeypad(liveView, "limit")),
  saveDataUri("09-power", renderers.renderKeypad(liveView, "power")),
  saveDataUri("10-battery", renderers.renderKeypad(liveView, "battery")),
  saveDataUri("11-battery-low", renderers.renderKeypad({ ...liveView, batteryPercent: 12 }, "battery")),
  saveSvg("12-fullpanel-timetable-bright", fullpanel.renderFullpanel({ ...liveView, stopRequest: false }, "timetable", true)),
  saveSvg("13-fullpanel-vehicle", fullpanel.renderFullpanel(liveView, "vehicle", false)),
  saveSvg("14-fullpanel-vehicle-lowering", fullpanel.renderFullpanel({
    ...liveView,
    speed: 0,
    mechanicalKneeling: previewLanguage === "en" ? "LOWERING" : "SENKT AB",
    power: previewLanguage === "en" ? "19.1 kWh/100 km" : "19,1 kWh/100 km",
    powerSource: "average-consumption",
  }, "vehicle", false)),
  saveSvg("15-fullpanel-vehicle-active", fullpanel.renderFullpanel({
    ...liveView,
    speed: 0,
    mechanicalKneeling: previewLanguage === "en" ? "ACTIVE" : "AKTIV",
    power: previewLanguage === "en" ? "19.1 kWh/100 km" : "19,1 kWh/100 km",
    powerSource: "average-consumption",
  }, "vehicle", false)),
  saveSvg("16-fullpanel-navigation", fullpanel.renderFullpanel(
    liveView,
    "navigation",
    true,
    undefined,
    navigationModel,
  )),
  saveSvg("17-fullpanel-navigation-pause", fullpanel.renderFullpanel(
    liveView,
    "navigation",
    true,
    undefined,
    terminalPauseModel,
  )),
  saveDataUri("18-navigation-pause", navigation.renderNavigationKey(terminalPauseModel, "maneuver")),
  saveDataUri("19-navigation-pause-target", navigation.renderNavigationKey(terminalPauseModel, "next-stop")),
  saveDataUri("20-navigation-total-distance", navigation.renderNavigationKey(terminalPauseModel, "total-distance")),
  saveDataUri("21-navigation-remaining-distance", navigation.renderNavigationKey(terminalPauseModel, "remaining-distance")),
]);

console.log(pathToFileURL(`${outputDirectory}/`).href);
