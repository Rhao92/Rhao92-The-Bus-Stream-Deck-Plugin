import { access, cp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [sourcePlugin, neutralPlugin, targetPlugin] = process.argv.slice(2);
const MARKETPLACE_NAME = "The Bus Control Center";

if (!sourcePlugin || !neutralPlugin || !targetPlugin) {
  throw new Error(
    "Usage: node qa/prepare-marketplace-revision.mjs <source-plugin> <neutral-plugin> <target-plugin>",
  );
}

try {
  await access(targetPlugin);
  throw new Error(`Target already exists and will not be overwritten: ${targetPlugin}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await cp(sourcePlugin, targetPlugin, { recursive: true, errorOnExist: true });

await cp(
  path.join(neutralPlugin, "imgs", "action-list"),
  path.join(targetPlugin, "imgs", "action-list"),
  { recursive: true, force: true },
);
for (const filename of ["category.png", "category@2x.png"]) {
  await cp(
    path.join(neutralPlugin, "imgs", "plugin", filename),
    path.join(targetPlugin, "imgs", "plugin", filename),
    { force: true },
  );
}

const manifestPath = path.join(targetPlugin, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.Name = MARKETPLACE_NAME;
manifest.Category = MARKETPLACE_NAME;
manifest.Description =
  "Kostenlose Begleit-App für The Bus mit Live-Telemetrie, Fahrzeugsteuerung, Navigation, Fullpanels und Stream Deck Mobile.";
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const englishPath = path.join(targetPlugin, "en.json");
const english = JSON.parse(await readFile(englishPath, "utf8"));
english.Name = MARKETPLACE_NAME;
english.Description =
  "Free companion for The Bus with live telemetry, vehicle controls, navigation, full panels, and Stream Deck Mobile.";
await writeFile(englishPath, `${JSON.stringify(english, null, 2)}\n`, "utf8");

const inspectorFiles = [path.join(targetPlugin, "property-inspector.html")];
const inspectorDirectory = path.join(targetPlugin, "property-inspector");
for (const entry of await readdir(inspectorDirectory, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith(".html") || entry.name.endsWith(".js"))) {
    inspectorFiles.push(path.join(inspectorDirectory, entry.name));
  }
}
for (const filename of inspectorFiles) {
  const content = await readFile(filename, "utf8");
  await writeFile(
    filename,
    content.replaceAll("Rhao92's The Bus Stream Deck Plugin", MARKETPLACE_NAME),
    "utf8",
  );
}

console.log(`Prepared Marketplace revision: ${targetPlugin}`);
