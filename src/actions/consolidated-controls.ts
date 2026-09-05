import { action, KeyAction } from "@elgato/streamdeck";
import { BaseConfigurableKeyAction } from "../base/base-configurable-key-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  DoorState,
  readAvailableDoorStates,
  summarizeDoorStates
} from "../core/doors";
import {
  IndicatorPosition,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../core/driving-controls";
import {
  GearPosition,
  GearStateResolver,
  resolveGearCommand
} from "../core/gear";
import {
  normalizeRetarderMode,
  normalizeWiperMode,
  readRetarderState,
  readWiperState,
  resolveRetarderCommand,
  resolveWiperCommand,
  RetarderMode,
  WiperMode
} from "../core/extended-controls";
import { KneelingMotionTracker } from "../core/kneeling";
import { TelemetrySnapshot } from "../core/telemetry";
import {
  passengerLightTargetRequiresPressRelease,
  manualKneelingRequiresHold,
  resolveAutomaticDoorClosingEvent,
  resolveAutomaticKneelingEvent,
  resolveDoorToggleEvent,
  resolveManualKneelingEvent,
  resolvePassengerLightOffEvent,
  resolvePassengerLightLevelEvent,
  resolvePassengerLightTargetEventBatches,
  resolvePassengerLightToggleTarget,
  resolvePassengerLightToggleEvent,
  resolveStopBrakeEvent,
  usesCyclicPassengerLightControl
} from "../core/vehicle-events";
import { isVehicleStationary } from "../core/vehicle-motion";
import {
  PassengerLightState,
  readAutomaticDoorClosingState,
  readAutomaticKneelingState,
  readDoorClearanceState,
  readParkingBrakeState,
  readPassengerLightState,
  readStopBrakeState
} from "../core/vehicle-controls";
import { vehicleIdentityContains } from "../core/vehicle-identity";
import {
  renderRetarderKey,
  renderWiperKey
} from "../vehicle/extended-control-renderer";

const LIGHT_LEVEL_DELAY_MS = 150;
const PASSENGER_LIGHT_AREA_DELAY_MS = 180;
const PASSENGER_LIGHT_STEP_DELAY_MS = 450;
const PASSENGER_LIGHT_PRESS_DURATION_MS = 120;

function image(folder: string, state: string): DisplayModel {
  return { image: `imgs/actions/${folder}/${state}.png`, title: null };
}

function passengerLightImageState(
  state: PassengerLightState | undefined
): "offline" | "off" | "dim" | "bright" {
  if (state === "on") {
    // Das gelbe Aktivbild behauptet keine konkrete Helligkeitsstufe.
    return "dim";
  }

  return state ?? "offline";
}

function readAutomaticDoorClosing(
  snapshot: TelemetrySnapshot
): boolean | undefined {
  if (!snapshot.connected || !snapshot.vehicle) {
    return undefined;
  }

  return readAutomaticDoorClosingState(snapshot.vehicle);
}

function readFullyControllableDoorStates(
  snapshot: TelemetrySnapshot
): DoorState[] | undefined {
  if (!snapshot.connected || !snapshot.vehicle) {
    return undefined;
  }

  const states = readAvailableDoorStates(snapshot.vehicle);

  if (
    !states
    || states.some((_, index) => !resolveDoorToggleEvent(snapshot.vehicle, index))
  ) {
    return undefined;
  }

  return states;
}

// ---------------------------------------------------------------------------
// Türen
// ---------------------------------------------------------------------------

type DoorPhysicalMode = "door-1" | "door-2" | "door-3" | "door-4";
type DoorControlMode =
  | "all"
  | DoorPhysicalMode
  | "clearance"
  | "automatic-closing";

const DOOR_MODES: readonly DoorControlMode[] = [
  "all",
  "door-1",
  "door-2",
  "door-3",
  "door-4",
  "clearance",
  "automatic-closing"
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

    if (mode === "clearance" || mode === "automatic-closing") {
      return false;
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

    if (mode === "clearance" || mode === "automatic-closing") {
      const state = mode === "clearance"
        ? readDoorClearanceState(snapshot.connected ? snapshot.vehicle : undefined)
        : readAutomaticDoorClosing(snapshot);
      const folder = mode === "clearance"
        ? "door-clearance"
        : "automatic-door-closing";
      return image(
        folder,
        state === undefined ? "offline" : state ? "active" : "inactive"
      );
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

    if (mode === "clearance" || mode === "automatic-closing") {
      const state = mode === "clearance"
        ? readDoorClearanceState(snapshot.vehicle)
        : readAutomaticDoorClosing(snapshot);

      if (state === undefined) {
        return;
      }

      const eventName = mode === "clearance"
        ? "ToggleDoorClearance"
        : resolveAutomaticDoorClosingEvent(snapshot.vehicle);

      if (!eventName) {
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

    if (mode !== "all") {
      const index = this.doorIndex(mode);
      const state = readAvailableDoorStates(snapshot.vehicle)?.[index];
      const eventName = resolveDoorToggleEvent(snapshot.vehicle, index);

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

    const states = readFullyControllableDoorStates(snapshot);

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
      const eventName = resolveDoorToggleEvent(
        snapshot.vehicle,
        indexes[position]
      );

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

  private doorIndex(mode: DoorPhysicalMode): number {
    return Number(mode.slice(-1)) - 1;
  }

  private readSingleState(
    mode: DoorPhysicalMode,
    snapshot: TelemetrySnapshot
  ): DoorState | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    const index = this.doorIndex(mode);

    if (!resolveDoorToggleEvent(snapshot.vehicle, index)) {
      return undefined;
    }

    return readAvailableDoorStates(snapshot.vehicle)?.[index];
  }

  private readGroupState(snapshot: TelemetrySnapshot) {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return summarizeDoorStates(readFullyControllableDoorStates(snapshot));
  }
}

// ---------------------------------------------------------------------------
// Gemeinsame Fahrsteuerung
// ---------------------------------------------------------------------------

const GEAR_FOLDERS: Record<GearPosition, string> = {
  D: "gear-drive",
  N: "gear-neutral",
  R: "gear-reverse"
};

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

type BrakeMode = "parking" | "stop";
type DrivingControlMode =
  | GearPosition
  | `indicator-${IndicatorControlMode}`
  | `brake-${BrakeMode}`
  | `retarder-${RetarderMode}`
  | `wiper-${WiperMode}`;

const DRIVING_CONTROL_MODES: readonly DrivingControlMode[] = [
  "D",
  "N",
  "R",
  "indicator-left",
  "indicator-right",
  "indicator-warning",
  "brake-parking",
  "brake-stop",
  "retarder-increase",
  "retarder-decrease",
  "retarder-off",
  "retarder-level-1",
  "retarder-level-2",
  "retarder-level-3",
  "retarder-level-4",
  "retarder-level-5",
  "wiper-increase",
  "wiper-decrease"
];

function isGearMode(mode: DrivingControlMode): mode is GearPosition {
  return mode === "D" || mode === "N" || mode === "R";
}

function indicatorModeFrom(
  mode: DrivingControlMode
): IndicatorControlMode | undefined {
  if (!mode.startsWith("indicator-")) {
    return undefined;
  }

  const candidate = mode.slice("indicator-".length) as IndicatorControlMode;
  return INDICATOR_MODES.includes(candidate) ? candidate : undefined;
}

function brakeModeFrom(mode: DrivingControlMode): BrakeMode | undefined {
  if (mode === "brake-parking") return "parking";
  if (mode === "brake-stop") return "stop";
  return undefined;
}

function createIndicatorDisplayModel(
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

function shouldAnimateIndicator(
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

@action({ UUID: "de.rhao92.thebus-telemetry-interface.gear-selector" })
export class ConfigurableGearSelectorAction
  extends BaseConfigurableKeyAction<DrivingControlMode> {
  protected readonly defaultMode: DrivingControlMode = "D";

  private readonly gearResolver = new GearStateResolver();

  protected normalizeMode(mode: unknown): DrivingControlMode {
    return DRIVING_CONTROL_MODES.includes(mode as DrivingControlMode)
      ? mode as DrivingControlMode
      : this.defaultMode;
  }

  protected override shouldAnimateMode(
    mode: DrivingControlMode,
    snapshot: TelemetrySnapshot
  ): boolean {
    const indicatorMode = indicatorModeFrom(mode);
    return indicatorMode === undefined
      ? false
      : shouldAnimateIndicator(indicatorMode, snapshot);
  }

  protected createModeDisplayModel(
    mode: DrivingControlMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (isGearMode(mode)) {
      const currentGear = this.readCurrentGear(snapshot);
      const folder = GEAR_FOLDERS[mode];

      if (currentGear === undefined) {
        return image(folder, "offline");
      }

      return image(folder, currentGear === mode ? "active" : "inactive");
    }

    const indicatorMode = indicatorModeFrom(mode);
    if (indicatorMode !== undefined) {
      return createIndicatorDisplayModel(
        indicatorMode,
        snapshot,
        animationFrame
      );
    }

    const brakeMode = brakeModeFrom(mode);
    if (brakeMode !== undefined) {
      const active = !snapshot.connected || !snapshot.vehicle
        ? undefined
        : brakeMode === "parking"
          ? readParkingBrakeState(snapshot.vehicle)
          : readStopBrakeState(snapshot.vehicle);
      return image(
        brakeMode === "parking" ? "parking-brake" : "stop-brake",
        active === undefined ? "offline" : active ? "active" : "inactive"
      );
    }

    if (mode.startsWith("retarder-")) {
      const retarderMode = normalizeRetarderMode(
        mode.slice("retarder-".length)
      );
      return {
        state: 0,
        title: null,
        image: renderRetarderKey(
          retarderMode,
          readRetarderState(snapshot.vehicle)
        )
      };
    }

    const wiperMode = normalizeWiperMode(mode.slice("wiper-".length));
    return {
      state: 0,
      title: null,
      image: renderWiperKey(wiperMode, readWiperState(snapshot.vehicle))
    };
  }

  protected async handleModeKeyDown(
    mode: DrivingControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (isGearMode(mode)) {
      await this.selectGear(mode, snapshot);
      return;
    }

    const indicatorMode = indicatorModeFrom(mode);
    if (indicatorMode !== undefined) {
      if (!snapshot.vehicleId) {
        return;
      }

      const confirmed = indicatorMode === "warning"
        ? readWarningLights(snapshot)
        : readIndicator(snapshot);

      if (confirmed === undefined) {
        return;
      }

      await this.sendAndRefresh(
        indicatorMode === "warning"
          ? "ToggleWarningLights"
          : indicatorMode === "left"
            ? "IndicatorDown"
            : "IndicatorUp"
      );
      return;
    }

    const brakeMode = brakeModeFrom(mode);
    if (brakeMode !== undefined) {
      if (!snapshot.connected || !snapshot.vehicle || !snapshot.vehicleId) {
        return;
      }

      const active = brakeMode === "parking"
        ? readParkingBrakeState(snapshot.vehicle)
        : readStopBrakeState(snapshot.vehicle);
      if (active === undefined) {
        return;
      }

      const eventName = brakeMode === "parking"
        ? "FixingBrake"
        : resolveStopBrakeEvent(snapshot.vehicle, active);
      if (eventName) {
        await this.sendAndRefresh(eventName);
      }
      return;
    }

    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }

    const command = mode.startsWith("retarder-")
      ? resolveRetarderCommand(
        snapshot.vehicle,
        normalizeRetarderMode(mode.slice("retarder-".length))
      )
      : resolveWiperCommand(
        snapshot.vehicle,
        normalizeWiperMode(mode.slice("wiper-".length))
      );

    if (command) {
      await this.sendAndRefresh(command.event);
    }
  }

  private async selectGear(
    mode: GearPosition,
    snapshot: TelemetrySnapshot
  ): Promise<void> {
    const currentGear = this.readCurrentGear(snapshot);

    if (currentGear === undefined || !snapshot.vehicleId || currentGear === mode) {
      return;
    }

    const events = resolveGearCommand(snapshot.vehicle, currentGear, mode);

    if (!events || events.length === 0) {
      return;
    }

    let sentAll = true;
    for (let index = 0; index < events.length; index += 1) {
      if (this.snapshot.vehicleId !== snapshot.vehicleId) {
        sentAll = false;
        break;
      }

      const sent = await this.sendEvent(events[index]);
      sentAll &&= sent;

      if (!sent) {
        this.logWarning(`Event "${events[index]}" konnte nicht gesendet werden.`);
        break;
      }

      if (index < events.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (sentAll) {
      // Nur das erwartete Ziel merken. Sichtbar wird es weiterhin erst, wenn
      // die Telemetrie den Gang tatsächlich bestätigt.
      this.gearResolver.expect(mode);
      this.refreshTelemetrySoon();
    }
  }

  private async sendAndRefresh(eventName: string): Promise<void> {
    const sent = await this.sendEvent(eventName);

    if (sent) {
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
// Blinker / Warnblinker (verborgene kompatible Einzelaction)
// ---------------------------------------------------------------------------

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
    return shouldAnimateIndicator(mode, snapshot);
  }

  protected createModeDisplayModel(
    mode: IndicatorControlMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    return createIndicatorDisplayModel(mode, snapshot, animationFrame);
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

    if (
      !resolveManualKneelingEvent(snapshot.vehicle, true)
      || !resolveManualKneelingEvent(snapshot.vehicle, false)
    ) {
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

    if (
      !resolveManualKneelingEvent(snapshot.vehicle, true)
      || !resolveManualKneelingEvent(snapshot.vehicle, false)
    ) {
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
        const eventName = resolveAutomaticKneelingEvent(snapshot.vehicle);

        if (!eventName) {
          return;
        }
        const sent = await this.sendEvent(eventName);

        if (sent) {
          this.refreshTelemetrySoon();
        } else {
          this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
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

    const eventName = resolveManualKneelingEvent(
      snapshot.vehicle,
      targetLowered
    );

    if (!eventName) {
      return;
    }
    this.commandInFlight = true;
    this.motion.start(targetLowered, snapshot.vehicle);

    try {
      if (manualKneelingRequiresHold(snapshot.vehicle)) {
        const pressed = await this.pressEvent(eventName);

        if (!pressed) {
          this.motion.stop();
          this.logWarning(`Event "${eventName}" konnte nicht gedrückt werden.`);
          return;
        }

        this.refreshTelemetrySoon();
        let released = false;

        try {
          await new Promise((resolve) => setTimeout(resolve, 3_500));
        } finally {
          released = this.snapshot.vehicleId === snapshot.vehicleId
            ? await this.releaseEvent(eventName)
            : (this.telemetry.sendEventForVehicleDetached(
              snapshot.vehicleId,
              eventName,
              "release"
            ), true);
        }

        if (!released) {
          this.motion.stop();
          this.logWarning(`Event "${eventName}" konnte nicht losgelassen werden.`);
          return;
        }

        this.refreshTelemetrySoon();
        return;
      }

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

type PassengerLightControlMode = "off" | "on" | "dim" | "bright" | "toggle";
const LIGHT_MODES: readonly PassengerLightControlMode[] = [
  "off",
  "on",
  "toggle",
  "dim",
  "bright"
];

const LIGHT_FOLDERS: Record<PassengerLightControlMode, string> = {
  off: "passenger-lights",
  on: "passenger-lights",
  toggle: "passenger-lights",
  dim: "passenger-lights-dim",
  bright: "passenger-lights-bright"
};

@action({ UUID: "de.rhao92.thebus-telemetry-interface.passenger-light-control" })
export class PassengerLightControlAction
  extends BaseConfigurableKeyAction<PassengerLightControlMode> {
  protected readonly defaultMode: PassengerLightControlMode = "off";

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
    return image(folder, passengerLightImageState(state));
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

    let targetMode: Exclude<PassengerLightControlMode, "toggle" | "on">;

    if (mode === "on") {
      if (currentState !== "off") {
        return;
      }

      // Fahrzeuge mit getrennten Bereichen werden auch beim direkten Ziel
      // Ein gemeinsam auf die erste bestaetigte aktive Stufe gebracht. So
      // bleiben insbesondere beide MAN-Decks und beide Scania-Bereiche
      // gekoppelt. Binaere Fahrzeuge verwenden ihren echten Hauptschalter.
      const coupledEvents = resolvePassengerLightTargetEventBatches(
        snapshot.vehicle,
        "dim"
      );

      if (coupledEvents === undefined) {
        const eventName = resolvePassengerLightToggleEvent(snapshot.vehicle);

        if (!eventName) {
          return;
        }

        const sent = await this.sendEvent(eventName);

        if (sent) {
          this.refreshTelemetrySoon();
        }
        return;
      }

      targetMode = "dim";
    } else if (
      mode === "toggle"
      && !vehicleIdentityContains(snapshot.vehicle, "man")
    ) {
      const eventName = resolvePassengerLightToggleEvent(snapshot.vehicle);

      if (!eventName) {
        return;
      }
      const sent = await this.sendEvent(eventName);

      if (sent) {
        this.refreshTelemetrySoon();
      }
      return;
    } else if (mode === "toggle") {
      const toggleTarget = resolvePassengerLightToggleTarget(
        snapshot.vehicle,
        currentState
      );

      if (toggleTarget === undefined) {
        return;
      }

      // Bereits gespeicherte Profile können weiterhin den früher sichtbaren
      // Umschaltmodus enthalten. Beim MAN darf dieser nicht den echten
      // TogglePassengersLight-Event senden, weil er ausschließlich das
      // Unterdeck bedient. Stattdessen schaltet er beide Decks gemeinsam aus
      // beziehungsweise aus AUS gemeinsam auf Gedimmt.
      targetMode = toggleTarget;
    } else {
      targetMode = mode;
    }

    const targetEventBatches = resolvePassengerLightTargetEventBatches(
      snapshot.vehicle,
      targetMode
    );

    if (targetEventBatches !== undefined) {
      for (let index = 0; index < targetEventBatches.length; index += 1) {
        if (this.snapshot.vehicleId !== snapshot.vehicleId) {
          return;
        }

        const eventBatch = targetEventBatches[index];

        for (let eventIndex = 0; eventIndex < eventBatch.length; eventIndex += 1) {
          if (this.snapshot.vehicleId !== snapshot.vehicleId) {
            return;
          }

          const sent = await this.sendEvent(eventBatch[eventIndex]);

          if (!sent) {
            return;
          }

          if (eventIndex < eventBatch.length - 1) {
            await new Promise((resolve) => setTimeout(
              resolve,
              PASSENGER_LIGHT_AREA_DELAY_MS
            ));
          }
        }

        this.refreshTelemetrySoon();

        if (index < targetEventBatches.length - 1) {
          await new Promise((resolve) => setTimeout(
            resolve,
            PASSENGER_LIGHT_STEP_DELAY_MS
          ));
        }
      }

      if (targetEventBatches.length > 0) {
        this.refreshTelemetrySoon();
      }
      return;
    }

    if (targetMode === "off") {
      if (currentState === "off") {
        return;
      }

      const directOffEvent = resolvePassengerLightOffEvent(snapshot.vehicle);

      if (
        directOffEvent
        && passengerLightTargetRequiresPressRelease(snapshot.vehicle)
      ) {
        const pressed = await this.pressEvent(directOffEvent);
        await new Promise((resolve) => setTimeout(
          resolve,
          PASSENGER_LIGHT_PRESS_DURATION_MS
        ));
        const released = await this.releaseEvent(directOffEvent);

        if (pressed && released) {
          this.refreshTelemetrySoon();
        }
        return;
      }

      // Bei einem zyklischen Mehrstufentaster ist ein einfacher Toggle ohne
      // bekannte Zielstufenfolge keine sichere Direktwahl auf AUS.
      if (usesCyclicPassengerLightControl(snapshot.vehicle)) {
        return;
      }

      const toggleEvent = resolvePassengerLightToggleEvent(snapshot.vehicle);

      if (!toggleEvent) {
        return;
      }

      const sent = await this.sendEvent(toggleEvent);

      if (sent) {
        this.refreshTelemetrySoon();
      }
      return;
    }

    const targetState: "dim" | "bright" = targetMode;

    if (currentState === targetState) {
      return;
    }

    const vehicleId = snapshot.vehicleId;
    const generation = ++this.commandGeneration;
    const directEvent = resolvePassengerLightLevelEvent(
      snapshot.vehicle,
      targetState
    );

    if (!directEvent && vehicleIdentityContains(snapshot.vehicle, "citea")) {
      return;
    }

    if (
      directEvent
      && passengerLightTargetRequiresPressRelease(snapshot.vehicle)
    ) {
      const pressed = await this.pressEvent(directEvent);
      await new Promise((resolve) => setTimeout(
        resolve,
        PASSENGER_LIGHT_PRESS_DURATION_MS
      ));
      const released = await this.releaseEvent(directEvent);

      if (pressed && released) {
        this.refreshTelemetrySoon();
      }
      return;
    }

    if (currentState === "off") {
      const toggleEvent = resolvePassengerLightToggleEvent(snapshot.vehicle);

      if (!toggleEvent) {
        return;
      }
      const enabled = await this.sendEvent(toggleEvent);

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

    const eventName = resolvePassengerLightLevelEvent(snapshot.vehicle, targetMode);

    if (!eventName) {
      return;
    }
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
