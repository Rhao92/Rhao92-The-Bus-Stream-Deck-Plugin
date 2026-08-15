import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const rendererSource = await readFile(
  new URL("../src/fullpanel/renderers.ts", import.meta.url),
  "utf8"
);
const renderers = await import(
  `data:text/javascript;base64,${Buffer.from(rendererSource).toString("base64")}`
);

const pluginRoot = new URL("../de.rhao92.thebus-telemetry-interface.sdPlugin/", import.meta.url);
const live = {
  connectionLabel: "LIVE",
  power: "−39,8 kW",
  batteryPercent: 78,
};
const offline = {
  connectionLabel: "OFFLINE",
  power: "–",
  batteryPercent: undefined,
};

const svgFromDataUri = (value) => Buffer.from(
  value.split(",", 2)[1],
  "base64"
).toString("utf8");

async function writeIcon(folder, name, dataUri) {
  const directory = new URL(`imgs/actions/${folder}/`, pluginRoot);
  await mkdir(directory, { recursive: true });
  const svg = svgFromDataUri(dataUri);
  const at2x = new Resvg(svg, { fitTo: { mode: "width", value: 144 } })
    .render()
    .asPng();
  const standard = new Resvg(svg, { fitTo: { mode: "width", value: 72 } })
    .render()
    .asPng();
  await Promise.all([
    writeFile(new URL(`${name}@2x.png`, directory), at2x),
    writeFile(new URL(`${name}.png`, directory), standard),
  ]);
}

await Promise.all([
  writeIcon("key-power", "action", renderers.renderKeypad(live, "power")),
  writeIcon("key-power", "offline", renderers.renderKeypad(offline, "power")),
  writeIcon("key-battery", "action", renderers.renderKeypad(live, "battery")),
  writeIcon("key-battery", "offline", renderers.renderKeypad(offline, "battery")),
]);

console.log("Leistungs- und Akku-Icons erzeugt.");
