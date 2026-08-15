import { normalizeControlBoolean } from "./driving-controls";
import { readLampState } from "./doors";
import type { VehicleTelemetry } from "./telemetry";

export type IgnitionState = "off" | "ignition" | "engine";
export type PassengerLightState = "off" | "dim" | "bright";

const PASSENGER_LIGHT_BUTTON = "InteriorLightControl 1";
const PASSENGER_LIGHT_MAIN_LAMP = "InteriorLightMain LED";
const PASSENGER_LIGHT_INTENSITY = "Interior Lights";
const AUTOMATIC_KNEELING_BUTTON = "Automatic Kneeling";
const DOOR_CLEARANCE_BUTTON = "Door Clearance";
const DOOR_CLEARANCE_LAMP = "ButtonLight DoorClearance";
const AUTOMATIC_KNEELING_DISABLED_LAMP = "ButtonLight AutomaticKneeling";

function hasOwnValue(
  source: Record<string, unknown> | undefined,
  key: string
): boolean {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function readButtonState(
  vehicle: VehicleTelemetry | undefined,
  name: string
): boolean | undefined {
  const buttons = vehicle?.Buttons;
  let value: unknown;

  if (Array.isArray(buttons)) {
    value = buttons.find((button) => button?.Name === name)?.State;
  } else if (buttons && typeof buttons === "object") {
    value = buttons[name]?.State;
  }

  return normalizeControlBoolean(value);
}

function readOptionalLampState(
  vehicle: VehicleTelemetry | undefined,
  name: string
): boolean | undefined {
  const lamps = vehicle?.AllLamps;

  if (!hasOwnValue(lamps, name)) {
    return undefined;
  }

  return readLampState(lamps?.[name]);
}

function normalizeIntensity(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number"
    ? value
    : Number(String(value).trim().replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const normalized = parsed > 1 && parsed <= 100
    ? parsed / 100
    : parsed;

  if (normalized < 0 || normalized > 1) {
    return undefined;
  }

  return normalized;
}

/**
 * Leitet den bestaetigten Zuendungszustand aus den echten Fahrzeugwerten ab.
 * Unvollstaendige oder widerspruechliche Telemetrie bleibt unbekannt und wird
 * nicht als ausgeschalteter Bus interpretiert.
 */
export function readIgnitionState(
  vehicle: VehicleTelemetry | undefined
): IgnitionState | undefined {
  if (!vehicle) {
    return undefined;
  }

  const engineStarted = normalizeControlBoolean(vehicle.EngineStarted);
  const ignitionEnabled = normalizeControlBoolean(vehicle.IgnitionEnabled);

  if (engineStarted === true) {
    return "engine";
  }

  if (ignitionEnabled === true) {
    return "ignition";
  }

  if (engineStarted === false && ignitionEnabled === false) {
    return "off";
  }

  return undefined;
}

/**
 * Leitet Aus/Gedimmt/Hell aus der tatsaechlichen Lampenintensitaet ab.
 * Der Schalter- beziehungsweise Main-LED-Zustand wird nur verwendet, wenn die
 * Intensitaet nicht geliefert wird. Fehlende Werte bleiben unbekannt.
 */
export function readPassengerLightState(
  vehicle: VehicleTelemetry | undefined
): PassengerLightState | undefined {
  if (!vehicle) {
    return undefined;
  }

  const mainButton = readButtonState(vehicle, PASSENGER_LIGHT_BUTTON);
  const mainLamp = readOptionalLampState(vehicle, PASSENGER_LIGHT_MAIN_LAMP);
  const mainEnabled = mainButton ?? mainLamp;
  const lamps = vehicle.AllLamps;
  const intensity = hasOwnValue(lamps, PASSENGER_LIGHT_INTENSITY)
    ? normalizeIntensity(lamps?.[PASSENGER_LIGHT_INTENSITY])
    : undefined;

  if (intensity !== undefined) {
    if (intensity <= 0.05) {
      return "off";
    }

    // Beim eCitaro ist der Wert zur sichtbaren Helligkeit invertiert:
    // ungefaehr 1.0 = gedimmt, ungefaehr 0.5 = hell.
    return intensity >= 0.75 ? "dim" : "bright";
  }

  if (mainEnabled === false) {
    return "off";
  }

  return undefined;
}


/**
 * Die eigentliche Schalterstellung ist beim eCitaro direkt als boolescher
 * Buttonzustand vorhanden. Sie hat Vorrang vor der Kontrolllampe, damit die
 * Anzeige beim Umschalten nicht kurz beziehungsweise dauerhaft auf Grau
 * faellt, falls der Lampenwert spaeter aktualisiert wird.
 */
export function readDoorClearanceState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  if (!vehicle) {
    return undefined;
  }

  const buttonState = readButtonState(vehicle, DOOR_CLEARANCE_BUTTON);

  if (buttonState !== undefined) {
    return buttonState;
  }

  return readOptionalLampState(vehicle, DOOR_CLEARANCE_LAMP);
}

/**
 * Beim eCitaro melden sowohl Button als auch Kontrolllampe den deaktivierten
 * Zustand. Deshalb werden beide Quellen invertiert. Ein fehlender Fallback
 * bleibt unbekannt statt automatisch als aktiv zu erscheinen.
 */
export function readAutomaticKneelingState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  if (!vehicle) {
    return undefined;
  }

  const disabledByButton = readButtonState(
    vehicle,
    AUTOMATIC_KNEELING_BUTTON
  );

  if (disabledByButton !== undefined) {
    return !disabledByButton;
  }

  const disabledByLamp = readOptionalLampState(
    vehicle,
    AUTOMATIC_KNEELING_DISABLED_LAMP
  );

  return disabledByLamp === undefined
    ? undefined
    : !disabledByLamp;
}
