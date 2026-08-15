import {
  KeyAction,
  WillDisappearEvent
} from "@elgato/streamdeck";
import { TelemetrySnapshot } from "../core/telemetry";
import { runtimeDisplayOverride } from "../core/runtime-display";
import { BaseAction } from "./base-action";

/**
 * Vollstaendiger, aus bestaetigter Telemetrie abgeleiteter Anzeigezustand
 * einer Stream-Deck-Taste.
 *
 * Nicht gesetzte Felder bleiben unveraendert. Mit null kann ein Titel oder
 * Bild bewusst geleert werden.
 */
export type DisplayModel = {
  state?: number;
  title?: string | null;
  image?: string | null;
};

type DisplayCache = {
  state?: number;
  title?: string | null;
  image?: string | null;
};

/**
 * Gemeinsame Basis fuer telemetriebasierte Key-Anzeigen.
 *
 * Abgeleitete Actions liefern nur noch ein DisplayModel. Die Basisklasse:
 * - aktualisiert alle sichtbaren Kontexte derselben SingletonAction,
 * - sendet nur tatsaechlich geaenderte Werte an Stream Deck,
 * - behaelt den letzten bestaetigten Anzeigezustand je Kontext,
 * - raeumt den Cache beim Verschwinden bzw. dispose() sauber auf.
 *
 * Die Klasse veraendert niemals Telemetrie optimistisch. Was angezeigt wird,
 * muss von createDisplayModel() aus dem aktuellen Snapshot abgeleitet werden.
 */
export abstract class BaseDisplayAction extends BaseAction {
  private readonly displayCache = new Map<string, DisplayCache>();
  private renderRevision = 0;
  private runtimeOverrideWasActive = false;

  /** Erzeugt den gewuenschten Anzeigezustand aus dem aktuellen Snapshot. */
  protected abstract createDisplayModel(
    snapshot: TelemetrySnapshot
  ): DisplayModel | Promise<DisplayModel>;

  protected override async onTelemetryUpdated(
    snapshot: TelemetrySnapshot
  ): Promise<void> {
    await this.renderLatest(() => this.createDisplayModel(snapshot));
  }

  /**
   * Fuehrt einen asynchronen Render nur dann aus, wenn zwischen Erzeugung und
   * Publikation kein neuerer Telemetrie- oder Animationsrender begonnen hat.
   */
  protected async renderLatest(
    factory: () => DisplayModel | Promise<DisplayModel>
  ): Promise<void> {
    const revision = ++this.renderRevision;
    const model = this.withRuntimeState(this.snapshot, await factory());

    if (revision !== this.renderRevision) {
      return;
    }

    await this.publishDisplayModel(model);
  }

  protected supersedePendingRenders(): void {
    this.renderRevision += 1;
  }

  protected async publishDisplayModel(model: DisplayModel): Promise<void> {
    await this.forEachVisibleKey(async (key: KeyAction, contextId: string) => {
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
    });
  }

  protected invalidateDisplay(contextId?: string): void {
    if (contextId === undefined) {
      this.displayCache.clear();
      return;
    }

    this.displayCache.delete(contextId);
  }

  protected override onDisappear(ev: WillDisappearEvent): void {
    this.supersedePendingRenders();
    this.displayCache.delete(ev.action.id);
  }

  override dispose(): void {
    this.supersedePendingRenders();
    this.displayCache.clear();
    super.dispose();
  }

  private withRuntimeState(
    snapshot: TelemetrySnapshot,
    model: DisplayModel
  ): DisplayModel {
    const override = runtimeDisplayOverride(snapshot);

    if (override) {
      this.runtimeOverrideWasActive = true;
      return override;
    }

    if (this.runtimeOverrideWasActive) {
      this.runtimeOverrideWasActive = false;
      return model.image === undefined
        ? { ...model, image: null }
        : model;
    }

    return model;
  }
}
