import {
  normalizeIndicatorPosition,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../src/core/driving-controls";
import { GearStateResolver } from "../src/core/gear";
import {
  KneelingMotionTracker,
  readKneelingState,
  readKneelingWheelMetric
} from "../src/core/kneeling";
import { readRampState } from "../src/core/ramp";
import { doorAllCommandIndexes, summarizeDoorStates } from "../src/core/doors";
import { readDoorClearanceState } from "../src/core/vehicle-controls";
import { isVehicleStationary, readVehicleSpeedKmh } from "../src/core/vehicle-motion";
import { runtimeDisplayOverride } from "../src/core/runtime-display";
import {
  readHvacState,
  resolveAirflowCommand,
  resolveFanCycleCommand,
  resolveFanStepCommand,
  resolveHvacSwitchCommand,
  resolveTemperatureCommand,
  resolveVentilationCommand
} from "../src/core/hvac";
import {
  deriveVehicleReadyState,
  hasUsableRouteTelemetry,
  RouteTelemetryStabilizer,
  type VehicleTelemetry
} from "../src/core/telemetry";
import { renderHvacDial, renderHvacKey } from "../src/hvac/hvac-renderer";
import {
  readExteriorLightState,
  readRetarderState,
  readSunBlindState,
  readWiperState,
  resolveExteriorLightCommand,
  resolveRetarderCommand,
  resolveSunBlindCommand,
  resolveTicketControlCommand,
  resolveWiperCommand,
  ticketControlAvailable
} from "../src/core/extended-controls";
import {
  renderExteriorLightKey,
  renderRetarderKey,
  renderSunBlindKey,
  renderTicketControlKey,
  renderWiperKey
} from "../src/vehicle/extended-control-renderer";

function check(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(Object.is(actual, expected), `${message}: erwartet ${String(expected)}, erhalten ${String(actual)}`);
}

function vehicle(overrides: Partial<VehicleTelemetry> = {}): VehicleTelemetry {
  return {
    Buttons: [],
    AllLamps: {},
    ...overrides
  };
}

function wheels(differences: number[]): VehicleTelemetry["Wheels"] {
  return differences.flatMap((difference, index) => [
    { Location: { Z: index * 10 } },
    { Location: { Z: index * 10 + difference } }
  ]);
}

function renderedSvg(image: string): string {
  return Buffer.from(image.split(",", 2)[1] ?? "", "base64").toString("utf8");
}

// UI-05/UI-06: OFFLINE bleibt ausschließlich der Verbindungsverlust. Eine
// erreichbare Telemetrie ohne Bus zeigt zentral den neutralen --- Platzhalter.
const offlineDisplay = runtimeDisplayOverride({
  connected: false,
  online: false,
  runtimeState: "offline"
});
const noBusDisplay = runtimeDisplayOverride({
  connected: false,
  online: true,
  runtimeState: "no-bus"
});
check(Boolean(offlineDisplay), "Offline-Override fehlt");
check(Boolean(noBusDisplay), "No-Bus-Override fehlt");
check(renderedSvg(offlineDisplay!.image).includes("OFFLINE"), "Offline-Text fehlt");
check(!renderedSvg(noBusDisplay!.image).includes("OFFLINE"), "No-Bus darf nicht OFFLINE zeigen");
check(renderedSvg(noBusDisplay!.image).includes("---"), "No-Bus-Platzhalter fehlt");
equal(runtimeDisplayOverride({
  connected: true,
  online: true,
  runtimeState: "bus-ready"
}), undefined, "Bus-Ready darf keinen Runtime-Override erhalten");

// NAV-09: Ein einzelner leerer Route-Snapshot darf eine bestaetigte Route
// nicht grau schalten. Ein echter Routenverlust wird nach drei leeren
// Antworten ueber mindestens eine Sekunde weiterhin korrekt uebernommen.
const routeStabilizer = new RouteTelemetryStabilizer();
const confirmedRoute = { PathLanes: [7, 8, 9] };
let stabilizedRoute = routeStabilizer.update("Bus_A", confirmedRoute, 1_000);
equal(stabilizedRoute.route, confirmedRoute, "Bestaetigte Route wird uebernommen");
equal(stabilizedRoute.updatedAt, 1_000, "Zeitstempel der bestaetigten Route");
stabilizedRoute = routeStabilizer.update("Bus_A", { PathLanes: [] }, 1_100);
equal(stabilizedRoute.route, confirmedRoute, "Erster leerer Snapshot behaelt Route");
equal(stabilizedRoute.updatedAt, 1_000, "Leerer Snapshot frischt Route nicht kuenstlich auf");
stabilizedRoute = routeStabilizer.update("Bus_A", {}, 1_600);
equal(stabilizedRoute.route, confirmedRoute, "Zweiter leerer Snapshot behaelt Route");
stabilizedRoute = routeStabilizer.update("Bus_A", { Paths: [] }, 2_100);
equal(hasUsableRouteTelemetry(stabilizedRoute.route), false, "Bestaetigter Routenverlust wird uebernommen");
const newBusWithoutRoute = routeStabilizer.update("Bus_B", {}, 2_200);
equal(hasUsableRouteTelemetry(newBusWithoutRoute.route), false, "Neue Bus-ID erbt keine alte Route");

// HVAC-01: Die eigene Buttons-Auswertung liefert Klimaschalter,
// Solltemperatur und Lüfterwert direkt aus der Fahrzeugtelemetrie. Es gibt
// keine Fahrzeugmodell-Abfrage und keinen fest verdrahteten eCitaro-Pfad.
const evaluatedHvacVehicle = vehicle({
  Speed: 0,
  Buttons: [
    {
      Name: "Fans 1",
      Tooltip: "Automatische Ventilation",
      State: "Primary",
      Actions: ["Fans", "None"],
      States: ["Primary", "Secondary", "Tertiary"]
    },
    {
      Name: "Air Condition",
      Tooltip: "Klimaanlage ausschalten",
      State: "Secondary",
      Actions: ["ToggleAirCondition"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "AC 1 Mode",
      Tooltip: "Zum Kühlmodus wechseln",
      State: "Primary",
      Actions: ["ACMode"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "AC Rear",
      Tooltip: "Hintere Klimaanlage einschalten",
      State: "Primary",
      Actions: ["ACRear"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "AC 1 Circulation",
      Tooltip: "Luftzirkulation aktivieren",
      State: "Primary",
      Actions: ["ACCirculation"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "AC Circulation Front",
      Tooltip: "Vordere Luftzirkulation aktivieren",
      State: "Primary",
      Actions: ["ACCirculationFront"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "AC 1 AirFlow",
      State: "AC_Mode_3",
      Value: "0.673077",
      Actions: ["AC 1 AirFlowFakeLeft", "AC 1 AirFlowFakeRight"],
      States: ["AC_Mode_1", "AC_Mode_2", "AC_Mode_3", "AC_Mode_4"]
    },
    {
      Name: "Air Condition Temperature",
      State: "220",
      Value: "0.4",
      Actions: [
        "SetTemp180", "SetTemp185", "SetTemp190", "SetTemp195",
        "SetTemp200", "SetTemp205", "SetTemp210", "SetTemp215",
        "SetTemp220", "SetTemp225", "SetTemp230", "SetTemp235",
        "SetTemp240", "SetTemp245", "SetTemp250", "SetTemp255",
        "SetTemp260", "SetTemp265", "SetTemp270", "SetTemp275", "SetTemp280",
        "AirconditionMinus", "AirconditionPlus"
      ],
      States: [
        "180", "185", "190", "195", "200", "205", "210", "215",
        "220", "225", "230", "235", "240", "245", "250", "255",
        "260", "265", "270", "275", "280"
      ]
    },
    {
      Name: "AC 1 FanSpeed",
      State: "Default",
      Value: "76.233184",
      Actions: ["None"],
      States: ["Default"]
    }
  ]
});
const evaluatedHvac = readHvacState(evaluatedHvacVehicle);
equal(evaluatedHvac.climateEnabled, true, "Klimaanlage aus Tooltip als EIN erkannt");
equal(evaluatedHvac.climateToggleEvent, "ToggleAirCondition", "Echtes Klima-Toggle-Event");
equal(evaluatedHvac.temperatureC, 22, "Solltemperatur 220 wird 22,0 °C");
equal(evaluatedHvac.fanStagePercent, 80, "Lüfterwert wird auf 20-%-Stufe abgebildet");
equal(evaluatedHvac.fanControlAvailable, false, "FanSpeed ohne gemeldete Action bleibt nur lesbar");
equal(evaluatedHvac.fanControlKind, "ventilation", "Nur die separat gemeldete automatische Ventilation bleibt steuerbar");
equal(evaluatedHvac.ventilationStage, 1, "Primary wird als Ventilationsstufe 1 erkannt");
equal(evaluatedHvac.ventilationStageCount, 3, "Drei gemeldete Ventilationsstufen");
equal(evaluatedHvac.ventilationEnabled, false, "Primary wird als Automatik AUS dargestellt");
equal(JSON.stringify(resolveTemperatureCommand(evaluatedHvacVehicle, 1)?.events), '["AirconditionPlus","AirconditionPlus"]', "+1 °C nutzt zweimal den echten 0,5-Grad-Reglerweg");
equal(JSON.stringify(resolveTemperatureCommand(evaluatedHvacVehicle, -1)?.events), '["AirconditionMinus","AirconditionMinus"]', "-1 °C nutzt zweimal den echten 0,5-Grad-Reglerweg");
equal(resolveFanStepCommand(evaluatedHvacVehicle, 1), undefined, "FanSpeed erfindet kein nicht gemeldetes Rechts-Event");
equal(resolveFanStepCommand(evaluatedHvacVehicle, -1), undefined, "FanSpeed erfindet kein nicht gemeldetes Links-Event");
equal(resolveFanCycleCommand(evaluatedHvacVehicle), undefined, "FanSpeed-Taste schreibt keinen read-only Value oder Default-State");
equal(resolveVentilationCommand(evaluatedHvacVehicle)?.events[0], "Fans", "Automatische Ventilation nutzt separat das echte Fans-Event");
equal(resolveVentilationCommand(evaluatedHvacVehicle)?.events.length, 1, "Automatik AUS schaltet mit einem Fans-Event ein");
equal(resolveVentilationCommand(evaluatedHvacVehicle)?.targetVentilationStage, 2, "Primary schaltet rückmeldebasiert auf EIN");
equal(resolveAirflowCommand(evaluatedHvacVehicle, 1)?.events[0], "AC 1 AirFlowFakeRight", "Luftverteilung rechts nutzt das gemeldete Event");
equal(resolveAirflowCommand(evaluatedHvacVehicle, -1)?.events[0], "AC 1 AirFlowFakeLeft", "Luftverteilung links nutzt das gemeldete Event");
equal(resolveHvacSwitchCommand(evaluatedHvacVehicle, "ac-mode")?.events[0], "ACMode", "Heizen/Kühlen nutzt ACMode");
equal(resolveHvacSwitchCommand(evaluatedHvacVehicle, "rear")?.events[0], "ACRear", "Hintere Klima nutzt ACRear");
equal(resolveHvacSwitchCommand(evaluatedHvacVehicle, "circulation")?.events[0], "ACCirculation", "Umluft nutzt ACCirculation");
equal(resolveHvacSwitchCommand(evaluatedHvacVehicle, "circulation-front")?.events[0], "ACCirculationFront", "Vordere Umluft nutzt ACCirculationFront");
const climateSvg = renderedSvg(renderHvacKey("climate", evaluatedHvac));
check(climateSvg.includes("KLIMA EIN"), "Klima-Taste zeigt bestätigten EIN-Zustand");
check(climateSvg.includes("22,0 °C"), "Klima-Taste zeigt aktuelle Solltemperatur");
const fanSvg = renderedSvg(renderHvacKey("fan", evaluatedHvac));
check(fanSvg.includes("80%"), "Lüftertaste zeigt die aktuelle 20-%-Stufe");
check(fanSvg.includes("NUR ANZEIGE"), "Lüftertaste kennzeichnet den read-only Prozentwert");
const fanDialSvg = renderedSvg(renderHvacDial("fan-speed", evaluatedHvac));
check(fanDialSvg.includes("80 %"), "Lüfterregler zeigt den aktuellen Prozentwert");
check(fanDialSvg.includes("NUR ANZEIGE"), "Lüfterregler kennzeichnet den read-only Prozentwert");
check(renderedSvg(renderHvacKey("ventilation", evaluatedHvac)).includes(">AUS<"), "Automatische Ventilation zeigt AUS");

const ventilationOnlyVehicle = vehicle({
  Buttons: [{
    Name: "Fans 1",
    Tooltip: "Automatische Ventilation",
    State: "Tertiary",
    Actions: ["Fans", "None"],
    States: ["Primary", "Secondary", "Tertiary"]
  }]
});
const ventilationOnlyState = readHvacState(ventilationOnlyVehicle);
equal(ventilationOnlyState.fanAvailable, true, "Ventilation bleibt auch ohne Prozentwert bedienbar");
equal(ventilationOnlyState.fanControlAvailable, false, "Ventilation wird nicht als FanSpeed ausgegeben");
equal(ventilationOnlyState.ventilationEnabled, true, "Tertiary wird als Automatik EIN dargestellt");
equal(resolveVentilationCommand(ventilationOnlyVehicle)?.events.length, 1, "Tertiary schaltet mit einem Fans-Event aus");
equal(resolveVentilationCommand(ventilationOnlyVehicle)?.targetVentilationStage, 1, "Dritte Ventilationsstufe springt auf die erste zurück");
check(
  renderedSvg(renderHvacKey("ventilation", ventilationOnlyState)).includes(">EIN<"),
  "Reine Ventilation fasst den bestätigten aktiven Zustand als EIN zusammen"
);

const ventilationSecondaryVehicle = vehicle({
  Buttons: [{
    Name: "Fans 1",
    Tooltip: "Automatische Ventilation",
    State: "Secondary",
    Actions: ["Fans", "None"],
    States: ["Primary", "Secondary", "Tertiary"]
  }]
});
equal(readHvacState(ventilationSecondaryVehicle).ventilationEnabled, true, "Secondary wird als Automatik EIN dargestellt");
equal(resolveVentilationCommand(ventilationSecondaryVehicle)?.events.length, 2, "Secondary erreicht AUS über Tertiary und Primary");
equal(resolveVentilationCommand(ventilationSecondaryVehicle)?.targetVentilationStage, 1, "Secondary schaltet gezielt auf AUS");

// Andere Busse werden über ihre tatsächlich gemeldeten Action-Namen erkannt.
// Sind exakte 20-%-Zielevents vorhanden, läuft die Folge 0..100..0 ohne
// fahrzeugspezifische Sonderbehandlung.
const genericFanVehicle = vehicle({
  Buttons: {
    "Cabin Fan Speed": {
      Value: 80,
      State: "80",
      Actions: [
        "SetFanSpeed0", "SetFanSpeed20", "SetFanSpeed40",
        "SetFanSpeed60", "SetFanSpeed80", "SetFanSpeed100"
      ]
    }
  }
});
equal(readHvacState(genericFanVehicle).fanControlAvailable, true, "Generische Fan-Events aktivieren Steuerung");
equal(readHvacState(genericFanVehicle).fanControlKind, "speed", "Echte Prozentziele behalten Vorrang vor Ventilation");
equal(resolveFanCycleCommand(genericFanVehicle)?.targetFanPercent, 100, "80 % springt auf 100 %");
equal(resolveFanCycleCommand(genericFanVehicle)?.events[0], "SetFanSpeed100", "Exaktes 100-%-Event");
const genericFanAtMaximum = vehicle({
  Buttons: {
    "Cabin Fan Speed": {
      Value: 100,
      Actions: ["SetFanSpeed0", "SetFanSpeed20", "SetFanSpeed40", "SetFanSpeed60", "SetFanSpeed80", "SetFanSpeed100"]
    }
  }
});
equal(resolveFanCycleCommand(genericFanAtMaximum)?.targetFanPercent, 0, "100 % springt auf 0 %");
equal(resolveFanCycleCommand(genericFanAtMaximum)?.events[0], "SetFanSpeed0", "Exaktes 0-%-Event");
check(
  renderedSvg(renderHvacKey("fan", readHvacState(genericFanVehicle))).includes("DREHREGLER"),
  "Steuerbarer generischer Lüfter zeigt die Zyklusfunktion"
);

// eCitaro-Buttonmapping: Primary aus, Secondary rechts, Tertiary links.
equal(normalizeIndicatorPosition("Primary"), "off", "Indicator Primary");
equal(normalizeIndicatorPosition("Secondary"), "right", "Indicator Secondary");
equal(normalizeIndicatorPosition("Tertiary"), "left", "Indicator Tertiary");

// Direkte Werte gewinnen gegen kurz nachlaufende Cockpitbuttons.
equal(readWarningLightsState(vehicle({
  WarningLights: false,
  Buttons: [{ Name: "Warning Light", State: true }]
})), false, "Direkter Warnblinkerwert muss Vorrang haben");
equal(readIndicatorState(vehicle({
  IndicatorState: -1,
  Buttons: [{ Name: "Indicator", State: "Primary" }]
})), "left", "Direkter Blinkerwert muss Vorrang haben");

// Die sichtbare Blinkphase kommt direkt aus den echten TML-Lampenwerten.
equal(readLampPhase(vehicle({ AllLamps: {
  "Light Indicator Left": 1
} }), "Light Indicator Left"), true, "Linker Blinker hell");
equal(readLampPhase(vehicle({ AllLamps: {
  "Light Indicator Left": 0
} }), "Light Indicator Left"), false, "Linker Blinker dunkel");
equal(readLampPhase(vehicle({ AllLamps: {
  "Light Indicator Right": 0.35
} }), "Light Indicator Right"), true, "Positive Lampenintensitaet gilt als hell");
equal(readLampPhase(vehicle({ AllLamps: {
  "LED Warning": 0
} }), "LED Warning"), false, "Warnblinker dunkel");
equal(readLampPhase(vehicle(), "LED Warning"), undefined, "Fehlende Lampe aktiviert nur den Fallback");

// Gangwahl: CurrentSelector bleibt Hauptquelle, aber ein einzelner
// widersprüchlicher Poll darf den bestätigten Zustand nicht sichtbar umschalten.
const gear = new GearStateResolver();
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "D" },
  Buttons: [{ Name: "Gear Selector", State: "Drive" }]
}), 0), "D", "Ausgangsgang D");
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "N" },
  Buttons: [{ Name: "Gear Selector", State: "Drive" }]
}), 100), "D", "Ein einzelner unerwarteter N-Poll darf D nicht kurz grau schalten");
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "D" },
  Buttons: [{ Name: "Gear Selector", State: "Drive" }]
}), 200), "D", "Rueckkehr zu D verwirft den transienten Kandidaten");

// Nach einem echten Pluginbefehl darf der erwartete Zielgang beim ersten
// Telemetrietreffer sofort bestaetigt werden.
gear.expect("N", 300);
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "N" },
  Buttons: [{ Name: "Gear Selector", State: "Drive" }]
}), 350), "N", "Erwartetes N muss trotz nachlaufendem Drive-Button sofort gelten");

// Ein externer, nicht vom Plugin erwarteter Wechsel wird nach zwei stabilen
// Polls uebernommen.
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "R" },
  Buttons: [{ Name: "Gear Selector", State: "Neutral" }]
}), 500), "N", "Erster unerwarteter R-Poll bleibt noch N");
equal(gear.resolve(vehicle({
  Gearbox: { CurrentSelector: "R" },
  Buttons: [{ Name: "Gear Selector", State: "Neutral" }]
}), 650), "R", "Zweiter stabiler R-Poll bestaetigt R");

// Kurze Telemetrieluecken bleiben beim letzten echten Zustand; eine laengere
// Trennung zeigt wieder korrekt OFFLINE.
equal(gear.resolve(undefined, 1200), "R", "Kurze Telemetrieluecke behaelt R");
equal(gear.resolve(undefined, 1700), undefined, "Laengere Trennung wird offline");

// Türfreigabe: echter Button vor Lampe, Lampenfallback nur bei fehlendem Button.
equal(readDoorClearanceState(vehicle({
  Buttons: [{ Name: "Door Clearance", State: true }],
  AllLamps: { "ButtonLight DoorClearance": 0 }
})), true, "Aktive Tuerfreigabe darf nicht grau werden");
equal(readDoorClearanceState(vehicle({
  Buttons: [{ Name: "Door Clearance", State: false }],
  AllLamps: { "ButtonLight DoorClearance": 1 }
})), false, "Buttonzustand muss Lampennachlauf ueberstimmen");
equal(readDoorClearanceState(vehicle({
  AllLamps: { "ButtonLight DoorClearance": 1 }
})), true, "Lampenfallback der Tuerfreigabe");

// DOOR-01: Alle geschlossen öffnet weiterhin alle; gemischt oder vollständig
// offen schließt nur die nicht bereits geschlossenen Türen.
equal(summarizeDoorStates(["closed", "closed", "closed"]), "closed", "Alle Tueren geschlossen");
equal(JSON.stringify(doorAllCommandIndexes(["closed", "closed", "closed"])), "[0,1,2]", "All Closed oeffnet alle Tueren");
equal(summarizeDoorStates(["closed", "open", "moving"]), "moving", "Gemischter Tuerzustand");
equal(JSON.stringify(doorAllCommandIndexes(["closed", "open", "moving"])), "[1,2]", "Mixed schliesst nur offene/bewegte Tueren");
equal(JSON.stringify(doorAllCommandIndexes(["open", "open", "open"])), "[0,1,2]", "All Open schliesst alle Tueren");

// Geschwindigkeit: READY nur bei bestaetigtem Stillstand.
equal(readVehicleSpeedKmh(vehicle({ Speed: 0 })), 0, "Speed 0 numerisch");
equal(readVehicleSpeedKmh(vehicle({ Speed: "0.0" })), 0, "Speed 0 als String");
equal(isVehicleStationary(vehicle({ Speed: 0 })), true, "0 km/h ist Stillstand");
equal(isVehicleStationary(vehicle({ Speed: 0.02543 })), false, "Rollende Geschwindigkeit darf nicht READY sein");
equal(isVehicleStationary(vehicle()), undefined, "Fehlende Geschwindigkeit ist nicht bestaetigt");

// Kneeling: Buttonzustand verhindert Bordstein-Fehlinterpretation.
const curbVehicle = vehicle({
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([4.8, 5.0, 4.7])
});
check((readKneelingWheelMetric(curbVehicle) ?? 0) > 2, "Testdaten muessen Bordsteinmetrik ausloesen");
equal(readKneelingState(curbVehicle), false, "Primary muss trotz Radunterschied als angehoben gelten");
equal(readKneelingState(vehicle({
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([0.2, 0.4, 0.3])
})), true, "Secondary muss als abgesenkt gelten");
equal(readKneelingState(vehicle({ Wheels: wheels([4.8, 5.0, 4.7]) })), true, "Radfallback fuer Fahrzeuge ohne Kneeling-Button");

// Bewegungsverfolgung wartet auf echte Bewegung oder spaeten Buttonfallback.
const motion = new KneelingMotionTracker();
const raised = vehicle({
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([0.2, 0.3, 0.2])
});
motion.start(true, raised, 0);
check(motion.isAnimating(vehicle({
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([0.2, 0.3, 0.2])
}), 1000), "Sofort umspringender Button darf Bewegung nicht sofort beenden");
check(motion.isAnimating(vehicle({
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([2.0, 1.9, 2.1])
}), 1600), "Echte Radbewegung bestaetigt Ziel zunaechst stabil");
check(!motion.isAnimating(vehicle({
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([2.0, 1.9, 2.1])
}), 2200), "Stabiles Kneeling-Ziel beendet Animation");


// Auto-Kneeling: Der manuelle Button kann unveraendert auf Primary bleiben.
// Eine echte Aenderung der Radmetrik muss trotzdem die Animation und den
// anschliessenden mechanischen Zustand des normalen Kneeling-Icons liefern.
const automaticMotion = new KneelingMotionTracker();
const autoRaised = vehicle({
  Speed: 0,
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([0.2, 0.3, 0.2])
});
equal(automaticMotion.observe(autoRaised, true, 0), false, "Auto-Kneeling startet nicht ohne Bewegung");
equal(automaticMotion.readMechanicalState(autoRaised, true), false, "Ausgangszustand Auto-Kneeling angehoben");

const autoMovingDown = vehicle({
  Speed: 0,
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([1.0, 1.1, 1.0])
});
check(automaticMotion.observe(autoMovingDown, true, 200), "Radbewegung muss Auto-Kneeling-Absenkung animieren");
equal(automaticMotion.target, true, "Auto-Kneeling-Ziel muss abgesenkt sein");

const autoLowered = vehicle({
  Speed: 0,
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([2.3, 2.2, 2.4])
});
check(automaticMotion.observe(autoLowered, true, 1300), "Erste Zielbestaetigung bleibt animiert");
equal(automaticMotion.observe(autoLowered, true, 1900), false, "Stabile Auto-Kneeling-Absenkung beendet Animation");
equal(automaticMotion.readMechanicalState(autoLowered, true), true, "Normales Kneeling-Icon muss trotz Primary rot werden");

const autoMovingUp = vehicle({
  Speed: 0,
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([1.4, 1.3, 1.4])
});
check(automaticMotion.observe(autoMovingUp, true, 2200), "Radbewegung muss Auto-Kneeling-Anhebung animieren");
equal(automaticMotion.target, false, "Auto-Kneeling-Ziel muss angehoben sein");
check(automaticMotion.observe(autoRaised, true, 3300), "Erste Anhebe-Zielbestaetigung bleibt animiert");
equal(automaticMotion.observe(autoRaised, true, 3900), false, "Stabile Auto-Kneeling-Anhebung beendet Animation");
equal(automaticMotion.readMechanicalState(autoRaised, true), false, "Normales Kneeling-Icon kehrt nach Auto-Anhebung zu READY zurueck");

// Ein bereits statisch hoher Bordsteinwert darf ohne beobachtete Bewegung
// weiterhin keinen falschen abgesenkten Zustand erzeugen.
const automaticCurb = new KneelingMotionTracker();
equal(automaticCurb.observe(curbVehicle, true, 0), false, "Statischer Bordstein startet keine Auto-Kneeling-Animation");
equal(automaticCurb.readMechanicalState(curbVehicle, true), false, "Statischer Bordstein bleibt angehoben");

// VEH-01: Auto-Kneeling benötigt einen vollständig lesbaren Bus, laufenden
// Motor und fünf Sekunden bestätigten Buskontext, aber keine Mission/Route.
const autoKneelingReadyBus = vehicle({
  Speed: 0,
  IgnitionEnabled: true,
  EngineStarted: true,
  Buttons: [
    { Name: "Kneeling", State: "Primary" },
    { Name: "Automatic Kneeling", State: false }
  ]
});
equal(deriveVehicleReadyState(autoKneelingReadyBus, undefined, 4_999).vehicleReadyForAutoKneeling, false, "Auto-Kneeling vor 5 Sekunden gesperrt");
const readyWithoutMission = deriveVehicleReadyState(autoKneelingReadyBus, undefined, 5_000);
equal(readyWithoutMission.vehicleReady, true, "Bus vollstaendig initialisiert");
equal(readyWithoutMission.missionReady, false, "Mission ist optional");
equal(readyWithoutMission.vehicleReadyForAutoKneeling, true, "Auto-Kneeling nach 5 Sekunden bereit");
equal(deriveVehicleReadyState(vehicle({
  ...autoKneelingReadyBus,
  EngineStarted: false,
  IgnitionEnabled: true
}), undefined, 6_000).vehicleReadyForAutoKneeling, false, "Auto-Kneeling ohne laufenden Motor gesperrt");

// Rampenzustand ausschließlich aus beiden expliziten Lampen.
equal(readRampState(vehicle({ AllLamps: {
  "ButtonLight WheelchairRamp State1": 0,
  "ButtonLight WheelchairRamp State2": 0
} })), "locked", "Rampe verriegelt");
equal(readRampState(vehicle({ AllLamps: {
  "ButtonLight WheelchairRamp State1": 0,
  "ButtonLight WheelchairRamp State2": 1
} })), "ready", "Rampe bereit");
equal(readRampState(vehicle({ AllLamps: {
  "ButtonLight WheelchairRamp State1": 1,
  "ButtonLight WheelchairRamp State2": 0
} })), "deployed", "Rampe ausgefahren");
equal(readRampState(vehicle({ AllLamps: {
  "ButtonLight WheelchairRamp State1": 0
} })), undefined, "Unvollstaendige Rampentelemetrie bleibt unbekannt");

// VEH-02/03/04, LIGHT-01 und TICKET-01: ausschließlich Namen, Events und
// Zustände aus den vorhandenen eCitaro-18m-4Door-Telemetrieaufnahmen.
const extendedControlsVehicle = vehicle({
  Buttons: [
    {
      Name: "Retarder",
      State: "Primary",
      Actions: ["RetarderOff", "RetarderOn", "RetarderMaxOff"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "Retarder Lever",
      State: "Retarder1",
      Value: "0.0",
      Actions: [
        "RetarderLevel1", "RetarderLevel2", "RetarderLevel3",
        "RetarderLevel4", "RetarderLevel5", "RetarderDown", "RetarderUp"
      ],
      States: ["Retarder1", "Retarder2", "Retarder3", "Retarder4", "Retarder5"]
    },
    {
      Name: "Window Shade",
      State: "Primary",
      Actions: ["WindowShadeDown", "WindowShadeUp", "None"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "Wiper",
      State: "Off",
      Actions: ["WiperDown", "WiperUp"],
      States: ["Fast", "On", "Interval", "Off"]
    },
    {
      Name: "Light Switch",
      State: "Parking Lights",
      Actions: ["Lightswitch", "LightSwitchDown", "LightSwitchUp"],
      States: ["Off", "Parking Lights", "Headlights", "Rear Fog Light", "Front Fog Light"]
    },
    {
      Name: "High Beam",
      State: "Primary",
      Actions: ["ToggleTravellerLights"],
      States: ["Primary", "Secondary"]
    },
    {
      Name: "Boardcomputer",
      State: "false",
      Actions: ["Select Boardcomputer"],
      States: ["On", "Off"]
    },
    {
      Name: "5 Cent",
      State: "false",
      Actions: ["Coins5"],
      States: ["On", "Off"]
    },
    {
      Name: "Cash Money",
      State: "false",
      Actions: ["Take Cash Money"],
      States: ["On", "Off"]
    }
  ],
  AllLamps: {
    "Light DAYTIME": 1,
    "Light Parking": 1,
    "Light Headlight": 0,
    "Light Travelling": 0,
    "Light Front Fog": 0,
    "Light Rear Fog": 0
  }
});

const retarderState = readRetarderState(extendedControlsVehicle);
equal(retarderState.level, 1, "Retarder1 wird als echte Stufe 1 gelesen");
equal(resolveRetarderCommand(extendedControlsVehicle, "increase")?.event, "RetarderUp", "Retarder höher nutzt RetarderUp");
equal(resolveRetarderCommand(extendedControlsVehicle, "decrease"), undefined, "Retarder1 hat keine niedrigere Stufe");
equal(resolveRetarderCommand(extendedControlsVehicle, "off")?.event, "RetarderOff", "Retarder aus nutzt RetarderOff");
equal(resolveRetarderCommand(extendedControlsVehicle, "level-4")?.event, "RetarderLevel4", "Direkte Retarderstufe nutzt gemeldetes Zielevent");
check(renderedSvg(renderRetarderKey("increase", retarderState)).includes("R1"), "Retarder-Taste zeigt bestätigte Stufe");

equal(readSunBlindState(extendedControlsVehicle), "up", "Window Shade Primary ist oben");
equal(resolveSunBlindCommand(extendedControlsVehicle)?.event, "WindowShadeDown", "Sonnenblende oben fährt über belegtes Down-Event herunter");
check(renderedSvg(renderSunBlindKey("up")).includes("OBEN"), "Sonnenblenden-Taste zeigt bestätigten Zustand");

equal(readWiperState(extendedControlsVehicle), "Off", "Wischerzustand Off");
equal(resolveWiperCommand(extendedControlsVehicle, "increase")?.event, "WiperUp", "Wischer höher nutzt WiperUp");
equal(resolveWiperCommand(extendedControlsVehicle, "decrease"), undefined, "Wischer aus sendet kein WiperDown");
check(renderedSvg(renderWiperKey("increase", "Off")).includes("STUFE HÖHER"), "Wischer-Taste zeigt echte Bedienrichtung");

const exteriorLights = readExteriorLightState(extendedControlsVehicle);
equal(exteriorLights.switchState, "Parking Lights", "Lichtschalterzustand wird direkt gelesen");
equal(exteriorLights.daytime, true, "Lampenname wird robust ohne erfundene Quelle gelesen");
equal(exteriorLights.headlights, false, "Abblendlicht-Lampe aus");
equal(resolveExteriorLightCommand(extendedControlsVehicle, "switch-up")?.event, "LightSwitchUp", "Lichtschalter höher nutzt gemeldetes Event");
equal(resolveExteriorLightCommand(extendedControlsVehicle, "high-beam")?.event, "ToggleTravellerLights", "Fernlicht nutzt gemeldetes Toggle-Event");
equal(resolveExteriorLightCommand(extendedControlsVehicle, "daytime"), undefined, "Tagfahrlicht bleibt ohne Einzel-Event read-only");
check(renderedSvg(renderExteriorLightKey("daytime", exteriorLights)).includes("NUR ANZEIGE"), "Read-only-Lichtmodus ist sichtbar gekennzeichnet");

equal(ticketControlAvailable(extendedControlsVehicle, "atron"), true, "ATRON-Auswahl ist nur mit gemeldetem Event verfügbar");
equal(resolveTicketControlCommand(extendedControlsVehicle, "atron")?.event, "Select Boardcomputer", "ATRON nutzt Select Boardcomputer");
equal(resolveTicketControlCommand(extendedControlsVehicle, "coin-005")?.event, "Coins5", "5-Cent-Taste nutzt Coins5");
equal(resolveTicketControlCommand(extendedControlsVehicle, "take-cash")?.event, "Take Cash Money", "Bargeldannahme nutzt Take Cash Money");
equal(resolveTicketControlCommand(extendedControlsVehicle, "coin-010"), undefined, "Fehlende Münztaste erzeugt kein Event");
check(renderedSvg(renderTicketControlKey("take-cash", true)).includes("ECHTES EVENT"), "Take Cash kennzeichnet den belegten Eventpfad");

console.log("Alle Core-Zustandstests bestanden.");
