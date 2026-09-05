import { normalizeControlBoolean } from "./driving-controls";
import { readLampState } from "./doors";
import type { VehicleTelemetry } from "./telemetry";
import { findVehicleButton } from "./vehicle-buttons";
import { vehicleIdentityContains } from "./vehicle-identity";

export type IgnitionState = "off" | "ignition" | "engine";
export type PassengerLightState = "off" | "on" | "dim" | "bright";

const PASSENGER_LIGHT_BUTTON = "InteriorLightControl 1";
const PASSENGER_LIGHT_MAIN_LAMP = "InteriorLightMain LED";
const PASSENGER_LIGHT_INTENSITY = "Interior Lights";
const AUTOMATIC_KNEELING_BUTTON = "Automatic Kneeling";
const AUTOMATIC_DOOR_BUTTON = "Automatic Door Closing";
const AUTOMATIC_DOOR_LAMP = "ButtonLight AutomaticDoorClosing";
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

function readMultiStateToggle(
  vehicle: VehicleTelemetry | undefined,
  name: string
): boolean | undefined {
  const raw = findVehicleButton(vehicle, name)?.State;
  const binary = normalizeControlBoolean(raw);

  if (binary !== undefined) {
    return binary;
  }

  const normalized = String(raw ?? "").trim().toLowerCase();

  if (normalized === "primary") {
    return false;
  }

  if (normalized === "secondary" || normalized === "tertiary") {
    return true;
  }

  return undefined;
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

function readCombinedLampState(
  vehicle: VehicleTelemetry,
  names: readonly string[]
): boolean | undefined {
  const states = names
    .filter((name) => hasOwnValue(vehicle.AllLamps, name))
    .map((name) => readOptionalLampState(vehicle, name))
    .filter((state): state is boolean => state !== undefined);

  if (states.length === 0) {
    return undefined;
  }

  return states.some(Boolean);
}

function readPassengerLightLampLevel(
  vehicle: VehicleTelemetry,
  name: string
): PassengerLightState | undefined {
  const raw = vehicle.AllLamps?.[name];

  if (!hasOwnValue(vehicle.AllLamps, name)) {
    return undefined;
  }

  const value = typeof raw === "number"
    ? raw
    : Number(String(raw ?? "").trim().replace(",", "."));

  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }

  if (value <= 0.05) {
    return "off";
  }

  return value < 1 ? "dim" : "bright";
}

function readVehicleSpecificPassengerLightLevel(
  vehicle: VehicleTelemetry
): PassengerLightState | undefined {
  if (vehicleIdentityContains(vehicle, "citea")) {
    const level = readPassengerLightLampLevel(
      vehicle,
      "Interior Lights Passenger"
    );

    // Der aktuelle Citea-Livepfad bestaetigt 0 als Aus und 0,1 als einzigen
    // erreichbaren aktiven Zustand. Dieser wird neutral als Ein ausgegeben,
    // nicht als angeblich separat waehlbare Dimmstufe. Ein tatsaechlich
    // gemeldeter hoher Lampenwert bliebe weiterhin als Hell erkennbar.
    return level === "dim" ? "on" : level;
  }

  if (vehicleIdentityContains(vehicle, "man")) {
    const lower = readPassengerLightLampLevel(vehicle, "LightInteriorLowerDeck");
    const upper = readPassengerLightLampLevel(vehicle, "LightInteriorUpperDeck");

    if (lower !== undefined && upper !== undefined) {
      return lower === upper ? lower : "on";
    }

    return lower ?? upper;
  }

  return undefined;
}

function readCyclicPassengerLightButtonState(
  vehicle: VehicleTelemetry
): PassengerLightState | undefined {
  if (vehicleIdentityContains(vehicle, "scania")) {
    const normalizeArea = (name: string): PassengerLightState | undefined => {
      const state = String(findVehicleButton(vehicle, name)?.State ?? "")
        .trim()
        .toLowerCase();

      if (state === "primary") return "off";
      if (state === "secondary") return "dim";
      if (state === "tertiary") return "bright";
      return undefined;
    };
    const front = normalizeArea("InteriorLightControl 1");
    const back = normalizeArea("InteriorLightControl 2");

    if (front !== undefined && back !== undefined) {
      return front === back ? front : "on";
    }

    return front ?? back;
  }

  if (vehicleIdentityContains(vehicle, "man")) {
    const normalizeDeck = (name: string): PassengerLightState | undefined => {
      const state = String(findVehicleButton(vehicle, name)?.State ?? "")
        .trim()
        .toLowerCase();

      if (state === "off") return "off";
      if (state === "dim" || state === "dimmed") return "dim";
      if (state === "bright") return "bright";
      return undefined;
    };
    const lower = normalizeDeck("InteriorLightLowerDeck");
    const upper = normalizeDeck("InteriorLightUpperDeck");

    if (lower !== undefined && upper !== undefined) {
      return lower === upper ? lower : "on";
    }

    return lower ?? upper;
  }

  if (vehicleIdentityContains(vehicle, "urbino")) {
    const main = String(findVehicleButton(vehicle, "Interior Light")?.State ?? "")
      .trim()
      .toLowerCase();

    if (main === "primary" || main === "off") {
      return "off";
    }

    if (main === "secondary" || main === "on") {
      const full = String(
        findVehicleButton(vehicle, "Interior Light Full")?.State ?? ""
      ).trim().toLowerCase();
      const dim = String(
        findVehicleButton(vehicle, "Interior Light Dim")?.State ?? ""
      ).trim().toLowerCase();

      if (full === "secondary" || full === "on") {
        return "bright";
      }

      if (dim === "secondary" || dim === "on") {
        return "dim";
      }

      return "on";
    }
  }

  const buttonNames = vehicleIdentityContains(vehicle, "citea")
    ? ["InteriorLightLevel"]
    : vehicleIdentityContains(vehicle, "ebusco")
      ? ["Interior Light"]
      : vehicleIdentityContains(vehicle, "urbino")
        ? ["Interior Light"]
        : vehicleIdentityContains(vehicle, "scania")
          ? ["InteriorLightControl 1"]
          : vehicleIdentityContains(vehicle, "man")
            ? ["InteriorLightLowerDeck"]
            : [];

  for (const buttonName of buttonNames) {
    const normalized = String(findVehicleButton(vehicle, buttonName)?.State ?? "")
      .trim()
      .toLowerCase();

    if (normalized === "off" || normalized === "primary") {
      return "off";
    }

    // Beim Ebusco wurden alle drei Zustände live mit den direkten offiziellen
    // Events abgeglichen: Primary = Aus, Secondary = Gedimmt,
    // Tertiary = Hell.
    if (vehicleIdentityContains(vehicle, "ebusco")) {
      if (normalized === "secondary") {
        return "dim";
      }

      if (normalized === "tertiary") {
        return "bright";
      }
    }

    // Beim Citea bestaetigt der aktuelle Live-Abgleich nur Primary = Aus und
    // Tertiary = Ein. Secondary bleibt als Hell auswertbar, falls The Bus den
    // Zustand tatsaechlich meldet; der gelistete direkte Hell-Event erreicht
    // ihn derzeit jedoch nicht.
    if (vehicleIdentityContains(vehicle, "citea")) {
      if (normalized === "tertiary") {
        return "on";
      }

      if (normalized === "secondary") {
        return "bright";
      }
    }

    // Nur der MAN benennt die beiden aktiven Stufen in der offiziellen
    // Rueckmeldung eindeutig. Primary/Secondary/Tertiary werden dagegen
    // bewusst lediglich als AUS/AN und nicht als konkrete Helligkeit gelesen.
    if (normalized === "dim" || normalized === "dimmed") {
      return "dim";
    }

    if (normalized === "bright") {
      return "bright";
    }

    if (
      normalized === "on"
      || normalized === "secondary"
      || normalized === "tertiary"
    ) {
      return "on";
    }
  }

  return undefined;
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
  const vehicleSpecificLevel = readVehicleSpecificPassengerLightLevel(vehicle);

  // MAN liefert die tatsächliche Helligkeit numerisch. Beim Citea wird der
  // aktuell allein erreichbare Wert 0,1 bewusst nur als Ein behandelt. Diese
  // physische Rückmeldung hat Vorrang vor einem verzögerten Buttonstate.
  if (vehicleSpecificLevel !== undefined) {
    return vehicleSpecificLevel;
  }

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

  if (mainEnabled === true) {
    return "on";
  }

  const cyclicButtonState = readCyclicPassengerLightButtonState(vehicle);

  // Diese Fahrzeugstufen sind live eindeutig abgeglichen und deshalb genauer
  // als zusätzliche, fehlende oder dauerhaft aktive Bereichslampen.
  if (
    (
      vehicleIdentityContains(vehicle, "ebusco")
      || vehicleIdentityContains(vehicle, "citea")
      || vehicleIdentityContains(vehicle, "urbino")
      || vehicleIdentityContains(vehicle, "scania")
    )
    && cyclicButtonState !== undefined
  ) {
    return cyclicButtonState;
  }

  // Diese Lampen wurden in den vollständigen Fahrzeugaufnahmen tatsächlich
  // mit 0/1-Wechseln beobachtet. Sie bestätigen nur EIN/AUS, nicht die
  // Helligkeitsstufe; daher wird bewusst der neutrale Zustand "on" benutzt.
  const binaryLampState = vehicleIdentityContains(vehicle, "ebusco")
    ? readCombinedLampState(vehicle, ["Light Passenger"])
    : vehicleIdentityContains(vehicle, "urbino")
      ? readCombinedLampState(vehicle, ["Passenger Lights"])
      : vehicleIdentityContains(vehicle, "scania")
        ? readCombinedLampState(
          vehicle,
          ["InteriorFront", "InteriorMiddle", "InteriorRear"]
        )
        : undefined;

  if (binaryLampState !== undefined) {
    return binaryLampState ? "on" : "off";
  }

  // Bei den zyklischen Lichttastern dient der reale Buttonzustand als
  // Fallback, wenn keine wechselnde Lampe vorhanden ist. Nur explizit benannte
  // Stufen werden als dim/bright angezeigt; generische Zustandsnummern bleiben
  // bewusst bei der neutralen Anzeige an/aus.
  if (cyclicButtonState !== undefined) {
    return cyclicButtonState;
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

  const buttonState = readMultiStateToggle(vehicle, DOOR_CLEARANCE_BUTTON);

  if (buttonState !== undefined) {
    return buttonState;
  }

  return readOptionalLampState(vehicle, DOOR_CLEARANCE_LAMP);
}

/**
 * Liest den vom jeweiligen Bus gemeldeten Zustand der automatischen hinteren
 * Tuerschliessung. Unbekannte Schalterwerte bleiben neutral.
 */
export function readAutomaticDoorClosingState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  const buttonState = readMultiStateToggle(vehicle, AUTOMATIC_DOOR_BUTTON);

  return buttonState ?? readOptionalLampState(vehicle, AUTOMATIC_DOOR_LAMP);
}

/**
 * Liest die Haltestellenbremse aus der vom Fahrzeug gemeldeten Schalterstellung.
 * Fahrzeuge ohne Schalter duerfen ersatzweise ihre explizite Kontrolllampe
 * verwenden; fehlt beides, bleibt der Zustand unbekannt.
 */
export function readStopBrakeState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  const buttonState = readMultiStateToggle(vehicle, "Stop Brake");

  return buttonState ?? readOptionalLampState(vehicle, "LED Stop Brake");
}

/**
 * Liest die Feststellbremse zentral aus derselben bestaetigten Schalter- oder
 * Fahrzeugrueckmeldung, die alle sichtbaren Bremsen-Actions verwenden.
 */
export function readParkingBrakeState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  if (!vehicle) {
    return undefined;
  }

  const buttonState = normalizeControlBoolean(
    findVehicleButton(vehicle, "Parking Brake")?.State
  );

  return buttonState ?? normalizeControlBoolean(vehicle.FixingBrake);
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

  const disabledByButton = readMultiStateToggle(
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
