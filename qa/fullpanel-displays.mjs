import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceModule = async (relativePath) => {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};
const { createViewModel } = await sourceModule("../src/fullpanel/view-model.ts");
const {
  renderKeypad,
  renderSinglePanel,
  renderTimetableKeypad,
  timetablePalette,
} = await sourceModule("../src/fullpanel/renderers.ts");

function svgFromDataUri(uri) {
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  return Buffer.from(uri.split(",", 2)[1], "base64").toString("utf8");
}

function vehicleView(speed, allowedSpeed) {
  return createViewModel({
    online: true,
    player: { Mode: "Vehicle", CurrentVehicle: "Bus_1003" },
    vehicle: { Speed: speed, AllowedSpeed: allowedSpeed },
    mission: {},
    world: {},
  });
}

const baseView = {
  connectionLabel: "LIVE",
  stopName: "Spandauer Str./Marienkirche",
  arrival: "10:51",
  departure: "10:52",
  deltaText: "+0:37",
  ingameTime: "10:50",
  status: "PÜNKTLICH",
  stopRequest: false,
};

const expectedPanelText = new Map([
  ["stop", "Spandauer Str./Marienkirche"],
  ["arrival", "10:51"],
  ["departure", "10:52"],
  ["delta", "+0:37"],
  ["ingame", "10:50"],
  ["status", "PÜNKTLICH"],
]);

for (const [kind, expected] of expectedPanelText) {
  const svg = svgFromDataUri(renderSinglePanel(baseView, kind));
  assert.match(svg, /2\.15 BETA/);
  assert.ok(svg.includes(expected), `${kind} enthält ${expected}`);
}

const longStopSvg = svgFromDataUri(renderSinglePanel({
  ...baseView,
  stopName: "Nordische Botschaften/Adenauer Stiftung & Gäste",
}, "stop"));
assert.match(longStopSvg, /textLength="172"/);
assert.match(longStopSvg, /&amp; Gäste/);
assert.doesNotMatch(longStopSvg, /<path|<circle/);

const requestedStopDim = svgFromDataUri(renderSinglePanel({
  ...baseView,
  stopRequest: true,
}, "stop", false));
const requestedStopBright = svgFromDataUri(renderSinglePanel({
  ...baseView,
  stopRequest: true,
}, "stop", true));
assert.notEqual(requestedStopDim, requestedStopBright);
assert.match(requestedStopBright, />STOP</);
assert.match(requestedStopBright, /fill="#d8172b"/);
assert.ok(requestedStopBright.includes(baseView.stopName));
assert.doesNotMatch(requestedStopBright, /<path|<circle/);

assert.equal(timetablePalette(baseView).accent, "#78d83a");
assert.equal(timetablePalette({ ...baseView, status: "VERFRÜHT" }).accent, "#ffc21d");
assert.equal(timetablePalette({ ...baseView, status: "VERSPÄTET" }).accent, "#ff4050");
assert.equal(timetablePalette({ ...baseView, status: "UNBEKANNT" }).accent, "#f4b942");

const stopDim = svgFromDataUri(renderSinglePanel({ ...baseView, stopRequest: true }, "status", false));
const stopBright = svgFromDataUri(renderSinglePanel({ ...baseView, stopRequest: true }, "status", true));
assert.notEqual(stopDim, stopBright);
assert.match(stopDim, />STOP</);
assert.match(stopBright, />STOP</);
assert.match(stopBright, /stroke="#78d83a"/);
assert.match(stopBright, /fill="#d8172b"/);

const normal = vehicleView(50, 50);
const warningOne = vehicleView(51, 50);
const warningFour = vehicleView(54.4, 50);
const critical = vehicleView(54.6, 50);
const noLimit = vehicleView(72, 0);

assert.equal(normal.speedLevel, "normal");
assert.equal(warningOne.speedLevel, "warning");
assert.equal(warningFour.speed, 54);
assert.equal(warningFour.speedLevel, "warning");
assert.equal(critical.speed, 55);
assert.equal(critical.speedLevel, "critical");
assert.equal(noLimit.speedLevel, "normal");

assert.match(svgFromDataUri(renderKeypad(normal, "speed")), /fill="#ffffff"/);
assert.match(svgFromDataUri(renderKeypad(warningOne, "speed")), /fill="#ffc21d"/);
assert.match(svgFromDataUri(renderKeypad(warningFour, "speed")), /fill="#ffc21d"/);
assert.match(svgFromDataUri(renderKeypad(critical, "speed")), /fill="#ff4050"/);
const speedSvg = svgFromDataUri(renderKeypad(normal, "speed"));
assert.match(speedSvg, />km\/h</);
assert.doesNotMatch(speedSvg, /GESCHWINDIGKEIT|TEMPOLIMIT|LIMIT/);

const limitSvg = svgFromDataUri(renderKeypad(normal, "limit"));
assert.match(limitSvg, />50</);
assert.match(limitSvg, /stroke="#ff3345"/);
assert.doesNotMatch(limitSvg, /TEMPOLIMIT|km\/h|GESCHWINDIGKEIT/);

const missingLimitSvg = svgFromDataUri(renderKeypad(noLimit, "limit"));
assert.match(missingLimitSvg, />--</);

const electric = {
  ...normal,
  power: "−39,8 kW",
  batteryPercent: 78,
};
const powerSvg = svgFromDataUri(renderKeypad(electric, "power"));
assert.match(powerSvg, />−39,8</);
assert.match(powerSvg, />kW</);
assert.doesNotMatch(powerSvg, /LEISTUNG|POWER/);

const batterySvg = svgFromDataUri(renderKeypad(electric, "battery"));
assert.match(batterySvg, />78%</);
assert.equal((batterySvg.match(/data-battery-cell=/g) ?? []).length, 0);
assert.equal((batterySvg.match(/data-battery-fill=/g) ?? []).length, 1);
assert.match(batterySvg, /data-battery-fill="continuous"[^>]*width="68\.6"/);
assert.doesNotMatch(batterySvg, /AKKU|BATTER/);

const emptyBatterySvg = svgFromDataUri(renderKeypad({
  ...electric,
  batteryPercent: 0,
}, "battery"));
assert.equal((emptyBatterySvg.match(/data-battery-fill=/g) ?? []).length, 1);
assert.match(emptyBatterySvg, /data-battery-fill="continuous"[^>]*width="0"/);

const fullBatterySvg = svgFromDataUri(renderKeypad({
  ...electric,
  batteryPercent: 100,
}, "battery"));
assert.equal((fullBatterySvg.match(/data-battery-fill=/g) ?? []).length, 1);
assert.match(fullBatterySvg, /data-battery-fill="continuous"[^>]*width="88"/);

const warningBatterySvg = svgFromDataUri(renderKeypad({
  ...electric,
  batteryPercent: 29,
}, "battery"));
assert.match(warningBatterySvg, /#ffc21d/);

const criticalBatterySvg = svgFromDataUri(renderKeypad({
  ...electric,
  batteryPercent: 14,
}, "battery"));
assert.match(criticalBatterySvg, /#ff4050/);

const offlineVehicleSvg = svgFromDataUri(renderKeypad({
  ...normal,
  runtimeState: "offline",
  connectionLabel: "OFFLINE",
}, "speed"));
assert.match(offlineVehicleSvg, />OFFLINE</);
assert.match(svgFromDataUri(renderKeypad({
  ...electric,
  runtimeState: "offline",
  connectionLabel: "OFFLINE",
}, "power")), />OFFLINE</);
assert.match(svgFromDataUri(renderKeypad({
  ...electric,
  runtimeState: "offline",
  connectionLabel: "OFFLINE",
}, "battery")), />OFFLINE</);

const noBusVehicleSvg = svgFromDataUri(renderKeypad({
  ...normal,
  runtimeState: "no-bus",
  connectionLabel: "NICHT IM BUS",
}, "speed"));
assert.match(noBusVehicleSvg, />--</);
assert.match(noBusVehicleSvg, /stroke="#8d96a3"/);

const expectedButtonText = new Map([
  ["arrival", "10:51"],
  ["departure", "10:52"],
  ["delta", "+0:37"],
  ["ingame", "10:50"],
  ["status", "PÜNKTLICH"],
]);

const stopButton = svgFromDataUri(renderTimetableKeypad(baseView, "stop"));
assert.match(stopButton, /width="144" height="144"/);
assert.match(stopButton, /Spandauer Str\.\//);
assert.match(stopButton, /Marienkirche/);
assert.match(stopButton, /2\.15 BETA/);

for (const [kind, expected] of expectedButtonText) {
  const svg = svgFromDataUri(renderTimetableKeypad(baseView, kind));
  assert.match(svg, /width="144" height="144"/);
  assert.ok(svg.includes(expected), `Fahrplan-Button ${kind} enthält ${expected}`);
}

const longStopButton = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  stopName: "Nordische Botschaften/Adenauer Stiftung & Gäste",
}, "stop"));
assert.match(longStopButton, /Nordische Botschaften/);
assert.match(longStopButton, /Adenauer Stiftung &amp; Gäste/);

const requestedStopButtonDim = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  stopRequest: true,
}, "stop", false));
const requestedStopButtonBright = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  stopRequest: true,
}, "stop", true));
assert.notEqual(requestedStopButtonDim, requestedStopButtonBright);
assert.match(requestedStopButtonBright, />STOP</);
assert.match(requestedStopButtonBright, /fill="#d8172b"/);
assert.match(requestedStopButtonBright, /stroke="#78d83a"/);
assert.match(requestedStopButtonBright, /Spandauer Str\.\//);
assert.match(requestedStopButtonBright, /Marienkirche/);

const requestedStatusButtonDim = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  stopRequest: true,
}, "status", false));
const requestedStatusButtonBright = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  stopRequest: true,
}, "status", true));
assert.notEqual(requestedStatusButtonDim, requestedStatusButtonBright);
assert.match(requestedStatusButtonBright, />STOP</);
assert.match(requestedStatusButtonBright, /fill="#d8172b"/);
assert.match(requestedStatusButtonBright, /stroke="#78d83a"/);

const offlineButton = svgFromDataUri(renderTimetableKeypad({
  ...baseView,
  runtimeState: "offline",
  connectionLabel: "OFFLINE",
}, "arrival"));
assert.match(offlineButton, />OFFLINE</);

console.log("single-displays: all tests passed");
