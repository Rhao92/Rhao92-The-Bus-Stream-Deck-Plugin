import {
  action,
  KeyDownEvent
} from "@elgato/streamdeck";
import { BaseAnimationAction } from "../base/base-animation-action";
import { DisplayModel } from "../base/base-display-action";
import { AnimationFrame } from "../core/animation-clock";
import { RampState, readRampState } from "../core/ramp";
import { TelemetrySnapshot } from "../core/telemetry";

const TARGET_STABLE_MS = 500;
const MIN_ANIMATION_MS = 1_200;
const ANIMATION_TIMEOUT_MS = 12_000;

type RampTargetState = Extract<RampState, "ready" | "deployed">;

@action({ UUID: "de.rhao92.thebus-telemetry-interface.ramp" })
export class RampAction extends BaseAnimationAction {
  private targetState: RampTargetState | undefined;
  private animationStartedAt = 0;
  private targetReachedAt: number | undefined;
  private commandInFlight = false;

  protected override shouldAnimate(snapshot: TelemetrySnapshot): boolean {
    if (!snapshot.connected || !snapshot.vehicle) {
      this.stopAnimation();
      return false;
    }

    if (!this.targetState) {
      return false;
    }

    const now = Date.now();

    if (now - this.animationStartedAt >= ANIMATION_TIMEOUT_MS) {
      this.stopAnimation();
      return false;
    }

    const state = readRampState(snapshot.vehicle);

    if (state === this.targetState) {
      this.targetReachedAt ??= now;

      if (
        now - this.targetReachedAt >= TARGET_STABLE_MS &&
        now - this.animationStartedAt >= MIN_ANIMATION_MS
      ) {
        this.stopAnimation();
        return false;
      }
    } else {
      this.targetReachedAt = undefined;
    }

    return true;
  }

  protected override createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel {
    if (!snapshot.connected || !snapshot.vehicle) {
      return { state: 0 };
    }

    if (this.targetState) {
      // Beim Aus- und Einfahren bleibt eine sichtbare Bewegung bestehen.
      // Besonders beim Einfahren darf der zwischenzeitliche Lampenzustand
      // 0/0 nicht mehr sofort das graue LOCKED-Bild setzen.
      return { state: animationFrame === 0 ? 2 : 3 };
    }

    switch (readRampState(snapshot.vehicle)) {
      case "locked":
        return { state: 1 };
      case "ready":
        return { state: 2 };
      case "deployed":
        return { state: 3 };
      default:
        return { state: 0 };
    }
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const state = snapshot.connected
      ? readRampState(snapshot.vehicle)
      : undefined;
    const targetState: RampTargetState | undefined = state === "deployed"
      ? "ready"
      : state === "ready"
        ? "deployed"
        : undefined;
    const eventName = targetState === "ready"
      ? "ElectricRampIn"
      : targetState === "deployed"
        ? "ElectricRampOut"
        : undefined;

    if (!eventName || !snapshot.vehicleId) {
      return;
    }

    this.commandInFlight = true;
    this.targetState = targetState;
    this.animationStartedAt = Date.now();
    this.targetReachedAt = undefined;

    try {
      const sent = await this.sendEvent(eventName);

      if (!sent) {
        this.stopAnimation();
        this.logWarning(`Event "${eventName}" konnte nicht gesendet werden.`);
        return;
      }

      // Die Ausfahr-Lampe kann bereits beim Start auf "deployed" springen.
      // Deshalb den Blinkpfad sofort nach bestaetigtem Versand aktivieren,
      // statt erst auf den naechsten Telemetrie-Poll zu warten.
      await this.onTelemetryUpdated(this.snapshot);
      this.refreshTelemetrySoon();
    } catch (error) {
      this.stopAnimation();
      this.logError(`Fehler beim Senden von "${eventName}".`, error);
    } finally {
      this.commandInFlight = false;
    }
  }

  override dispose(): void {
    this.stopAnimation();
    super.dispose();
  }

  private stopAnimation(): void {
    this.targetState = undefined;
    this.animationStartedAt = 0;
    this.targetReachedAt = undefined;
  }
}
