import {
  KeyAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import {
  TelemetryClient,
  TelemetrySnapshot
} from "../core/telemetry";
import { BaseContextAction } from "./base-context-action";

export type TelemetryEventMode = "push" | "press" | "release";

/**
 * Gemeinsame Grundlage fuer alle telemetriebasierten V3-Key-Actions.
 *
 * Sichtbare Kontexte, dispose() und Logging kommen aus BaseContextAction.
 * Diese Spezialisierung kapselt zusaetzlich die zentrale
 * TelemetryClient-Subscription und die Fahrzeug-Event-Helfer.
 */
export abstract class BaseAction extends BaseContextAction<KeyAction> {
  protected readonly telemetry = TelemetryClient.instance;

  private unsubscribeTelemetry: (() => void) | undefined;

  /** Aktuell bestaetigter gemeinsamer Player-/Vehicle-/Mission-Snapshot. */
  protected get snapshot(): TelemetrySnapshot {
    return this.telemetry.snapshot;
  }

  /** Anzahl der derzeit sichtbaren Tasten-Kontexte dieser SingletonAction. */
  protected get visibleKeyCount(): number {
    return this.visibleContextCount;
  }

  protected override resolveContext(ev: WillAppearEvent): KeyAction {
    return ev.action as KeyAction;
  }

  protected override onContextAppear(
    ev: WillAppearEvent,
    _key: KeyAction,
    _firstVisible: boolean
  ): void {
    const createdSubscription = this.ensureTelemetrySubscription();
    this.dispatchActionHook("onAppear()", () => this.onAppear(ev));

    // subscribe() publiziert beim ersten sichtbaren Key bereits sofort. Fuer
    // weitere Kontexte derselben SingletonAction stossen wir die Anzeige mit
    // dem vorhandenen Cache separat an.
    if (!createdSubscription) {
      this.dispatchTelemetry(this.telemetry.snapshot);
    }
  }

  protected override onContextDisappear(
    ev: WillDisappearEvent,
    _key: KeyAction | undefined,
    lastVisible: boolean
  ): void {
    this.dispatchActionHook("onDisappear()", () => this.onDisappear(ev));

    if (lastVisible) {
      this.releaseTelemetrySubscription();
    }
  }

  /** Optionaler Hook fuer abgeleitete Actions. */
  protected onAppear(_ev: WillAppearEvent): void | Promise<void> {}

  /** Optionaler Hook fuer abgeleitete Actions. */
  protected onDisappear(_ev: WillDisappearEvent): void | Promise<void> {}

  /**
   * Zentraler Telemetrie-Hook. Er wird bei jedem publizierten Snapshot sowie
   * unmittelbar beim Erscheinen einer Action aufgerufen.
   */
  protected onTelemetryUpdated(
    _snapshot: TelemetrySnapshot
  ): void | Promise<void> {}

  /** Fuehrt eine Operation fuer jede aktuell sichtbare Taste dieser Action aus. */
  protected async forEachVisibleKey(
    operation: (key: KeyAction, contextId: string) => void | Promise<void>
  ): Promise<void> {
    await this.forEachVisibleContext(operation);
  }

  /** Liefert eine sichtbare Taste anhand ihrer Stream-Deck-Context-ID. */
  protected getVisibleKey(contextId: string): KeyAction | undefined {
    return this.getVisibleContext(contextId);
  }

  /** Sendet ein normales TML-Event an das aktuell bestaetigte Fahrzeug. */
  protected sendEvent(eventName: string): Promise<boolean> {
    return this.telemetry.sendEvent(eventName, "push");
  }

  /** Sendet die Press-Variante eines TML-Events. */
  protected pressEvent(eventName: string): Promise<boolean> {
    return this.telemetry.sendEvent(eventName, "press");
  }

  /** Sendet die Release-Variante eines TML-Events. */
  protected releaseEvent(eventName: string): Promise<boolean> {
    return this.telemetry.sendEvent(eventName, "release");
  }

  /**
   * Plant Kontrollabrufe ein. Der lokale Cache wird dabei nicht optimistisch
   * veraendert; sichtbare Zustaende bleiben immer telemetriebestaetigt.
   */
  protected refreshTelemetrySoon(): void {
    this.telemetry.refreshSoon();
  }

  protected override onDispose(): void {
    this.releaseTelemetrySubscription();
    super.onDispose();
  }

  private ensureTelemetrySubscription(): boolean {
    if (this.unsubscribeTelemetry) {
      return false;
    }

    this.unsubscribeTelemetry = this.telemetry.subscribe((snapshot) => {
      this.dispatchTelemetry(snapshot);
    });
    return true;
  }

  private releaseTelemetrySubscription(): void {
    if (!this.unsubscribeTelemetry) {
      return;
    }

    this.unsubscribeTelemetry();
    this.unsubscribeTelemetry = undefined;
  }

  private dispatchTelemetry(snapshot: TelemetrySnapshot): void {
    this.dispatchActionHook(
      "onTelemetryUpdated()",
      () => this.onTelemetryUpdated(snapshot)
    );
  }

  private dispatchActionHook(
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
