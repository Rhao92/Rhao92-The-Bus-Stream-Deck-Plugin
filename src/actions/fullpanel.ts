import streamDeck, {
  action,
  DialAction,
  DialDownEvent,
  SingletonAction,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import { FullpanelBlinkHub } from "../fullpanel/blink-hub";
import {
  FULLPANEL_LAYOUT,
  FULLPANEL_OVERLAY_MS,
  renderFullpanel,
  renderFullpanelSegment,
  renderFullpanelSetup
} from "../fullpanel/fullpanel-renderer";
import {
  FullpanelLayer,
  FullpanelOverlay,
  FullpanelViewModel
} from "../fullpanel/types";
import { FullpanelViewModelHub } from "../fullpanel/view-model-hub";
import {
  RouteGuidanceHub,
  RouteGuidanceModel
} from "../navigation/route-guidance";
import { translateUi } from "../core/localization";

type FullpanelSettings = {
  layer?: string;
};

type FullpanelContext = {
  action: DialAction<FullpanelSettings>;
  contextId: string;
  column: number;
};

type FullpanelGroup = {
  deviceId: string;
  contexts: Map<number, FullpanelContext>;
  layer: FullpanelLayer;
  blinkBright: boolean;
  renderQueued: boolean;
  rendering: boolean;
  lastFull?: string;
  lastContextSignature: string;
  overlay?: FullpanelOverlay;
};

function normalizeColumn(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(3, Math.trunc(number)))
    : 0;
}

function normalizeLayer(value: unknown): FullpanelLayer {
  return value === "vehicle" || value === "navigation"
    ? value
    : "timetable";
}

const FULLPANEL_LAYERS: FullpanelLayer[] = [
  "timetable",
  "vehicle",
  "navigation"
];

function nextLayer(value: FullpanelLayer): FullpanelLayer {
  const index = FULLPANEL_LAYERS.indexOf(value);
  return FULLPANEL_LAYERS[(index + 1) % FULLPANEL_LAYERS.length];
}

function layerLabel(value: FullpanelLayer): string {
  if (value === "vehicle") return translateUi("vehicle");
  if (value === "navigation") return translateUi("navigation");
  return translateUi("timetable");
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.fullpanel" })
export class FullpanelAction extends SingletonAction<FullpanelSettings> {
  private readonly telemetryHub = FullpanelViewModelHub.instance;
  private readonly guidanceHub = RouteGuidanceHub.instance;
  private readonly blinkHub = FullpanelBlinkHub.instance;
  private readonly groups = new Map<string, FullpanelGroup>();
  private readonly locations = new Map<string, {
    deviceId: string;
    column: number;
  }>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private unsubscribeGuidance: (() => void) | undefined;
  private unsubscribeBlink: (() => void) | undefined;
  private disposed = false;
  private viewModel = this.telemetryHub.viewModel;
  private guidanceModel: RouteGuidanceModel = this.guidanceHub.model;

  override async onWillAppear(
    ev: WillAppearEvent<FullpanelSettings>
  ): Promise<void> {
    if (this.disposed) {
      return;
    }

    const dial = ev.action as DialAction<FullpanelSettings>;
    const column = normalizeColumn(
      "coordinates" in ev.payload
        ? ev.payload.coordinates?.column
        : 0
    );
    const deviceId = dial.device.id;
    const group = this.getOrCreateGroup(deviceId);
    const previous = group.contexts.get(column);

    if (previous && previous.contextId !== dial.id) {
      this.locations.delete(previous.contextId);
    }

    group.contexts.set(column, {
      action: dial,
      contextId: dial.id,
      column
    });
    this.locations.set(dial.id, { deviceId, column });

    await Promise.allSettled([
      dial.setFeedbackLayout(FULLPANEL_LAYOUT),
      dial.setTriggerDescription({
        rotate: translateUi("only_display"),
        push: column === 0 ? translateUi("change_dashboard") : translateUi("only_display"),
        touch: translateUi("change_dashboard")
      })
    ]);

    try {
      const settings = await dial.getSettings<FullpanelSettings>();
      group.layer = normalizeLayer(settings.layer);
    } catch (error) {
      this.warn("Layer-Einstellungen konnten nicht gelesen werden.", error);
    }

    this.ensureResources();
    this.requestRender(group);
  }

  override onWillDisappear(
    ev: WillDisappearEvent<FullpanelSettings>
  ): void {
    if (this.disposed) {
      return;
    }

    const contextId = ev.action.id;
    const location = this.locations.get(contextId);
    this.locations.delete(contextId);

    if (!location) {
      return;
    }

    const group = this.groups.get(location.deviceId);
    if (!group) {
      return;
    }

    const current = group.contexts.get(location.column);
    if (current?.contextId === contextId) {
      group.contexts.delete(location.column);
    }

    if (group.contexts.size === 0) {
      this.groups.delete(location.deviceId);
    } else {
      this.requestRender(group);
    }

    this.releaseResourcesIfIdle();
  }

  override async onTouchTap(
    ev: TouchTapEvent<FullpanelSettings>
  ): Promise<void> {
    const group = this.groupForContext(ev.action.id);
    if (!group || this.disposed) {
      return;
    }

    group.layer = nextLayer(group.layer);
    this.showOverlay(
      group,
      translateUi("layer"),
      layerLabel(group.layer)
    );
    await this.persistLayer(group);
    this.requestRender(group);
  }

  override async onDialDown(
    ev: DialDownEvent<FullpanelSettings>
  ): Promise<void> {
    const group = this.groupForContext(ev.action.id);
    const location = this.locations.get(ev.action.id);
    if (!group || !location || this.disposed) {
      return;
    }

    if (location.column !== 0) {
      return;
    }

    group.layer = nextLayer(group.layer);
    this.showOverlay(
      group,
      "REGLER 1",
      layerLabel(group.layer)
    );
    await this.persistLayer(group);
    this.requestRender(group);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.unsubscribeGuidance?.();
    this.unsubscribeGuidance = undefined;
    this.unsubscribeBlink?.();
    this.unsubscribeBlink = undefined;

    for (const group of this.groups.values()) {
      group.contexts.clear();
      group.overlay = undefined;
      group.renderQueued = false;
    }

    this.groups.clear();
    this.locations.clear();
  }

  private getOrCreateGroup(deviceId: string): FullpanelGroup {
    let group = this.groups.get(deviceId);

    if (!group) {
      group = {
        deviceId,
        contexts: new Map<number, FullpanelContext>(),
        layer: "timetable",
        blinkBright: true,
        renderQueued: false,
        rendering: false,
        lastFull: undefined,
        lastContextSignature: ""
      };
      this.groups.set(deviceId, group);
    }

    return group;
  }

  private groupForContext(contextId: string): FullpanelGroup | undefined {
    const location = this.locations.get(contextId);
    return location ? this.groups.get(location.deviceId) : undefined;
  }

  private ensureResources(): void {
    if (!this.unsubscribeTelemetry) {
      this.unsubscribeTelemetry = this.telemetryHub.subscribe(
        (_snapshot, viewModel) => {
          if (this.disposed) {
            return;
          }

          this.viewModel = viewModel;
          for (const group of this.groups.values()) {
            if (group.layer !== "navigation") this.requestRender(group);
          }
        }
      );
    }

    if (!this.unsubscribeGuidance) {
      this.unsubscribeGuidance = this.guidanceHub.subscribe(
        (_snapshot, model) => {
          if (this.disposed) return;
          this.guidanceModel = model;
          for (const group of this.groups.values()) {
            if (group.layer === "navigation") this.requestRender(group);
          }
        }
      );
    }

    if (!this.unsubscribeBlink) {
      this.unsubscribeBlink = this.blinkHub.subscribe((bright) => {
        if (this.disposed) {
          return;
        }

        const now = Date.now();
        for (const group of this.groups.values()) {
          let needsRender = false;

          if (this.viewModel.stopRequest) {
            group.blinkBright = bright;
            needsRender = true;
          }

          if (group.overlay && group.overlay.expiresAt <= now) {
            group.overlay = undefined;
            needsRender = true;
          }

          if (needsRender) {
            this.requestRender(group);
          }
        }
      });
    }
  }

  private releaseResourcesIfIdle(): void {
    if (this.groups.size > 0) {
      return;
    }

    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.unsubscribeGuidance?.();
    this.unsubscribeGuidance = undefined;
    this.unsubscribeBlink?.();
    this.unsubscribeBlink = undefined;
  }

  private showOverlay(
    group: FullpanelGroup,
    title: string,
    value: string
  ): void {
    group.overlay = {
      title,
      value,
      expiresAt: Date.now() + FULLPANEL_OVERLAY_MS
    };
  }

  private async persistLayer(group: FullpanelGroup): Promise<void> {
    const jobs = [...group.contexts.values()].map(async (context) => {
      let settings: FullpanelSettings = {};

      try {
        settings = await context.action.getSettings<FullpanelSettings>();
      } catch (error) {
        this.warn(
          `Einstellungen fuer Segment ${context.column + 1} nicht lesbar.`,
          error
        );
      }

      try {
        await context.action.setSettings<FullpanelSettings>({
          ...settings,
          layer: group.layer
        });
      } catch (error) {
        this.warn(
          `Einstellungen fuer Segment ${context.column + 1} konnten nicht gespeichert werden.`,
          error
        );
      }
    });

    await Promise.allSettled(jobs);
  }

  private requestRender(group: FullpanelGroup): void {
    if (this.disposed || !this.groups.has(group.deviceId)) {
      return;
    }

    group.renderQueued = true;
    if (group.rendering) {
      return;
    }

    group.rendering = true;
    void this.flush(group).finally(() => {
      group.rendering = false;
      if (group.renderQueued && !this.disposed) {
        this.requestRender(group);
      }
    });
  }

  private async flush(group: FullpanelGroup): Promise<void> {
    while (
      group.renderQueued
      && !this.disposed
      && this.groups.has(group.deviceId)
    ) {
      group.renderQueued = false;
      await this.renderNow(group);
    }
  }

  private async renderNow(group: FullpanelGroup): Promise<void> {
    const contexts = [...group.contexts.values()];
    const complete = [0, 1, 2, 3].every(
      (column) => group.contexts.has(column)
    );
    let full: string | undefined;

    if (complete) {
      full = renderFullpanel(
        this.viewModel,
        group.layer,
        group.blinkBright,
        group.overlay,
        this.guidanceModel
      );
    }

    const contextSignature = contexts
      .map((context) => `${context.column}:${context.contextId}`)
      .sort()
      .join("|");

    if (
      complete
      && group.lastFull === full
      && group.lastContextSignature === contextSignature
    ) {
      return;
    }

    if (!complete) {
      group.lastFull = undefined;
      group.lastContextSignature = "";
    }

    const jobs = contexts.map((context) => context.action.setFeedback({
      display: full
        ? renderFullpanelSegment(full, context.column)
        : renderFullpanelSetup(context.column, contexts.length)
    }));
    const results = await Promise.allSettled(jobs);
    let successful = true;

    for (const result of results) {
      if (result.status === "rejected") {
        successful = false;
        this.warn(
          "Ein Fullpanel-Segment konnte nicht aktualisiert werden.",
          result.reason
        );
      }
    }

    if (complete && successful) {
      group.lastFull = full;
      group.lastContextSignature = contextSignature;
    }
  }

  private warn(message: string, error?: unknown): void {
    if (error === undefined) {
      streamDeck.logger.warn(`[FullpanelAction] ${message}`);
      return;
    }

    streamDeck.logger.warn(`[FullpanelAction] ${message}`, error);
  }
}
