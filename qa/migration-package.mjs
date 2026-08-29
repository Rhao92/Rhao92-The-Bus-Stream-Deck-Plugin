import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pluginRoot = new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/", import.meta.url);
const compatibilityBaseline = JSON.parse(
  await readFile(new URL("compatibility-uuids.json", import.meta.url), "utf8"),
);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("manifest.json", pluginRoot), "utf8"));
const bundle = await readFile(new URL("bin/plugin.js", pluginRoot), "utf8");
const packageLockText = await readFile(new URL("package-lock.json", root), "utf8");
const propertyInspector = await readFile(
  new URL("property-inspector/timetable.html", pluginRoot),
  "utf8",
);
const generalPropertyInspector = await readFile(
  new URL("property-inspector.html", pluginRoot),
  "utf8",
);
const navigationPropertyInspector = await readFile(
  new URL("property-inspector/navigation.html", pluginRoot),
  "utf8",
);
const pluginSource = await readFile(new URL("src/plugin.ts", root), "utf8");
const fullpanelHubSource = await readFile(
  new URL("src/fullpanel/view-model-hub.ts", root),
  "utf8",
);

const retiredImageActions = new Set([
  "de.rhao92.thebus-telemetry-interface.touch-display",
  "de.rhao92.thebus-telemetry-interface.key-display",
  "de.rhao92.thebus-telemetry-interface.touch-game-time",
  "de.rhao92.thebus-telemetry-interface.touch-departure-delta",
  "de.rhao92.thebus-telemetry-interface.touch-scheduled-time",
  "de.rhao92.thebus-telemetry-interface.touch-departure-status",
  "de.rhao92.thebus-telemetry-interface.touch-timetable-combo",
  "de.rhao92.thebus-telemetry-interface.game-time",
  "de.rhao92.thebus-telemetry-interface.departure-time",
]);

assert.equal(packageJson.name, "rhao92-the-bus-telemetry-interface");
assert.equal(packageJson.version, "2.16.0");
assert.equal(packageLock.version, packageJson.version);
assert.equal(packageLock.packages[""].version, packageJson.version);
assert.equal(manifest.Name, "Rhao92's The Bus Stream Deck Plugin");
assert.equal(manifest.Category, manifest.Name);
assert.equal(manifest.Author, "Rhao92");
assert.equal(manifest.Version, "2.16.0.21");
assert.equal(manifest.UUID, "de.rhao92.thebus-telemetry-interface");
assert.equal(manifest.Actions.length, 50);
assert.doesNotMatch(
  JSON.stringify(manifest),
  /STOP-DEMO|STOP testen|TESTWERT|Regler testen|DRUCK ERKANNT/i,
);
assert.ok(manifest.Actions.some((entry) => entry.Controllers?.includes("Keypad")));
assert.ok(manifest.Actions.some((entry) => entry.Controllers?.includes("Encoder")));
assert.equal(packageJson.dependencies.pngjs, undefined);
assert.equal(packageJson.devDependencies["@types/pngjs"], undefined);
assert.doesNotMatch(packageLockText, /pngjs/i);
assert.match(
  pluginSource,
  /FullpanelViewModelHub\.instance\.start\(\)/,
  "Die Fahrtverbrauchsauswertung muss bereits beim Pluginstart laufen",
);
assert.doesNotMatch(
  fullpanelHubSource,
  /listeners\.size\s*===\s*0[\s\S]{0,180}unsubscribeTelemetry/,
  "Ein Seitenwechsel darf die gemeinsame Fahrtverbrauchsauswertung nicht beenden",
);

const uuids = manifest.Actions.map((entry) => entry.UUID);
assert.equal(new Set(uuids).size, uuids.length);
for (const uuid of compatibilityBaseline.requiredActionUuids) {
  assert.ok(
    uuids.includes(uuid),
    `Stabile 2.12.1.17-UUID fehlt: ${uuid}`,
  );
}
for (const uuid of retiredImageActions) {
  assert.ok(!uuids.includes(uuid), `Entfernte Bild-Action noch im Manifest: ${uuid}`);
}

const visibleNames = manifest.Actions
  .filter((entry) => entry.VisibleInActionsList !== false)
  .map((entry) => entry.Name);
assert.deepEqual(visibleNames, [
  "Fullpanel",
  "Fahrplan · Einzelpanel",
  "Fahrplan · Button",
  "Fahrplan · Haltewunsch",
  "Navigation",
  "Navigation · Debug speichern",
  "Fahrzeug · Geschwindigkeit",
  "Fahrzeug · Tempolimit",
  "Fahrzeug · Leistung",
  "Fahrzeug · Akku",
  "Klima · Steuerung",
  "Klima · Regler",
  "Türen · Türsteuerung",
  "Türen · Türfreigabe",
  "Türen · Automatisches Türschließen",
  "Fahrt · Gangwahl",
  "Fahrt · Blinker",
  "Fahrt · Zündung",
  "Fahrt · Feststellbremse",
  "Fahrt · Retarder",
  "Fahrt · Sonnenblende",
  "Fahrt · Scheibenwischer",
  "Einstieg · Kneeling",
  "Einstieg · Rollstuhlrampe",
  "Licht · Außenbeleuchtung",
  "Licht · Fahrgastraumlicht",
  "Ticketing · ATRON-Steuerung",
]);

for (const [uuid, controller, inspector] of [
  ["de.rhao92.thebus-telemetry-interface.fullpanel", "Encoder", undefined],
  ["de.rhao92.thebus-telemetry-interface.timetable-panel", "Encoder", "property-inspector/timetable.html"],
  ["de.rhao92.thebus-telemetry-interface.timetable-button", "Keypad", "property-inspector/timetable.html"],
  ["de.rhao92.thebus-telemetry-interface.navigation-maneuver", "Keypad", "property-inspector/navigation.html"],
  ["de.rhao92.thebus-telemetry-interface.navigation-debug-capture", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.vehicle-speed", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.vehicle-speed-limit", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.vehicle-power", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.vehicle-battery", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.hvac-control", "Keypad", "property-inspector/hvac.html"],
  ["de.rhao92.thebus-telemetry-interface.hvac-dial", "Encoder", "property-inspector/hvac.html"],
  ["de.rhao92.thebus-telemetry-interface.retarder-control", "Keypad", "property-inspector.html"],
  ["de.rhao92.thebus-telemetry-interface.sun-blind", "Keypad", undefined],
  ["de.rhao92.thebus-telemetry-interface.wiper-control", "Keypad", "property-inspector.html"],
  ["de.rhao92.thebus-telemetry-interface.exterior-light-control", "Keypad", "property-inspector.html"],
  ["de.rhao92.thebus-telemetry-interface.ticket-control", "Keypad", "property-inspector.html"],
]) {
  const entry = manifest.Actions.find((action) => action.UUID === uuid);
  assert.ok(entry, `Neue Action fehlt: ${uuid}`);
  assert.deepEqual(entry.Controllers, [controller]);
  assert.equal(entry.PropertyInspectorPath, inspector);
}

for (const kind of ["stop", "arrival", "departure", "delta", "ingame", "status"]) {
  assert.match(propertyInspector, new RegExp(`value="${kind}"`));
}
assert.match(propertyInspector, /event: "setSettings"/);
const inspectorScript = propertyInspector.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inspectorScript);
assert.doesNotThrow(() => new Function(inspectorScript));
assert.doesNotMatch(generalPropertyInspector, /touch-display|key-display/);
for (const mode of [
  "increase", "decrease", "off", "level-1", "level-5",
  "switch-up", "switch-down", "daytime", "parking", "headlights",
  "high-beam", "front-fog", "rear-fog", "atron", "take-cash",
  "coin-005", "coin-010", "coin-015", "coin-020", "coin-030",
  "coin-050", "coin-060", "coin-100", "coin-200", "coin-400",
  "coin-600", "coin-800",
]) {
  assert.match(generalPropertyInspector, new RegExp(`"${mode}"`));
}
const generalInspectorScript = generalPropertyInspector.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(generalInspectorScript);
assert.doesNotThrow(() => new Function(generalInspectorScript));
for (const kind of [
  "maneuver", "maneuver-distance", "next-stop", "total-distance", "remaining-distance",
  "route-progress", "eta", "predicted-delta", "confidence",
]) {
  assert.match(navigationPropertyInspector, new RegExp(`value="${kind}"`));
}
const navigationInspectorScript = navigationPropertyInspector.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(navigationInspectorScript);
assert.doesNotThrow(() => new Function(navigationInspectorScript));
assert.match(navigationPropertyInspector, /event: "setSettings"/);
assert.match(navigationPropertyInspector, /event: "getSettings"/);
assert.match(navigationPropertyInspector, /didReceiveSettings/);
assert.match(navigationPropertyInspector, /action: actionUuid/);
assert.match(navigationPropertyInspector, /pendingKind/);
const hvacPropertyInspector = await readFile(
  new URL("property-inspector/hvac.html", pluginRoot),
  "utf8",
);
for (const mode of [
  "climate", "ac-mode", "rear", "circulation", "circulation-front",
  "ventilation", "temperature-up", "temperature-down", "fan", "fan-down",
  "airflow-left", "airflow-right", "temperature", "fan-speed", "airflow",
]) {
  assert.match(hvacPropertyInspector, new RegExp(`"${mode}"`));
}
assert.match(hvacPropertyInspector, /event: "setSettings"/);
assert.match(hvacPropertyInspector, /event: "sendToPlugin"/);
assert.match(hvacPropertyInspector, /event: "getSettings"/);
assert.match(hvacPropertyInspector, /didReceiveSettings/);
assert.match(hvacPropertyInspector, /action: actionUuid/);
assert.match(hvacPropertyInspector, /pendingMode/);
const hvacInspectorScript = hvacPropertyInspector.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(hvacInspectorScript);
assert.doesNotThrow(() => new Function(hvacInspectorScript));

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const sourceFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(candidate);
    else if (entry.name.endsWith(".ts")) sourceFiles.push(candidate);
  }
}
await collect(sourceRoot);
const sourceUuids = new Set();
let sourceText = "";
for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, "utf8");
  sourceText += source;
  for (const match of source.matchAll(/@action\(\{ UUID: "([^"]+)" \}\)/g)) {
    sourceUuids.add(match[1]);
  }
}
assert.deepEqual(new Set(uuids), sourceUuids);
assert.doesNotMatch(sourceText, /imageBase64|AtronDisplayClient|\bUMG\b|pngjs/i);
assert.doesNotMatch(sourceText, /FanSpeedFake/i);
assert.doesNotMatch(sourceText, /STOP-DEMO|TESTWERT|Regler testen|DRUCK ERKANNT/i);
assert.match(sourceText, /NavigationDebugRecorder\.instance\.start\(\)/);
assert.match(sourceText, /Die Datei enthaelt die 60 Sekunden VOR dem Tastendruck/);
assert.match(sourceText, /join\(homedir\(\), "Documents", "Projekte", "The Bus", "NaviDebug"\)/);
assert.doesNotMatch(sourceText, /OneDriveConsumer|OneDriveCommercial/);

for (const uuid of uuids) {
  assert.ok(bundle.includes(uuid), `Runtime registriert ${uuid} nicht`);
}
for (const uuid of retiredImageActions) {
  assert.ok(!bundle.includes(uuid), `Entfernte Bild-Action noch im Runtime-Bundle: ${uuid}`);
}
assert.doesNotMatch(bundle, /FullpanelTelemetryClient/);
assert.doesNotMatch(bundle, /STOP-DEMO|TESTWERT|Regler testen|DRUCK ERKANNT/i);
assert.match(bundle, /GeoJsonRoadmap/);
assert.doesNotMatch(bundle, /imageBase64|AtronDisplayClient|\bUMG\b|pngjs/i);
assert.match(bundle, /Light Indicator Left/);
assert.match(bundle, /Light Indicator Right/);
assert.match(bundle, /LED Warning/);
assert.match(bundle, /Powermeter/);
assert.match(bundle, /CurrentFuel/);
assert.match(bundle, /MaxFuel/);
assert.match(bundle, /DisplayFuel/);
assert.match(bundle, /average-consumption-pending/);
assert.match(bundle, /resetAverageConsumption/);
assert.ok(
  bundle.includes("Documents")
    && bundle.includes("Projekte")
    && bundle.includes("NaviDebug"),
  "Portabler Navi-Debug-Zielordner fehlt im Runtime-Bundle",
);
assert.doesNotMatch(bundle, /setbutton/);
assert.doesNotMatch(bundle, /FanSpeedFake/i);
assert.match(bundle, /SENKT AB/);
assert.match(bundle, /HEBT AN/);
assert.match(sourceText, /sendEventForVehicleDetached[\s\S]*"press"/);
assert.match(sourceText, /sendEventForVehicleDetached[\s\S]*"release"/);
for (const marker of [
  "RetarderUp", "RetarderDown", "RetarderOff", "RetarderLevel5",
  "WindowShadeDown", "WindowShadeUp", "WiperDown", "WiperUp",
  "LightSwitchDown", "LightSwitchUp", "ToggleTravellerLights",
  "Select Boardcomputer", "Coins5", "Coins800", "Take Cash Money",
  "NUR ANZEIGE", "2.16", "Navigation Blackbox",
]) {
  assert.match(bundle, new RegExp(marker));
}

for (const entry of manifest.Actions) {
  const references = [
    entry.Icon,
    entry.PropertyInspectorPath,
    ...(entry.States ?? []).map((state) => state.Image),
    entry.Encoder?.Icon,
    entry.Encoder?.layout,
  ].filter(Boolean);
  for (const reference of references) {
    const value = String(reference);
    const candidate = value.includes(".")
      ? new URL(value, pluginRoot)
      : new URL(`${value}.png`, pluginRoot);
    await access(candidate);
  }
}

for (const removedPath of [
  "src/actions/atron-info.ts",
  "src/actions/consolidated-displays.ts",
  "src/actions/touch-panel.ts",
  "src/base/base-atron-action.ts",
  "src/base/base-configurable-atron-action.ts",
  "src/core/atron-display.ts",
  "src/core/atron-frame.ts",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/game-time",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/departure-time",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-game-time",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-departure-delta",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-departure-status",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-departure-time",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-scheduled-time",
  "de.rhao92.thebus-telemetry-interface.sdPlugin/imgs/actions/touch-timetable-combo",
]) {
  await assert.rejects(access(new URL(`../${removedPath}`, import.meta.url)));
}

const telemetrySource = await readFile(new URL("../src/core/telemetry.ts", import.meta.url), "utf8");
assert.match(telemetrySource, /VEHICLE_POLL_INTERVAL_MS = 100/);
assert.match(telemetrySource, /WORLD_POLL_INTERVAL_MS = 500/);
assert.ok(telemetrySource.includes("`${BASE_URL}/world`"));

console.log("migration-package: all tests passed");
