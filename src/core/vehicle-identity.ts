import type { VehicleTelemetry } from "./telemetry";

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Vergleicht ausschließlich die von The Bus selbst gemeldete technische
 * Fahrzeugidentität. Sichtbare Produktnamen oder geratenes Modellwissen
 * werden dafür nicht verwendet.
 */
export function vehicleIdentityContains(
  vehicle: VehicleTelemetry | undefined,
  token: string
): boolean {
  const expected = fold(token);

  if (!vehicle || !expected) {
    return false;
  }

  return [
    vehicle.InputIdentifier,
    vehicle.ActorName,
    vehicle.VehicleModel
  ].some((value) => fold(value).includes(expected));
}
