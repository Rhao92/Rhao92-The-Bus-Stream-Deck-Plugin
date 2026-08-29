import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pluginRoot = new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/", import.meta.url);
const source = await readFile(new URL("src/core/localization.ts", root), "utf8");
const localization = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

assert.equal(localization.normalizeDisplayLanguage("en"), "en");
assert.equal(localization.normalizeDisplayLanguage("en-US"), "en");
assert.equal(localization.normalizeDisplayLanguage("de-DE"), "de");
assert.equal(localization.normalizeDisplayLanguage("fr"), "de");
assert.equal(localization.setDisplayLanguage("en-GB"), "en");
assert.equal(localization.translateUi("next_stop"), "NEXT STOP");
assert.equal(localization.formatUiDecimal(12.34, 1), "12.3");
assert.equal(localization.setDisplayLanguage("de-DE"), "de");
assert.equal(localization.translateUi("next_stop"), "NÄCHSTE HALTESTELLE");
assert.equal(localization.formatUiDecimal(12.34, 1), "12,3");

const manifest = JSON.parse(await readFile(new URL("manifest.json", pluginRoot), "utf8"));
const english = JSON.parse(await readFile(new URL("en.json", pluginRoot), "utf8"));
assert.equal(english.Name, "Rhao92's The Bus Stream Deck Plugin");
assert.match(english.Description, /Stream Deck plugin for The Bus/i);
const manifestUuids = manifest.Actions.map((entry) => entry.UUID);
const localizedActionUuids = Object.keys(english).filter((key) => key.includes("."));
assert.deepEqual(localizedActionUuids.sort(), [...manifestUuids].sort());
assert.equal(english.Actions, undefined, "Action localizations must be top-level UUID keys");
for (const uuid of manifestUuids) {
  assert.ok(english[uuid]?.Name, `English action name missing: ${uuid}`);
  assert.ok(english[uuid]?.Tooltip, `English action tooltip missing: ${uuid}`);
}
assert.match(
  english["de.rhao92.thebus-telemetry-interface.vehicle-power"].Tooltip,
  /Pressing the key resets only this trip average/,
);
for (const action of manifest.Actions.filter((entry) => entry.Encoder?.TriggerDescription)) {
  const expectedFields = Object.keys(action.Encoder.TriggerDescription);
  const translatedFields = english[action.UUID]?.Encoder?.TriggerDescription ?? {};
  assert.deepEqual(
    Object.keys(translatedFields).sort(),
    expectedFields.sort(),
    `English encoder trigger descriptions incomplete: ${action.UUID}`,
  );
}

const inspectors = [
  "property-inspector.html",
  "property-inspector/hvac.html",
  "property-inspector/navigation.html",
  "property-inspector/timetable.html",
];
for (const relative of inspectors) {
  const html = await readFile(new URL(relative, pluginRoot), "utf8");
  assert.match(html, /i18n\.js/);
  assert.match(html, /TheBusI18n\.setLanguage\(info\)/);
}
const inspectorI18n = await readFile(new URL("property-inspector/i18n.js", pluginRoot), "utf8");
assert.doesNotThrow(() => new Function(inspectorI18n));
assert.match(inspectorI18n, /application\?\.language/);
assert.match(inspectorI18n, /All doors/);
assert.match(inspectorI18n, /Prediction confidence/);

console.log("localization: German fallback and English resources passed");
