import streamDeck, {
  action,
  DialAction,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import {
  HvacCommand,
  HvacDialMode,
  normalizeHvacDialMode,
  readHvacState,
  resolveAirflowCommand,
  resolveFanStepCommand,
  resolveTemperatureCommand
} from "../core/hvac";
import { executeHvacCommand } from "../core/hvac-command";
import { TelemetryClient, TelemetrySnapshot } from "../core/telemetry";
import {
  renderHvacDial,
  renderHvacDialRuntime
} from "../hvac/hvac-renderer";
import { FULLPANEL_LAYOUT } from "../fullpanel/fullpanel-renderer";

type HvacDialSettings = {
  mode?: string;
};

type HvacDialModeChangedPayload = {
  type?: string;
  mode?: string;
};

type HvacDialContext = {
  action: DialAction<HvacDialSettings>;
  mode: HvacDialMode;
  lastImage?: string;
};

@action({ UUID: "de.rhao92.thebus-telemetry-interface.hvac-dial" })
export class HvacDialAction extends SingletonAction<HvacDialSettings> {
  private readonly telemetry = TelemetryClient.instance;
  private readonly contexts = new Map<string, HvacDialContext>();
  private readonly commandQueues = new Map<string, Promise<void>>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private snapshot: TelemetrySnapshot = this.telemetry.snapshot;
  private disposed = false;

  override async onWillAppear(ev: WillAppearEvent<HvacDialSettings>): Promise<void> {
    if (this.disposed) {
      return;
    }

    const dial = ev.action as DialAction<HvacDialSettings>;
    let settings: HvacDialSettings = {};
    try {
      settings = await dial.getSettings<HvacDialSettings>();
    } catch (error) {
      this.warn("Reglerauswahl konnte nicht gelesen werden.", error);
    }

    const mode = normalizeHvacDialMode(settings.mode);
    this.contexts.set(dial.id, { action: dial, mode });
    await Promise.allSettled([
      dial.setFeedbackLayout(FULLPANEL_LAYOUT),
      dial.setTriggerDescription({
        rotate: "Klima-Regler drehen",
        push: "Keine Funktion",
        touch: "Keine Funktion"
      })
    ]);

    if (settings.mode !== mode) {
      try {
        await dial.setSettings({ ...settings, mode });
      } catch (error) {
        this.warn("Standard-Reglerauswahl konnte nicht gespeichert werden.", error);
      }
    }

    this.ensureTelemetry();
    await this.renderContext(dial.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<HvacDialSettings>): void {
    const context = this.contexts.get(ev.action.id);
    if (!context || this.disposed) {
      return;
    }

    context.mode = normalizeHvacDialMode(ev.payload?.settings?.mode);
    context.lastImage = undefined;
    void this.renderContext(ev.action.id);
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<HvacDialModeChangedPayload, HvacDialSettings>
  ): Promise<void> {
    if (ev.payload?.type !== "modeChanged" || this.disposed) {
      return;
    }

    const dial = ev.action as DialAction<HvacDialSettings>;
    const mode = normalizeHvacDialMode(ev.payload.mode);
    let settings: HvacDialSettings = {};
    try {
      settings = await dial.getSettings<HvacDialSettings>();
      await dial.setSettings({ ...settings, mode });
    } catch (error) {
      this.warn("Reglerauswahl konnte nicht gespeichert werden.", error);
    }

    const context = this.contexts.get(dial.id);
    if (context) {
      context.mode = mode;
      context.lastImage = undefined;
      await this.renderContext(dial.id);
    }
  }

  override onDialRotate(ev: DialRotateEvent<HvacDialSettings>): void {
    const context = this.contexts.get(ev.action.id);
    const ticks = Math.trunc(ev.payload?.ticks ?? 0);
    if (!context || ticks === 0 || this.disposed) {
      return;
    }

    const previous = this.commandQueues.get(ev.action.id) ?? Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(() => this.executeTicks(ev.action.id, context.mode, ticks))
      .finally(() => {
        if (this.commandQueues.get(ev.action.id) === queued) {
          this.commandQueues.delete(ev.action.id);
        }
      });
    this.commandQueues.set(ev.action.id, queued);
  }

  override onWillDisappear(ev: WillDisappearEvent<HvacDialSettings>): void {
    this.contexts.delete(ev.action.id);
    this.commandQueues.delete(ev.action.id);
    if (this.contexts.size === 0) {
      this.unsubscribeTelemetry?.();
      this.unsubscribeTelemetry = undefined;
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
    this.commandQueues.clear();
  }

  private ensureTelemetry(): void {
    if (this.unsubscribeTelemetry || this.disposed) {
      return;
    }

    this.unsubscribeTelemetry = this.telemetry.subscribe((snapshot) => {
      if (this.disposed) {
        return;
      }

      this.snapshot = snapshot;
      for (const contextId of this.contexts.keys()) {
        void this.renderContext(contextId);
      }
    });
  }

  private async renderContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (!context || this.disposed) {
      return;
    }

    const runtimeState = this.snapshot.runtimeState;
    const image = !this.snapshot.connected || runtimeState === "offline"
      ? renderHvacDialRuntime("offline")
      : runtimeState === "no-bus" || runtimeState === "bus-not-ready"
        ? renderHvacDialRuntime("no-bus")
        : renderHvacDial(context.mode, readHvacState(this.snapshot.vehicle));

    if (context.lastImage === image) {
      return;
    }

    context.lastImage = image;
    try {
      await context.action.setFeedback({ display: image });
    } catch (error) {
      context.lastImage = undefined;
      this.warn(`Klima-Regler ${context.mode} konnte nicht aktualisiert werden.`, error);
    }
  }

  private async executeTicks(
    contextId: string,
    mode: HvacDialMode,
    ticks: number
  ): Promise<void> {
    if (!this.snapshot.vehicleId || !this.snapshot.vehicleReady || !this.snapshot.vehicle) {
      return;
    }

    const direction: 1 | -1 = ticks > 0 ? 1 : -1;
    for (let tick = 0; tick < Math.abs(ticks); tick += 1) {
      if (!this.contexts.has(contextId) || !this.snapshot.vehicleId) {
        return;
      }

      const command = mode === "temperature"
        ? resolveTemperatureCommand(this.snapshot.vehicle, direction)
        : mode === "fan-speed"
          ? resolveFanStepCommand(this.snapshot.vehicle, direction)
          : resolveAirflowCommand(this.snapshot.vehicle, direction);
      if (!command) {
        return;
      }

      const vehicleId = this.snapshot.vehicleId;
      if (!vehicleId) {
        return;
      }

      const sent = await executeHvacCommand(
        this.telemetry,
        vehicleId,
        command,
        "[HvacDialAction]"
      );
      if (!sent) {
        return;
      }
    }
  }

  private warn(message: string, error?: unknown): void {
    const source = "[HvacDialAction]";
    if (error === undefined) {
      streamDeck.logger.warn(`${source} ${message}`);
      return;
    }

    streamDeck.logger.warn(`${source} ${message}`, error);
  }
}
