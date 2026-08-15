export type RefreshHandler = () => void | Promise<void>;

export type RefreshTargetOptions = {
  id: string;
  delaysMs: readonly number[];
  refresh: RefreshHandler;
  onError?: (error: unknown) => void;
};

type RefreshTarget = {
  delaysMs: readonly number[];
  refresh: RefreshHandler;
  onError?: (error: unknown) => void;
  timers: Map<number, ReturnType<typeof setTimeout>>;
};

/**
 * Zentrale Registry fuer zeitversetzte Kontrollabrufe.
 *
 * Jede Datenquelle registriert genau ein benanntes Refresh-Ziel. Actions
 * fordern anschliessend nur noch einen Refresh dieses Ziels an. Mehrere kurz
 * aufeinanderfolgende Anforderungen werden pro Zeitstufe zusammengefasst,
 * sodass nicht jeder Tastendruck neue 100-/450-/1000-ms-Timer erzeugt.
 *
 * Die Registry veraendert keinerlei lokalen Zustand. Sie stoesst lediglich
 * erneute Abfragen der jeweiligen bestaetigten Datenquelle an.
 */
export class RefreshRegistry {
  private static readonly singleton = new RefreshRegistry();

  static get instance(): RefreshRegistry {
    return this.singleton;
  }

  private readonly targets = new Map<string, RefreshTarget>();

  private constructor() {}

  register(options: RefreshTargetOptions): () => void {
    const id = options.id.trim();

    if (!id) {
      throw new Error("Ein Refresh-Ziel benoetigt eine ID.");
    }

    if (this.targets.has(id)) {
      throw new Error(`Refresh-Ziel \"${id}\" ist bereits registriert.`);
    }

    const delaysMs = this.normalizeDelays(options.delaysMs);

    if (delaysMs.length === 0) {
      throw new Error(
        `Refresh-Ziel \"${id}\" benoetigt mindestens eine Zeitstufe.`
      );
    }

    this.targets.set(id, {
      delaysMs,
      refresh: options.refresh,
      onError: options.onError,
      timers: new Map()
    });

    return () => {
      this.unregister(id);
    };
  }

  /**
   * Plant alle Zeitstufen eines registrierten Ziels ein.
   * Bereits anstehende Stufen bleiben bestehen und werden nicht dupliziert.
   */
  request(id: string): boolean {
    const target = this.targets.get(id);

    if (!target) {
      return false;
    }

    for (const delayMs of target.delaysMs) {
      if (target.timers.has(delayMs)) {
        continue;
      }

      const timer = setTimeout(() => {
        target.timers.delete(delayMs);
        this.run(target);
      }, delayMs);

      target.timers.set(delayMs, timer);
    }

    return true;
  }

  /** Entfernt nur noch nicht ausgefuehrte Zeitstufen eines Refresh-Ziels. */
  cancel(id: string): void {
    const target = this.targets.get(id);

    if (!target) {
      return;
    }

    for (const timer of target.timers.values()) {
      clearTimeout(timer);
    }

    target.timers.clear();
  }

  private unregister(id: string): void {
    this.cancel(id);
    this.targets.delete(id);
  }

  private run(target: RefreshTarget): void {
    try {
      void Promise.resolve(target.refresh()).catch((error: unknown) => {
        target.onError?.(error);
      });
    } catch (error) {
      target.onError?.(error);
    }
  }

  private normalizeDelays(delaysMs: readonly number[]): number[] {
    return [...new Set(delaysMs)]
      .filter((delayMs) => Number.isFinite(delayMs) && delayMs >= 0)
      .map((delayMs) => Math.floor(delayMs))
      .sort((left, right) => left - right);
  }
}
