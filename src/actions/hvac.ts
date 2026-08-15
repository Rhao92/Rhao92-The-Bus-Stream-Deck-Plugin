import {
  action,
  KeyAction
} from "@elgato/streamdeck";
import { BaseConfigurableKeyAction } from "../base/base-configurable-key-action";
import {
  HvacCommand,
  HvacMode,
  normalizeHvacMode,
  readHvacState,
  resolveAirflowCommand,
  resolveFanCycleCommand,
  resolveFanStepCommand,
  resolveHvacSwitchCommand,
  resolveTemperatureCommand,
  resolveVentilationCommand
} from "../core/hvac";
import { executeHvacCommand } from "../core/hvac-command";
import { TelemetrySnapshot } from "../core/telemetry";
import { renderHvacKey } from "../hvac/hvac-renderer";

@action({ UUID: "de.rhao92.thebus-telemetry-interface.hvac-control" })
export class HvacControlAction extends BaseConfigurableKeyAction<HvacMode> {
  protected readonly defaultMode = "climate" as const;

  protected normalizeMode(mode: unknown): HvacMode {
    return normalizeHvacMode(mode);
  }

  protected createModeDisplayModel(
    mode: HvacMode,
    snapshot: TelemetrySnapshot
  ) {
    return {
      state: 0,
      title: null,
      image: renderHvacKey(mode, readHvacState(snapshot.vehicle))
    };
  }

  protected async handleModeKeyDown(
    mode: HvacMode,
    snapshot: TelemetrySnapshot,
    _key: KeyAction
  ): Promise<void> {
    if (!snapshot.vehicleId || !snapshot.vehicleReady || !snapshot.vehicle) {
      return;
    }

    let command: HvacCommand | undefined;

    switch (mode) {
      case "climate":
      case "ac-mode":
      case "rear":
      case "circulation":
      case "circulation-front":
        command = resolveHvacSwitchCommand(snapshot.vehicle, mode);
        break;
      case "temperature-up":
        command = resolveTemperatureCommand(snapshot.vehicle, 1);
        break;
      case "temperature-down":
        command = resolveTemperatureCommand(snapshot.vehicle, -1);
        break;
      case "fan":
        command = resolveFanCycleCommand(snapshot.vehicle);
        break;
      case "fan-down":
        command = resolveFanStepCommand(snapshot.vehicle, -1);
        break;
      case "ventilation":
        command = resolveVentilationCommand(snapshot.vehicle);
        break;
      case "airflow-left":
        command = resolveAirflowCommand(snapshot.vehicle, -1);
        break;
      case "airflow-right":
        command = resolveAirflowCommand(snapshot.vehicle, 1);
        break;
    }

    if (!command || command.events.length === 0) {
      return;
    }

    await executeHvacCommand(
      this.telemetry,
      snapshot.vehicleId,
      command,
      "[HvacControlAction]"
    );
  }
}
