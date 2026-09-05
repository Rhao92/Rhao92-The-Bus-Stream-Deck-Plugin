import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "http://127.0.0.1:37337";
const SAMPLE_INTERVAL_MS = 250;
const DEFAULT_DURATION_MS = 5000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(root, "qa", "fixtures", "vehicle-telemetry");
const watchMode = process.argv.includes("--watch");
const durationArgument = process.argv.find((value) => value.startsWith("--duration="));
const durationMs = durationArgument
  ? Math.max(1000, Number(durationArgument.slice("--duration=".length)) || DEFAULT_DURATION_MS)
  : DEFAULT_DURATION_MS;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}/${path.replace(/^\/+/, "")}`, {
    signal: AbortSignal.timeout(2500)
  });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.json();
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
}

function normalizeActorName(value) {
  return String(value ?? "unknown-vehicle").replace(/_C_\d+$/u, "_C");
}

function slug(value) {
  return String(value ?? "unknown-vehicle")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "") || "unknown-vehicle";
}

function buttonsOf(vehicle) {
  const buttons = vehicle?.Buttons;
  if (Array.isArray(buttons)) return buttons;
  if (buttons && typeof buttons === "object") return Object.values(buttons);
  return [];
}

function schemaPaths(value, prefix = "", depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return [];
  const entries = Array.isArray(value)
    ? value.length > 0 ? [["[]", value[0]]] : []
    : Object.entries(value);
  return entries.flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const own = `${path}:${valueType(child)}`;
    return child && typeof child === "object"
      ? [own, ...schemaPaths(child, path, depth + 1)]
      : [own];
  });
}

function addObserved(set, value) {
  if (value === undefined || value === null || set.size >= 24) return;
  const normalized = typeof value === "number"
    ? Number(value.toFixed(4))
    : String(value).slice(0, 160);
  set.add(JSON.stringify(normalized));
}

function observedValues(set) {
  return [...set].map((value) => JSON.parse(value));
}

function createSession(player, vehicle, map) {
  const actorName = normalizeActorName(player.CurrentVehicle ?? vehicle.ActorName);
  return {
    vehicleId: player.CurrentVehicle,
    identity: {
      actorClass: actorName,
      vehicleModel: String(vehicle.VehicleModel ?? ""),
      inputIdentifier: String(vehicle.InputIdentifier ?? ""),
      mapName: String(map?.MapName ?? "")
    },
    topLevelSchema: new Set(),
    buttons: new Map(),
    lamps: new Map(),
    doorSchemas: new Set(),
    umgSchema: new Set(),
    busLogicSchema: new Set(),
    samples: 0
  };
}

function observe(session, vehicle) {
  session.samples += 1;
  for (const [key, value] of Object.entries(vehicle ?? {})) {
    session.topLevelSchema.add(`${key}:${valueType(value)}`);
  }

  for (const button of buttonsOf(vehicle)) {
    const name = String(button?.Name ?? "").trim();
    if (!name) continue;
    let item = session.buttons.get(name);
    if (!item) {
      item = {
        name,
        actions: new Set(),
        declaredStates: new Set(),
        observedStates: new Set(),
        observedValues: new Set(),
        stateTypes: new Set(),
        valueTypes: new Set()
      };
      session.buttons.set(name, item);
    }
    uniqueStrings(button.Actions).forEach((value) => item.actions.add(value));
    uniqueStrings(button.States).forEach((value) => item.declaredStates.add(value));
    if (button.State !== undefined) {
      item.stateTypes.add(valueType(button.State));
      addObserved(item.observedStates, button.State);
    }
    if (button.Value !== undefined) {
      item.valueTypes.add(valueType(button.Value));
      addObserved(item.observedValues, button.Value);
    }
  }

  for (const [name, value] of Object.entries(vehicle?.AllLamps ?? {})) {
    let values = session.lamps.get(name);
    if (!values) {
      values = new Set();
      session.lamps.set(name, values);
    }
    addObserved(values, value);
  }

  schemaPaths(vehicle?.doors).forEach((value) => session.doorSchemas.add(value));
  schemaPaths(vehicle?.UMG).forEach((value) => session.umgSchema.add(value));
  schemaPaths(vehicle?.BusLogic).forEach((value) => session.busLogicSchema.add(value));
}

function finalize(session) {
  const buttons = [...session.buttons.values()]
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((item) => ({
      name: item.name,
      actions: [...item.actions],
      declaredStates: [...item.declaredStates],
      observedStates: observedValues(item.observedStates),
      observedValues: observedValues(item.observedValues),
      stateTypes: [...item.stateTypes].sort(),
      valueTypes: [...item.valueTypes].sort()
    }));
  const lamps = [...session.lamps.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, values]) => ({ name, observedValues: observedValues(values) }));
  const structure = {
    identity: session.identity,
    topLevelSchema: [...session.topLevelSchema].sort(),
    buttons: buttons.map(({ name, actions, declaredStates, stateTypes, valueTypes }) => ({
      name,
      actions,
      declaredStates,
      stateTypes,
      valueTypes
    })),
    lampNames: lamps.map(({ name }) => name),
    doorSchema: [...session.doorSchemas].sort(),
    umgSchema: [...session.umgSchema].sort(),
    busLogicSchema: [...session.busLogicSchema].sort()
  };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(structure))
    .digest("hex");
  return {
    schemaVersion: 1,
    source: {
      api: "The Bus official local telemetry API",
      baseUrl: "http://127.0.0.1:37337",
      readOnly: true
    },
    identity: session.identity,
    structureFingerprint: fingerprint,
    sampleCount: session.samples,
    topLevelSchema: structure.topLevelSchema,
    buttons,
    lamps,
    doorSchema: structure.doorSchema,
    umgSchema: structure.umgSchema,
    busLogicSchema: structure.busLogicSchema
  };
}

async function readExisting(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function persist(session) {
  const result = finalize(session);
  const identityName = result.identity.inputIdentifier
    || result.identity.vehicleModel
    || result.identity.actorClass;
  const familySlug = slug(identityName);
  const primaryTarget = resolve(outputDirectory, `${familySlug}.json`);
  await mkdir(outputDirectory, { recursive: true });
  const primaryExisting = await readExisting(primaryTarget);
  const variantSlug = `${familySlug}--${slug(result.identity.actorClass)}`;
  const target = primaryExisting
    && primaryExisting.identity?.actorClass !== result.identity.actorClass
      ? resolve(outputDirectory, `${variantSlug}.json`)
      : primaryTarget;
  const candidate = target.replace(/\.json$/u, ".candidate.json");
  const existing = target === primaryTarget
    ? primaryExisting
    : await readExisting(target);

  if (existing?.structureFingerprint === result.structureFingerprint) {
    console.log(`UNCHANGED ${identityName} ${result.structureFingerprint}`);
    return;
  }

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (existing) {
    await writeFile(`${candidate}.new`, output, "utf8");
    await rename(`${candidate}.new`, candidate);
    console.log(`CHANGED ${identityName}: review ${candidate}`);
    process.exitCode = 2;
    return;
  }

  await writeFile(`${target}.new`, output, "utf8");
  await rename(`${target}.new`, target);
  console.log(`CREATED ${identityName}: ${target}`);
}

async function currentVehicle() {
  const player = await fetchJson("player");
  if (player?.Mode !== "Vehicle" || !player.CurrentVehicle) return undefined;
  const [vehicle, map] = await Promise.all([
    fetchJson(`vehicles/${encodeURIComponent(player.CurrentVehicle)}`),
    fetchJson("map").catch(() => undefined)
  ]);
  return { player, vehicle, map };
}

async function runOnce() {
  const current = await currentVehicle();
  if (!current) {
    throw new Error("Kein aktiver Bus. Im Spiel zuerst einen Bus übernehmen.");
  }
  const session = createSession(current.player, current.vehicle, current.map);
  const endAt = Date.now() + durationMs;
  while (Date.now() < endAt) {
    const sample = await currentVehicle();
    if (!sample || sample.player.CurrentVehicle !== session.vehicleId) break;
    observe(session, sample.vehicle);
    await sleep(SAMPLE_INTERVAL_MS);
  }
  await persist(session);
}

async function runWatch() {
  let session;
  let waitingReported = false;
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });

  while (!stopping) {
    try {
      const current = await currentVehicle();
      if (!current) {
        if (session) {
          await persist(session);
          session = undefined;
        }
        if (!waitingReported) {
          console.log("WAITING: Im Spiel einen Bus übernehmen.");
          waitingReported = true;
        }
        await sleep(750);
        continue;
      }

      waitingReported = false;
      if (!session || session.vehicleId !== current.player.CurrentVehicle) {
        if (session) await persist(session);
        session = createSession(current.player, current.vehicle, current.map);
        console.log(`CAPTURING ${session.identity.inputIdentifier || session.identity.actorClass}`);
      }
      observe(session, current.vehicle);
    } catch (error) {
      if (!waitingReported) {
        console.log(`WAITING: ${error.message}`);
        waitingReported = true;
      }
    }
    await sleep(SAMPLE_INTERVAL_MS);
  }

  if (session) await persist(session);
}

await (watchMode ? runWatch() : runOnce());
