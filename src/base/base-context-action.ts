import streamDeck, {
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";

/**
 * Gemeinsamer sichtbarkeitsbasierter Lifecycle fuer alle SingletonActions.
 *
 * Eine Action-Klasse kann gleichzeitig auf mehreren Stream-Deck-Kontexten
 * liegen. Die Basisklasse verwaltet diese Kontexte zentral, sorgt fuer ein
 * idempotentes dispose() und stellt einheitliche Fehler-/Logging-Helfer bereit.
 *
 * TContext darf sowohl ein KeyAction- als auch ein DialAction-Kontext sein.
 * Datenquellen wie die Fahrzeugtelemetrie werden von den spezialisierten
 * Ableitungen nur noch beim ersten sichtbaren Kontext
 * abonniert und beim letzten verschwundenen Kontext wieder freigegeben.
 */
export abstract class BaseContextAction<TContext> extends SingletonAction {
  private readonly visibleContexts = new Map<string, TContext>();
  private disposed = false;

  /** Wandelt den SDK-Kontext in den von der Action verwendeten Typ um. */
  protected abstract resolveContext(ev: WillAppearEvent): TContext;

  /** True, sobald mindestens ein Kontext dieser SingletonAction sichtbar ist. */
  protected get isVisible(): boolean {
    return this.visibleContexts.size > 0;
  }

  /** Anzahl der derzeit sichtbaren Kontexte dieser SingletonAction. */
  protected get visibleContextCount(): number {
    return this.visibleContexts.size;
  }

  override onWillAppear(ev: WillAppearEvent): void {
    if (this.disposed) {
      this.logWarning("onWillAppear nach dispose() ignoriert.");
      return;
    }

    const firstVisible = this.visibleContexts.size === 0;
    const context = this.resolveContext(ev);
    this.visibleContexts.set(ev.action.id, context);

    this.dispatchLifecycleHook(
      "onContextAppear()",
      () => this.onContextAppear(ev, context, firstVisible)
    );
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    const context = this.visibleContexts.get(ev.action.id);
    this.visibleContexts.delete(ev.action.id);
    const lastVisible = this.visibleContexts.size === 0;

    this.dispatchLifecycleHook(
      "onContextDisappear()",
      () => this.onContextDisappear(ev, context, lastVisible)
    );
  }

  /** Hook nach dem Eintragen eines sichtbaren Kontextes. */
  protected onContextAppear(
    _ev: WillAppearEvent,
    _context: TContext,
    _firstVisible: boolean
  ): void | Promise<void> {}

  /** Hook nach dem Entfernen eines sichtbaren Kontextes. */
  protected onContextDisappear(
    _ev: WillDisappearEvent,
    _context: TContext | undefined,
    _lastVisible: boolean
  ): void | Promise<void> {}

  /** Fuehrt eine Operation fuer alle derzeit sichtbaren Kontexte aus. */
  protected async forEachVisibleContext(
    operation: (context: TContext, contextId: string) => void | Promise<void>
  ): Promise<void> {
    const jobs: Promise<void>[] = [];

    for (const [contextId, context] of this.visibleContexts) {
      jobs.push(Promise.resolve(operation(context, contextId)));
    }

    await Promise.allSettled(jobs);
  }

  /** Liefert einen sichtbaren Kontext anhand seiner Stream-Deck-ID. */
  protected getVisibleContext(contextId: string): TContext | undefined {
    return this.visibleContexts.get(contextId);
  }

  protected logInfo(message: string): void {
    streamDeck.logger.info(`[${this.constructor.name}] ${message}`);
  }

  protected logWarning(message: string): void {
    streamDeck.logger.warn(`[${this.constructor.name}] ${message}`);
  }

  protected logError(message: string, error?: unknown): void {
    if (error === undefined) {
      streamDeck.logger.error(`[${this.constructor.name}] ${message}`);
      return;
    }

    streamDeck.logger.error(
      `[${this.constructor.name}] ${message}`,
      error
    );
  }

  /** Optionaler Cleanup-Hook fuer spezialisierte Basisklassen. */
  protected onDispose(): void {}

  /**
   * Loest alle von der Action gehaltenen Ressourcen. Die Methode ist
   * idempotent und wird von der zentralen ActionRegistry aufgerufen.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      this.onDispose();
    } catch (error) {
      this.logError("Fehler in onDispose().", error);
    }

    this.visibleContexts.clear();
  }

  private dispatchLifecycleHook(
    hookName: string,
    hook: () => void | Promise<void>
  ): void {
    try {
      const result = hook();
      void Promise.resolve(result).catch((error: unknown) => {
        this.logError(`Fehler in ${hookName}`, error);
      });
    } catch (error) {
      this.logError(`Fehler in ${hookName}`, error);
    }
  }
}
