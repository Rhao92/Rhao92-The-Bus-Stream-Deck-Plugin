import {
  action,
  KeyDownEvent
} from "@elgato/streamdeck";
import { BaseDisplayAction, DisplayModel } from "../base/base-display-action";
import {
  GearPosition,
  GearStateResolver,
  resolveGearCommand
} from "../core/gear";
import { TelemetrySnapshot } from "../core/telemetry";

abstract class GearSelectorAction extends BaseDisplayAction {
  protected abstract readonly targetGear: GearPosition;

  private commandInFlight = false;
  private readonly gearResolver = new GearStateResolver();

  protected override createDisplayModel(
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    const currentGear = this.readCurrentGear(snapshot);

    if (currentGear === undefined) {
      return { state: 0 };
    }

    return {
      state: currentGear === this.targetGear ? 2 : 1
    };
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const currentGear = this.readCurrentGear(snapshot);

    // Ohne bestaetigten Ist-Zustand wird kein Gangbefehl gesendet. Die Anzeige
    // und Bedienung bleiben damit vollstaendig telemetriegesteuert.
    if (currentGear === undefined || !snapshot.vehicleId) {
      return;
    }

    // Ein bereits eingelegter Gang wird nicht erneut gesendet.
    if (currentGear === this.targetGear) {
      return;
    }

    const events = resolveGearCommand(
      snapshot.vehicle,
      currentGear,
      this.targetGear
    );

    if (!events || events.length === 0) {
      return;
    }

    this.commandInFlight = true;

    try {
      for (let index = 0; index < events.length; index += 1) {
        if (this.snapshot.vehicleId !== snapshot.vehicleId) {
          return;
        }

        const sent = await this.sendEvent(events[index]);

        if (!sent) {
          this.logWarning(`Event \"${events[index]}\" konnte nicht gesendet werden.`);
          return;
        }

        if (index < events.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Nur das erwartete Ziel merken. Sichtbar wird es weiterhin erst, wenn
      // die Telemetrie den Gang tatsächlich bestätigt.
      this.gearResolver.expect(this.targetGear);
      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(
        `Fehler beim Senden der Gangfolge \"${events.join(", ")}\".`,
        error
      );
    } finally {
      this.commandInFlight = false;
    }
  }

  private readCurrentGear(
    snapshot: TelemetrySnapshot
  ): GearPosition | undefined {
    return this.gearResolver.resolve(
      snapshot.connected ? snapshot.vehicle : undefined
    );
  }

  override dispose(): void {
    this.gearResolver.reset();
    super.dispose();
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.gear-drive" })
export class GearDriveAction extends GearSelectorAction {
  protected readonly targetGear = "D";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.gear-neutral" })
export class GearNeutralAction extends GearSelectorAction {
  protected readonly targetGear = "N";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.gear-reverse" })
export class GearReverseAction extends GearSelectorAction {
  protected readonly targetGear = "R";
}
