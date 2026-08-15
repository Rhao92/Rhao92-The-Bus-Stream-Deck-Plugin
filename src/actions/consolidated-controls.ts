import { action, KeyAction } from "@elgato/streamdeck";
import { BaseConfigurableKeyAction } from "../base/base-configurable-key-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  DoorState,
  readAvailableDoorStates,
  readDoorState,
  summarizeDoorStates
} from "../core/doors";
import {
  IndicatorPosition,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../core/driving-controls";
import { GEAR_EVENTS, GearPosition, GearStateResolver } from "../core/gear";
import { KneelingMotionTracker } from "../core/kneeling";
import { TelemetrySnapshot } from "../core/telemetry";
import { isVehicleStationary } from "../core/vehicle-motion";
import {
  PassengerLightState,
  readAutomaticKneelingState,
  readPassengerLightState
} from "../core/vehicle-controls";

const DOOR_EVENTS = [
  "DoorFrontOpenClose",
  "DoorMiddleOpenClose",
  "DoorRearOpenClose",
  "DoorFourthOpenClose"
] as const;

const LIGHT_LEVEL_DELAY_MS = 150;

function image(folder: string, state: string): DisplayModel {
  return { image: `imgs/actions/${folder}/${state}.png`, title: null };
}

// ---------------------------------------------------------------------------
// Türen
// ---------------------------------------------------------------------------

type DoorControlMode = "all" | "door-1" | "door-2" | "door-3" | "door-4";

const DOOR_MODES: readonly DoorControlMode[] = [
  "all",
  "door-1",
  "door-2",
  "door-3",
  "door-4"
];

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-control" })
export class DoorControlAction extends BaseConfigurableKeyAction<DoorControlMode> {
  protected readonly defaultMode: DoorControlMode = "all";

  protected normalizeMode(mode: unknown): DoorControlMode {
    return DOOR_MODES.includes(mode as DoorControlMode)
      ? mode as DoorControlMode
      : this.defaultMode;
  }

  protected override shouldAnimateMode(
    mode: DoorControlMode,
    snapshot: TelemetrySnapshot
  ): boolean {
    if (mode === "all") {
      return this.readGroupState(snapshot) === "moving";
    }

    return this.readSingleState(mode, snapshot) === "moving";
  }

  protected createModeDisplayModel(
    mode: DoorControlMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (mode === "all") {
      const state = this.readGroupState(snapshot);

      switch (state) {
        case "closed":
          return image("all-doors", "closed");
        case "mixed":
          return image("all-doors", "mixed");
        case "open":
          return image("all-doors", "open");
        case "moving":
          return image(
            "all-doors",
            animationFrame === 0 ? "moving" : "moving-dim"
          );
        default:
          return image("all-doors", "offline");
      }
    }

    const state = this.readSingleState(mode, snapshot);

    switch (state) {
      case "closed":
        return image(mode, "closed");
      case "open":
        return image(mode, "open");
      case "moving":
        return image(mode, animationFrame === 0 ? "moving" : "moving-dim");
      default:
        return image(mode, "offline");
    }
  }

  protected async handleModeKeyDown(
    mode: DoorControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.connected || !snapshot.vehicle || !snapshot.vehicleId) {
      return;
    }

    if (mode !== "all") {
      const index = this.doorIndex(mode);
      const state = readDoorState(snapshot.vehicle.doors?.[index]);
      const eventName = DOOR_EVENTS[index];

      if (state === undefined || !eventName) {
        return;
      }

      const sent = await this.sendEvent(eventName);

      if (sent) {
        this.refreshTelemetrySoon();
      } else {
        this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
      }
      return;
    }

    const states = readAvailableDoorStates(snapshot.vehicle);

    if (!states) {
      return;
    }

    const shouldClose = states.some(
      (state) => state === "open" || state === "moving"
    );
    const indexes = states
      .map((state, index) => ({ state, index }))
      .filter(({ state }) => !shouldClose || state !== "closed")
      .map(({ index }) => index);

    let sentAny = false;

    for (let position = 0; position < indexes.length; position += 1) {
      const eventName = DOOR_EVENTS[indexes[position]];

      if (!eventName) {
        continue;
      }

      const sent = await this.sendEvent(eventName);
      sentAny ||= sent;

      if (!sent) {
        this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
      }

      if (position < indexes.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (sentAny) {
      this.refreshTelemetrySoon();
    }
  }

  private doorIndex(mode: Exclude<DoorControlMode, "all">): number {
    return Number(mode.slice(-1)) - 1;
  }

  private readSingleState(
    mode: Exclude<DoorControlMode, "all">,
    snapshot: TelemetrySnapshot
  ): DoorState | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return readDoorState(snapshot.vehicle.doors?.[this.doorIndex(mode)]);
  }

  private readGroupState(snapshot: TelemetrySnapshot) {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return summarizeDoorStates(readAvailableDoorStates(snapshot.vehicle));
  }
}

// ---------------------------------------------------------------------------
// Gangwahl
// ---------------------------------------------------------------------------

const GEAR_FOLDERS: Record<GearPosition, string> = {
  D: "gear-drive",
  N: "gear-neutral",
  R: "gear-reverse"
};

@action({ UUID: "de.rhao92.thebus-telemetry-interface.gear-selector" })
export class ConfigurableGearSelectorAction
  extends BaseConfigurableKeyAction<GearPosition> {
  protected readonly defaultMode: GearPosition = "D";

  private readonly gearResolver = new GearStateResolver();

  protected normalizeMode(mode: unknown): GearPosition {
    return mode === "N" || mode === "R" || mode === "D"
      ? mode
      : this.defaultMode;
  }

  protected createModeDisplayModel(
    mode: GearPosition,
    snapshot: TelemetrySnapshot,
    _animationFrame: AnimationFrame
  ): DisplayModel {
    const currentGear = this.readCurrentGear(snapshot);
    const folder = GEAR_FOLDERS[mode];

    if (currentGear === undefined) {
      return image(folder, "offline");
    }

    return image(folder, currentGear === mode ? "active" : "inactive");
  }

  protected async handleModeKeyDown(
    mode: GearPosition,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    const currentGear = this.readCurrentGear(snapshot);

    if (currentGear === undefined || !snapshot.vehicleId || currentGear === mode) {
      return;
    }

    const eventName = GEAR_EVENTS[mode];
    const sent = await this.sendEvent(eventName);

    if (sent) {
      // Nur das erwartete Ziel merken. Sichtbar wird es weiterhin erst, wenn
      // die Telemetrie den Gang tatsächlich bestätigt.
      this.gearResolver.expect(mode);
      this.refreshTelemetrySoon();
    } else {
      this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
    }
  }

  private readCurrentGear(snapshot: TelemetrySnapshot): GearPosition | undefined {
    return this.gearResolver.resolve(
      snapshot.connected ? snapshot.vehicle : undefined
    );
  }

  override dispose(): void {
    this.gearResolver.reset();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Blinker / Warnblinker
// ---------------------------------------------------------------------------

type IndicatorControlMode = "left" | "right" | "warning";
const INDICATOR_MODES: readonly IndicatorControlMode[] = [
  "left",
  "right",
  "warning"
];

const INDICATOR_FOLDERS: Record<IndicatorControlMode, string> = {
  left: "indicator-left",
  right: "indicator-right",
  warning: "warning-lights"
};

@action({ UUID: "de.rhao92.thebus-telemetry-interface.indicator-control" })
export class IndicatorControlAction
  extends BaseConfigurableKeyAction<IndicatorControlMode> {
  protected readonly defaultMode: IndicatorControlMode = "left";

  protected normalizeMode(mode: unknown): IndicatorControlMode {
    return INDICATOR_MODES.includes(mode as IndicatorControlMode)
      ? mode as IndicatorControlMode
      : this.defaultMode;
  }

  protected override shouldAnimateMode(
    mode: IndicatorControlMode,
    snapshot: TelemetrySnapshot
  ): boolean {
    const warning = readWarningLights(snapshot);

    if (mode === "warning") {
      return warning === true
        && readIndicatorLampPhase(snapshot, mode) === undefined;
    }

    const indicator = readIndicator(snapshot);
    return (warning === true || indicator === mode)
      && readIndicatorLampPhase(snapshot, mode) === undefined;
  }

  protected createModeDisplayModel(
    mode: IndicatorControlMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    const folder = INDICATOR_FOLDERS[mode];
    const warning = readWarningLights(snapshot);
    const indicator = readIndicator(snapshot);

    if (mode === "warning") {
      if (warning === undefined) {
        return image(folder, "offline");
      }

      if (!warning) {
        return image(folder, "inactive");
      }

      const lampPhase = readIndicatorLampPhase(snapshot, mode);
      if (lampPhase !== undefined) {
        return image(folder, lampPhase ? "active" : "active-dim");
      }

      return image(folder, animationFrame === 0 ? "active-dim" : "active");
    }

    if (indicator === undefined && warning !== true) {
      return image(folder, "offline");
    }

    const active = warning === true || indicator === mode;
    const lampPhase = readIndicatorLampPhase(snapshot, mode);
    return active
      ? image(
        folder,
        lampPhase === undefined
          ? animationFrame === 0 ? "active-dim" : "active"
          : lampPhase ? "active" : "active-dim"
      )
      : image(folder, "inactive");
  }

  protected async handleModeKeyDown(
    mode: IndicatorControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleId) {
      return;
    }

    const eventName = mode === "warning"
      ? "ToggleWarningLights"
      : mode === "left"
        ? "IndicatorDown"
        : "IndicatorUp";

    const confirmed = mode === "warning"
      ? readWarningLights(snapshot)
      : readIndicator(snapshot);

    if (confirmed === undefined) {
      return;
    }

    const sent = await this.sendEvent(eventName);

    if (sent) {
      this.refreshTelemetrySoon();
    } else {
      this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
    }
  }
}

function readWarningLights(
  snapshot: TelemetrySnapshot
): boolean | undefined {
  if (!snapshot.connected) {
    return undefined;
  }

  return readWarningLightsState(snapshot.vehicle);
}

function readIndicator(
  snapshot: TelemetrySnapshot
): IndicatorPosition | undefined {
  if (!snapshot.connected) {
    return undefined;
  }

  return readIndicatorState(snapshot.vehicle);
}

function readIndicatorLampPhase(
  snapshot: TelemetrySnapshot,
  mode: IndicatorControlMode
): boolean | undefined {
  const lampName = mode === "warning"
    ? "LED Warning"
    : mode === "left"
      ? "Light Indicator Left"
      : "Light Indicator Right";
  return readLampPhase(snapshot.vehicle, lampName);
}

// ---------------------------------------------------------------------------
// Kneeling
// ---------------------------------------------------------------------------

type KneelingControlMode = "manual" | "automatic";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.kneeling-control" })
export class KneelingControlAction
  extends BaseConfigurableKeyAction<KneelingControlMode> {
  protected readonly defaultMode: KneelingControlMode = "manual";

  private readonly motion = new KneelingMotionTracker();
  private commandInFlight = false;

  protected normalizeMode(mode: unknown): KneelingControlMode {
    return mode === "automatic" ? "automatic" : this.defaultMode;
  }

  protected override shouldAnimateMode(
    mode: KneelingControlMode,
    snapshot: TelemetrySnapshot
  ): boolean {
    if (mode !== "manual") {
      return false;
    }

    if (!snapshot.connected || !snapshot.vehicle) {
      this.motion.stop();
      return false;
    }

    return this.motion.observe(
      snapshot.vehicle,
      readAutomaticKneelingState(snapshot.vehicle) === true
    );
  }

  protected createModeDisplayModel(
    mode: KneelingControlMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (mode === "automatic") {
      if (!snapshot.connected || !snapshot.vehicle) {
        return image("automatic-kneeling", "offline");
      }

      const active = readAutomaticKneelingState(snapshot.vehicle);
      return active === undefined
        ? image("automatic-kneeling", "offline")
        : image("automatic-kneeling", active ? "active" : "inactive");
    }

    if (!snapshot.connected || !snapshot.vehicle) {
      return image("kneeling", "offline");
    }

    if (this.motion.target !== undefined) {
      return image("kneeling", animationFrame === 0 ? "ready" : "active");
    }

    const automaticActive = readAutomaticKneelingState(snapshot.vehicle) === true;
    const lowered = this.motion.readMechanicalState(
      snapshot.vehicle,
      automaticActive
    );

    if (lowered === undefined) {
      return image("kneeling", "offline");
    }

    if (lowered) {
      return image("kneeling", "active");
    }

    return image(
      "kneeling",
      isVehicleStationary(snapshot.vehicle) === true ? "ready" : "inactive"
    );
  }

  protected async handleModeKeyDown(
    mode: KneelingControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    if (!snapshot.connected || !snapshot.vehicle || !snapshot.vehicleId) {
      return;
    }

    if (mode === "automatic") {
      if (readAutomaticKneelingState(snapshot.vehicle) === undefined) {
        return;
      }

      this.commandInFlight = true;

      try {
        const sent = await this.sendEvent("Pedestrians");

        if (sent) {
          this.refreshTelemetrySoon();
        } else {
          this.logWarning('Event "Pedestrians" konnte nicht gesendet werden.');
        }
      } finally {
        this.commandInFlight = false;
      }
      return;
    }

    const automaticActive = readAutomaticKneelingState(snapshot.vehicle) === true;
    const lowered = this.motion.readMechanicalState(
      snapshot.vehicle,
      automaticActive
    );

    if (lowered === undefined) {
      return;
    }

    const targetLowered = !lowered;

    if (targetLowered && isVehicleStationary(snapshot.vehicle) !== true) {
      return;
    }

    const eventName = targetLowered ? "KneelDown" : "KneelUp";
    this.commandInFlight = true;
    this.motion.start(targetLowered, snapshot.vehicle);

    try {
      const sent = await this.sendEvent(eventName);

      if (!sent) {
        this.motion.stop();
        this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.motion.stop();
      this.logError(`Fehler beim Senden von "${eventName}".`, error);
    } finally {
      this.commandInFlight = false;
    }
  }

  override dispose(): void {
    this.motion.stop();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Fahrgastraumlicht
// ---------------------------------------------------------------------------

type PassengerLightControlMode = "toggle" | "dim" | "bright";
const LIGHT_MODES: readonly PassengerLightControlMode[] = [
  "toggle",
  "dim",
  "bright"
];

const LIGHT_FOLDERS: Record<PassengerLightControlMode, string> = {
  toggle: "passenger-lights",
  dim: "passenger-lights-dim",
  bright: "passenger-lights-bright"
};

@action({ UUID: "de.rhao92.thebus-telemetry-interface.passenger-light-control" })
export class PassengerLightControlAction
  extends BaseConfigurableKeyAction<PassengerLightControlMode> {
  protected readonly defaultMode: PassengerLightControlMode = "toggle";

  private commandGeneration = 0;

  protected normalizeMode(mode: unknown): PassengerLightControlMode {
    return LIGHT_MODES.includes(mode as PassengerLightControlMode)
      ? mode as PassengerLightControlMode
      : this.defaultMode;
  }

  protected createModeDisplayModel(
    mode: PassengerLightControlMode,
    snapshot: TelemetrySnapshot,
    _animationFrame: AnimationFrame
  ): DisplayModel {
    const folder = LIGHT_FOLDERS[mode];

    if (!snapshot.connected || !snapshot.vehicle) {
      return image(folder, "offline");
    }

    const state = readPassengerLightState(snapshot.vehicle);
    return image(folder, state ?? "offline");
  }

  protected async handleModeKeyDown(
    mode: PassengerLightControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.connected || !snapshot.vehicle || !snapshot.vehicleId) {
      return;
    }

    const currentState = readPassengerLightState(snapshot.vehicle);

    if (currentState === undefined) {
      return;
    }

    if (mode === "toggle") {
      const sent = await this.sendEvent("TogglePassengersLight");

      if (sent) {
        this.refreshTelemetrySoon();
      }
      return;
    }

    const targetState: Exclude<PassengerLightState, "off"> = mode;

    if (currentState === targetState) {
      return;
    }

    const vehicleId = snapshot.vehicleId;
    const generation = ++this.commandGeneration;

    if (currentState === "off") {
      const enabled = await this.sendEvent("TogglePassengersLight");

      if (!enabled) {
        return;
      }

      this.refreshTelemetrySoon();
      await new Promise((resolve) => setTimeout(resolve, LIGHT_LEVEL_DELAY_MS));

      if (
        generation !== this.commandGeneration
        || this.snapshot.vehicleId !== vehicleId
      ) {
        return;
      }
    }

    const eventName = mode === "dim" ? "InteriorLightDim" : "InteriorLightBright";
    const sent = await this.sendEvent(eventName);

    if (sent) {
      this.refreshTelemetrySoon();
    }
  }

  override dispose(): void {
    this.commandGeneration += 1;
    super.dispose();
  }
}
