import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { Resvg } from "@resvg/resvg-js";

const outputDirectory = process.argv[2] ?? "/tmp/rhao92-the-bus-telemetry-interface-2.15.0.18-beta-visual";
await mkdir(outputDirectory, { recursive: true });

const importSource = async (source) => import(
  `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`
);

const rendererSource = await readFile(
  new URL("../src/fullpanel/renderers.ts", import.meta.url),
  "utf8"
);
const renderers = await importSource(rendererSource);

const fullpanelTypeScript = await readFile(
  new URL("../src/fullpanel/fullpanel-renderer.ts", import.meta.url),
  "utf8"
);
const fullpanelJavaScript = ts.transpileModule(fullpanelTypeScript, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const fullpanel = await importSource(fullpanelJavaScript);

const liveView = {
  online: true,
  inVehicle: true,
  connectionLabel: "LIVE",
  stopName: "S+U Zoologischer Garten",
  arrival: "15:18",
  departure: "15:17",
  deltaText: "−1:02",
  deltaSeconds: -62,
  deltaSource: "MISSION",
  status: "VERFRÜHT",
  ingameTime: "15:16:58",
  stopRequest: true,
  speed: 50,
  allowedSpeed: 50,
  speedOverLimit: 0,
  speedLevel: "normal",
  gear: "D",
  batteryPercent: 78,
  doors: "GESCHLOSSEN",
  parkingBrake: "AUS",
  autoKneeling: false,
  mechanicalKneeling: "READY",
  power: "−45,0 kW",
};

const decodeDataUri = (value) => Buffer.from(value.split(",", 2)[1], "base64");
const saveSvgAndPng = async (name, svg) => {
  await writeFile(`${outputDirectory}/${name}.svg`, svg);
  const rendered = new Resvg(svg, { fitTo: { mode: "original" } }).render();
  await writeFile(`${outputDirectory}/${name}.png`, rendered.asPng());
};
const saveDataUri = (name, value) => saveSvgAndPng(name, decodeDataUri(value));
const saveSvg = (name, value) => saveSvgAndPng(name, value);

await Promise.all([
  saveDataUri("01-single-stop-bright", renderers.renderSinglePanel(liveView, "stop", true)),
  saveDataUri("02-single-status-dim", renderers.renderSinglePanel(liveView, "status", false)),
  saveDataUri("03-button-stop-bright", renderers.renderTimetableKeypad(liveView, "stop", true)),
  saveDataUri("04-button-arrival", renderers.renderTimetableKeypad({ ...liveView, stopRequest: false }, "arrival", false)),
  saveDataUri("05-speed-normal", renderers.renderKeypad(liveView, "speed")),
  saveDataUri("06-speed-warning", renderers.renderKeypad({ ...liveView, speed: 54, speedOverLimit: 4, speedLevel: "warning" }, "speed")),
  saveDataUri("07-speed-critical", renderers.renderKeypad({ ...liveView, speed: 55, speedOverLimit: 5, speedLevel: "critical" }, "speed")),
  saveDataUri("08-limit", renderers.renderKeypad(liveView, "limit")),
  saveDataUri("09-power", renderers.renderKeypad(liveView, "power")),
  saveDataUri("10-battery", renderers.renderKeypad(liveView, "battery")),
  saveDataUri("11-battery-low", renderers.renderKeypad({ ...liveView, batteryPercent: 12 }, "battery")),
  saveSvg("12-fullpanel-timetable-bright", fullpanel.renderFullpanel(liveView, "timetable", false, true)),
  saveSvg("13-fullpanel-vehicle", fullpanel.renderFullpanel(liveView, "vehicle", false, false)),
  saveSvg("14-fullpanel-vehicle-lowering", fullpanel.renderFullpanel({
    ...liveView,
    speed: 0,
    mechanicalKneeling: "SENKT AB",
    power: "+145,0 kW",
  }, "vehicle", false, false)),
  saveSvg("15-fullpanel-vehicle-active", fullpanel.renderFullpanel({
    ...liveView,
    speed: 0,
    mechanicalKneeling: "AKTIV",
    power: "0,0 kW",
  }, "vehicle", false, false)),
]);

console.log(pathToFileURL(`${outputDirectory}/`).href);
