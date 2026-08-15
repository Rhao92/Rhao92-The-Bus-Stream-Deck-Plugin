import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyAction,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import {
  NavigationDisplayKind,
  normalizeNavigationKind,
  renderNavigationKey
} from "../navigation/navigation-renderer";
import {
  RouteGuidanceHub,
  RouteGuidanceModel
} from "../navigation/route-guidance";

type NavigationSettings = { kind?: string };
type NavigationContext = {
  action: KeyAction<NavigationSettings>;
  kind: NavigationDisplayKind;
};

abstract class BaseNavigationAction extends SingletonAction<NavigationSettings> {
  protected readonly fixedKind: NavigationDisplayKind | undefined = undefined;

  private readonly guidanceHub = RouteGuidanceHub.instance;
  private readonly contexts = new Map<string, NavigationContext>();
  private readonly lastImages = new Map<string, string>();
  private unsubscribeGuidance: (() => void) | undefined;
  private model: RouteGuidanceModel = this.guidanceHub.model;
  private renderQueued = false;
  private rendering = false;
  private disposed = false;

  override async onWillAppear(
    ev: WillAppearEvent<NavigationSettings>
  ): Promise<void> {
    if (this.disposed) return;
    const key = ev.action as KeyAction<NavigationSettings>;
    let settings: NavigationSettings = {};
    if (this.fixedKind === undefined) {
      try {
        settings = await key.getSettings<NavigationSettings>();
      } catch (error) {
        streamDeck.logger.warn(
          "[Navigation] Anzeigeauswahl konnte nicht gelesen werden.",
          error
        );
      }
    }
    const kind = this.fixedKind ?? normalizeNavigationKind(settings.kind);
    this.contexts.set(key.id, { action: key, kind });
    await key.setTitle("");

    if (this.fixedKind === undefined && settings.kind !== kind) {
      try {
        await key.setSettings({ ...settings, kind });
      } catch (error) {
        streamDeck.logger.warn(
          "[Navigation] Standardauswahl konnte nicht gespeichert werden.",
          error
        );
      }
    }

    this.ensureGuidance();
    this.requestRender();
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<NavigationSettings>
  ): void {
    if (this.disposed || this.fixedKind !== undefined) return;
    const context = this.contexts.get(ev.action.id);
    if (!context) return;
    const kind = normalizeNavigationKind(ev.payload.settings.kind);
    if (context.kind === kind) return;
    context.kind = kind;
    this.lastImages.delete(ev.action.id);
    this.requestRender();
  }

  override onWillDisappear(
    ev: WillDisappearEvent<NavigationSettings>
  ): void {
    this.contexts.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
    this.releaseGuidanceIfIdle();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeGuidance?.();
    this.unsubscribeGuidance = undefined;
    this.contexts.clear();
    this.lastImages.clear();
  }

  private ensureGuidance(): void {
    if (this.unsubscribeGuidance || this.disposed) return;
    this.unsubscribeGuidance = this.guidanceHub.subscribe((_snapshot, model) => {
      if (this.disposed) return;
      this.model = model;
      this.requestRender();
    });
  }

  private releaseGuidanceIfIdle(): void {
    if (this.contexts.size > 0) return;
    this.unsubscribeGuidance?.();
    this.unsubscribeGuidance = undefined;
  }

  private requestRender(): void {
    if (this.disposed || this.contexts.size === 0) return;
    this.renderQueued = true;
    if (this.rendering) return;
    this.rendering = true;
    void this.flush().finally(() => {
      this.rendering = false;
      if (this.renderQueued && !this.disposed) this.requestRender();
    });
  }

  private async flush(): Promise<void> {
    while (this.renderQueued && !this.disposed && this.contexts.size > 0) {
      this.renderQueued = false;
      const jobs: Promise<void>[] = [];
      for (const [contextId, context] of this.contexts) {
        const image = renderNavigationKey(this.model, context.kind);
        if (this.lastImages.get(contextId) === image) continue;
        this.lastImages.set(contextId, image);
        jobs.push(context.action.setImage(image).catch((error: unknown) => {
          this.lastImages.delete(contextId);
          streamDeck.logger.warn(
            `[Navigation:${context.kind}] Anzeige konnte nicht aktualisiert werden.`,
            error
          );
        }));
      }
      await Promise.allSettled(jobs);
    }
  }
}

/** Sichtbare UI-01-Sammelaktion; vorhandene Instanzen bleiben Manöver. */
@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-maneuver" })
export class NavigationAction extends BaseNavigationAction {}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-maneuver-distance" })
export class NavigationManeuverDistanceAction extends BaseNavigationAction {
  protected override readonly fixedKind = "maneuver-distance" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-next-stop" })
export class NavigationNextStopAction extends BaseNavigationAction {
  protected override readonly fixedKind = "next-stop" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-remaining-distance" })
export class NavigationRemainingDistanceAction extends BaseNavigationAction {
  protected override readonly fixedKind = "remaining-distance" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-route-progress" })
export class NavigationRouteProgressAction extends BaseNavigationAction {
  protected override readonly fixedKind = "route-progress" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-eta" })
export class NavigationEtaAction extends BaseNavigationAction {
  protected override readonly fixedKind = "eta" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-predicted-delta" })
export class NavigationPredictedDeltaAction extends BaseNavigationAction {
  protected override readonly fixedKind = "predicted-delta" as const;
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-confidence" })
export class NavigationConfidenceAction extends BaseNavigationAction {
  protected override readonly fixedKind = "confidence" as const;
}
