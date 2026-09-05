import { normalizeControlBoolean } from "./driving-controls";
import type { VehicleButton, VehicleTelemetry } from "./telemetry";
import { vehicleIdentityContains } from "./vehicle-identity";

export type HvacMode =
  | "climate"
  | "ac-mode"
  | "rear"
  | "circulation"
  | "circulation-front"
  | "ventilation"
  | "temperature-up"
  | "temperature-down"
  | "fan"
  | "fan-down"
  | "airflow-left"
  | "airflow-right";

export type HvacDialMode = "temperature" | "fan-speed" | "airflow";

export type HvacSwitchKind =
  | "climate"
  | "ac-mode"
  | "rear"
  | "circulation"
  | "circulation-front";

export type HvacCommand = {
  events: string[];
  targetTemperatureC?: number;
  targetFanPercent?: number;
  targetVentilationStage?: number;
  targetAirflowStage?: number;
};

export type HvacState = {
  climateAvailable: boolean;
  climateEnabled?: boolean;
  climateToggleEvent?: string;
  acModeAvailable: boolean;
  coolingEnabled?: boolean;
  rearAvailable: boolean;
  rearEnabled?: boolean;
  circulationAvailable: boolean;
  circulationEnabled?: boolean;
  frontCirculationAvailable: boolean;
  frontCirculationEnabled?: boolean;
  temperatureAvailable: boolean;
  temperatureC?: number;
  temperatureControlAvailable: boolean;
  fanAvailable: boolean;
  fanPercent?: number;
  fanStagePercent?: number;
  fanControlAvailable: boolean;
  fanControlKind?: "speed" | "ventilation";
  ventilationAvailable: boolean;
  ventilationEnabled?: boolean;
  ventilationStage?: number;
  ventilationStageCount?: number;
  airflowAvailable: boolean;
  airflowStage?: number;
  airflowStageCount?: number;
};

const FAN_STEPS = [0, 20, 40, 60, 80, 100] as const;

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number"
    ? value
    : Number(String(value).trim().replace(",", "."));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function buttonsOf(vehicle: VehicleTelemetry | undefined): VehicleButton[] {
  const buttons = vehicle?.Buttons;

  if (Array.isArray(buttons)) {
    return buttons.filter(Boolean);
  }

  if (!buttons || typeof buttons !== "object") {
    return [];
  }

  return Object.entries(buttons).map(([name, button]) => ({
    ...button,
    Name: button.Name ?? name
  }));
}

function actionsOf(button: VehicleButton | undefined): string[] {
  return (button?.Actions ?? []).filter((eventName) => {
    const normalized = fold(eventName);
    return normalized.length > 0 && normalized !== "none";
  });
}

function findBestButton(
  vehicle: VehicleTelemetry | undefined,
  score: (button: VehicleButton) => number
): VehicleButton | undefined {
  let best: VehicleButton | undefined;
  let bestScore = 0;

  for (const button of buttonsOf(vehicle)) {
    const candidateScore = score(button);
    if (candidateScore > bestScore) {
      best = button;
      bestScore = candidateScore;
    }
  }

  return best;
}

function findNamedButton(
  vehicle: VehicleTelemetry | undefined,
  exactNames: readonly string[],
  actionNames: readonly string[] = []
): VehicleButton | undefined {
  const normalizedNames = new Set(exactNames.map(fold));
  const normalizedActions = new Set(actionNames.map(fold));

  return findBestButton(vehicle, (button) => {
    if (normalizedNames.has(fold(button.Name))) {
      return 100;
    }

    return actionsOf(button).some((eventName) => normalizedActions.has(fold(eventName)))
      ? 90
      : 0;
  });
}

function isClimateToken(value: string): boolean {
  return value.includes("aircondition")
    || value.includes("airconditioning")
    || value.includes("climate")
    || value.includes("hvac")
    || value === "ac";
}

function findClimateButton(
  vehicle: VehicleTelemetry | undefined
): VehicleButton | undefined {
  return findBestButton(vehicle, (button) => {
    const name = fold(button.Name);
    const actions = actionsOf(button).map(fold);
    const toggle = actions.some(
      (action) => action.includes("toggle") && isClimateToken(action)
    );

    if (toggle) {
      return 100;
    }

    if (
      isClimateToken(name)
      && !name.includes("temperature")
      && !name.includes("temp")
      && !name.includes("fan")
      && !name.includes("blower")
      && !name.includes("rear")
      && !name.includes("circulation")
      && !name.includes("mode")
      && !name.includes("airflow")
    ) {
      return 30;
    }

    return 0;
  });
}

function findAcModeButton(vehicle: VehicleTelemetry | undefined): VehicleButton | undefined {
  return findNamedButton(vehicle, ["AC 1 Mode", "AC Mode"], ["ACMode"]);
}

function findRearButton(vehicle: VehicleTelemetry | undefined): VehicleButton | undefined {
  return findNamedButton(vehicle, ["AC Rear", "Rear AC", "Rear Climate"], ["ACRear"]);
}

function findCirculationButton(vehicle: VehicleTelemetry | undefined): VehicleButton | undefined {
  return findNamedButton(
    vehicle,
    ["AC 1 Circulation", "AC Circulation", "Air Circulation"],
    ["ACCirculation"]
  );
}

function findFrontCirculationButton(vehicle: VehicleTelemetry | undefined): VehicleButton | undefined {
  return findNamedButton(
    vehicle,
    ["AC Circulation Front", "Front AC Circulation", "Front Air Circulation"],
    ["ACCirculationFront"]
  );
}

function findTemperatureButton(
  vehicle: VehicleTelemetry | undefined
): VehicleButton | undefined {
  return findBestButton(vehicle, (button) => {
    const name = fold(button.Name);
    const actions = actionsOf(button).map(fold);
    const hasTemperatureAction = actions.some(
      (action) => action.includes("settemp")
        || action.includes("temperatureplus")
        || action.includes("temperatureminus")
        || action.includes("airconditionplus")
        || action.includes("airconditionminus")
    );

    if (hasTemperatureAction) {
      return 100;
    }

    if (
      (name.includes("temperature") || name.includes("temp"))
      && (isClimateToken(name) || name.includes("cabin"))
    ) {
      return 50;
    }

    return 0;
  });
}

function findFanSpeedButton(
  vehicle: VehicleTelemetry | undefined
): VehicleButton | undefined {
  return findBestButton(vehicle, (button) => {
    const name = fold(button.Name);
    const actions = actionsOf(button).map(fold);
    const isSpeedName = name.includes("fanspeed")
      || name.includes("blower")
      || name.includes("luefterstufe")
      || name.includes("ventilationspeed");
    const isSpeedAction = actions.some(
      (action) => action.includes("fanspeed")
        || action.includes("blower")
        || action.includes("luefterstufe")
    );
    const hasValue = numberValue(button.Value) !== undefined;

    if (isSpeedName && hasValue) {
      return 100;
    }

    if (isSpeedAction && hasValue) {
      return 90;
    }

    if (isSpeedName || isSpeedAction) {
      return 50;
    }

    return 0;
  });
}

function findVentilationButton(
  vehicle: VehicleTelemetry | undefined
): VehicleButton | undefined {
  return findBestButton(vehicle, (button) => {
    const name = fold(button.Name);
    const tooltip = fold(button.Tooltip);
    const actions = actionsOf(button).map(fold);
    const states = (button.States ?? []).map(fold).filter(Boolean);
    const currentState = fold(button.State);
    const hasThreeStates = states.length === 3;
    const stateIsKnown = states.includes(currentState);
    const hasCycleEvent = actions.some((action) =>
      action === "fans"
      || action === "ventilation"
      || action === "automaticventilation"
      || action === "autoventilation"
    );
    const identifiesVentilation = name === "fans1"
      || name === "fans"
      || name.includes("automaticventilation")
      || name.includes("autoventilation")
      || tooltip.includes("automatischeventilation")
      || tooltip.includes("automaticventilation");

    return hasThreeStates && stateIsKnown && hasCycleEvent && identifiesVentilation
      ? 100
      : 0;
  });
}

function findAirflowButton(vehicle: VehicleTelemetry | undefined): VehicleButton | undefined {
  return findBestButton(vehicle, (button) => {
    const name = fold(button.Name);
    const actions = actionsOf(button).map(fold);
    const directional = actions.some((action) =>
      action.includes("airflow") && (action.includes("left") || action.includes("right"))
    );

    if (directional) {
      return 100;
    }

    return name.includes("airflow") && !name.includes("circulation") ? 40 : 0;
  });
}

function parseTemperature(value: unknown): number | undefined {
  const parsed = numberValue(value);
  if (parsed === undefined) {
    return undefined;
  }

  const temperature = Math.abs(parsed) >= 100 ? parsed / 10 : parsed;
  return temperature >= 5 && temperature <= 50
    ? Math.round(temperature * 10) / 10
    : undefined;
}

function parseFanPercent(value: unknown): number | undefined {
  const parsed = numberValue(value);
  if (parsed === undefined) {
    return undefined;
  }

  const percent = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return percent >= 0 && percent <= 100
    ? Math.max(0, Math.min(100, percent))
    : undefined;
}

function fanStage(percent: number | undefined): number | undefined {
  if (percent === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(percent / 20) * 20));
}

function twoStateEnabled(button: VehicleButton | undefined): boolean | undefined {
  if (!button) {
    return undefined;
  }

  const tooltip = fold(button.Tooltip);
  if (
    tooltip.includes("ausschalten")
    || tooltip.includes("deaktivieren")
    || tooltip.includes("turnoff")
    || tooltip.includes("disable")
  ) {
    return true;
  }

  if (
    tooltip.includes("einschalten")
    || tooltip.includes("aktivieren")
    || tooltip.includes("turnon")
    || tooltip.includes("enable")
  ) {
    return false;
  }

  const direct = normalizeControlBoolean(button.State);
  if (direct !== undefined) {
    return direct;
  }

  const state = fold(button.State);
  const states = (button.States ?? []).map(fold);
  if (states.length === 2) {
    const index = states.indexOf(state);
    if (index >= 0) {
      return index === 1;
    }
  }

  return undefined;
}

function coolingEnabled(button: VehicleButton | undefined): boolean | undefined {
  if (!button) {
    return undefined;
  }

  const tooltip = fold(button.Tooltip);
  if (tooltip.includes("zumkuhlmoduswechseln") || tooltip.includes("switchtocooling")) {
    return false;
  }

  if (tooltip.includes("zumheizmoduswechseln") || tooltip.includes("switchtoheating")) {
    return true;
  }

  return twoStateEnabled(button);
}

function eventOf(button: VehicleButton | undefined, names: readonly string[]): string | undefined {
  const candidates = new Set(names.map(fold));
  return actionsOf(button).find((eventName) => candidates.has(fold(eventName)));
}

function climateToggleEvent(button: VehicleButton | undefined): string | undefined {
  const stage = indexedStage(button);

  if (stage && stage.count > 2) {
    return actionsOf(button).find((eventName) => {
      const action = fold(eventName);
      return stage.current === 1
        ? action.includes("airconditionfakeright")
        : action.includes("airconditionfakeleft");
    });
  }

  return actionsOf(button).find((eventName) => {
    const action = fold(eventName);
    return action.includes("toggle") && isClimateToken(action);
  }) ?? actionsOf(button).find((eventName) => isClimateToken(fold(eventName)));
}

function climateEnabledState(
  button: VehicleButton | undefined
): boolean | undefined {
  const stage = indexedStage(button);

  if (stage && stage.count > 2) {
    return stage.current > 1;
  }

  return twoStateEnabled(button);
}

function climateSwitchCommand(
  button: VehicleButton | undefined
): HvacCommand | undefined {
  const stage = indexedStage(button);

  if (stage && stage.count > 2) {
    const eventName = climateToggleEvent(button);

    if (!eventName) {
      return undefined;
    }

    // Beim vierstufigen Scania-Regler schaltet Rechts von AUS auf Stufe 1.
    // Zum Ausschalten wird über den echten Links-Event stufenweise bis AUS
    // zurückgegangen. Der sichtbare Zustand folgt weiterhin der Telemetrie.
    const repeats = stage.current === 1 ? 1 : stage.current - 1;
    return {
      events: Array.from({ length: repeats }, () => eventName)
    };
  }

  const eventName = climateToggleEvent(button);
  return eventName ? { events: [eventName] } : undefined;
}

function parseSetTemperatureEvent(eventName: string): number | undefined {
  const action = fold(eventName);
  const match = action.match(/(?:set|select)(?:aircondition|airconditioning|climate|hvac|ac)?(?:temperature|temp)(\d{2,4})$/)
    ?? action.match(/settemp(\d{2,4})$/);
  return match ? parseTemperature(match[1]) : undefined;
}

function temperatureStep(button: VehicleButton): number | undefined {
  const values = [
    ...(button.States ?? []).map(parseTemperature),
    ...actionsOf(button).map(parseSetTemperatureEvent)
  ].filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const unique = [...new Set(values)];
  const steps = unique.slice(1)
    .map((value, index) => Math.round((value - unique[index]) * 10) / 10)
    .filter((value) => value > 0);

  return steps.length > 0 ? Math.min(...steps) : undefined;
}

function directionEvent(
  button: VehicleButton,
  direction: 1 | -1
): string | undefined {
  return actionsOf(button).find((eventName) => {
    const action = fold(eventName);
    const temperatureAction = action.includes("temperature")
      || action.includes("temp")
      || action.includes("aircondition");
    if (!temperatureAction || parseSetTemperatureEvent(eventName) !== undefined) {
      return false;
    }

    return direction > 0
      ? action.includes("plus") || action.includes("up") || action.includes("increase")
      : action.includes("minus") || action.includes("down") || action.includes("decrease");
  });
}

function parseSetFanEvent(eventName: string): number | undefined {
  const action = fold(eventName);
  const match = action.match(/(?:set|select)(?:ac|climate|hvac)?(?:fanspeed|fanlevel|blower|luefterstufe)(\d{1,3})$/);
  if (!match) {
    return undefined;
  }

  const percent = Number(match[1]);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? percent
    : undefined;
}

function allActions(vehicle: VehicleTelemetry | undefined): string[] {
  return buttonsOf(vehicle).flatMap(actionsOf);
}

function ventilationCycleEvent(button: VehicleButton | undefined): string | undefined {
  return actionsOf(button).find((eventName) => {
    const action = fold(eventName);
    return action === "fans"
      || action === "ventilation"
      || action === "automaticventilation"
      || action === "autoventilation";
  });
}

function indexedStage(button: VehicleButton | undefined): { current: number; count: number } | undefined {
  if (!button) {
    return undefined;
  }

  const states = (button.States ?? []).map(fold).filter(Boolean);
  const index = states.indexOf(fold(button.State));
  if (states.length < 2 || index < 0) {
    return undefined;
  }

  return { current: index + 1, count: states.length };
}

function ventilationStage(button: VehicleButton | undefined): { current: number; count: number } | undefined {
  const stage = indexedStage(button);
  return stage?.count === 3 ? stage : undefined;
}

function airflowDirectionEvent(
  button: VehicleButton | undefined,
  direction: 1 | -1
): string | undefined {
  return actionsOf(button).find((eventName) => {
    const action = fold(eventName);
    if (!action.includes("airflow")) {
      return false;
    }

    return direction > 0
      ? action.includes("right") || action.includes("plus") || action.includes("next")
      : action.includes("left") || action.includes("minus") || action.includes("previous");
  });
}

function listedFanDirectionEvent(
  button: VehicleButton | undefined,
  direction: 1 | -1
): string | undefined {
  return actionsOf(button).find((eventName) => {
    const action = fold(eventName);
    if (!action.includes("fan") && !action.includes("blower") && !action.includes("luefter")) {
      return false;
    }

    return direction > 0
      ? action.includes("right") || action.includes("plus") || action.includes("up") || action.includes("increase")
      : action.includes("left") || action.includes("minus") || action.includes("down") || action.includes("decrease");
  });
}

function listedPassengerFanDirectionEvent(
  vehicle: VehicleTelemetry | undefined,
  direction: 1 | -1
): string | undefined {
  return allActions(vehicle).find((eventName) => {
    const action = fold(eventName);
    const passengerFan = action.includes("passfanspeed")
      || action.includes("passengerfanspeed")
      || action.includes("cabinfanspeed");

    if (!passengerFan) {
      return false;
    }

    return direction > 0
      ? action.includes("up") || action.includes("plus") || action.includes("increase")
      : action.includes("down") || action.includes("minus") || action.includes("decrease");
  });
}

export function normalizeHvacMode(value: unknown): HvacMode {
  switch (value) {
    case "ac-mode":
    case "rear":
    case "circulation":
    case "circulation-front":
    case "ventilation":
    case "temperature-up":
    case "temperature-down":
    case "fan":
    case "fan-down":
    case "airflow-left":
    case "airflow-right":
      return value;
    default:
      return "climate";
  }
}

export function normalizeHvacDialMode(value: unknown): HvacDialMode {
  switch (value) {
    case "fan-speed":
    case "airflow":
      return value;
    default:
      return "temperature";
  }
}

export function readHvacState(vehicle: VehicleTelemetry | undefined): HvacState {
  const climateButton = findClimateButton(vehicle);
  const acModeButton = findAcModeButton(vehicle);
  const rearButton = findRearButton(vehicle);
  const circulationButton = findCirculationButton(vehicle);
  const frontCirculationButton = findFrontCirculationButton(vehicle);
  const temperatureButton = findTemperatureButton(vehicle);
  const fanButton = findFanSpeedButton(vehicle);
  const ventilationButton = findVentilationButton(vehicle);
  const airflowButton = findAirflowButton(vehicle);
  const currentVentilationStage = ventilationStage(ventilationButton);
  const currentAirflowStage = indexedStage(airflowButton);
  const temperatureC = parseTemperature(temperatureButton?.State);
  const fanPercent = parseFanPercent(fanButton?.Value)
    ?? parseFanPercent(fanButton?.State);
  const fanDirectionAvailable = Boolean(
    (
      fanButton
      && fanPercent !== undefined
      && (
      (listedFanDirectionEvent(fanButton, 1) && listedFanDirectionEvent(fanButton, -1))
      || allActions(vehicle).some((eventName) => parseSetFanEvent(eventName) !== undefined)
      )
    )
    || (
      listedPassengerFanDirectionEvent(vehicle, 1)
      && listedPassengerFanDirectionEvent(vehicle, -1)
    )
  );

  return {
    climateAvailable: Boolean(climateButton),
    climateEnabled: climateEnabledState(climateButton),
    climateToggleEvent: climateToggleEvent(climateButton),
    acModeAvailable: Boolean(eventOf(acModeButton, ["ACMode"])),
    coolingEnabled: coolingEnabled(acModeButton),
    rearAvailable: Boolean(eventOf(rearButton, ["ACRear"])),
    rearEnabled: twoStateEnabled(rearButton),
    circulationAvailable: Boolean(eventOf(circulationButton, ["ACCirculation"])),
    circulationEnabled: twoStateEnabled(circulationButton),
    frontCirculationAvailable: Boolean(eventOf(frontCirculationButton, ["ACCirculationFront"])),
    frontCirculationEnabled: twoStateEnabled(frontCirculationButton),
    temperatureAvailable: temperatureC !== undefined,
    temperatureC,
    temperatureControlAvailable: Boolean(
      temperatureButton
      && (directionEvent(temperatureButton, 1) || directionEvent(temperatureButton, -1))
    ),
    fanAvailable: fanPercent !== undefined
      || currentVentilationStage !== undefined
      || fanDirectionAvailable,
    fanPercent,
    fanStagePercent: fanStage(fanPercent),
    fanControlAvailable: fanDirectionAvailable,
    fanControlKind: fanDirectionAvailable
      ? "speed"
      : currentVentilationStage
        ? "ventilation"
        : undefined,
    ventilationAvailable: currentVentilationStage !== undefined,
    ventilationEnabled: currentVentilationStage
      ? currentVentilationStage.current > 1
      : undefined,
    ventilationStage: currentVentilationStage?.current,
    ventilationStageCount: currentVentilationStage?.count,
    airflowAvailable: Boolean(
      currentAirflowStage
      && airflowDirectionEvent(airflowButton, 1)
      && airflowDirectionEvent(airflowButton, -1)
    ),
    airflowStage: currentAirflowStage?.current,
    airflowStageCount: currentAirflowStage?.count
  };
}

export function resolveHvacSwitchCommand(
  vehicle: VehicleTelemetry | undefined,
  kind: HvacSwitchKind
): HvacCommand | undefined {
  const button = kind === "climate"
    ? findClimateButton(vehicle)
    : kind === "ac-mode"
      ? findAcModeButton(vehicle)
      : kind === "rear"
        ? findRearButton(vehicle)
        : kind === "circulation"
          ? findCirculationButton(vehicle)
          : findFrontCirculationButton(vehicle);
  if (kind === "climate") {
    return climateSwitchCommand(button);
  }

  const eventName = eventOf(button, kind === "ac-mode"
    ? ["ACMode"]
    : kind === "rear"
      ? ["ACRear"]
      : kind === "circulation"
        ? ["ACCirculation"]
        : ["ACCirculationFront"]);

  return eventName ? { events: [eventName] } : undefined;
}

export function resolveTemperatureCommand(
  vehicle: VehicleTelemetry | undefined,
  direction: 1 | -1
): HvacCommand | undefined {
  const button = findTemperatureButton(vehicle);
  const current = parseTemperature(button?.State);
  if (!button) {
    return undefined;
  }

  // Beim MAN sind die beiden von TML benannten KeyUp/KeyDown-Events im
  // Praxistest genau entgegengesetzt zur Temperaturwirkung. Nur für diese
  // technische Fahrzeugidentität wird die Richtung gedreht.
  const eventDirection = vehicleIdentityContains(vehicle, "man")
    ? direction === 1 ? -1 : 1
    : direction;
  const nativeDirection = directionEvent(button, eventDirection);

  // Einige Busse melden echte Plus-/Minus-Events, aber keinen numerischen
  // Sollwert. Der einzelne physische Regelschritt darf dann verwendet werden;
  // Anzeige und Zieltemperatur bleiben bewusst unbekannt.
  if (current === undefined) {
    return nativeDirection ? { events: [nativeDirection] } : undefined;
  }

  const target = Math.round((current + direction) * 10) / 10;

  // Der physische Regler und die Rohschnittstelle bestaetigen 0,5-Grad-
  // Schritte. Fuer die gewuenschte 1-Grad-Taste wird daher der echte
  // Plus-/Minus-Weg zweimal ausgeloest. Direkte SetTemp-Ziele sind nur noch
  // Fallback, weil sie im Live-Test nicht reagiert haben.
  if (nativeDirection) {
    const nativeStep = temperatureStep(button);
    const repeats = nativeStep && nativeStep > 0 && nativeStep <= 1
      ? Math.max(1, Math.round(1 / nativeStep))
      : 1;
    return {
      events: Array.from({ length: repeats }, () => nativeDirection),
      targetTemperatureC: target
    };
  }

  const exact = actionsOf(button)
    .map((eventName) => ({ eventName, temperature: parseSetTemperatureEvent(eventName) }))
    .find((entry) => entry.temperature !== undefined && Math.abs(entry.temperature - target) < 0.01);

  return exact
    ? { events: [exact.eventName], targetTemperatureC: target }
    : undefined;
}

export function resolveFanStepCommand(
  vehicle: VehicleTelemetry | undefined,
  direction: 1 | -1
): HvacCommand | undefined {
  const fanButton = findFanSpeedButton(vehicle);
  const percent = parseFanPercent(fanButton?.Value)
    ?? parseFanPercent(fanButton?.State);
  if (!fanButton || percent === undefined) {
    const eventName = listedPassengerFanDirectionEvent(vehicle, direction);
    return eventName ? { events: [eventName] } : undefined;
  }

  const currentStage = fanStage(percent) ?? 0;
  const currentIndex = FAN_STEPS.indexOf(currentStage as typeof FAN_STEPS[number]);
  const targetIndex = Math.max(0, Math.min(
    FAN_STEPS.length - 1,
    currentIndex + direction
  ));
  const target = FAN_STEPS[targetIndex];
  if (target === currentStage) {
    return undefined;
  }

  const eventName = listedFanDirectionEvent(fanButton, direction);
  if (eventName) {
    return {
      events: [eventName],
      targetFanPercent: target
    };
  }

  const direct = allActions(vehicle).find(
    (candidate) => parseSetFanEvent(candidate) === target
  );
  return direct
    ? { events: [direct], targetFanPercent: target }
    : undefined;
}

export function resolveFanCycleCommand(
  vehicle: VehicleTelemetry | undefined
): HvacCommand | undefined {
  const fanButton = findFanSpeedButton(vehicle);
  const percent = parseFanPercent(fanButton?.Value)
    ?? parseFanPercent(fanButton?.State);
  const currentStage = fanStage(percent);
  if (fanButton && percent !== undefined && currentStage !== undefined) {
    const currentIndex = FAN_STEPS.indexOf(currentStage as typeof FAN_STEPS[number]);
    const target = FAN_STEPS[(currentIndex + 1) % FAN_STEPS.length];
    const direct = allActions(vehicle).find(
      (eventName) => parseSetFanEvent(eventName) === target
    );
    if (direct) {
      return { events: [direct], targetFanPercent: target };
    }

  }

  return resolveFanStepCommand(vehicle, 1);
}

export function resolveVentilationCommand(
  vehicle: VehicleTelemetry | undefined
): HvacCommand | undefined {
  const ventilationButton = findVentilationButton(vehicle);
  const currentStage = ventilationStage(ventilationButton);
  const eventName = ventilationCycleEvent(ventilationButton);
  if (!currentStage || !eventName) {
    return undefined;
  }

  const enabling = currentStage.current === 1;
  const eventCount = enabling
    ? 1
    : currentStage.count - currentStage.current + 1;

  return {
    events: Array.from({ length: eventCount }, () => eventName),
    targetVentilationStage: enabling ? 2 : 1
  };
}

export function resolveAirflowCommand(
  vehicle: VehicleTelemetry | undefined,
  direction: 1 | -1
): HvacCommand | undefined {
  const button = findAirflowButton(vehicle);
  const stage = indexedStage(button);
  const eventName = airflowDirectionEvent(button, direction);
  if (!stage || !eventName) {
    return undefined;
  }

  return {
    events: [eventName],
    targetAirflowStage: Math.max(1, Math.min(stage.count, stage.current + direction))
  };
}
