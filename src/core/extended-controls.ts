import { normalizeControlBoolean, readLampPhase } from "./driving-controls";
import { findVehicleButton } from "./vehicle-buttons";
import type { VehicleButton, VehicleTelemetry } from "./telemetry";

export type RetarderMode =
  | "increase"
  | "decrease"
  | "off"
  | "level-1"
  | "level-2"
  | "level-3"
  | "level-4"
  | "level-5";

export type RetarderState = {
  available: boolean;
  level?: number;
  state?: string;
};

export type WiperMode = "increase" | "decrease";
export type WiperState = "Off" | "Interval" | "On" | "Fast";

export type SunBlindState = "up" | "down";

export type ExteriorLightMode =
  | "switch-up"
  | "switch-down"
  | "daytime"
  | "parking"
  | "headlights"
  | "high-beam"
  | "front-fog"
  | "rear-fog";

export type LightSwitchState =
  | "Off"
  | "Parking Lights"
  | "Headlights"
  | "Rear Fog Light"
  | "Front Fog Light";

export type ExteriorLightState = {
  switchState?: LightSwitchState;
  daytime?: boolean;
  parking?: boolean;
  headlights?: boolean;
  highBeam?: boolean;
  frontFog?: boolean;
  rearFog?: boolean;
};

export type TicketControlMode =
  | "atron"
  | "take-cash"
  | "coin-005"
  | "coin-010"
  | "coin-015"
  | "coin-020"
  | "coin-030"
  | "coin-050"
  | "coin-060"
  | "coin-100"
  | "coin-200"
  | "coin-400"
  | "coin-600"
  | "coin-800";

export type VehicleCommand = {
  event: string;
};

export type TicketControlDefinition = {
  buttonName: string;
  event: string;
  value: string;
};

export const RETARDER_MODES: readonly RetarderMode[] = [
  "increase",
  "decrease",
  "off",
  "level-1",
  "level-2",
  "level-3",
  "level-4",
  "level-5"
];

export const WIPER_MODES: readonly WiperMode[] = ["increase", "decrease"];

export const EXTERIOR_LIGHT_MODES: readonly ExteriorLightMode[] = [
  "switch-up",
  "switch-down",
  "daytime",
  "parking",
  "headlights",
  "high-beam",
  "front-fog",
  "rear-fog"
];

export const TICKET_CONTROL_MODES: readonly TicketControlMode[] = [
  "atron",
  "take-cash",
  "coin-005",
  "coin-010",
  "coin-015",
  "coin-020",
  "coin-030",
  "coin-050",
  "coin-060",
  "coin-100",
  "coin-200",
  "coin-400",
  "coin-600",
  "coin-800"
];

const RETARDER_LEVEL_EVENTS: Record<
  Extract<RetarderMode, `level-${number}`>,
  string
> = {
  "level-1": "RetarderLevel1",
  "level-2": "RetarderLevel2",
  "level-3": "RetarderLevel3",
  "level-4": "RetarderLevel4",
  "level-5": "RetarderLevel5"
};

const LIGHT_SWITCH_STATES = new Set<LightSwitchState>([
  "Off",
  "Parking Lights",
  "Headlights",
  "Rear Fog Light",
  "Front Fog Light"
]);

const WIPER_STATES = new Set<WiperState>([
  "Off",
  "Interval",
  "On",
  "Fast"
]);

export const TICKET_CONTROL_DEFINITIONS: Record<
  TicketControlMode,
  TicketControlDefinition
> = {
  atron: {
    buttonName: "Boardcomputer",
    event: "Select Boardcomputer",
    value: "ATRON"
  },
  "take-cash": {
    buttonName: "Cash Money",
    event: "Take Cash Money",
    value: "TAKE CASH"
  },
  "coin-005": { buttonName: "5 Cent", event: "Coins5", value: "0,05 €" },
  "coin-010": { buttonName: "10 Cent", event: "Coins10", value: "0,10 €" },
  "coin-015": { buttonName: "15 Cent", event: "Coins15", value: "0,15 €" },
  "coin-020": { buttonName: "20 Cent", event: "Coins20", value: "0,20 €" },
  "coin-030": { buttonName: "30 Cent", event: "Coins30", value: "0,30 €" },
  "coin-050": { buttonName: "50 Cent", event: "Coins50", value: "0,50 €" },
  "coin-060": { buttonName: "60 Cent", event: "Coins60", value: "0,60 €" },
  "coin-100": { buttonName: "1 Euro", event: "Coins100", value: "1,00 €" },
  "coin-200": { buttonName: "2 Euro", event: "Coins200", value: "2,00 €" },
  "coin-400": { buttonName: "4 Euro", event: "Coins400", value: "4,00 €" },
  "coin-600": { buttonName: "6 Euro", event: "Coins600", value: "6,00 €" },
  "coin-800": { buttonName: "8 Euro", event: "Coins800", value: "8,00 €" }
};

function buttonHasEvent(
  button: VehicleButton | undefined,
  event: string
): boolean {
  return Boolean(button?.Actions?.includes(event));
}

function exactState<TState extends string>(
  button: VehicleButton | undefined,
  states: ReadonlySet<TState>
): TState | undefined {
  const value = typeof button?.State === "string"
    ? button.State.trim()
    : "";
  return states.has(value as TState) ? value as TState : undefined;
}

function readLampCaseInsensitive(
  vehicle: VehicleTelemetry | undefined,
  expectedName: string
): boolean | undefined {
  const lamps = vehicle?.AllLamps;
  if (!lamps) {
    return undefined;
  }

  const normalize = (value: string) => value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/gu, "");
  const expected = normalize(expectedName);
  const key = Object.keys(lamps).find((name) => normalize(name) === expected);
  return key === undefined ? undefined : readLampPhase(vehicle, key);
}

export function normalizeRetarderMode(value: unknown): RetarderMode {
  return RETARDER_MODES.includes(value as RetarderMode)
    ? value as RetarderMode
    : "increase";
}

export function readRetarderState(
  vehicle: VehicleTelemetry | undefined
): RetarderState {
  const lever = findVehicleButton(vehicle, "Retarder Lever");
  const value = typeof lever?.State === "string" ? lever.State.trim() : "";
  const match = /^Retarder([1-5])$/u.exec(value);

  if (!match) {
    return { available: false };
  }

  return {
    available: true,
    level: Number(match[1]),
    state: value
  };
}

export function resolveRetarderCommand(
  vehicle: VehicleTelemetry | undefined,
  mode: RetarderMode
): VehicleCommand | undefined {
  const state = readRetarderState(vehicle);
  if (!state.available || state.level === undefined) {
    return undefined;
  }

  if (mode === "off") {
    const button = findVehicleButton(vehicle, "Retarder");
    return buttonHasEvent(button, "RetarderOff")
      ? { event: "RetarderOff" }
      : undefined;
  }

  const lever = findVehicleButton(vehicle, "Retarder Lever");
  if (mode === "increase") {
    return state.level < 5 && buttonHasEvent(lever, "RetarderUp")
      ? { event: "RetarderUp" }
      : undefined;
  }
  if (mode === "decrease") {
    return state.level > 1 && buttonHasEvent(lever, "RetarderDown")
      ? { event: "RetarderDown" }
      : undefined;
  }

  const event = RETARDER_LEVEL_EVENTS[mode];
  const targetLevel = Number(mode.slice(-1));
  return state.level !== targetLevel && buttonHasEvent(lever, event)
    ? { event }
    : undefined;
}

export function readSunBlindState(
  vehicle: VehicleTelemetry | undefined
): SunBlindState | undefined {
  const state = findVehicleButton(vehicle, "Window Shade")?.State;
  return state === "Primary"
    ? "up"
    : state === "Secondary"
      ? "down"
      : undefined;
}

export function resolveSunBlindCommand(
  vehicle: VehicleTelemetry | undefined
): VehicleCommand | undefined {
  const button = findVehicleButton(vehicle, "Window Shade");
  const state = readSunBlindState(vehicle);
  const event = state === "up"
    ? "WindowShadeDown"
    : state === "down"
      ? "WindowShadeUp"
      : undefined;
  return event && buttonHasEvent(button, event) ? { event } : undefined;
}

export function normalizeWiperMode(value: unknown): WiperMode {
  return WIPER_MODES.includes(value as WiperMode)
    ? value as WiperMode
    : "increase";
}

export function readWiperState(
  vehicle: VehicleTelemetry | undefined
): WiperState | undefined {
  return exactState(findVehicleButton(vehicle, "Wiper"), WIPER_STATES);
}

export function resolveWiperCommand(
  vehicle: VehicleTelemetry | undefined,
  mode: WiperMode
): VehicleCommand | undefined {
  const button = findVehicleButton(vehicle, "Wiper");
  const state = readWiperState(vehicle);
  if (!state) {
    return undefined;
  }

  const event = mode === "increase" ? "WiperUp" : "WiperDown";
  if (
    (mode === "increase" && state === "Fast")
    || (mode === "decrease" && state === "Off")
  ) {
    return undefined;
  }

  return buttonHasEvent(button, event) ? { event } : undefined;
}

export function normalizeExteriorLightMode(
  value: unknown
): ExteriorLightMode {
  return EXTERIOR_LIGHT_MODES.includes(value as ExteriorLightMode)
    ? value as ExteriorLightMode
    : "switch-up";
}

export function readExteriorLightState(
  vehicle: VehicleTelemetry | undefined
): ExteriorLightState {
  const lightSwitch = findVehicleButton(vehicle, "Light Switch");
  const highBeamButton = findVehicleButton(vehicle, "High Beam");
  const highBeamFromLamp = readLampCaseInsensitive(vehicle, "Light Travelling");
  const highBeamFromButton = highBeamButton?.State === "Secondary"
    ? true
    : highBeamButton?.State === "Primary"
      ? false
      : normalizeControlBoolean(highBeamButton?.State);

  return {
    switchState: exactState(lightSwitch, LIGHT_SWITCH_STATES),
    daytime: readLampCaseInsensitive(vehicle, "Light Daytime"),
    parking: readLampCaseInsensitive(vehicle, "Light Parking"),
    headlights: readLampCaseInsensitive(vehicle, "Light Headlight"),
    highBeam: highBeamFromLamp ?? highBeamFromButton,
    frontFog: readLampCaseInsensitive(vehicle, "Light Front Fog"),
    rearFog: readLampCaseInsensitive(vehicle, "Light Rear Fog")
  };
}

export function resolveExteriorLightCommand(
  vehicle: VehicleTelemetry | undefined,
  mode: ExteriorLightMode
): VehicleCommand | undefined {
  if (mode === "switch-up" || mode === "switch-down") {
    const button = findVehicleButton(vehicle, "Light Switch");
    if (!readExteriorLightState(vehicle).switchState) {
      return undefined;
    }
    const event = mode === "switch-up" ? "LightSwitchUp" : "LightSwitchDown";
    return buttonHasEvent(button, event) ? { event } : undefined;
  }

  if (mode === "high-beam") {
    const button = findVehicleButton(vehicle, "High Beam");
    const state = readExteriorLightState(vehicle).highBeam;
    return state !== undefined && buttonHasEvent(button, "ToggleTravellerLights")
      ? { event: "ToggleTravellerLights" }
      : undefined;
  }

  // Tagfahr-, Stand-, Abblend- und Nebellicht sind in der vorhandenen
  // eCityBus-Aufnahme echte Lampenwerte, aber keine separaten Einzel-Events.
  return undefined;
}

export function normalizeTicketControlMode(
  value: unknown
): TicketControlMode {
  return TICKET_CONTROL_MODES.includes(value as TicketControlMode)
    ? value as TicketControlMode
    : "atron";
}

export function ticketControlAvailable(
  vehicle: VehicleTelemetry | undefined,
  mode: TicketControlMode
): boolean {
  const definition = TICKET_CONTROL_DEFINITIONS[mode];
  return buttonHasEvent(
    findVehicleButton(vehicle, definition.buttonName),
    definition.event
  );
}

export function resolveTicketControlCommand(
  vehicle: VehicleTelemetry | undefined,
  mode: TicketControlMode
): VehicleCommand | undefined {
  const definition = TICKET_CONTROL_DEFINITIONS[mode];
  return ticketControlAvailable(vehicle, mode)
    ? { event: definition.event }
    : undefined;
}
