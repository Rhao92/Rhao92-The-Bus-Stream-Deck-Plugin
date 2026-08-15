import type { VehicleTelemetry } from "./telemetry";
import { readVehicleButtonState } from "./vehicle-buttons";

export type IndicatorPosition = "left" | "off" | "right";

const TRUE_VALUES = new Set([
  "1",
  "true",
  "on",
  "active",
  "enabled",
  "engaged",
  "applied",
  "pulled",
  "set",
  "yes",
  "state1"
]);

const FALSE_VALUES = new Set([
  "0",
  "false",
  "off",
  "inactive",
  "disabled",
  "disengaged",
  "released",
  "unset",
  "none",
  "no",
  "state0"
]);

/**
 * Normalisiert typische TML-Schalterwerte, ohne unbekannte Werte als false zu
 * interpretieren. undefined bedeutet: Zustand ist nicht sicher bestaetigt.
 */
export function normalizeControlBoolean(
  value: unknown
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }

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
  const numeric = Number(normalized);

  if (Number.isFinite(numeric)) {
    if (numeric === 0) {
      return false;
    }

    if (numeric === 1) {
      return true;
    }
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return undefined;
}

/**
 * Liest die echte Hell-/Dunkelphase einer Fahrzeuglampe. Anders als ein
 * Schalterzustand darf eine beliebige positive Lampenintensitaet als hell
 * gelten. Fehlt das Feld, bleibt der Wert undefined und die Action kann den
 * gemeinsamen Animationstakt als Fahrzeugfallback verwenden.
 */
export function readLampPhase(
  vehicle: VehicleTelemetry | undefined,
  lampName: string
): boolean | undefined {
  const lamps = vehicle?.AllLamps;

  if (!lamps || !Object.prototype.hasOwnProperty.call(lamps, lampName)) {
    return undefined;
  }

  const value = lamps[lampName];
  const normalized = normalizeControlBoolean(value);
  if (normalized !== undefined) {
    return normalized;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric > 0 : undefined;
}

/**
 * Normalisiert die bekannten IndicatorState- und eCitaro-Buttonformen.
 *
 * Der eCitaro liefert fuer den Button:
 * - Primary = aus
 * - Secondary = rechts
 * - Tertiary = links
 */
export function normalizeIndicatorPosition(
  value: unknown
): IndicatorPosition | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    if (value < 0) {
      return "left";
    }

    if (value > 0) {
      return "right";
    }

    return "off";
  }

  if (typeof value === "boolean") {
    return value ? undefined : "off";
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const raw = value.trim().toLowerCase();
  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    if (numeric < 0) {
      return "left";
    }

    if (numeric > 0) {
      return "right";
    }

    return "off";
  }

  const normalized = raw.replace(/[^a-zäöüß]/g, "");

  if (
    normalized === "tertiary"
    || normalized === "left"
    || normalized === "links"
    || normalized === "l"
    || normalized === "down"
    || normalized.includes("left")
    || normalized.includes("links")
  ) {
    return "left";
  }

  if (
    normalized === "secondary"
    || normalized === "right"
    || normalized === "rechts"
    || normalized === "r"
    || normalized === "up"
    || normalized.includes("right")
    || normalized.includes("rechts")
  ) {
    return "right";
  }

  if (
    normalized === "primary"
    || normalized === "off"
    || normalized === "none"
    || normalized === "neutral"
    || normalized === "center"
    || normalized === "centre"
    || normalized === "inactive"
    || normalized === "false"
  ) {
    return "off";
  }

  return undefined;
}

/**
 * Der direkte Fahrzeugwert ist die primaere Quelle. Der Cockpitbutton dient
 * nur als Rueckfall, weil dessen Zustand bei einzelnen Builds kurzzeitig
 * nachlaufen kann und sonst Warnblinker-/Blinkerfarben haengen bleiben.
 */
export function readWarningLightsState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  if (!vehicle) {
    return undefined;
  }

  const direct = normalizeControlBoolean(vehicle.WarningLights);

  if (direct !== undefined) {
    return direct;
  }

  return normalizeControlBoolean(
    readVehicleButtonState(vehicle, "Warning Light")
  );
}

/**
 * Analog zum Warnblinker hat IndicatorState Vorrang. Der Buttonfallback
 * versteht zusaetzlich Primary/Secondary/Tertiary.
 */
export function readIndicatorState(
  vehicle: VehicleTelemetry | undefined
): IndicatorPosition | undefined {
  if (!vehicle) {
    return undefined;
  }

  const direct = normalizeIndicatorPosition(vehicle.IndicatorState);

  if (direct !== undefined) {
    return direct;
  }

  return normalizeIndicatorPosition(
    readVehicleButtonState(vehicle, "Indicator")
  );
}
