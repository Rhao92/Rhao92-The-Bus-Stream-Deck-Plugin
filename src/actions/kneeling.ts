import {
  action,
  KeyDownEvent
} from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import {
  KneelingMotionTracker
} from "../core/kneeling";
import { TelemetrySnapshot } from "../core/telemetry";
import { isVehicleStationary } from "../core/vehicle-motion";
import { readAutomaticKneelingState } from "../core/vehicle-controls";
import {
  manualKneelingRequiresHold,
  resolveManualKneelingEvent
} from "../core/vehicle-events";

const SCANIA_KNEELING_HOLD_MS = 3_500;

@action({ UUID: "de.rhao92.thebus-telemetry-interface.kneeling" })
export class KneelingAction extends BaseAnimationAction {
  private readonly motion = new KneelingMotionTracker();
  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
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

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (!snapshot.connected || !snapshot.vehicle) {
      return { state: 0 };
    }

    if (
      !resolveManualKneelingEvent(snapshot.vehicle, true)
      || !resolveManualKneelingEvent(snapshot.vehicle, false)
    ) {
      return { state: 0 };
    }

    if (this.motion.target !== undefined) {
      // Gelb/Rot im Wechsel, bis die Bewegung ausreichend bestaetigt ist.
      return { state: animationFrame === 0 ? 1 : 2 };
    }

    const automaticActive = readAutomaticKneelingState(snapshot.vehicle) === true;
    const lowered = this.motion.readMechanicalState(
      snapshot.vehicle,
      automaticActive
    );

    if (lowered === undefined) {
      return { state: 0 };
    }

    if (lowered) {
      return { state: 2 };
    }

    return { state: isVehicleStationary(snapshot.vehicle) === true ? 1 : 3 };
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;

    if (!snapshot.connected || !snapshot.vehicle || !snapshot.vehicleId) {
      return;
    }

    // Fuer die Bedienrichtung gilt der explizite Primary/Secondary-Zustand.
    // Ein Bordstein kann damit keinen falschen KneelUp-Befehl mehr ausloesen.
    const automaticActive = readAutomaticKneelingState(snapshot.vehicle) === true;
    const lowered = this.motion.readMechanicalState(
      snapshot.vehicle,
      automaticActive
    );

    if (lowered === undefined) {
      return;
    }

    const targetLowered = !lowered;

    // Absenken ist nur im bestaetigten Stillstand freigegeben. Anheben bleibt
    // auch dann moeglich, falls das Fahrzeug bereits abgesenkt gemeldet wird.
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
          await new Promise((resolve) => setTimeout(resolve, SCANIA_KNEELING_HOLD_MS));
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
