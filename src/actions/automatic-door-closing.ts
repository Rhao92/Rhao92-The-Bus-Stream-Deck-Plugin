import { action } from "@elgato/streamdeck";
import { BaseToggleAction } from "../base/base-toggle-action";
import { normalizeControlBoolean } from "../core/driving-controls";
import { readLampState } from "../core/doors";
import { TelemetrySnapshot } from "../core/telemetry";

const AUTOMATIC_DOOR_BUTTON = "Automatic Door Closing";
const AUTOMATIC_DOOR_LAMP = "ButtonLight AutomaticDoorClosing";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.automatic-door-closing" })
export class AutomaticDoorClosingAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    const buttonState = this.telemetry.getButton(
      snapshot.vehicle,
      AUTOMATIC_DOOR_BUTTON
    )?.State;
    const fromButton = normalizeControlBoolean(buttonState);

    if (fromButton !== undefined) {
      return fromButton;
    }

    // Lampenfallback nur, wenn der Wert wirklich geliefert wird. Fehlende
    // Telemetrie darf nicht mehr stillschweigend als deaktiviert erscheinen.
    return readLampState(snapshot.vehicle.AllLamps?.[AUTOMATIC_DOOR_LAMP]);
  }

  protected override getToggleEventName(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): string {
    return "ToggleAutomaticRearDoorClosing";
  }
}
