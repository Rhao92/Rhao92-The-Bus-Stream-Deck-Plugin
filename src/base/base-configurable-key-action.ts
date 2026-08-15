import {
  DidReceiveSettingsEvent,
  KeyAction,
  KeyDownEvent,
  SendToPluginEvent,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import {
  AnimationClock,
  AnimationFrame,
  AnimationTick,
  DEFAULT_ANIMATION_INTERVAL_MS
} from "../core/animation-clock";
import { TelemetrySnapshot } from "../core/telemetry";
import { runtimeDisplayOverride } from "../core/runtime-display";
import { BaseAction } from "./base-action";
import { DisplayModel } from "./base-display-action";

export type ConfigurableActionSettings = {
  mode?: string;
};

export type ModeChangedPayload = {
  type?: string;
  mode?: string;
  nonce?: number;
};

type DisplayCache = {
  state?: number;
  title?: string | null;
  image?: string | null;
};

/**
 * Basis fuer zusammengefasste Key-Actions mit einer Auswahl im Property
 * Inspector. Jede belegte Taste behaelt ihren eigenen Modus, obwohl das SDK
 * pro Manifest-UUID nur eine SingletonAction instanziiert.
 *
 * Die Klasse stellt weiterhin die V3-Grundregel sicher: Anzeigezustände werden
 * ausschliesslich aus dem bestaetigten Telemetrie-Snapshot abgeleitet. Ein
 * Tastendruck aendert weder Modus noch Anzeige optimistisch.
 */
export abstract class BaseConfigurableKeyAction<TMode extends string>
  extends BaseAction {
  private readonly contextModes = new Map<string, TMode>();
  private readonly displayCache = new Map<string, DisplayCache>();
  private readonly animationClock = AnimationClock.instance;

  private animationFrame: AnimationFrame = 0;
  private unsubscribeAnimationClock: (() => void) | undefined;
  private renderRevision = 0;
  private readonly commandContexts = new Set<string>();

  /** Standardmodus fuer neu hinzugefuegte oder unvollstaendige Actions. */
  protected abstract readonly defaultMode: TMode;

  /** Frame-Dauer; Actions ohne Animation ignorieren diesen Wert. */
  protected readonly animationIntervalMs: number =
    DEFAULT_ANIMATION_INTERVAL_MS;

  /** Validiert einen vom Property Inspector gelieferten Modus. */
  protected abstract normalizeMode(mode: unknown): TMode;

  /** Erzeugt die telemetriebestaetigte Anzeige fuer genau einen Modus. */
  protected abstract createModeDisplayModel(
    mode: TMode,
    snapshot: TelemetrySnapshot,
    animationFrame: AnimationFrame
  ): DisplayModel | Promise<DisplayModel>;

  /** Fuehrt den zum gewaehlten Modus gehoerenden Fahrzeugbefehl aus. */
  protected abstract handleModeKeyDown(
    mode: TMode,
    snapshot: TelemetrySnapshot,
    key: KeyAction
  ): void | Promise<void>;

  /** Gibt an, ob dieser Modus im aktuellen bestaetigten Zustand blinken soll. */
  protected shouldAnimateMode(
    _mode: TMode,
    _snapshot: TelemetrySnapshot
  ): boolean {
    return false;
  }

  protected override async onAppear(ev: WillAppearEvent): Promise<void> {
    const key = ev.action as KeyAction<ConfigurableActionSettings>;
    let settings: ConfigurableActionSettings = {};

    try {
      settings = await key.getSettings<ConfigurableActionSettings>();
    } catch (error) {
      this.logWarning(`Einstellungen fuer Kontext ${key.id} konnten nicht gelesen werden.`);
    }

    const mode = this.normalizeMode(settings.mode);
    this.contextModes.set(key.id, mode);
    this.invalidateDisplay(key.id);

    // Ein expliziter Standardwert macht den Property Inspector deterministisch
    // und verhindert, dass alte Profile dauerhaft mit leerem Settings-Objekt
    // weiterlaufen.
    if (settings.mode !== mode) {
      try {
        await key.setSettings({ ...settings, mode });
      } catch (error) {
        this.logWarning(`Standardmodus fuer Kontext ${key.id} konnte nicht gespeichert werden.`);
      }
    }

    await this.renderContext(key, key.id, this.snapshot, ++this.renderRevision);
    this.syncAnimationClock(this.snapshot);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ConfigurableActionSettings>
  ): Promise<void> {
    const key = ev.action as KeyAction<ConfigurableActionSettings>;
    const mode = this.normalizeMode(ev.payload.settings.mode);

    this.contextModes.set(key.id, mode);
    await this.renderModeImmediately(key, key.id, mode, this.snapshot);
    this.syncAnimationClock(this.snapshot);
  }

  /**
   * Sofortige Vorschau aus dem Property Inspector. setSettings bleibt die
   * persistente Quelle; diese Nachricht verkürzt lediglich die sichtbare
   * Reaktionszeit und verändert niemals Fahrzeugzustände optimistisch.
   */
  override async onSendToPlugin(
    ev: SendToPluginEvent<ModeChangedPayload, ConfigurableActionSettings>
  ): Promise<void> {
    const payload = ev.payload;

    if (payload?.type !== "modeChanged") {
      return;
    }

    const key = ev.action as KeyAction<ConfigurableActionSettings>;
    const mode = this.normalizeMode(payload.mode);
    let settings: ConfigurableActionSettings = {};

    // Der direkte PI-Kanal dient nicht nur der Vorschau, sondern speichert den
    // Modus zusätzlich im Plugin. Damit bleibt die Auswahl auch dann erhalten,
    // wenn eine Stream-Deck-Version den parallelen UI-setSettings-Befehl nicht
    // zuverlässig zustellt.
    try {
      settings = await key.getSettings<ConfigurableActionSettings>();
    } catch (error) {
      this.logWarning(`Einstellungen fuer Kontext ${key.id} konnten vor dem Speichern nicht gelesen werden.`);
    }

    try {
      await key.setSettings({ ...settings, mode });
    } catch (error) {
      this.logWarning(`Modus fuer Kontext ${key.id} konnte nicht gespeichert werden.`);
    }

    // Der Event-Kontext selbst ist die maßgebliche Taste. Dadurch hängt die
    // Vorschau nicht davon ab, ob ein vorangegangenes willAppear bereits in
    // einer internen Sichtbarkeitsmap verarbeitet wurde.
    this.contextModes.set(key.id, mode);
    await this.renderModeImmediately(key, key.id, mode, this.snapshot);
    this.syncAnimationClock(this.snapshot);
  }

  protected override async onTelemetryUpdated(
    snapshot: TelemetrySnapshot
  ): Promise<void> {
    await this.renderAll(snapshot);
    this.syncAnimationClock(snapshot);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const key = ev.action as KeyAction;

    // Der Sperrstatus ist kontextbezogen: Zwei unterschiedlich belegte Tasten
    // derselben konfigurierbaren Action duerfen sich nicht gegenseitig blockieren.
    if (this.commandContexts.has(key.id)) {
      return;
    }

    const mode = this.contextModes.get(key.id) ?? this.defaultMode;
    this.commandContexts.add(key.id);

    try {
      await this.handleModeKeyDown(mode, this.snapshot, key);
    } catch (error) {
      this.logError(`Befehl fuer Modus "${mode}" fehlgeschlagen.`, error);
    } finally {
      this.commandContexts.delete(key.id);
    }
  }

  protected override onDisappear(ev: WillDisappearEvent): void {
    this.renderRevision += 1;
    this.contextModes.delete(ev.action.id);
    this.displayCache.delete(ev.action.id);
    this.commandContexts.delete(ev.action.id);

    if (!this.isVisible) {
      this.releaseAnimationClock();
    }
  }

  override dispose(): void {
    this.renderRevision += 1;
    this.releaseAnimationClock();
    this.contextModes.clear();
    this.displayCache.clear();
    this.commandContexts.clear();
    super.dispose();
  }

  /** Liefert den normalisierten Modus eines sichtbaren Kontextes. */
  protected modeFor(contextId: string): TMode {
    return this.contextModes.get(contextId) ?? this.defaultMode;
  }

  /** Erzwingt fuer einen oder alle Kontexte eine vollstaendige Neuausgabe. */
  protected invalidateDisplay(contextId?: string): void {
    if (contextId === undefined) {
      this.displayCache.clear();
      return;
    }

    this.displayCache.delete(contextId);
  }


  private async renderModeImmediately(
    key: KeyAction,
    contextId: string,
    mode: TMode,
    snapshot: TelemetrySnapshot
  ): Promise<void> {
    const revision = ++this.renderRevision;
    const animated = this.shouldAnimateMode(mode, snapshot);
    const model = runtimeDisplayOverride(snapshot) ?? await this.createModeDisplayModel(
      mode,
      snapshot,
      animated ? this.animationFrame : 0
    );

    if (revision !== this.renderRevision) {
      return;
    }

    // Cache bewusst leeren: ein Moduswechsel muss auch dann erneut publiziert
    // werden, wenn Stream Deck kurz zuvor das Manifest-Standardbild eingesetzt
    // hat oder ein älterer asynchroner Render noch denselben Pfad gespeichert
    // hatte.
    this.invalidateDisplay(contextId);
    await this.publishToContext(key, contextId, model, revision);
  }

  private async renderAll(snapshot: TelemetrySnapshot): Promise<void> {
    const revision = ++this.renderRevision;
    await this.forEachVisibleKey((key, contextId) =>
      this.renderContext(key, contextId, snapshot, revision)
    );
  }

  private async renderContext(
    key: KeyAction,
    contextId: string,
    snapshot: TelemetrySnapshot,
    revision: number
  ): Promise<void> {
    const mode = this.modeFor(contextId);
    const animated = this.shouldAnimateMode(mode, snapshot);
    const model = runtimeDisplayOverride(snapshot) ?? await this.createModeDisplayModel(
      mode,
      snapshot,
      animated ? this.animationFrame : 0
    );

    if (revision !== this.renderRevision) {
      return;
    }

    await this.publishToContext(key, contextId, model, revision);
  }

  private async publishToContext(
    key: KeyAction,
    contextId: string,
    model: DisplayModel,
    revision: number
  ): Promise<void> {
    if (revision !== this.renderRevision) {
      return;
    }
    const previous = this.displayCache.get(contextId) ?? {};
    const next: DisplayCache = { ...previous };
    const jobs: Promise<void>[] = [];

    if (model.state !== undefined && model.state !== previous.state) {
      next.state = model.state;
      jobs.push(key.setState(model.state));
    }

    if (model.title !== undefined && model.title !== previous.title) {
      next.title = model.title;
      jobs.push(key.setTitle(model.title ?? ""));
    }

    if (model.image !== undefined && model.image !== previous.image) {
      next.image = model.image;
      jobs.push(key.setImage(model.image ?? ""));
    }

    this.displayCache.set(contextId, next);
    await Promise.allSettled(jobs);
  }

  private syncAnimationClock(snapshot: TelemetrySnapshot): void {
    let animated = false;

    for (const [contextId] of this.visibleKeys()) {
      if (this.shouldAnimateMode(this.modeFor(contextId), snapshot)) {
        animated = true;
        break;
      }
    }

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

  /** Erstellt eine Iteration ueber die sichtbaren Key-IDs ohne SDK-Interna. */
  private *visibleKeys(): IterableIterator<[string, KeyAction]> {
    const entries: Array<[string, KeyAction]> = [];

    // forEachVisibleKey ist asynchron; fuer die kleine Moduspruefung wird die
    // bereits vom SDK gepflegte actions-Auflistung verwendet.
    for (const action of this.actions) {
      if (action.isKey()) {
        entries.push([action.id, action]);
      }
    }

    yield* entries;
  }

  private onAnimationTick(tick: AnimationTick): void {
    this.animationFrame = tick.frame;

    void this.renderAll(this.snapshot).catch((error: unknown) => {
      this.logError("Animationsframe konnte nicht aktualisiert werden.", error);
    });
  }

  private releaseAnimationClock(): void {
    this.unsubscribeAnimationClock?.();
    this.unsubscribeAnimationClock = undefined;
    this.animationFrame = 0;
  }
}
