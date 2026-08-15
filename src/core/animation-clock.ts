export type AnimationFrame = 0 | 1;
export type AnimationTick = {
  frame: AnimationFrame;
  now: number;
};

type AnimationListener = (tick: AnimationTick) => void;

type AnimationChannel = {
  readonly intervalMs: number;
  readonly listeners: Set<AnimationListener>;
  frame: AnimationFrame;
  nextTickAt: number;
};

export const DEFAULT_ANIMATION_INTERVAL_MS = 400;
export const TWO_HZ_ANIMATION_INTERVAL_MS = 250;

/**
 * Zentraler Taktgeber fuer alle animierten Actions.
 *
 * Actions duerfen unterschiedliche Frame-Dauern anfordern, erzeugen aber
 * niemals eigene Timer. Alle Abonnenten derselben Frame-Dauer teilen sich
 * einen phasengleichen Kanal. Intern plant genau ein setTimeout jeweils den
 * zeitlich naechsten faelligen Kanal.
 */
export class AnimationClock {
  private static readonly singleton = new AnimationClock();

  static get instance(): AnimationClock {
    return this.singleton;
  }

  private readonly channels = new Map<number, AnimationChannel>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  private constructor() {}

  frameFor(intervalMs = DEFAULT_ANIMATION_INTERVAL_MS): AnimationFrame {
    const normalizedInterval = this.normalizeInterval(intervalMs);
    return this.channels.get(normalizedInterval)?.frame ?? 0;
  }

  subscribe(
    listener: AnimationListener,
    intervalMs = DEFAULT_ANIMATION_INTERVAL_MS
  ): () => void {
    const normalizedInterval = this.normalizeInterval(intervalMs);
    let channel = this.channels.get(normalizedInterval);

    if (!channel) {
      channel = {
        intervalMs: normalizedInterval,
        listeners: new Set<AnimationListener>(),
        frame: 0,
        nextTickAt: Date.now() + normalizedInterval
      };
      this.channels.set(normalizedInterval, channel);
    }

    channel.listeners.add(listener);
    this.scheduleNextTick();

    return () => {
      const current = this.channels.get(normalizedInterval);

      if (!current) {
        return;
      }

      current.listeners.delete(listener);

      if (current.listeners.size === 0) {
        this.channels.delete(normalizedInterval);
      }

      this.scheduleNextTick();
    };
  }

  private normalizeInterval(intervalMs: number): number {
    if (!Number.isFinite(intervalMs)) {
      return DEFAULT_ANIMATION_INTERVAL_MS;
    }

    // Schnellere Bildwechsel sind auf einem Stream Deck nicht sinnvoll und
    // wuerden den Plugin-Prozess unnoetig belasten.
    return Math.max(50, Math.round(intervalMs));
  }

  private scheduleNextTick(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.channels.size === 0) {
      return;
    }

    let nextTickAt = Number.POSITIVE_INFINITY;

    for (const channel of this.channels.values()) {
      nextTickAt = Math.min(nextTickAt, channel.nextTickAt);
    }

    this.timer = setTimeout(
      () => this.tick(),
      Math.max(1, nextTickAt - Date.now())
    );
  }

  private tick(): void {
    this.timer = undefined;
    const now = Date.now();

    for (const channel of this.channels.values()) {
      if (now < channel.nextTickAt) {
        continue;
      }

      const elapsedIntervals =
        Math.floor((now - channel.nextTickAt) / channel.intervalMs) + 1;

      if (elapsedIntervals % 2 === 1) {
        channel.frame = channel.frame === 0 ? 1 : 0;
      }

      channel.nextTickAt += elapsedIntervals * channel.intervalMs;
      const tick: AnimationTick = {
        frame: channel.frame,
        now
      };

      // Ein Listener darf sich waehrend des Callbacks abmelden. Eine Kopie
      // verhindert dabei, dass andere Listener desselben Kanals uebersprungen
      // werden.
      for (const listener of [...channel.listeners]) {
        listener(tick);
      }
    }

    this.scheduleNextTick();
  }
}
