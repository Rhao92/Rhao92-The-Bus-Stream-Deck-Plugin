import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  doorAllCommandIndexes,
  DoorState,
  readAvailableDoorStates,
  readDoorState,
  summarizeDoorStates
} from "../core/doors";
import { TelemetrySnapshot } from "../core/telemetry";

const DOOR_EVENTS = [
  "DoorFrontOpenClose",
  "DoorMiddleOpenClose",
  "DoorRearOpenClose",
  "DoorFourthOpenClose"
] as const;

const SINGLE_DOOR_STATES = {
  offline: 0,
  closed: 1,
  movingDim: 2,
  open: 3,
  moving: 4
} as const;

const ALL_DOORS_STATES = {
  offline: 0,
  closed: 1,
  mixed: 2,
  open: 3,
  movingDim: 4,
  moving: 5
} as const;

abstract class SingleDoorAction extends BaseAnimationAction {
  protected abstract readonly doorIndex: number;

  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    return this.readState(snapshot) === "moving";
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    const state = this.readState(snapshot);

    switch (state) {
      case "closed":
        return { state: SINGLE_DOOR_STATES.closed };
      case "open":
        return { state: SINGLE_DOOR_STATES.open };
      case "moving":
        return {
          state: animationFrame === 0
            ? SINGLE_DOOR_STATES.moving
            : SINGLE_DOOR_STATES.movingDim
        };
      default:
        return { state: SINGLE_DOOR_STATES.offline };
    }
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const state = this.readState(snapshot);
    const eventName = DOOR_EVENTS[this.doorIndex];

    // Ein fehlender Tuerzustand ist kein bestaetigtes "geschlossen". Ohne
    // sichere Telemetrie wird deshalb auch kein Toggle-Befehl gesendet.
    if (state === undefined || !snapshot.vehicleId || !eventName) {
      return;
    }

    this.commandInFlight = true;

    try {
      const sent = await this.sendEvent(eventName);

      if (!sent) {
        this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(`Fehler beim Senden von \"${eventName}\".`, error);
    } finally {
      this.commandInFlight = false;
    }
  }

  private readState(snapshot: TelemetrySnapshot): DoorState | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return readDoorState(snapshot.vehicle.doors?.[this.doorIndex]);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-1" })
export class Door1Action extends SingleDoorAction {
  protected readonly doorIndex = 0;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-2" })
export class Door2Action extends SingleDoorAction {
  protected readonly doorIndex = 1;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-3" })
export class Door3Action extends SingleDoorAction {
  protected readonly doorIndex = 2;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.door-4" })
export class Door4Action extends SingleDoorAction {
  protected readonly doorIndex = 3;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.all-doors" })
export class AllDoorsAction extends BaseAnimationAction {
  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    return this.readGroupState(snapshot) === "moving";
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    const state = this.readGroupState(snapshot);

    switch (state) {
      case "closed":
        return {
          state: ALL_DOORS_STATES.closed,
          title: "OPEN ALL"
        };
      case "mixed":
        return {
          state: ALL_DOORS_STATES.mixed,
          title: "CLOSE ALL"
        };
      case "open":
        return {
          state: ALL_DOORS_STATES.open,
          title: "CLOSE ALL"
        };
      case "moving":
        return {
          state: animationFrame === 0
            ? ALL_DOORS_STATES.moving
            : ALL_DOORS_STATES.movingDim,
          title: "CLOSE ALL"
        };
      default:
        return {
          state: ALL_DOORS_STATES.offline,
          title: null
        };
    }
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const states = snapshot.connected
      ? readAvailableDoorStates(snapshot.vehicle)
      : undefined;

    if (!states || !snapshot.vehicleId) {
      return;
    }

    const indexes = doorAllCommandIndexes(states);

    if (indexes.length === 0) {
      return;
    }

    this.commandInFlight = true;
    let sentAny = false;

    try {
      for (let position = 0; position < indexes.length; position += 1) {
        const index = indexes[position];
        const eventName = DOOR_EVENTS[index];

        if (!eventName) {
          continue;
        }

        const sent = await this.sendEvent(eventName);
        sentAny ||= sent;

        if (!sent) {
          this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
        }

        // Die offiziellen Toggle-Events werden bewusst leicht versetzt, damit
        // das Spiel auch bei vier Tueren jeden einzelnen Befehl verarbeitet.
        if (position < indexes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (sentAny) {
        this.refreshTelemetrySoon();
      }
    } catch (error) {
      this.logError("Fehler beim Senden der Sammel-Tuerbefehle.", error);
    } finally {
      this.commandInFlight = false;
    }
  }

  private readGroupState(snapshot: TelemetrySnapshot) {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    return summarizeDoorStates(readAvailableDoorStates(snapshot.vehicle));
  }
}
