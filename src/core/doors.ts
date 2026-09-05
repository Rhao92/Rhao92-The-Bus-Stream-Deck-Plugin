import type { DoorTelemetry, VehicleTelemetry } from "./telemetry";

export type DoorState = "closed" | "moving" | "open";
export type DoorGroupState = DoorState | "mixed";

const CLOSED_PROGRESS_MAX = 0.02;
const OPEN_PROGRESS_MIN = 0.98;

function normalizePhysicalDoorIndex(value: unknown): number | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();
  const namedIndexes: Record<string, number> = {
    first: 0,
    second: 1,
    third: 2,
    fourth: 3
  };

  if (normalized in namedIndexes) {
    return namedIndexes[normalized];
  }

  const numeric = Number(normalized);

  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 4
    ? numeric - 1
    : undefined;
}

function orderDoorsByPhysicalIndex(
  doors: readonly DoorTelemetry[]
): DoorTelemetry[] {
  const indexed = doors.map((door, originalIndex) => ({
    door,
    originalIndex,
    physicalIndex: normalizePhysicalDoorIndex(door.Index)
  }));
  const physicalIndexes = indexed.map(({ physicalIndex }) => physicalIndex);

  if (
    physicalIndexes.some((index) => index === undefined)
    || new Set(physicalIndexes).size !== indexed.length
  ) {
    return [...doors];
  }

  return indexed
    .sort((left, right) => (
      (left.physicalIndex ?? left.originalIndex)
      - (right.physicalIndex ?? right.originalIndex)
    ))
    .map(({ door }) => door);
}

function normalizeProgress(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number"
    ? value
    : Number(String(value).trim().replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  // Einige Telemetrievarianten liefern Prozentwerte statt 0..1.
  const normalized = parsed > 1 && parsed <= 100
    ? parsed / 100
    : parsed;

  if (normalized < 0 || normalized > 1) {
    return undefined;
  }

  return normalized;
}

function normalizeOpenFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 0) {
      return false;
    }

    if (value === 1) {
      return true;
    }

    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "open", "opened", "active", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "closed", "close", "inactive", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

/**
 * Leitet den bestaetigten physischen Zustand einer Tuer ab.
 *
 * Progress hat fuer echte Bewegung Vorrang. Der Open-Wert bleibt als
 * Endzustands-/Fahrzeugfallback erhalten, damit Busse mit einem nur grob
 * gepflegten Progress-Feld weiterhin korrekt funktionieren.
 */
export function readDoorState(
  door: DoorTelemetry | undefined
): DoorState | undefined {
  if (!door) {
    return undefined;
  }

  const progress = normalizeProgress(door.Progress);
  const open = normalizeOpenFlag(door.Open);

  if (
    progress !== undefined
    && progress > CLOSED_PROGRESS_MAX
    && progress < OPEN_PROGRESS_MIN
  ) {
    return "moving";
  }

  if (progress !== undefined && progress >= OPEN_PROGRESS_MIN) {
    return "open";
  }

  if (progress !== undefined && progress <= CLOSED_PROGRESS_MAX) {
    return open === true ? "open" : "closed";
  }

  if (open !== undefined) {
    return open ? "open" : "closed";
  }

  return undefined;
}

/**
 * Liest nur die im Fahrzeug tatsaechlich vorhandenen Tueren (maximal vier).
 * Sobald eine vorhandene Tuer keinen bestaetigten Zustand liefert, ist auch
 * der Gruppenstatus unbekannt und es wird kein Sammelbefehl gesendet.
 */
export function readAvailableDoorStates(
  vehicle: VehicleTelemetry | undefined,
  maxDoors = 4
): DoorState[] | undefined {
  if (!vehicle || !Array.isArray(vehicle.doors)) {
    return undefined;
  }

  // Einige Fahrzeuge, derzeit insbesondere der MAN-Doppeldecker, liefern
  // doors[] nicht in physischer Reihenfolge. Das ebenfalls gelieferte Index-
  // Feld benennt die echte Position eindeutig (First/Second/Third/Fourth).
  // Nur bei einer vollständigen, eindeutigen Zuordnung wird neu sortiert;
  // ältere Fahrzeuge ohne Index-Metadaten behalten unverändert ihre Reihenfolge.
  const doors = orderDoorsByPhysicalIndex(vehicle.doors.slice(0, maxDoors));

  if (doors.length === 0) {
    return undefined;
  }

  const states = doors.map(readDoorState);

  if (states.some((state) => state === undefined)) {
    return undefined;
  }

  return states as DoorState[];
}

export function summarizeDoorStates(
  states: readonly DoorState[] | undefined
): DoorGroupState | undefined {
  if (!states || states.length === 0) {
    return undefined;
  }

  if (states.some((state) => state === "moving")) {
    return "moving";
  }

  if (states.every((state) => state === "open")) {
    return "open";
  }

  if (states.every((state) => state === "closed")) {
    return "closed";
  }

  return "mixed";
}

/**
 * Liefert die Türindizes für DOOR-01 ohne optimistische Zustandsannahmen.
 * Sind alle Türen geschlossen, werden alle zum Öffnen getoggelt. Sobald
 * mindestens eine Tür offen oder in Bewegung ist, werden nur diese Türen
 * zum Schließen getoggelt; bereits geschlossene Türen bleiben unangetastet.
 */
export function doorAllCommandIndexes(
  states: readonly DoorState[] | undefined
): number[] {
  if (!states || states.length === 0) return [];
  const shouldClose = states.some(
    (state) => state === "open" || state === "moving"
  );
  return states
    .map((state, index) => ({ state, index }))
    .filter(({ state }) => !shouldClose || state !== "closed")
    .map(({ index }) => index);
}

/** Lampenwerte koennen boolesch oder als Helligkeit 0..1 geliefert werden. */
export function readLampState(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const numeric = typeof value === "number"
    ? value
    : Number(String(value).trim().replace(",", "."));

  if (Number.isFinite(numeric)) {
    return numeric > 0.5;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "on", "active", "enabled"].includes(normalized)) {
    return true;
  }

  if (["false", "off", "inactive", "disabled"].includes(normalized)) {
    return false;
  }

  return undefined;
}
