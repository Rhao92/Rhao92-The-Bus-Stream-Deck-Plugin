import {
  action,
  KeyDownEvent
} from "@elgato/streamdeck";
import { BaseDisplayAction, DisplayModel } from "../base/base-display-action";
import { BaseToggleAction } from "../base/base-toggle-action";
import { TelemetrySnapshot } from "../core/telemetry";
import {
  PassengerLightState,
  readPassengerLightState
} from "../core/vehicle-controls";

const LIGHT_STATES = {
  offline: 0,
  off: 1,
  dim: 2,
  bright: 3
} as const;
const LIGHT_LEVEL_DELAY_MS = 150;

function displayStateFor(state: PassengerLightState | undefined): number {
  switch (state) {
    case "off":
      return LIGHT_STATES.off;
    case "dim":
      return LIGHT_STATES.dim;
    case "bright":
      return LIGHT_STATES.bright;
    default:
      return LIGHT_STATES.offline;
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.passenger-lights" })
export class PassengerLightsAction extends BaseToggleAction {
  protected override readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined {
    if (!snapshot.connected || !snapshot.vehicle) {
      return undefined;
    }

    const state = readPassengerLightState(snapshot.vehicle);
    return state === undefined ? undefined : state !== "off";
  }

  protected override createToggleDisplayModel(
    _active: boolean,
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: displayStateFor(readPassengerLightState(snapshot.vehicle))
    };
  }

  protected override getToggleEventName(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): string {
    return "TogglePassengersLight";
  }
}

abstract class PassengerLightLevelAction extends BaseDisplayAction {
  protected abstract readonly targetState: Exclude<PassengerLightState, "off">;
  protected abstract readonly targetEventName: string;

  private commandInFlight = false;
  private commandGeneration = 0;

  protected override createDisplayModel(
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    if (!snapshot.connected || !snapshot.vehicle) {
      return { state: LIGHT_STATES.offline };
    }

    return {
      state: displayStateFor(readPassengerLightState(snapshot.vehicle))
    };
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const vehicleId = snapshot.vehicleId;
    const currentState = snapshot.connected
      ? readPassengerLightState(snapshot.vehicle)
      : undefined;

    if (!vehicleId || currentState === undefined || currentState === this.targetState) {
      return;
    }

    const generation = ++this.commandGeneration;
    this.commandInFlight = true;

    try {
      if (currentState === "off") {
        const enabled = await this.sendEvent("TogglePassengersLight");

        if (!enabled) {
          this.logWarning("Fahrgastraumlicht konnte nicht eingeschaltet werden.");
          return;
        }

        this.refreshTelemetrySoon();
        await new Promise((resolve) => setTimeout(resolve, LIGHT_LEVEL_DELAY_MS));

        // Fahrzeugwechsel oder dispose() waehrend der kurzen Befehlsfolge:
        // Der zweite Befehl darf dann nicht an ein anderes Fahrzeug gehen.
        if (
          generation !== this.commandGeneration
          || this.snapshot.vehicleId !== vehicleId
        ) {
          return;
        }
      }

      const sent = await this.sendEvent(this.targetEventName);

      if (!sent) {
        this.logWarning(`Event \"${this.targetEventName}\" konnte nicht gesendet werden.`);
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(
        `Fehler beim Senden von \"${this.targetEventName}\".`,
        error
      );
    } finally {
      this.commandInFlight = false;
    }
  }

  override dispose(): void {
    this.commandGeneration += 1;
    this.commandInFlight = false;
    super.dispose();
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.passenger-lights-dim" })
export class PassengerLightsDimAction extends PassengerLightLevelAction {
  protected readonly targetState = "dim";
  protected readonly targetEventName = "InteriorLightDim";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.passenger-lights-bright" })
export class PassengerLightsBrightAction extends PassengerLightLevelAction {
  protected readonly targetState = "bright";
  protected readonly targetEventName = "InteriorLightBright";
}
