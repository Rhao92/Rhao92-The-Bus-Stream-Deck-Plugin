import { action } from "@elgato/streamdeck";
import { BaseToggleAction } from "../base/base-toggle-action";
import { TelemetrySnapshot } from "../core/telemetry";
import { resolveAutomaticDoorClosingEvent } from "../core/vehicle-events";
import { readAutomaticDoorClosingState } from "../core/vehicle-controls";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.automatic-door-closing" })
export class AutomaticDoorClosingAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return readAutomaticDoorClosingState(snapshot.vehicle);
  }

  protected override getToggleEventName(
    snapshot: TelemetrySnapshot,
    _active: boolean
  ): string | undefined {
    return resolveAutomaticDoorClosingEvent(snapshot.vehicle);
  }
}
