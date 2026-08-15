import { KeyDownEvent } from "@elgato/streamdeck";
import { TelemetrySnapshot } from "../core/telemetry";
import { TelemetryEventMode } from "./base-action";
import { BaseDisplayAction, DisplayModel } from "./base-display-action";

/**
 * Gemeinsame Basis fuer einfache, telemetriebestaetigte Ein-/Aus-Aktionen.
 *
 * Die abgeleitete Action beschreibt nur:
 * - wie der echte Zustand aus dem Snapshot gelesen wird,
 * - welches TML-Event beim Druecken gesendet werden soll,
 * - optional eine abweichende Darstellung fuer Ein/Aus/Offline.
 *
 * BaseToggleAction setzt niemals lokal einen neuen Zustand. Nach dem Befehl
 * werden lediglich schnelle Kontrollabrufe eingeplant; die sichtbare Anzeige
 * aendert sich erst, wenn The Bus den neuen Zustand in der Telemetrie meldet.
 */
export abstract class BaseToggleAction extends BaseDisplayAction {
  private commandInFlight = false;

  /** Stream-Deck-State, solange die Aktion nicht verfuegbar ist. */
  protected readonly offlineDisplayState = 0;

  /** Stream-Deck-State fuer den bestaetigten Aus-Zustand. */
  protected readonly inactiveDisplayState = 1;

  /** Stream-Deck-State fuer den bestaetigten Ein-Zustand. */
  protected readonly activeDisplayState = 2;

  /**
   * Liest den tatsaechlich bestaetigten Schalterzustand.
   *
   * undefined bedeutet: Der Zustand ist derzeit nicht verlaesslich verfuegbar
   * und es darf deshalb auch kein Toggle-Befehl gesendet werden.
   */
  protected abstract readToggleState(
    snapshot: TelemetrySnapshot
  ): boolean | undefined;

  /**
   * Liefert das TML-Event fuer den naechsten Tastendruck.
   * Der aktuell bestaetigte Zustand wird fuer dynamische Events mitgegeben.
   */
  protected abstract getToggleEventName(
    snapshot: TelemetrySnapshot,
    active: boolean
  ): string | undefined;

  /** Push ist der Standard; Press/Release bleiben fuer Sonderfaelle moeglich. */
  protected getToggleEventMode(
    _snapshot: TelemetrySnapshot,
    _active: boolean
  ): TelemetryEventMode {
    return "push";
  }

  /** Standarddarstellung fuer einen binaeren Schalter. */
  protected createToggleDisplayModel(
    active: boolean,
    _snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: active
        ? this.activeDisplayState
        : this.inactiveDisplayState
    };
  }

  /** Darstellung, falls Telemetrie oder Zustand nicht verfuegbar sind. */
  protected createUnavailableDisplayModel(
    _snapshot: TelemetrySnapshot
  ): DisplayModel {
    return { state: this.offlineDisplayState };
  }

  protected override createDisplayModel(
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    const active = this.readToggleState(snapshot);

    if (active === undefined) {
      return this.createUnavailableDisplayModel(snapshot);
    }

    return this.createToggleDisplayModel(active, snapshot);
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    if (this.commandInFlight) {
      return;
    }

    const snapshot = this.snapshot;
    const active = this.readToggleState(snapshot);

    // Kein optimistisches Umschalten und kein Befehl ohne bestaetigten Zustand.
    if (active === undefined || !snapshot.vehicleId) {
      return;
    }

    const eventName = this.getToggleEventName(snapshot, active);

    if (!eventName) {
      return;
    }

    this.commandInFlight = true;

    try {
      const sent = await this.sendToggleEvent(
        eventName,
        this.getToggleEventMode(snapshot, active)
      );

      if (!sent) {
        this.logWarning(`Event \"${eventName}\" konnte nicht gesendet werden.`);
        return;
      }

      this.refreshTelemetrySoon();
    } catch (error) {
      this.logError(`Fehler beim Senden von \"${eventName}\".`, error);
    } finally {
      this.commandInFlight = false;
    }
  }

  private sendToggleEvent(
    eventName: string,
    mode: TelemetryEventMode
  ): Promise<boolean> {
    switch (mode) {
      case "press":
        return this.pressEvent(eventName);
      case "release":
        return this.releaseEvent(eventName);
      default:
        return this.sendEvent(eventName);
    }
  }
}
