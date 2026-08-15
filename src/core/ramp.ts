import { readLampState } from "./doors";
import type { VehicleTelemetry } from "./telemetry";

export type RampState = "locked" | "ready" | "deployed";

const DEPLOYED_LAMP = "ButtonLight WheelchairRamp State1";
const READY_LAMP = "ButtonLight WheelchairRamp State2";

function readOptionalLamp(
  vehicle: VehicleTelemetry,
  name: string
): boolean | undefined {
  const lamps = vehicle.AllLamps;

  if (!lamps || !Object.prototype.hasOwnProperty.call(lamps, name)) {
    return undefined;
  }

  return readLampState(lamps[name]);
}

/**
 * Leitet den Rampenzustand nur aus explizit gelieferten Lampenwerten ab.
 * Fehlen beide Lampen oder ist nur ein widerspruechlicher Teilzustand
 * vorhanden, bleibt die Rampe unbekannt statt automatisch LOCKED zu werden.
 */
export function readRampState(
  vehicle: VehicleTelemetry | undefined
): RampState | undefined {
  if (!vehicle) {
    return undefined;
  }

  const deployed = readOptionalLamp(vehicle, DEPLOYED_LAMP);
  const ready = readOptionalLamp(vehicle, READY_LAMP);

  if (deployed === true) {
    return "deployed";
  }

  if (ready === true) {
    return "ready";
  }

  if (deployed === false && ready === false) {
    return "locked";
  }

  return undefined;
}
