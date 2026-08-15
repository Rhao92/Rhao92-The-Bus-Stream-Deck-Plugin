import {
  AnimationClock,
  TWO_HZ_ANIMATION_INTERVAL_MS
} from "../core/animation-clock";

type BlinkListener = (bright: boolean) => void;

/** Gemeinsame, phasengleiche 2-Hz-Anzeige fuer alle STOP-Darstellungen. */
export class FullpanelBlinkHub {
  private static readonly singleton = new FullpanelBlinkHub();

  static get instance(): FullpanelBlinkHub {
    return this.singleton;
  }

  private readonly clock = AnimationClock.instance;
  private readonly listeners = new Set<BlinkListener>();
  private unsubscribeClock: (() => void) | undefined;
  private bright = true;

  private constructor() {}

  subscribe(listener: BlinkListener): () => void {
    this.listeners.add(listener);

    if (!this.unsubscribeClock) {
      this.bright = this.clock.frameFor(TWO_HZ_ANIMATION_INTERVAL_MS) === 0;
      this.unsubscribeClock = this.clock.subscribe((tick) => {
        this.bright = tick.frame === 0;
        for (const current of [...this.listeners]) {
          current(this.bright);
        }
      }, TWO_HZ_ANIMATION_INTERVAL_MS);
    }

    listener(this.bright);

    let active = true;
    return () => {
      if (!active) {
        return;
      }

      active = false;
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.unsubscribeClock?.();
        this.unsubscribeClock = undefined;
      }
    };
  }

  dispose(): void {
    this.unsubscribeClock?.();
    this.unsubscribeClock = undefined;
    this.listeners.clear();
  }
}
