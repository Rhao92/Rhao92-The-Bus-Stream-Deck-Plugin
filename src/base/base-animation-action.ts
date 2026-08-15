import { WillDisappearEvent } from "@elgato/streamdeck";
import {
  AnimationClock,
  AnimationFrame,
  AnimationTick,
  DEFAULT_ANIMATION_INTERVAL_MS
} from "../core/animation-clock";
import { TelemetrySnapshot } from "../core/telemetry";
import { BaseDisplayAction, DisplayModel } from "./base-display-action";

/**
 * Gemeinsame Basis fuer telemetriegesteuerte Blinkanzeigen.
 *
 * Abgeleitete Actions entscheiden nur noch:
 * - ob der aktuelle bestaetigte Zustand animiert werden soll,
 * - wie statische und animierte Frames aussehen.
 *
 * Alle Instanzen verwenden denselben AnimationClock. Es gibt deshalb keinen
 * eigenen Tueren- oder Kneeling-Timer. Sobald keine sichtbare Action mehr
 * animiert, wird auch der gemeinsame Timer automatisch beendet.
 */
export abstract class BaseAnimationAction extends BaseDisplayAction {
  private readonly animationClock = AnimationClock.instance;

  /** Frame-Dauer dieser Action; Standard bleibt der bisherige 400-ms-Takt. */
  protected readonly animationIntervalMs: number =
    DEFAULT_ANIMATION_INTERVAL_MS;

  private animationFrame: AnimationFrame = 0;
  private unsubscribeAnimationClock: (() => void) | undefined;

  /** True, solange der aktuelle Snapshot eine Animation verlangt. */
  protected abstract shouldAnimate(snapshot: TelemetrySnapshot): boolean;

  /**
   * Erstellt die Anzeige. animationFrame wechselt zentral zwischen 0 und 1.
   * Bei statischen Zustaenden darf der Frame ignoriert werden.
   */
  protected abstract createAnimationDisplayModel(
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel | Promise<DisplayModel>;

  protected override async createDisplayModel(
    snapshot: TelemetrySnapshot
  ): Promise<DisplayModel> {
    const animated = this.shouldAnimate(snapshot);
    this.syncAnimationClock(animated);

    return this.createAnimationDisplayModel(
      snapshot,
      animated ? this.animationFrame : 0
    );
  }

  protected override onDisappear(ev: WillDisappearEvent): void {
    super.onDisappear(ev);

    if (!this.isVisible) {
      this.releaseAnimationClock();
    }
  }

  override dispose(): void {
    this.releaseAnimationClock();
    super.dispose();
  }

  private syncAnimationClock(animated: boolean): void {
    if (!animated || !this.isVisible) {
      this.releaseAnimationClock();
      return;
    }

    if (this.unsubscribeAnimationClock) {
      return;
    }

    this.animationFrame = this.animationClock.frameFor(
      this.animationIntervalMs
    );
    this.unsubscribeAnimationClock = this.animationClock.subscribe(
      (tick) => this.onAnimationTick(tick),
      this.animationIntervalMs
    );
  }

  private releaseAnimationClock(): void {
    if (!this.unsubscribeAnimationClock) {
      this.animationFrame = 0;
      return;
    }

    this.unsubscribeAnimationClock();
    this.unsubscribeAnimationClock = undefined;
    this.animationFrame = 0;
  }

  private onAnimationTick(tick: AnimationTick): void {
    this.animationFrame = tick.frame;

    void this.renderAnimationFrame().catch((error: unknown) => {
      this.logError("Fehler beim Aktualisieren eines Animationsframes.", error);
    });
  }

  private async renderAnimationFrame(): Promise<void> {
    if (!this.isVisible) {
      this.releaseAnimationClock();
      return;
    }

    const snapshot = this.snapshot;
    const animated = this.shouldAnimate(snapshot);

    if (!animated) {
      this.releaseAnimationClock();
    }

    await this.renderLatest(() => this.createAnimationDisplayModel(
      snapshot,
      animated ? this.animationFrame : 0
    ));
  }
}
