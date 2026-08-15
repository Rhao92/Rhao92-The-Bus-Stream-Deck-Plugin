import type { VehicleButton, VehicleTelemetry } from "./telemetry";

/**
 * Sucht einen Fahrzeugbutton robust in beiden von der Telemetrie verwendeten
 * Formen (Array oder Record). Der exakte Name hat Vorrang; danach folgt ein
 * fallunabhaengiger Vergleich als Kompatibilitaetsfallback.
 */
export function findVehicleButton(
  vehicle: VehicleTelemetry | undefined,
  name: string
): VehicleButton | undefined {
  const buttons = vehicle?.Buttons;

  if (Array.isArray(buttons)) {
    const exact = buttons.find((button) => button?.Name === name);

    if (exact) {
      return exact;
    }

    const normalizedName = name.trim().toLowerCase();
    return buttons.find(
      (button) => button?.Name?.trim().toLowerCase() === normalizedName
    );
  }

  if (buttons && typeof buttons === "object") {
    if (buttons[name]) {
      return buttons[name];
    }

    const normalizedName = name.trim().toLowerCase();
    const matchingKey = Object.keys(buttons).find(
      (key) => key.trim().toLowerCase() === normalizedName
    );

    return matchingKey ? buttons[matchingKey] : undefined;
  }

  return undefined;
}

export function readVehicleButtonState(
  vehicle: VehicleTelemetry | undefined,
  name: string
): unknown {
  return findVehicleButton(vehicle, name)?.State;
}
