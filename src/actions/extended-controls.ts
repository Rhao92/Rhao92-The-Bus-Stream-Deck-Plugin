import {
  action,
  KeyAction,
  KeyDownEvent,
  KeyUpEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import { BaseConfigurableKeyAction } from "../base/base-configurable-key-action";
import { BaseDisplayAction, DisplayModel } from "../base/base-display-action";
import {
  ExteriorLightMode,
  normalizeExteriorLightMode,
  normalizeRetarderMode,
  normalizeTicketControlMode,
  normalizeWiperMode,
  readExteriorLightState,
  readRetarderState,
  readSunBlindState,
  readWiperState,
  resolveExteriorLightCommand,
  resolveRetarderCommand,
  resolveSunBlindCommand,
  resolveTicketControlCommand,
  resolveWiperCommand,
  RetarderMode,
  ticketControlAvailable,
  TicketControlMode,
  WiperMode
} from "../core/extended-controls";
import { TelemetrySnapshot } from "../core/telemetry";
import {
  renderExteriorLightKey,
  renderRetarderKey,
  renderSunBlindKey,
  renderTicketControlKey,
  renderWiperKey
} from "../vehicle/extended-control-renderer";

async function sendConfirmedEvent(
  actionInstance: {
    send: (eventName: string) => Promise<boolean>;
    refresh: () => void;
    warn: (message: string) => void;
  },
  eventName: string
): Promise<void> {
  const sent = await actionInstance.send(eventName);
  if (sent) {
    actionInstance.refresh();
  } else {
    actionInstance.warn(`Event "${eventName}" konnte nicht gesendet werden.`);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.retarder-control" })
export class RetarderControlAction
  extends BaseConfigurableKeyAction<RetarderMode> {
  protected readonly defaultMode = "increase" as const;

  protected normalizeMode(mode: unknown): RetarderMode {
    return normalizeRetarderMode(mode);
  }

  protected createModeDisplayModel(
    mode: RetarderMode,
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: 0,
      title: null,
      image: renderRetarderKey(mode, readRetarderState(snapshot.vehicle))
    };
  }

  protected async handleModeKeyDown(
    mode: RetarderMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }
    const command = resolveRetarderCommand(snapshot.vehicle, mode);
    if (!command) {
      return;
    }
    await sendConfirmedEvent({
      send: (eventName) => this.sendEvent(eventName),
      refresh: () => this.refreshTelemetrySoon(),
      warn: (message) => this.logWarning(message)
    }, command.event);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.sun-blind" })
export class SunBlindAction extends BaseDisplayAction {
  private readonly heldEvents = new Map<string, {
    vehicleId: string;
    eventName: string;
  }>();

  protected createDisplayModel(snapshot: TelemetrySnapshot): DisplayModel {
    return {
      state: 0,
      title: null,
      image: renderSunBlindKey(readSunBlindState(snapshot.vehicle))
    };
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (this.heldEvents.has(ev.action.id)) return;
    const snapshot = this.snapshot;
    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }
    const command = resolveSunBlindCommand(snapshot.vehicle);
    if (!command) {
      return;
    }
    this.heldEvents.set(ev.action.id, {
      vehicleId: snapshot.vehicleId,
      eventName: command.event
    });
    this.telemetry.sendEventForVehicleDetached(
      snapshot.vehicleId,
      command.event,
      "press"
    );
    this.refreshTelemetrySoon();
  }

  override onKeyUp(ev: KeyUpEvent): void {
    if (this.releaseHeldEvent(ev.action.id)) this.refreshTelemetrySoon();
  }

  protected override async onTelemetryUpdated(
    snapshot: TelemetrySnapshot
  ): Promise<void> {
    for (const [contextId, held] of [...this.heldEvents]) {
      if (!snapshot.vehicleId || held.vehicleId !== snapshot.vehicleId) {
        this.releaseHeldEvent(contextId);
      }
    }
    await super.onTelemetryUpdated(snapshot);
  }

  protected override onDisappear(ev: WillDisappearEvent): void {
    this.releaseHeldEvent(ev.action.id);
    super.onDisappear(ev);
  }

  override dispose(): void {
    for (const contextId of [...this.heldEvents.keys()]) {
      this.releaseHeldEvent(contextId);
    }
    super.dispose();
  }

  private releaseHeldEvent(contextId: string): boolean {
    const held = this.heldEvents.get(contextId);
    if (!held) return false;
    this.heldEvents.delete(contextId);
    this.telemetry.sendEventForVehicleDetached(
      held.vehicleId,
      held.eventName,
      "release"
    );
    return true;
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.wiper-control" })
export class WiperControlAction
  extends BaseConfigurableKeyAction<WiperMode> {
  protected readonly defaultMode = "increase" as const;

  protected normalizeMode(mode: unknown): WiperMode {
    return normalizeWiperMode(mode);
  }

  protected createModeDisplayModel(
    mode: WiperMode,
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: 0,
      title: null,
      image: renderWiperKey(mode, readWiperState(snapshot.vehicle))
    };
  }

  protected async handleModeKeyDown(
    mode: WiperMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }
    const command = resolveWiperCommand(snapshot.vehicle, mode);
    if (!command) {
      return;
    }
    await sendConfirmedEvent({
      send: (eventName) => this.sendEvent(eventName),
      refresh: () => this.refreshTelemetrySoon(),
      warn: (message) => this.logWarning(message)
    }, command.event);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.exterior-light-control" })
export class ExteriorLightControlAction
  extends BaseConfigurableKeyAction<ExteriorLightMode> {
  protected readonly defaultMode = "switch-up" as const;

  protected normalizeMode(mode: unknown): ExteriorLightMode {
    return normalizeExteriorLightMode(mode);
  }

  protected createModeDisplayModel(
    mode: ExteriorLightMode,
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: 0,
      title: null,
      image: renderExteriorLightKey(
        mode,
        readExteriorLightState(snapshot.vehicle)
      )
    };
  }

  protected async handleModeKeyDown(
    mode: ExteriorLightMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }
    const command = resolveExteriorLightCommand(snapshot.vehicle, mode);
    if (!command) {
      return;
    }
    await sendConfirmedEvent({
      send: (eventName) => this.sendEvent(eventName),
      refresh: () => this.refreshTelemetrySoon(),
      warn: (message) => this.logWarning(message)
    }, command.event);
  }
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.ticket-control" })
export class TicketControlAction
  extends BaseConfigurableKeyAction<TicketControlMode> {
  protected readonly defaultMode = "atron" as const;

  protected normalizeMode(mode: unknown): TicketControlMode {
    return normalizeTicketControlMode(mode);
  }

  protected createModeDisplayModel(
    mode: TicketControlMode,
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    return {
      state: 0,
      title: null,
      image: renderTicketControlKey(
        mode,
        ticketControlAvailable(snapshot.vehicle, mode)
      )
    };
  }

  protected async handleModeKeyDown(
    mode: TicketControlMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleReady || !snapshot.vehicleId || !snapshot.vehicle) {
      return;
    }
    const command = resolveTicketControlCommand(snapshot.vehicle, mode);
    if (!command) {
      return;
    }
    await sendConfirmedEvent({
      send: (eventName) => this.sendEvent(eventName),
      refresh: () => this.refreshTelemetrySoon(),
      warn: (message) => this.logWarning(message)
    }, command.event);
  }
}
