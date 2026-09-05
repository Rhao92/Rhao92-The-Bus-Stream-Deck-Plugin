import { action, KeyAction, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { BaseConfigurableKeyAction } from "../base/base-configurable-key-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  IndicatorPosition,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../core/driving-controls";
import { TelemetryClient, TelemetrySnapshot } from "../core/telemetry";
import {
  readParkingBrakeState,
  readStopBrakeState
} from "../core/vehicle-controls";
import { resolveStopBrakeEvent } from "../core/vehicle-events";

const PARKING_BRAKE_EVENT = "FixingBrake";
const WARNING_LIGHT_EVENT = "ToggleWarningLights";

function readParkingBrake(
  _telemetry: TelemetryClient,
  snapshot: TelemetrySnapshot
): boolean | undefined {
  if (!snapshot.connected || !snapshot.vehicle) {
    return undefined;
  }

  return readParkingBrakeState(snapshot.vehicle);
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

type BrakeMode = "parking" | "stop";

const BRAKE_MODES: readonly BrakeMode[] = ["parking", "stop"];
const BRAKE_FOLDERS: Record<BrakeMode, string> = {
  parking: "parking-brake",
  stop: "stop-brake"
};

/**
 * Die stabile Feststellbremsen-UUID wird als konfigurierbare Bremsen-Action
 * weiterverwendet. Der Standard bleibt Feststellbremse, damit vorhandene
 * Profile ohne Settings unverändert funktionieren.
 */
@action({ UUID: "de.rhao92.thebus-telemetry-interface.parking-brake" })
export class ParkingBrakeAction
  extends BaseConfigurableKeyAction<BrakeMode> {
  protected readonly defaultMode: BrakeMode = "parking";

  protected normalizeMode(mode: unknown): BrakeMode {
    return BRAKE_MODES.includes(mode as BrakeMode)
      ? mode as BrakeMode
      : this.defaultMode;
  }

  protected createModeDisplayModel(
    mode: BrakeMode,
    snapshot: TelemetrySnapshot,
    _animationFrame: AnimationFrame
  ): DisplayModel {
    const active = this.readBrakeState(mode, snapshot);
    const state = active === undefined
      ? "offline"
      : active
        ? "active"
        : "inactive";

    return {
      state: 0,
      title: null,
      image: `imgs/actions/${BRAKE_FOLDERS[mode]}/${state}.png`
    };
  }

  protected async handleModeKeyDown(
    mode: BrakeMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    const active = this.readBrakeState(mode, snapshot);

    if (active === undefined || !snapshot.vehicleId) {
      return;
    }

    const eventName = mode === "parking"
      ? PARKING_BRAKE_EVENT
      : resolveStopBrakeEvent(snapshot.vehicle, active);

    if (!eventName) {
      return;
    }

    const sent = await this.sendEvent(eventName);

    if (!sent) {
      this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
      return;
    }

    this.refreshTelemetrySoon();
  }

  private readBrakeState(
    mode: BrakeMode,
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return mode === "parking"
      ? readParkingBrake(this.telemetry, snapshot)
      : readStopBrakeState(snapshot.vehicle);
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
