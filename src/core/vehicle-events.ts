import type { VehicleTelemetry } from "./telemetry";
import { findVehicleButton } from "./vehicle-buttons";
import { vehicleIdentityContains } from "./vehicle-identity";

const LEGACY_DOOR_EVENTS = [
  "DoorFrontOpenClose",
  "DoorMiddleOpenClose",
  "DoorRearOpenClose",
  "DoorFourthOpenClose"
] as const;

const DOOR_EVENT_CANDIDATES: readonly (readonly string[])[] = [
  ["DoorFrontOpenClose", "DoorFrontOpenCloseButton"],
  ["DoorMiddleOpenClose", "MiddleDoorOpenClose"],
  ["DoorRearOpenClose", "RearDoorOpenClose"],
  ["DoorFourthOpenClose", "FourthDoorOpenClose"]
];

function listedAction(
  vehicle: VehicleTelemetry | undefined,
  buttonNames: readonly string[],
  candidates: readonly string[]
): string | undefined {
  for (const buttonName of buttonNames) {
    const actions = findVehicleButton(vehicle, buttonName)?.Actions;

    if (!Array.isArray(actions)) {
      continue;
    }

    for (const candidate of candidates) {
      const exact = actions.find((action) => action === candidate);

      if (exact) {
        return exact;
      }

      const normalized = candidate.toLowerCase();
      const insensitive = actions.find(
        (action) => action.trim().toLowerCase() === normalized
      );

      if (insensitive) {
        return insensitive;
      }
    }
  }

  return undefined;
}

/**
 * Verwendet ausschließlich die vom konkreten Fahrzeug gemeldeten Events der
 * Haltestellenbremse. Ein Toggle hat Vorrang; bei getrennten Ein-/Aus-Events
 * entscheidet allein der bestaetigte aktuelle Zustand über das Ziel.
 */
export function resolveStopBrakeEvent(
  vehicle: VehicleTelemetry | undefined,
  active: boolean
): string | undefined {
  const toggle = listedAction(
    vehicle,
    ["Stop Brake"],
    ["StopBrakeOnOff"]
  );

  if (toggle) {
    return toggle;
  }

  return listedAction(
    vehicle,
    ["Stop Brake"],
    active
      ? ["StopBrakeOff", "BusStopBrakeOff"]
      : ["StopBrakeOn", "BusStopBrakeOn"]
  );
}

/**
 * Verwendet zuerst den vom konkreten Door-N-Button gemeldeten Event. Die
 * bisherigen Namen bleiben als Legacy-Fallback erhalten, damit Fahrzeuge mit
 * unvollstaendiger Buttonliste nicht durch die neue Erkennung beeintraechtigt
 * werden.
 */
export function resolveDoorToggleEvent(
  vehicle: VehicleTelemetry | undefined,
  doorIndex: number
): string | undefined {
  // Beim Scania kann der Fahrer laut Praxistest ausschließlich die erste Tür
  // direkt bedienen. Die zwar gelisteten hinteren Events bewirken dort keine
  // Zustandsänderung und dürfen deshalb nicht als steuerbar angeboten werden.
  if (vehicleIdentityContains(vehicle, "scania") && doorIndex > 0) {
    return undefined;
  }

  // Der Urbino meldet die physischen Türen 2 und 4 in der Steuerzuordnung
  // vertauscht. Nur der Eventpfad wird getauscht; die physische doors[]-
  // Rückmeldung bleibt an ihrem tatsächlichen Index.
  const advertisedDoorIndex = vehicleIdentityContains(vehicle, "urbino")
    ? doorIndex === 1
      ? 3
      : doorIndex === 3
        ? 1
        : doorIndex
    : doorIndex;
  const candidates = DOOR_EVENT_CANDIDATES[advertisedDoorIndex];
  const fallback = LEGACY_DOOR_EVENTS[advertisedDoorIndex];

  if (!candidates || !fallback) {
    return undefined;
  }

  return listedAction(
    vehicle,
    [`Door ${advertisedDoorIndex + 1}`],
    candidates
  )
    ?? fallback;
}

export function resolveAutomaticDoorClosingEvent(
  vehicle: VehicleTelemetry | undefined
): string | undefined {
  return listedAction(
    vehicle,
    ["Automatic Door Closing"],
    [
      "ToggleAutomaticRearDoorClosing",
      "ToggleAutoclose",
      "PreventRearAuto"
    ]
  ) ?? "ToggleAutomaticRearDoorClosing";
}

export function resolveAutomaticKneelingEvent(
  vehicle: VehicleTelemetry | undefined
): string | undefined {
  if (vehicleIdentityContains(vehicle, "scania")) {
    return undefined;
  }

  return listedAction(
    vehicle,
    ["Automatic Kneeling"],
    [
      "Pedestrians",
      "toggleAutoKneeling",
      "Autokneeling",
      "ToggleAutomaticKneeling"
    ]
  ) ?? "Pedestrians";
}

export function resolveManualKneelingEvent(
  vehicle: VehicleTelemetry | undefined,
  targetLowered: boolean
): string | undefined {
  // Beim Scania ist ausschließlich das Kneeling-Paar mechanisch wirksam. Die
  // Events müssen gedrückt gehalten werden; die getrennten Lifting-Events
  // werden deshalb nicht als Fallback vermischt.
  if (vehicleIdentityContains(vehicle, "scania")) {
    return listedAction(
      vehicle,
      ["Kneeling"],
      [targetLowered ? "KneelDown" : "KneelUp"]
    );
  }

  const candidates = targetLowered
    ? ["KneelDown", "LiftDown"]
    : ["KneelUp", "LiftUp"];

  return listedAction(vehicle, ["Kneeling", "Lifting"], candidates)
    ?? (targetLowered ? "KneelDown" : "KneelUp");
}

/** Beim Scania wurde nur der gehaltene Press-/Release-Pfad mechanisch bestätigt. */
export function manualKneelingRequiresHold(
  vehicle: VehicleTelemetry | undefined
): boolean {
  return vehicleIdentityContains(vehicle, "scania");
}

export function resolvePassengerLightToggleEvent(
  vehicle: VehicleTelemetry | undefined
): string | undefined {
  return listedAction(
    vehicle,
    [
      "InteriorLightControl 1",
      "Interior Light",
      "InteriorLightLevel",
      "InteriorLightLowerDeck"
    ],
    ["TogglePassengersLight"]
  ) ?? "TogglePassengersLight";
}

/**
 * Diese aufgenommenen Fahrzeugfamilien bedienen AUS/GEDIMMT/HELL im Spiel
 * ueber dieselbe Taste. Der Event schaltet deshalb jeweils genau eine reale
 * Stufe weiter; er ist kein binaerer Ein-/Aus-Schalter und auch kein direkter
 * Zielstufenbefehl.
 *
 * Der eCitaro bleibt bewusst ausgenommen: Er besitzt weiterhin die bewaehrte
 * getrennte Ein-/Aus- und Helligkeitssteuerung. Unbekannte Fahrzeuge behalten
 * ebenfalls die bisherige Legacy-Aufloesung.
 */
export function usesCyclicPassengerLightControl(
  vehicle: VehicleTelemetry | undefined
): boolean {
  return ["ebusco", "urbino", "scania", "man"]
    .some((identity) => vehicleIdentityContains(vehicle, identity));
}

export function resolvePassengerLightOffEvent(
  vehicle: VehicleTelemetry | undefined
): string | undefined {
  const direct = listedAction(
    vehicle,
    ["Interior Light", "InteriorLightLevel"],
    ["InteriorLightOff"]
  );

  if (direct) {
    return direct;
  }

  // Beim Urbino bestaetigt der Hauptbutton den Ein-/Aus-Zustand eindeutig.
  // Ein bedingter Toggle bei bestaetigt aktivem Licht ist deshalb eine sichere
  // Direktwahl auf AUS; fuer alle anderen Familien bleibt der unbekannte
  // Zielpfad weiterhin blockiert.
  return vehicleIdentityContains(vehicle, "urbino")
    ? resolvePassengerLightToggleEvent(vehicle)
    : undefined;
}

/**
 * Der Ebusco benötigt für alle drei bestätigten Zielstufen Press/Release.
 * Beim Citea bleibt ausschließlich der direkte Aus-Event bestätigt; Ein wird
 * über den echten Hauptschalter erreicht, während keine getrennte Stufe mehr
 * behauptet wird.
 */
export function passengerLightTargetRequiresPressRelease(
  vehicle: VehicleTelemetry | undefined
): boolean {
  return vehicleIdentityContains(vehicle, "ebusco")
    || vehicleIdentityContains(vehicle, "citea");
}

export function resolvePassengerLightLevelEvent(
  vehicle: VehicleTelemetry | undefined,
  level: "dim" | "bright"
): string | undefined {
  // Der Citea listet beide Stufen-Events weiterhin, der aktuelle Live-Abgleich
  // zeigt jedoch ausschließlich Aus und einen aktiven Lichtzustand. Gelistete
  // Namen allein dürfen nicht als bestätigte Zielstufen angeboten werden.
  if (vehicleIdentityContains(vehicle, "citea")) {
    return undefined;
  }

  // Diese Familien besitzen reale Lichtstufen, bedienen sie im Spiel aber
  // ueber einen gemeinsamen zyklischen Taster. Die gelisteten Einzel-Events
  // duerfen daher nicht als direkt waehlbare Zielstufen ausgegeben werden.
  if (
    vehicleIdentityContains(vehicle, "scania")
    || vehicleIdentityContains(vehicle, "man")
  ) {
    return undefined;
  }

  const candidates = level === "dim"
    ? ["InteriorLightDim", "InteriorLightDimmed", "INTLightDim"]
    : ["InteriorLightBright", "INTLightFull"];

  return listedAction(
    vehicle,
    [
      "InteriorLightControl 2",
      "Interior Light",
      "InteriorLightLevel",
      level === "dim" ? "Interior Light Dim" : "Interior Light Full"
    ],
    candidates
  );
}

export type PassengerLightTarget = "off" | "dim" | "bright";

/**
 * Übersetzt ausschließlich beim MAN einen gespeicherten Legacy-Umschalter in
 * ein gemeinsames Ziel für beide Decks. Aktives oder gemischtes Licht wird
 * ausgeschaltet; gemeinsames Aus wird auf die erste reale Stufe Gedimmt
 * geschaltet. Andere Fahrzeuge behalten ihren vorhandenen echten Toggle.
 */
export function resolvePassengerLightToggleTarget(
  vehicle: VehicleTelemetry | undefined,
  currentState: PassengerLightTarget | "on" | undefined
): PassengerLightTarget | undefined {
  if (!vehicleIdentityContains(vehicle, "man") || currentState === undefined) {
    return undefined;
  }

  return currentState === "off" ? "dim" : "off";
}

function manPassengerLightLevel(
  vehicle: VehicleTelemetry | undefined,
  buttonName: string
): number | undefined {
  const state = String(findVehicleButton(vehicle, buttonName)?.State ?? "")
    .trim()
    .toLowerCase();

  if (state === "off") return 0;
  if (state === "dim" || state === "dimmed") return 1;
  if (state === "bright") return 2;
  return undefined;
}

/**
 * Erzeugt beim MAN aus den getrennt rückgemeldeten Unter-/Oberdeckstufen eine
 * exakte Zielsequenz. Beide Bereiche werden additiv bedient; ein gemischter
 * Ausgangszustand wird nicht als gemeinsame Helligkeit ausgegeben.
 */
export function resolvePassengerLightTargetEvents(
  vehicle: VehicleTelemetry | undefined,
  target: PassengerLightTarget
): string[] | undefined {
  return resolvePassengerLightTargetEventBatches(vehicle, target)?.flat();
}

/**
 * Gruppiert beim MAN die zusammengehörigen Schritte von Unter- und Oberdeck.
 * Beide echten Events gehören in dieselbe Helligkeitsrunde. Die Ausführung
 * hält innerhalb der Runde den live ermittelten kurzen Sicherheitsabstand ein,
 * weil The Bus parallele Anfragen verwirft. Scania behält den bewährten
 * seriellen Pfad unverändert.
 */
export function resolvePassengerLightTargetEventBatches(
  vehicle: VehicleTelemetry | undefined,
  target: PassengerLightTarget
): string[][] | undefined {
  const isMan = vehicleIdentityContains(vehicle, "man");
  const isScania = vehicleIdentityContains(vehicle, "scania");

  if (!isMan && !isScania) {
    return undefined;
  }

  const targetLevel = isMan
    ? target === "off" ? 0 : target === "dim" ? 1 : 2
    // Beim Scania liegt Aus zwischen Hell und Gedimmt:
    // Down: Gedimmt -> Aus -> Hell, Up in Gegenrichtung.
    : target === "bright" ? 0 : target === "off" ? 1 : 2;
  const decks = isMan
    ? [
      {
        button: "InteriorLightLowerDeck",
        up: "LDPassengersLightUp",
        down: "LDPassengersLightDown"
      },
      {
        button: "InteriorLightUpperDeck",
        up: "UDPassengersLightUp",
        down: "UDPassengersLightDown"
      }
    ] as const
    : [
      {
        button: "InteriorLightControl 1",
        up: "LightingFrontInteriorUp",
        down: "LightingFrontInteriorDown"
      },
      {
        button: "InteriorLightControl 2",
        up: "LightingBackInteriorUp",
        down: "LightingBackInteriorDown"
      }
    ] as const;
  const eventsByArea: string[][] = [];

  for (const deck of decks) {
    const currentLevel = isMan
      ? manPassengerLightLevel(vehicle, deck.button)
      : (() => {
        const state = String(findVehicleButton(vehicle, deck.button)?.State ?? "")
          .trim()
          .toLowerCase();

        if (state === "tertiary") return 0;
        if (state === "primary") return 1;
        if (state === "secondary") return 2;
        return undefined;
      })();

    if (currentLevel === undefined) {
      return undefined;
    }

    const difference = targetLevel - currentLevel;

    if (difference === 0) {
      continue;
    }

    const candidate = difference > 0 ? deck.up : deck.down;
    const eventName = listedAction(vehicle, [deck.button], [candidate]);

    if (!eventName) {
      return undefined;
    }

    eventsByArea.push(Array.from(
      { length: Math.abs(difference) },
      () => eventName
    ));
  }

  if (!isMan) {
    return eventsByArea.flatMap((events) => events.map((eventName) => [eventName]));
  }

  const rounds = Math.max(0, ...eventsByArea.map((events) => events.length));

  return Array.from({ length: rounds }, (_, round) =>
    eventsByArea
      .map((events) => events[round])
      .filter((eventName): eventName is string => eventName !== undefined)
  );
}
