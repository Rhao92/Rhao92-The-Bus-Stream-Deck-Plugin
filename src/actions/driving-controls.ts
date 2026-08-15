import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { BaseToggleAction } from "../base/base-toggle-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  IndicatorPosition,
  normalizeControlBoolean,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../core/driving-controls";
import { TelemetryClient, TelemetrySnapshot } from "../core/telemetry";

const PARKING_BRAKE_EVENT = "FixingBrake";
const WARNING_LIGHT_EVENT = "ToggleWarningLights";

function readParkingBrake(
  telemetry: TelemetryClient,
  snapshot: TelemetrySnapshot
): boolean | undefined {
  if (!snapshot.connected || !snapshot.vehicle) {
    return undefined;
  }

  const buttonState = telemetry.getButton(
    snapshot.vehicle,
    "Parking Brake"
  )?.State;
  const fromButton = normalizeControlBoolean(buttonState);

  if (fromButton !== undefined) {
    return fromButton;
  }

  return normalizeControlBoolean(snapshot.vehicle.FixingBrake);
}

function readWarningLights(
  _telemetry: TelemetryClient,
  snapshot: TelemetrySnapshot
): boolean | undefined {
  if (!snapshot.connected) {
    return undefined;
  }

  return readWarningLightsState(snapshot.vehicle);
}

function readIndicator(
  _telemetry: TelemetryClient,
  snapshot: TelemetrySnapshot
): IndicatorPosition | undefined {
  if (!snapshot.connected) {
    return undefined;
  }

  return readIndicatorState(snapshot.vehicle);
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.parking-brake" })
export class ParkingBrakeAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    return readParkingBrake(this.telemetry, snapshot);
  }

  protected override getToggleEventName(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): string {
    return PARKING_BRAKE_EVENT;
  }
}

abstract class IndicatorAction extends BaseAnimationAction {
  protected abstract readonly targetIndicator: Exclude<
    IndicatorPosition,
    "off"
  >;

  protected abstract readonly eventName: "IndicatorDown" | "IndicatorUp";

  protected abstract readonly lampName:
    | "Light Indicator Left"
    | "Light Indicator Right";

  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    return this.isActive(snapshot)
      && readLampPhase(snapshot.vehicle, this.lampName) === undefined;
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    const indicator = readIndicator(this.telemetry, snapshot);
    const warningLights = readWarningLights(this.telemetry, snapshot);

    if (indicator === undefined && warningLights !== true) {
      return { state: 0 };
    }

    const active = warningLights === true
      || indicator === this.targetIndicator;

    if (!active) {
      return { state: 1 };
    }

    const lampPhase = readLampPhase(snapshot.vehicle, this.lampName);
    if (lampPhase !== undefined) {
      return { state: lampPhase ? 3 : 2 };
    }

    return { state: animationFrame === 0 ? 2 : 3 };
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const indicator = readIndicator(this.telemetry, snapshot);

    // Der Richtungszustand muss bestaetigt sein. Der Tastendruck aendert
    // niemals lokal den sichtbaren Blinkerzustand.
    if (indicator === undefined || !snapshot.vehicleId) {
      return;
    }

    this.commandInFlight = true;

    try {
      const sent = await this.sendEvent(this.eventName);

      if (!sent) {
        this.logWarning(`Event \"${this.eventName}\" konnte nicht gesendet werden.`);
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(`Fehler beim Senden von \"${this.eventName}\".`, error);
    } finally {
      this.commandInFlight = false;
    }
  }

  private isActive(snapshot: TelemetrySnapshot): boolean {
    const indicator = readIndicator(this.telemetry, snapshot);
    const warningLights = readWarningLights(this.telemetry, snapshot);

    return warningLights === true || indicator === this.targetIndicator;
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.indicator-left" })
export class IndicatorLeftAction extends IndicatorAction {
  protected readonly targetIndicator = "left";
  protected readonly eventName = "IndicatorDown";
  protected readonly lampName = "Light Indicator Left";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.indicator-right" })
export class IndicatorRightAction extends IndicatorAction {
  protected readonly targetIndicator = "right";
  protected readonly eventName = "IndicatorUp";
  protected readonly lampName = "Light Indicator Right";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.warning-lights" })
export class WarningLightsAction extends BaseAnimationAction {
  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    return readWarningLights(this.telemetry, snapshot) === true
      && readLampPhase(snapshot.vehicle, "LED Warning") === undefined;
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    const active = readWarningLights(this.telemetry, snapshot);

    if (active === undefined) {
      return { state: 0 };
    }

    if (!active) {
      return { state: 1 };
    }

    const lampPhase = readLampPhase(snapshot.vehicle, "LED Warning");
    if (lampPhase !== undefined) {
      return { state: lampPhase ? 3 : 2 };
    }

    return { state: animationFrame === 0 ? 2 : 3 };
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const active = readWarningLights(this.telemetry, snapshot);

    if (active === undefined || !snapshot.vehicleId) {
      return;
    }

    this.commandInFlight = true;

    try {
      const sent = await this.sendEvent(WARNING_LIGHT_EVENT);

      if (!sent) {
        this.logWarning(
          `Event \"${WARNING_LIGHT_EVENT}\" konnte nicht gesendet werden.`
        );
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(
        `Fehler beim Senden von \"${WARNING_LIGHT_EVENT}\".`,
        error
      );
    } finally {
      this.commandInFlight = false;
    }
  }
}
