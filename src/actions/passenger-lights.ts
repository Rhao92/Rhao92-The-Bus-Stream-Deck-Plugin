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
import {
  passengerLightTargetRequiresPressRelease,
  resolvePassengerLightLevelEvent,
  resolvePassengerLightTargetEventBatches,
  resolvePassengerLightToggleEvent
} from "../core/vehicle-events";
import { vehicleIdentityContains } from "../core/vehicle-identity";

const LIGHT_STATES = {
  offline: 0,
  off: 1,
  on: 2,
  dim: 2,
  bright: 3
} as const;
const LIGHT_LEVEL_DELAY_MS = 150;
const PASSENGER_LIGHT_AREA_DELAY_MS = 180;
const PASSENGER_LIGHT_STEP_DELAY_MS = 450;
const PASSENGER_LIGHT_PRESS_DURATION_MS = 120;

function displayStateFor(state: PassengerLightState | undefined): number {
  switch (state) {
    case "off":
      return LIGHT_STATES.off;
    case "on":
      // Gelb bedeutet hier nur bestaetigt eingeschaltet. Ohne passende
      // Rueckmeldung wird daraus keine konkrete Helligkeitsstufe abgeleitet.
      return LIGHT_STATES.on;
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
    snapshot: TelemetrySnapshot,
    _active: boolean
  ): string | undefined {
    return resolvePassengerLightToggleEvent(snapshot.vehicle);
  }
}

abstract class PassengerLightLevelAction extends BaseDisplayAction {
  protected abstract readonly targetState: "dim" | "bright";
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

    if (!vehicleId || currentState === this.targetState) {
      return;
    }

    const generation = ++this.commandGeneration;
    this.commandInFlight = true;

    try {
      const targetEventBatches = resolvePassengerLightTargetEventBatches(
        snapshot.vehicle,
        this.targetState
      );

      if (targetEventBatches !== undefined) {
        for (let index = 0; index < targetEventBatches.length; index += 1) {
          if (this.snapshot.vehicleId !== vehicleId) {
            return;
          }

          const eventBatch = targetEventBatches[index];

          for (let eventIndex = 0; eventIndex < eventBatch.length; eventIndex += 1) {
            if (this.snapshot.vehicleId !== vehicleId) {
              return;
            }

            const eventName = eventBatch[eventIndex];
            const sent = await this.sendEvent(eventName);

            if (!sent) {
              this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
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

      const directEvent = resolvePassengerLightLevelEvent(
        snapshot.vehicle,
        this.targetState
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

        if (!pressed || !released) {
          this.logWarning(`Event \"${directEvent}\" konnte nicht vollständig gesendet werden.`);
          return;
        }

        this.refreshTelemetrySoon();
        return;
      }

      if (currentState === "off") {
        const toggleEvent = resolvePassengerLightToggleEvent(snapshot.vehicle);

        if (!toggleEvent) {
          return;
        }

        const enabled = await this.sendEvent(toggleEvent);

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

      const eventName = resolvePassengerLightLevelEvent(
        snapshot.vehicle,
        this.targetState
      );

      if (!eventName) {
        return;
      }

      const sent = await this.sendEvent(eventName);

      if (!sent) {
        this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
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
