import {
  action,
  KeyDownEvent,
  KeyUpEvent
} from "@elgato/streamdeck";
import { BaseDisplayAction, DisplayModel } from "../base/base-display-action";
import {
  IgnitionState,
  readIgnitionState
} from "../core/vehicle-controls";
import { TelemetrySnapshot } from "../core/telemetry";

const OFF_CONFIRM_MS = 1000;
const IGNITION_STATES = {
  offline: 0,
  off: 1,
  ignition: 2,
  engine: 3
} as const;

@action({ UUID: "de.rhao92.thebus-telemetry-interface.ignition" })
export class IgnitionAction extends BaseDisplayAction {
  private pressedVehicleId: string | undefined;
  private displayVehicleId: string | undefined;
  private lastConfirmedState: IgnitionState | undefined;
  private possibleOffSince = 0;

  protected override createDisplayModel(
    snapshot: TelemetrySnapshot
  ): DisplayModel {
    if (!snapshot.connected || !snapshot.vehicle) {
      return { state: IGNITION_STATES.offline };
    }

    // Ein Fahrzeugwechsel darf keinen bestaetigten Motorzustand des alten
    // Busses in die neue Anzeige uebernehmen. Kurze Aussetzer mit derselben
    // Fahrzeug-ID behalten den stabilisierten Zustand dagegen bei.
    if (snapshot.vehicleId !== this.displayVehicleId) {
      this.displayVehicleId = snapshot.vehicleId;
      this.lastConfirmedState = undefined;
      this.possibleOffSince = 0;
    }

    // Waehrend des echten Press-/Release-Langdrucks liefert der eCitaro kurz
    // widerspruechliche Zwischenwerte. Die Anzeige bleibt deshalb beim letzten
    // bestaetigten Zustand, ohne lokal einen neuen Zustand zu erfinden.
    if (this.pressedVehicleId) {
      return { state: this.displayStateFor(this.lastConfirmedState) };
    }

    const candidate = readIgnitionState(snapshot.vehicle);

    if (candidate === undefined) {
      return { state: this.displayStateFor(this.lastConfirmedState) };
    }

    if (candidate !== "off") {
      this.possibleOffSince = 0;
      this.lastConfirmedState = candidate;
      return { state: this.displayStateFor(candidate) };
    }

    // Ausschalten erst nach einer stabilen Sekunde bestaetigen. So flackert
    // der Zustand beim Motorstart nicht kurz auf AUS, ein echtes Ausschalten
    // wird aber weiterhin verlaesslich uebernommen.
    if (this.lastConfirmedState && this.lastConfirmedState !== "off") {
      const now = Date.now();

      if (this.possibleOffSince === 0) {
        this.possibleOffSince = now;
        return { state: this.displayStateFor(this.lastConfirmedState) };
      }

      if (now - this.possibleOffSince < OFF_CONFIRM_MS) {
        return { state: this.displayStateFor(this.lastConfirmedState) };
      }
    }

    this.possibleOffSince = 0;
    this.lastConfirmedState = "off";
    return { state: IGNITION_STATES.off };
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    const snapshot = this.snapshot;
    const vehicleId = snapshot.vehicleId;

    if (
      !snapshot.connected
      || !snapshot.vehicle
      || !vehicleId
      || this.pressedVehicleId
      || readIgnitionState(snapshot.vehicle) === undefined
    ) {
      return;
    }

    this.pressedVehicleId = vehicleId;
    this.possibleOffSince = 0;
    this.telemetry.sendEventForVehicleDetached(
      vehicleId,
      "MotorStartStop",
      "press"
    );
  }

  override onKeyUp(_ev: KeyUpEvent): void {
    const vehicleId = this.pressedVehicleId;
    this.pressedVehicleId = undefined;
    this.possibleOffSince = 0;

    if (!vehicleId) {
      return;
    }

    this.telemetry.sendEventForVehicleDetached(
      vehicleId,
      "MotorStartStop",
      "release"
    );
    this.refreshTelemetrySoon();
  }

  override dispose(): void {
    const vehicleId = this.pressedVehicleId;
    this.pressedVehicleId = undefined;

    if (vehicleId) {
      this.telemetry.sendEventForVehicleDetached(
        vehicleId,
        "MotorStartStop",
        "release"
      );
    }

    super.dispose();
  }

  private displayStateFor(state: IgnitionState | undefined): number {
    switch (state) {
      case "off":
        return IGNITION_STATES.off;
      case "ignition":
        return IGNITION_STATES.ignition;
      case "engine":
        return IGNITION_STATES.engine;
      default:
        return IGNITION_STATES.offline;
    }
  }
}
