import streamDeck, {
  action,
  DialAction,
  DidReceiveSettingsEvent,
  KeyAction,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import { FullpanelBlinkHub } from "../fullpanel/blink-hub";
import { FULLPANEL_LAYOUT } from "../fullpanel/fullpanel-renderer";
import {
  renderKeypad,
  renderSinglePanel,
  renderTimetableKeypad
} from "../fullpanel/renderers";
import {
  FullpanelViewModel,
  normalizeTimetableKind,
  TimetableKind
} from "../fullpanel/types";
import { FullpanelViewModelHub } from "../fullpanel/view-model-hub";
import { translateUi } from "../core/localization";

type TimetableSettings = {
  kind?: string;
};

type TimetableContext = {
  action: DialAction<TimetableSettings> | KeyAction<TimetableSettings>;
  kind: TimetableKind;
};

type TimetableController = "encoder" | "keypad";
type VehicleDisplayKind = "speed" | "limit" | "power" | "battery";
type VehicleDisplaySettings = {
  kind?: string;
};

type VehicleDisplayContext = {
  action: KeyAction<VehicleDisplaySettings>;
  kind: VehicleDisplayKind;
};

const VEHICLE_DISPLAY_KINDS = new Set<VehicleDisplayKind>([
  "speed",
  "limit",
  "power",
  "battery"
]);

function normalizeVehicleDisplayKind(value: unknown): VehicleDisplayKind {
  return VEHICLE_DISPLAY_KINDS.has(value as VehicleDisplayKind)
    ? value as VehicleDisplayKind
    : "speed";
}

abstract class ConfigurableTimetableDisplayAction
  extends SingletonAction<TimetableSettings> {
  protected abstract readonly controller: TimetableController;

  private readonly telemetryHub = FullpanelViewModelHub.instance;
  private readonly blinkHub = FullpanelBlinkHub.instance;
  private readonly contexts = new Map<string, TimetableContext>();
  private readonly lastImages = new Map<string, string>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private unsubscribeBlink: (() => void) | undefined;
  private renderQueued = false;
  private rendering = false;
  private disposed = false;
  private blinkBright = true;
  private viewModel = this.telemetryHub.viewModel;

  override async onWillAppear(
    ev: WillAppearEvent<TimetableSettings>
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    const actionContext = ev.action as
      | DialAction<TimetableSettings>
      | KeyAction<TimetableSettings>;
    let settings: TimetableSettings = {};

    try {
      settings = await actionContext.getSettings<TimetableSettings>();
    } catch (error) {
      this.warn("Panel-Auswahl konnte nicht gelesen werden.", error);
    }

    const kind = this.normalizeKind(settings.kind);
    this.contexts.set(actionContext.id, { action: actionContext, kind });

    if (this.controller === "encoder") {
      const dial = actionContext as DialAction<TimetableSettings>;
      await Promise.allSettled([
        dial.setFeedbackLayout(FULLPANEL_LAYOUT),
        dial.setTriggerDescription({
          rotate: translateUi("only_display"),
          push: translateUi("only_display"),
          touch: translateUi("only_display")
        })
      ]);
    } else {
      await (actionContext as KeyAction<TimetableSettings>).setTitle("");
    }

    if (settings.kind !== kind) {
      try {
        await actionContext.setSettings<TimetableSettings>({
          ...settings,
          kind
        });
      } catch (error) {
        this.warn("Standardauswahl konnte nicht gespeichert werden.", error);
      }
    }

    this.ensureResources();
    this.requestRender();
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<TimetableSettings>
  ): void {
    if (this.disposed) {
      return;
    }

    const context = this.contexts.get(ev.action.id);
    if (!context) {
      return;
    }

    const kind = this.normalizeKind(ev.payload?.settings?.kind);
    if (context.kind === kind) {
      return;
    }

    context.kind = kind;
    this.lastImages.delete(ev.action.id);
    this.requestRender();
  }

  override onWillDisappear(
    ev: WillDisappearEvent<TimetableSettings>
  ): void {
    const contextId = ev.action.id;
    this.contexts.delete(contextId);
    this.lastImages.delete(contextId);
    this.releaseResourcesIfIdle();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.unsubscribeBlink?.();
    this.unsubscribeBlink = undefined;
    this.contexts.clear();
    this.lastImages.clear();
  }

  private ensureResources(): void {
    if (!this.unsubscribeTelemetry) {
      this.unsubscribeTelemetry = this.telemetryHub.subscribe(
        (_snapshot, viewModel) => {
          if (this.disposed) {
            return;
          }

          this.viewModel = viewModel;
          this.requestRender();
        }
      );
    }

    if (!this.unsubscribeBlink) {
      this.unsubscribeBlink = this.blinkHub.subscribe((bright) => {
        if (this.disposed) {
          return;
        }

        this.blinkBright = bright;
        if (
          this.viewModel.stopRequest
          && [...this.contexts.values()].some(
            (context) => context.kind === "stop"
              || context.kind === "status"
              || context.kind === "stop-request"
          )
        ) {
          this.requestRender();
        }
      });
    }
  }

  private releaseResourcesIfIdle(): void {
    if (this.contexts.size > 0) {
      return;
    }

    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.unsubscribeBlink?.();
    this.unsubscribeBlink = undefined;
  }

  private requestRender(): void {
    if (this.disposed || this.contexts.size === 0) {
      return;
    }

    this.renderQueued = true;
    if (this.rendering) {
      return;
    }

    this.rendering = true;
    void this.flush().finally(() => {
      this.rendering = false;
      if (this.renderQueued && !this.disposed) {
        this.requestRender();
      }
    });
  }

  private async flush(): Promise<void> {
    while (this.renderQueued && !this.disposed && this.contexts.size > 0) {
      this.renderQueued = false;
      await this.renderNow();
    }
  }

  private async renderNow(): Promise<void> {
    const jobs: Promise<void>[] = [];

    for (const [contextId, context] of this.contexts) {
      const image = this.controller === "encoder"
        ? renderSinglePanel(
          this.viewModel,
          context.kind,
          this.blinkBright
        ) as string
        : renderTimetableKeypad(
          this.viewModel,
          context.kind,
          this.blinkBright
        ) as string;

      if (this.lastImages.get(contextId) === image) {
        continue;
      }

      this.lastImages.set(contextId, image);
      const update = this.controller === "encoder"
        ? (context.action as DialAction<TimetableSettings>)
          .setFeedback({ display: image })
        : (context.action as KeyAction<TimetableSettings>).setImage(image);
      jobs.push(update.catch((error: unknown) => {
        this.lastImages.delete(contextId);
        this.warn(
          `Fahrplan-Anzeige ${context.kind} konnte nicht aktualisiert werden.`,
          error
        );
      }));
    }

    await Promise.allSettled(jobs);
  }

  private warn(message: string, error?: unknown): void {
    const source = `[ConfigurableTimetable:${this.controller}]`;
    if (error === undefined) {
      streamDeck.logger.warn(`${source} ${message}`);
      return;
    }

    streamDeck.logger.warn(`${source} ${message}`, error);
  }

  private normalizeKind(value: unknown): TimetableKind {
    const kind = normalizeTimetableKind(value);
    return this.controller === "encoder" && kind === "stop-request"
      ? "stop"
      : kind;
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.timetable-panel" })
export class TimetablePanelAction extends ConfigurableTimetableDisplayAction {
  protected readonly controller = "encoder";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.timetable-button" })
export class TimetableButtonAction extends ConfigurableTimetableDisplayAction {
  protected readonly controller = "keypad";
}

abstract class VehicleKeypadDisplayAction
  extends SingletonAction<VehicleDisplaySettings> {
  protected abstract readonly defaultKind: VehicleDisplayKind;
  protected readonly configurable: boolean = false;

  protected readonly telemetryHub = FullpanelViewModelHub.instance;
  private readonly contexts = new Map<string, VehicleDisplayContext>();
  private readonly lastImages = new Map<string, string>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private renderQueued = false;
  private rendering = false;
  private disposed = false;
  private viewModel: FullpanelViewModel = this.telemetryHub.viewModel;

  override async onWillAppear(
    ev: WillAppearEvent<VehicleDisplaySettings>
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    const key = ev.action as KeyAction<VehicleDisplaySettings>;
    let settings: VehicleDisplaySettings = {};

    if (this.configurable) {
      try {
        settings = await key.getSettings<VehicleDisplaySettings>();
      } catch (error) {
        this.warn("Anzeigeauswahl konnte nicht gelesen werden.", error);
      }
    }

    const kind = this.configurable
      ? normalizeVehicleDisplayKind(settings.kind)
      : this.defaultKind;
    this.contexts.set(key.id, { action: key, kind });
    await key.setTitle("");

    if (this.configurable && settings.kind !== kind) {
      try {
        await key.setSettings<VehicleDisplaySettings>({ ...settings, kind });
      } catch (error) {
        this.warn("Standardanzeige konnte nicht gespeichert werden.", error);
      }
    }

    this.ensureTelemetry();
    this.requestRender();
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<VehicleDisplaySettings>
  ): void {
    if (!this.configurable || this.disposed) {
      return;
    }

    const context = this.contexts.get(ev.action.id);
    if (!context) {
      return;
    }

    const kind = normalizeVehicleDisplayKind(ev.payload?.settings?.kind);
    if (context.kind === kind) {
      return;
    }

    context.kind = kind;
    this.lastImages.delete(ev.action.id);
    this.requestRender();
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.contexts.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
    this.releaseTelemetryIfIdle();
  }

  override onKeyDown(ev: KeyDownEvent<VehicleDisplaySettings>): void {
    if (this.contexts.get(ev.action.id)?.kind === "power") {
      this.telemetryHub.resetAverageConsumption();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.contexts.clear();
    this.lastImages.clear();
  }

  private ensureTelemetry(): void {
    if (this.unsubscribeTelemetry || this.disposed) {
      return;
    }

    this.unsubscribeTelemetry = this.telemetryHub.subscribe(
      (_snapshot, viewModel) => {
        if (this.disposed) {
          return;
        }

        this.viewModel = viewModel;
        this.requestRender();
      }
    );
  }

  private releaseTelemetryIfIdle(): void {
    if (this.contexts.size > 0) {
      return;
    }

    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
  }

  private requestRender(): void {
    if (this.disposed || this.contexts.size === 0) {
      return;
    }

    this.renderQueued = true;
    if (this.rendering) {
      return;
    }

    this.rendering = true;
    void this.flush().finally(() => {
      this.rendering = false;
      if (this.renderQueued && !this.disposed) {
        this.requestRender();
      }
    });
  }

  private async flush(): Promise<void> {
    while (this.renderQueued && !this.disposed && this.contexts.size > 0) {
      this.renderQueued = false;
      await this.renderNow();
    }
  }

  private async renderNow(): Promise<void> {
    const jobs: Promise<void>[] = [];

    for (const [contextId, context] of this.contexts) {
      const image = renderKeypad(this.viewModel, context.kind) as string;
      if (this.lastImages.get(contextId) === image) {
        continue;
      }

      this.lastImages.set(contextId, image);
      jobs.push(context.action.setImage(image).catch((error: unknown) => {
        this.lastImages.delete(contextId);
        this.warn("Fahrzeuganzeige konnte nicht aktualisiert werden.", error);
      }));
    }

    await Promise.allSettled(jobs);
  }

  private warn(message: string, error?: unknown): void {
    const source = `[VehicleKeypad:${this.defaultKind}]`;
    if (error === undefined) {
      streamDeck.logger.warn(`${source} ${message}`);
      return;
    }

    streamDeck.logger.warn(`${source} ${message}`, error);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.vehicle-speed" })
export class VehicleSpeedAction extends VehicleKeypadDisplayAction {
  protected readonly defaultKind = "speed";
  protected override readonly configurable = true;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.vehicle-speed-limit" })
export class VehicleSpeedLimitAction extends VehicleKeypadDisplayAction {
  protected readonly defaultKind = "limit";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.vehicle-power" })
export class VehiclePowerAction extends VehicleKeypadDisplayAction {
  protected readonly defaultKind = "power";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.vehicle-battery" })
export class VehicleBatteryAction extends VehicleKeypadDisplayAction {
  protected readonly defaultKind = "battery";
}
