import streamDeck from "@elgato/streamdeck";
import { HvacCommand } from "./hvac";
import { TelemetryClient } from "./telemetry";

const COMMAND_GAP_MS = 100;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function executeHvacCommand(
  telemetry: TelemetryClient,
  vehicleId: string,
  command: HvacCommand,
  warningSource: string
): Promise<boolean> {
  for (let index = 0; index < command.events.length; index += 1) {
    if (telemetry.snapshot.vehicleId !== vehicleId) {
      return false;
    }

    const eventName = command.events[index];
    const sent = await telemetry.sendEvent(eventName, "push");
    if (!sent) {
      streamDeck.logger.warn(
        `${warningSource} HVAC-Event "${eventName}" konnte nicht gesendet werden.`
      );
      return false;
    }

    telemetry.refreshSoon();
    if (index + 1 < command.events.length) {
      await delay(COMMAND_GAP_MS);
    }
  }

  return command.events.length > 0;
}
