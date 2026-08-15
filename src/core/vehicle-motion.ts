import { VehicleTelemetry } from "./telemetry";

export function readVehicleSpeedKmh(
  vehicle: VehicleTelemetry | undefined
): number | undefined {
  const raw = vehicle?.Speed;
  const value = typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim() !== ""
      ? Number(raw)
      : Number.NaN;

  return Number.isFinite(value) ? Math.abs(value) : undefined;
}

/**
 * Liefert nur dann true, wenn die Geschwindigkeit bestaetigt bei 0 km/h liegt.
 * Fehlende bzw. ungueltige Telemetrie gilt bewusst nicht als READY.
 */
export function isVehicleStationary(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  const speed = readVehicleSpeedKmh(vehicle);

  if (speed === undefined) {
    return undefined;
  }

  return speed === 0;
}
