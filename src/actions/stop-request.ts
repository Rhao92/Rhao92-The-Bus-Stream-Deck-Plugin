import { action } from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { DisplayModel } from "../base/base-display-action";
import {
  AnimationFrame,
  TWO_HZ_ANIMATION_INTERVAL_MS
} from "../core/animation-clock";
import { readLampState } from "../core/doors";
import { normalizeControlBoolean } from "../core/driving-controls";
import { TelemetrySnapshot, VehicleTelemetry } from "../core/telemetry";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.stop-request" })
export class StopRequestAction extends BaseAnimationAction {
  /** 250 ms Hell + 250 ms Dunkel ergeben exakt 2 Hz. */
  protected override readonly animationIntervalMs: number =
    TWO_HZ_ANIMATION_INTERVAL_MS;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    return this.readStopRequest(snapshot.vehicle) === true;
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (!snapshot.connected || !snapshot.vehicle) {
      return { state: 0 };
    }

    const requested = this.readStopRequest(snapshot.vehicle);

    if (requested === undefined) {
      return { state: 0 };
    }

    if (!requested) {
      return { state: 1 };
    }

    return {
      state: animationFrame === 0 ? 3 : 2
    };
  }

  private readStopRequest(
    vehicle: VehicleTelemetry | undefined
  ): boolean | undefined {
    if (!vehicle) {
      return undefined;
    }

    const lamps = vehicle.AllLamps;
    const lamp = lamps
      && Object.prototype.hasOwnProperty.call(lamps, "LED StopRequest")
      ? readLampState(lamps["LED StopRequest"])
      : undefined;

    const doorStates = Array.isArray(vehicle.doors)
      ? vehicle.doors
        .map((door) => normalizeControlBoolean(door.StopRequest))
        .filter((value): value is boolean => value !== undefined)
      : [];
    const doorRequest = doorStates.some(Boolean)
      ? true
      : doorStates.length > 0
        ? false
        : undefined;

    if (lamp === true || doorRequest === true) {
      return true;
    }

    if (lamp === false || doorRequest === false) {
      return false;
    }

    return undefined;
  }
}
