import { action } from "@elgato/streamdeck";
import { BaseToggleAction } from "../base/base-toggle-action";
import { TelemetrySnapshot } from "../core/telemetry";
import { readAutomaticKneelingState } from "../core/vehicle-controls";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.automatic-kneeling" })
export class AutomaticKneelingAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (
      !snapshot.connected
      || !snapshot.vehicle
      || snapshot.vehicleReadyForAutoKneeling !== true
    ) {
      return undefined;
    }

    return readAutomaticKneelingState(snapshot.vehicle);
  }

  protected override getToggleEventName(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): string {
    return "Pedestrians";
  }
}
