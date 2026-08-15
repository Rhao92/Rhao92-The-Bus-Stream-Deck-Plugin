import { action } from "@elgato/streamdeck";
import { BaseToggleAction } from "../base/base-toggle-action";
import { readDoorClearanceState } from "../core/vehicle-controls";
import { TelemetrySnapshot } from "../core/telemetry";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-clearance" })
export class DoorClearanceAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return readDoorClearanceState(snapshot.vehicle);
  }

  protected override getToggleEventName(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): string {
    return "ToggleDoorClearance";
  }
}
