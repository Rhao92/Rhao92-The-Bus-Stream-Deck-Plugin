import {
  normalizeIndicatorPosition,
  readLampPhase,
  readIndicatorState,
  readWarningLightsState
} from "../src/core/driving-controls";
import { GearStateResolver, resolveGearCommand } from "../src/core/gear";
import {
  KneelingMotionTracker,
  readKneelingButtonState,
  readKneelingState,
  readKneelingWheelMetric
} from "../src/core/kneeling";
import { readRampState } from "../src/core/ramp";
import {
  doorAllCommandIndexes,
  readAvailableDoorStates,
  summarizeDoorStates
} from "../src/core/doors";
import {
  readAutomaticDoorClosingState,
  readAutomaticKneelingState,
  readDoorClearanceState,
  readParkingBrakeState,
  readPassengerLightState,
  readStopBrakeState
} from "../src/core/vehicle-controls";
import {
  passengerLightTargetRequiresPressRelease,
  manualKneelingRequiresHold,
  resolveAutomaticDoorClosingEvent,
  resolveAutomaticKneelingEvent,
  resolveDoorToggleEvent,
  resolveManualKneelingEvent,
  resolvePassengerLightOffEvent,
  resolvePassengerLightLevelEvent,
  resolvePassengerLightTargetEventBatches,
  resolvePassengerLightTargetEvents,
  resolvePassengerLightToggleTarget,
  resolvePassengerLightToggleEvent,
  resolveStopBrakeEvent,
  usesCyclicPassengerLightControl
} from "../src/core/vehicle-events";
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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function telemetryFixture(name: string): VehicleTelemetry {
  const raw = JSON.parse(readFileSync(
    resolve(process.cwd(), "qa", "fixtures", "vehicle-telemetry", name),
    "utf8"
  )) as {
    identity?: {
      actorClass?: string;
      vehicleModel?: string;
      inputIdentifier?: string;
    };
    buttons?: Array<{
      name?: string;
      actions?: string[];
      declaredStates?: string[];
      observedStates?: unknown[];
      observedValues?: unknown[];
    }>;
    lamps?: Array<{
      name?: string;
      observedValues?: unknown[];
    }>;
  };

  return vehicle({
    ActorName: raw.identity?.actorClass,
    VehicleModel: raw.identity?.vehicleModel,
    InputIdentifier: raw.identity?.inputIdentifier,
    Buttons: (raw.buttons ?? []).map((button) => ({
      Name: button.name,
      Actions: button.actions,
      States: button.declaredStates,
      State: button.observedStates?.[0],
      Value: button.observedValues?.[0]
    })),
    AllLamps: Object.fromEntries((raw.lamps ?? [])
      .filter((lamp) => lamp.name)
      .map((lamp) => [lamp.name as string, lamp.observedValues?.[0]]))
  });
}

// VEHICLE-01: Fahrzeugabweichungen werden aus den vom jeweiligen Button
// gemeldeten echten Actions aufgeloest. Die bisherigen Eventnamen bleiben als
// Legacy-Fallback bestehen und werden durch neue Busse nicht ersetzt.
const citeaEvents = vehicle({
  Buttons: [
    { Name: "Door 2", Actions: ["MiddleDoorOpenClose"] },
    { Name: "Door 3", Actions: ["RearDoorOpenClose"] },
    { Name: "Automatic Kneeling", Actions: ["Autokneeling"] },
    { Name: "Lifting", Actions: ["LiftDown", "LiftUp"], State: "Secondary" },
    {
      Name: "InteriorLightLevel",
      Actions: ["InteriorLightOff", "InteriorLightDimmed", "InteriorLightBright"]
    }
  ]
});
equal(resolveDoorToggleEvent(citeaEvents, 1), "MiddleDoorOpenClose", "Citea-Tuer 2 nutzt gemeldeten Event");
equal(resolveDoorToggleEvent(citeaEvents, 2), "RearDoorOpenClose", "Citea-Tuer 3 nutzt gemeldeten Event");
equal(resolveAutomaticKneelingEvent(citeaEvents), "Autokneeling", "Citea nutzt gemeldetes Auto-Kneeling");
equal(resolveManualKneelingEvent(citeaEvents, true), "LiftDown", "Citea senkt ueber Lifting");
equal(resolveManualKneelingEvent(citeaEvents, false), "LiftUp", "Citea hebt ueber Lifting");
equal(readKneelingButtonState(citeaEvents), true, "Lifting-Secondary bestaetigt abgesenkten Zustand");
equal(resolvePassengerLightLevelEvent(citeaEvents, "dim"), "InteriorLightDimmed", "Unbekanntes Legacy-Fahrzeug behaelt gemeldetes Dimm-Event");

const ebuscoEvents = vehicle({
  Buttons: [
    { Name: "Automatic Door Closing", Actions: ["ToggleAutoclose"], State: "Secondary" },
    { Name: "Automatic Kneeling", Actions: ["toggleAutoKneeling"], State: "Secondary" },
    { Name: "Lifting", Actions: ["LiftDown", "LiftUp"], State: "Primary" }
  ]
});
equal(resolveAutomaticDoorClosingEvent(ebuscoEvents), "ToggleAutoclose", "Ebusco nutzt gemeldete Tuerschliessautomatik");
equal(readAutomaticDoorClosingState(ebuscoEvents), true, "Secondary bestaetigt aktive Tuerschliessautomatik");
equal(resolveAutomaticKneelingEvent(ebuscoEvents), "toggleAutoKneeling", "Ebusco nutzt gemeldetes Auto-Kneeling");
equal(readAutomaticKneelingState(ebuscoEvents), false, "Secondary bestaetigt deaktiviertes Auto-Kneeling");
equal(resolveManualKneelingEvent(ebuscoEvents, true), "LiftDown", "Ebusco senkt ueber Lifting");

const urbinoEvents = vehicle({
  Buttons: [
    { Name: "Automatic Door Closing", Actions: ["PreventRearAuto"], State: "Primary" },
    { Name: "Automatic Kneeling", Actions: ["toggleAutoKneeling"], State: "Primary" },
    { Name: "Interior Light Dim", Actions: ["INTLightDim"] },
    { Name: "Interior Light Full", Actions: ["INTLightFull"] }
  ]
});
equal(resolveAutomaticDoorClosingEvent(urbinoEvents), "PreventRearAuto", "Urbino nutzt gemeldete Tuerschliessautomatik");
equal(readAutomaticDoorClosingState(urbinoEvents), false, "Primary bestaetigt inaktive Tuerschliessautomatik");
equal(resolvePassengerLightLevelEvent(urbinoEvents, "dim"), "INTLightDim", "Urbino nutzt gemeldeten Dimm-Event");
equal(resolvePassengerLightLevelEvent(urbinoEvents, "bright"), "INTLightFull", "Urbino nutzt gemeldeten Hell-Event");

const manEvents = vehicle({
  Buttons: [{ Name: "Door 1", Actions: ["DoorFrontOpenCloseButton"] }]
});
equal(resolveDoorToggleEvent(manEvents, 0), "DoorFrontOpenCloseButton", "MAN-Tuer 1 nutzt gemeldeten Button-Event");
equal(resolveDoorToggleEvent(manEvents, 1), "DoorMiddleOpenClose", "MAN-Tuer 2 behaelt den live bestaetigten mittleren Event");
equal(resolveDoorToggleEvent(manEvents, 2), "DoorRearOpenClose", "MAN-Tuer 3 behaelt den live bestaetigten hinteren Event");
equal(resolveDoorToggleEvent(manEvents, 1), "DoorMiddleOpenClose", "Fehlende MAN-Tueraction behaelt Legacy-Fallback");

const legacyEvents = vehicle();
equal(resolveDoorToggleEvent(legacyEvents, 1), "DoorMiddleOpenClose", "Legacy-Tuername bleibt erhalten");
equal(resolveAutomaticDoorClosingEvent(legacyEvents), "ToggleAutomaticRearDoorClosing", "Legacy-Tuerschliessautomatik bleibt erhalten");
equal(resolveAutomaticKneelingEvent(legacyEvents), "Pedestrians", "Legacy-Auto-Kneeling bleibt erhalten");

const capturedEcitaro = telemetryFixture("ecitaro.json");
const capturedEbusco = telemetryFixture("ebusco-2-2.json");
const capturedUrbino = telemetryFixture("urbino.json");
const capturedMan = telemetryFixture("man.json");
const capturedScania = telemetryFixture("scania.json");
const capturedCitea120 = telemetryFixture("citea-lle-120-3d.json");
const capturedCitea127 = telemetryFixture("citea.json");
equal(resolveDoorToggleEvent(capturedEcitaro, 1), "DoorMiddleOpenClose", "eCitaro-Referenz behaelt Tuer 2");
equal(resolveDoorToggleEvent(capturedEbusco, 3), "DoorFourthOpenClose", "Ebusco-Referenz nutzt Tuer 4");
equal(resolveAutomaticDoorClosingEvent(capturedUrbino), "PreventRearAuto", "Urbino-Referenz nutzt PreventRearAuto");
equal(resolveDoorToggleEvent(capturedUrbino, 1), "DoorFourthOpenClose", "Urbino-Tuer 2 korrigiert die live bestaetigte Vertauschung");
equal(resolveDoorToggleEvent(capturedUrbino, 3), "DoorMiddleOpenClose", "Urbino-Tuer 4 korrigiert die live bestaetigte Vertauschung");
equal(resolveDoorToggleEvent(capturedMan, 0), "DoorFrontOpenCloseButton", "MAN-Referenz nutzt eigenen Fronttuer-Event");
equal(resolveDoorToggleEvent(capturedScania, 0), "DoorFrontOpenClose", "Scania-Referenz behaelt die funktionierende Fronttuer");
equal(resolveDoorToggleEvent(capturedScania, 1), undefined, "Scania behauptet die nicht steuerbare Tuer 2 nicht mehr");
equal(resolveDoorToggleEvent(capturedScania, 2), undefined, "Scania behauptet die nicht steuerbare Tuer 3 nicht mehr");
equal(resolveDoorToggleEvent(capturedCitea120, 1), "MiddleDoorOpenClose", "Citea-120-Referenz nutzt eigenen Mitteltuer-Event");
equal(resolveDoorToggleEvent(capturedCitea127, 1), "MiddleDoorOpenClose", "Citea-127-Referenz behebt Door-All-Tuer 2");
equal(resolveManualKneelingEvent(capturedCitea127, true), "LiftDown", "Citea-127-Referenz nutzt LiftDown");
equal(resolveAutomaticKneelingEvent(capturedEbusco), "toggleAutoKneeling", "Ebusco-Referenz nutzt eigenes Auto-Kneeling");
equal(resolveAutomaticKneelingEvent(capturedScania), undefined, "Scania bietet kein bestaetigtes Auto-Kneeling an");
equal(resolveManualKneelingEvent(capturedScania, true), "KneelDown", "Scania senkt über den live bestätigten Kneeling-Haltepfad");
equal(resolveManualKneelingEvent(capturedScania, false), "KneelUp", "Scania hebt über den live bestätigten Kneeling-Haltepfad");
equal(manualKneelingRequiresHold(capturedScania), true, "Scania-Kneeling verwendet Press-Hold-Release");
equal(manualKneelingRequiresHold(capturedEcitaro), false, "eCitaro behält seinen bisherigen Klickpfad");
equal(readStopBrakeState(capturedEcitaro), false, "eCitaro liest Haltestellenbremse Off direkt");
equal(readStopBrakeState(capturedEbusco), false, "Ebusco Primary bedeutet Haltestellenbremse aus");
equal(readStopBrakeState(capturedMan), false, "MAN Primary bedeutet Haltestellenbremse aus");
equal(readStopBrakeState(capturedCitea127), false, "Citea Primary bedeutet Haltestellenbremse aus");
equal(readStopBrakeState(vehicle({ AllLamps: { "LED Stop Brake": 1 } })), true, "Kontrolllampe bestaetigt Haltestellenbremse ohne Schalter");
equal(readStopBrakeState(vehicle()), undefined, "Fehlende Haltestellenbremsen-Telemetrie bleibt unbekannt");
equal(readParkingBrakeState(vehicle({ Buttons: [{ Name: "Parking Brake", State: true }] })), true, "Feststellbremse nutzt den bestätigten Buttonzustand");
equal(readParkingBrakeState(vehicle({ FixingBrake: false })), false, "Feststellbremse nutzt die bestätigte Fahrzeugrückmeldung als Fallback");
equal(readParkingBrakeState(vehicle()), undefined, "Fehlende Feststellbremsen-Telemetrie bleibt unbekannt");
equal(resolveStopBrakeEvent(capturedEcitaro, false), "StopBrakeOnOff", "eCitaro nutzt den gemeldeten Toggle");
equal(resolveStopBrakeEvent(capturedCitea127, false), "StopBrakeOnOff", "Citea nutzt den gemeldeten Toggle");
equal(resolveStopBrakeEvent(capturedEbusco, false), "StopBrakeOn", "Ebusco schaltet gezielt ein");
equal(resolveStopBrakeEvent(capturedEbusco, true), "StopBrakeOff", "Ebusco schaltet gezielt aus");
equal(resolveStopBrakeEvent(capturedMan, false), "BusStopBrakeOn", "MAN schaltet gezielt ein");
equal(resolveStopBrakeEvent(capturedMan, true), "BusStopBrakeOff", "MAN schaltet gezielt aus");
equal(resolveStopBrakeEvent(capturedScania, false), undefined, "Scania ohne gemeldetes Event bleibt bei der Haltestellenbremse read-only");
equal(usesCyclicPassengerLightControl(capturedEbusco), true, "Ebusco verwendet den echten zyklischen Lichttaster");
equal(usesCyclicPassengerLightControl(capturedCitea127), false, "Citea wird nach aktuellem Live-Abgleich nur als binaeres Licht behandelt");
equal(usesCyclicPassengerLightControl(capturedUrbino), true, "Urbino verwendet den echten zyklischen Lichttaster");
equal(usesCyclicPassengerLightControl(capturedScania), true, "Scania verwendet den echten zyklischen Lichttaster");
equal(usesCyclicPassengerLightControl(capturedMan), true, "MAN verwendet den echten zyklischen Lichttaster");
equal(usesCyclicPassengerLightControl(capturedEcitaro), false, "eCitaro behaelt getrennte Lichtstufen");
equal(resolvePassengerLightToggleEvent(capturedEbusco), "TogglePassengersLight", "Ebusco schaltet mit einem Druck genau eine reale Lichtstufe weiter");
equal(resolvePassengerLightToggleEvent(capturedCitea127), "TogglePassengersLight", "Citea schaltet mit einem Druck den bestaetigten Ein-/Aus-Zustand");
equal(resolvePassengerLightToggleEvent(capturedUrbino), "TogglePassengersLight", "Urbino schaltet mit einem Druck genau eine reale Lichtstufe weiter");
equal(resolvePassengerLightToggleEvent(capturedScania), "TogglePassengersLight", "Scania schaltet mit einem Druck genau eine reale Lichtstufe weiter");
equal(resolvePassengerLightToggleEvent(capturedMan), "TogglePassengersLight", "MAN schaltet mit einem Druck genau eine reale Lichtstufe weiter");
equal(resolvePassengerLightOffEvent(capturedEbusco), "InteriorLightOff", "Ebusco besitzt einen live bestaetigten direkten Aus-Event");
equal(resolvePassengerLightLevelEvent(capturedEbusco, "dim"), "InteriorLightDimmed", "Ebusco besitzt einen live bestaetigten direkten Dimm-Event");
equal(resolvePassengerLightLevelEvent(capturedEbusco, "bright"), "InteriorLightBright", "Ebusco besitzt einen live bestaetigten direkten Hell-Event");
equal(passengerLightTargetRequiresPressRelease(capturedEbusco), true, "Ebusco-Lichtziele verwenden den live bestaetigten Press-Release-Pfad");
equal(resolvePassengerLightOffEvent(capturedCitea127), "InteriorLightOff", "Citea besitzt einen live bestaetigten direkten Aus-Event");
equal(resolvePassengerLightLevelEvent(capturedCitea127, "dim"), undefined, "Citea behauptet keine getrennte Dimmstufe");
equal(resolvePassengerLightLevelEvent(capturedCitea127, "bright"), undefined, "Citea behauptet den gelisteten, aber wirkungslosen Hell-Event nicht");
equal(passengerLightTargetRequiresPressRelease(capturedCitea127), true, "Citea-Aus verwendet den live bestaetigten Press-Release-Pfad");
equal(resolvePassengerLightOffEvent(capturedUrbino), "TogglePassengersLight", "Urbino erreicht Aus sicher ueber den bestaetigten Hauptzustand und Toggle");
equal(resolvePassengerLightLevelEvent(capturedUrbino, "dim"), "INTLightDim", "Urbino besitzt einen live bestaetigten direkten Dimm-Event");
equal(resolvePassengerLightLevelEvent(capturedUrbino, "bright"), "INTLightFull", "Urbino behaelt seinen vorhandenen direkten Hell-Event");
equal(resolvePassengerLightLevelEvent(capturedScania, "dim"), undefined, "Scania behauptet keine separate Zielstufentaste");
equal(resolvePassengerLightLevelEvent(capturedMan, "bright"), undefined, "MAN behauptet keine separate Zielstufentaste");
equal(resolvePassengerLightLevelEvent(capturedEcitaro, "dim"), "InteriorLightDim", "eCitaro behaelt bewaehrte Helligkeitssteuerung");

const manMixedLight = vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    {
      Name: "InteriorLightLowerDeck",
      State: "Dimmed",
      Actions: ["LDPassengersLightUp", "LDPassengersLightDown", "TogglePassengersLight"]
    },
    {
      Name: "InteriorLightUpperDeck",
      State: "Off",
      Actions: ["UDPassengersLightUp", "UDPassengersLightDown"]
    }
  ]
});
equal(JSON.stringify(resolvePassengerLightTargetEvents(manMixedLight, "off")), '["LDPassengersLightDown"]', "MAN schaltet beide Decks gezielt auf Aus");
equal(JSON.stringify(resolvePassengerLightTargetEvents(manMixedLight, "dim")), '["UDPassengersLightUp"]', "MAN gleicht das Oberdeck gezielt auf Gedimmt an");
equal(JSON.stringify(resolvePassengerLightTargetEvents(manMixedLight, "bright")), '["LDPassengersLightUp","UDPassengersLightUp","UDPassengersLightUp"]', "MAN schaltet beide Decks gezielt auf Hell");
equal(JSON.stringify(resolvePassengerLightTargetEventBatches(vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    {
      Name: "InteriorLightLowerDeck",
      State: "Off",
      Actions: ["LDPassengersLightUp", "LDPassengersLightDown"]
    },
    {
      Name: "InteriorLightUpperDeck",
      State: "Off",
      Actions: ["UDPassengersLightUp", "UDPassengersLightDown"]
    }
  ]
}), "bright")), '[["LDPassengersLightUp","UDPassengersLightUp"],["LDPassengersLightUp","UDPassengersLightUp"]]', "MAN koppelt Unter- und Oberdeck pro Helligkeitsstufe");
equal(resolvePassengerLightToggleTarget(capturedMan, "bright"), "off", "MAN-Legacy-Umschalter schaltet beide hellen Decks aus");
equal(resolvePassengerLightToggleTarget(capturedMan, "dim"), "off", "MAN-Legacy-Umschalter schaltet beide gedimmten Decks aus");
equal(resolvePassengerLightToggleTarget(capturedMan, "on"), "off", "MAN-Legacy-Umschalter gleicht gemischte Decks auf Aus an");
equal(resolvePassengerLightToggleTarget(capturedMan, "off"), "dim", "MAN-Legacy-Umschalter schaltet beide Decks gemeinsam gedimmt ein");
equal(resolvePassengerLightToggleTarget(capturedEcitaro, "bright"), undefined, "eCitaro behaelt seinen bisherigen Toggle-Event");

const scaniaMixedLight = vehicle({
  InputIdentifier: "Scania",
  Buttons: [
    {
      Name: "InteriorLightControl 1",
      State: "Secondary",
      Actions: ["LightingFrontInteriorDown", "LightingFrontInteriorUp", "TogglePassengersLight"]
    },
    {
      Name: "InteriorLightControl 2",
      State: "Primary",
      Actions: ["LightingBackInteriorDown", "LightingBackInteriorUp"]
    }
  ]
});
equal(JSON.stringify(resolvePassengerLightTargetEvents(scaniaMixedLight, "off")), '["LightingFrontInteriorDown"]', "Scania gleicht den Frontbereich gezielt auf Aus an");
equal(JSON.stringify(resolvePassengerLightTargetEvents(scaniaMixedLight, "dim")), '["LightingBackInteriorUp"]', "Scania gleicht den Heckbereich gezielt auf Gedimmt an");
equal(JSON.stringify(resolvePassengerLightTargetEvents(scaniaMixedLight, "bright")), '["LightingFrontInteriorDown","LightingFrontInteriorDown","LightingBackInteriorDown"]', "Scania schaltet beide Bereiche gezielt auf Hell");

equal(JSON.stringify(resolveGearCommand(capturedEbusco, "N", "D")), '["GearUp"]', "Ebusco schaltet live bestaetigt von N nach D mit GearUp");
equal(JSON.stringify(resolveGearCommand(capturedEbusco, "N", "R")), '["GearDown"]', "Ebusco schaltet live bestaetigt von N nach R mit GearDown");
equal(JSON.stringify(resolveGearCommand(capturedEbusco, "D", "N")), '["GearDown"]', "Ebusco schaltet live bestaetigt von D nach N mit GearDown");
equal(JSON.stringify(resolveGearCommand(capturedEbusco, "R", "N")), '["GearUp"]', "Ebusco schaltet live bestaetigt von R nach N mit GearUp");
equal(JSON.stringify(resolveGearCommand(capturedEbusco, "D", "R")), '["GearDown","GearDown"]', "Ebusco ueberbrueckt D nach R mit zwei bestaetigten GearDown-Events");
equal(JSON.stringify(resolveGearCommand(capturedEbusco, "R", "D")), '["GearUp","GearUp"]', "Ebusco ueberbrueckt R nach D mit zwei bestaetigten GearUp-Events");
equal(JSON.stringify(resolveGearCommand(capturedEcitaro, "D", "N")), '["SetGearN"]', "eCitaro behaelt direkte Gangwahl");

equal(readPassengerLightState(vehicle({
  InputIdentifier: "ebusco_2.2",
  AllLamps: { "Light Passenger": 1 }
})), "on", "Ebusco zeigt bestaetigt EIN ohne erfundene Helligkeitsstufe");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "ebusco_2.2",
  Buttons: [{ Name: "Interior Light", State: "Secondary" }],
  AllLamps: { "Light Passenger": 0.1 }
})), "dim", "Ebusco ordnet den live bestaetigten Secondary-Zustand Gedimmt zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "ebusco_2.2",
  Buttons: [{ Name: "Interior Light", State: "Tertiary" }],
  AllLamps: { "Light Passenger": 1 }
})), "bright", "Ebusco ordnet den live bestaetigten Tertiary-Zustand Hell zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "urbino",
  AllLamps: { "Passenger Lights": 0 }
})), "off", "Urbino zeigt bestaetigt AUS");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "urbino",
  Buttons: [
    { Name: "Interior Light", State: "Secondary" },
    { Name: "Interior Light Dim", State: "Secondary" },
    { Name: "Interior Light Full", State: "Primary" }
  ],
  AllLamps: { "Passenger Lights": 1 }
})), "dim", "Urbino ordnet den live bestaetigten Dimm-Button Gedimmt zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "urbino",
  Buttons: [
    { Name: "Interior Light", State: "Secondary" },
    { Name: "Interior Light Dim", State: "Primary" },
    { Name: "Interior Light Full", State: "Secondary" }
  ],
  AllLamps: { "Passenger Lights": 1 }
})), "bright", "Urbino ordnet den live bestaetigten Full-Button Hell zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "Scania",
  AllLamps: { InteriorFront: 0, InteriorMiddle: 1, InteriorRear: 0 }
})), "on", "Scania fasst echte Bereichslampen nur binaer zusammen");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "Scania",
  Buttons: [
    { Name: "InteriorLightControl 1", State: "Primary" },
    { Name: "InteriorLightControl 2", State: "Primary" }
  ],
  AllLamps: { InteriorFront: 0, InteriorMiddle: 1, InteriorRear: 0 }
})), "off", "Scania ignoriert die dauerhaft aktive Mittellampe bei bestaetigtem Aus");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "Scania",
  Buttons: [
    { Name: "InteriorLightControl 1", State: "Secondary" },
    { Name: "InteriorLightControl 2", State: "Secondary" }
  ]
})), "dim", "Scania zeigt gemeinsam bestaetigtes Gedimmt an");
equal(readPassengerLightState(scaniaMixedLight), "on", "Scania zeigt abweichende Front-/Heckstufen neutral als aktiv");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "citea",
  Buttons: [{ Name: "InteriorLightLevel", State: "Primary" }]
})), "off", "Citea ordnet den live bestaetigten Primary-Zustand Aus zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "citea",
  Buttons: [{ Name: "InteriorLightLevel", State: "Tertiary" }]
})), "on", "Citea ordnet den live bestaetigten Tertiary-Zustand neutral Ein zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "citea",
  Buttons: [{ Name: "InteriorLightLevel", State: "Secondary" }]
})), "bright", "Citea ordnet den live bestaetigten Secondary-Zustand Hell zu");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "citea",
  Buttons: [{ Name: "InteriorLightLevel", State: "Tertiary" }],
  AllLamps: { "Interior Lights Passenger": 3 }
})), "bright", "Citea nutzt den physischen Lampenwert 3 fuer Hell auch bei abweichendem Buttonstate");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "citea",
  Buttons: [{ Name: "InteriorLightLevel", State: "Secondary" }],
  AllLamps: { "Interior Lights Passenger": 0.1 }
})), "on", "Citea nutzt den einzigen bestaetigten aktiven Lampenwert neutral als Ein");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    { Name: "InteriorLightLowerDeck", State: "Dimmed" },
    { Name: "InteriorLightUpperDeck", State: "Off" }
  ]
})), "on", "MAN zeigt abweichende Unter-/Oberdeckstufen neutral als aktiv");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    { Name: "InteriorLightLowerDeck", State: "bRight" },
    { Name: "InteriorLightUpperDeck", State: "bRight" }
  ]
})), "bright", "MAN zeigt die gemeinsam bestaetigte Hellstufe an");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    { Name: "InteriorLightLowerDeck", State: "Dimmed" },
    { Name: "InteriorLightUpperDeck", State: "Dimmed" }
  ],
  AllLamps: {
    LightInteriorLowerDeck: 3,
    LightInteriorUpperDeck: 3
  }
})), "bright", "MAN bevorzugt die physischen Lampenwerte 3 fuer Hell");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "MAN",
  Buttons: [
    { Name: "InteriorLightLowerDeck", State: "bRight" },
    { Name: "InteriorLightUpperDeck", State: "bRight" }
  ],
  AllLamps: {
    LightInteriorLowerDeck: 0.1,
    LightInteriorUpperDeck: 0.1
  }
})), "dim", "MAN bevorzugt die physischen Lampenwerte 0,1 fuer Gedimmt");
equal(readPassengerLightState(vehicle({
  InputIdentifier: "MAN",
  AllLamps: {
    LightInteriorLowerDeck: 0,
    LightInteriorUpperDeck: 0
  }
})), "off", "MAN erkennt Aus ueber beide physischen Lampenwerte");

const nonNumericEbuscoHvac = vehicle({
  Buttons: [
    {
      Name: "Air Condition Temperature",
      State: "Primary",
      Actions: ["AirconditionPlus", "AirconditionMinus"],
      States: ["Primary", "Secondary"]
    },
    { Name: "Aircon Pass Fanspeed Higher", Actions: ["PassFanspeedUp"] },
    { Name: "Aircon Pass Fanspeed Lower", Actions: ["PassFanspeedDown"] }
  ]
});
equal(resolveTemperatureCommand(nonNumericEbuscoHvac, 1)?.events[0], "AirconditionPlus", "Ebusco-Temperatur nutzt echten Plus-Event ohne erfundenen Wert");
equal(resolveTemperatureCommand(nonNumericEbuscoHvac, -1)?.targetTemperatureC, undefined, "Ebusco-Temperatur erfindet keinen Sollwert");
equal(resolveFanStepCommand(nonNumericEbuscoHvac, 1)?.events[0], "PassFanspeedUp", "Ebusco-Fahrgastraumluefter nutzt echten Aufwaerts-Event");
equal(resolveFanStepCommand(nonNumericEbuscoHvac, -1)?.events[0], "PassFanspeedDown", "Ebusco-Fahrgastraumluefter nutzt echten Abwaerts-Event");
equal(readHvacState(nonNumericEbuscoHvac).fanPercent, undefined, "Ebusco-Luefter erfindet keinen Prozentwert");
equal(readHvacState(nonNumericEbuscoHvac).fanControlAvailable, true, "Ebusco-Luefter ist ueber gemeldete Richtungs-Events bedienbar");
const nonNumericEbuscoState = readHvacState(nonNumericEbuscoHvac);
check(renderedSvg(renderHvacKey("temperature-up", nonNumericEbuscoState)).includes("+1°"), "Ebusco-Temperaturtaste bleibt trotz unbekanntem Wert bedienbar");
check(renderedSvg(renderHvacKey("temperature-up", nonNumericEbuscoState)).includes("--.- °C"), "Ebusco-Temperaturtaste zeigt keinen erfundenen Wert");
check(renderedSvg(renderHvacDial("fan-speed", nonNumericEbuscoState)).includes("--"), "Ebusco-Luefterdial zeigt unbekannten Wert neutral");

const scaniaClimateOff = vehicle({
  InputIdentifier: "Scania",
  Buttons: [{
    Name: "Air Condition",
    State: "Off",
    States: ["Off", "1", "2", "3"],
    Actions: ["ACIntensity", "Air ConditionFakeLeft", "Air ConditionFakeRight"]
  }]
});
equal(readHvacState(scaniaClimateOff).climateEnabled, false, "Scania-Klimastufe AUS wird als aus erkannt");
equal(JSON.stringify(resolveHvacSwitchCommand(scaniaClimateOff, "climate")?.events), '["Air ConditionFakeRight"]', "Scania schaltet von AUS mit dem echten Rechts-Event auf Stufe 1");
const scaniaClimateStageTwo = vehicle({
  InputIdentifier: "Scania",
  Buttons: [{
    Name: "Air Condition",
    State: "2",
    States: ["Off", "1", "2", "3"],
    Actions: ["ACIntensity", "Air ConditionFakeLeft", "Air ConditionFakeRight"]
  }]
});
equal(readHvacState(scaniaClimateStageTwo).climateEnabled, true, "Scania-Klimastufe 2 wird als ein erkannt");
equal(JSON.stringify(resolveHvacSwitchCommand(scaniaClimateStageTwo, "climate")?.events), '["Air ConditionFakeLeft","Air ConditionFakeLeft"]', "Scania schaltet rueckmeldungsgefuehrt von Stufe 2 auf AUS");

equal(JSON.stringify(resolveTemperatureCommand(capturedMan, 1)?.events), '["AirconditionKeyDown","AirconditionKeyDown"]', "MAN waermer korrigiert die live bestaetigte vertauschte Eventrichtung");
equal(JSON.stringify(resolveTemperatureCommand(capturedMan, -1)?.events), '["AirconditionKeyUp","AirconditionKeyUp"]', "MAN kaelter korrigiert die live bestaetigte vertauschte Eventrichtung");
equal(JSON.stringify(resolveTemperatureCommand(capturedScania, 1)?.events), '["AirconditionKeyUp","AirconditionKeyUp"]', "Scania behaelt die normale Temperatur-Eventrichtung");

const lowerCaseVehicleControls = vehicle({
  Buttons: [
    { Name: "Wiper", State: "interval", Actions: ["WiperDown", "WiperUp"] },
    { Name: "Light Switch", State: "parking", Actions: ["LightSwitchDown", "LightSwitchUp"] }
  ]
});
equal(readWiperState(lowerCaseVehicleControls), "Interval", "Kleingeschriebenes Wischerintervall wird normalisiert");
equal(readExteriorLightState(lowerCaseVehicleControls).switchState, "Parking Lights", "Ebusco-Parking-State wird normalisiert");

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

// Der Urbino liefert in Neutral dauerhaft den widerspruechlichen direkten
// Getriebewert R. Sein Gear-Selector-Button wurde live als korrekte Quelle
// bestaetigt und darf deshalb nur bei dieser Familie Vorrang erhalten.
const urbinoGear = new GearStateResolver();
equal(urbinoGear.resolve(vehicle({
  InputIdentifier: "urbino",
  Gearbox: { CurrentSelector: "D" },
  Buttons: [{ Name: "Gear Selector", State: "Drive" }]
}), 0), "D", "Urbino startet mit uebereinstimmendem D");
urbinoGear.expect("N", 100);
equal(urbinoGear.resolve(vehicle({
  InputIdentifier: "urbino",
  Gearbox: { CurrentSelector: "R" },
  Buttons: [{ Name: "Gear Selector", State: "Neutral" }]
}), 150), "N", "Urbino bevorzugt bei der live bestaetigten Neutral-Abweichung den korrekten Buttonzustand");

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
equal(JSON.stringify(readAvailableDoorStates(vehicle({
  InputIdentifier: "MAN",
  doors: [
    { Name: "Door Front", Index: "First", Open: "false", Progress: "0.0" },
    { Name: "Door Rear", Index: "Third", Open: "true", Progress: "1.0" },
    { Name: "Door Middle", Index: "Second ", Open: "false", Progress: "0.0" }
  ]
}))), '["closed","closed","open"]', "MAN-Tuerzustand wird nach dem echten physischen Index sortiert");
equal(JSON.stringify(readAvailableDoorStates(vehicle({
  doors: [
    { Name: "Legacy 1", Open: "true", Progress: "1.0" },
    { Name: "Legacy 2", Open: "false", Progress: "0.0" }
  ]
}))), '["open","closed"]', "Fahrzeuge ohne Index-Metadaten behalten ihre bisherige Reihenfolge");

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
const scaniaRaisedKneeling = vehicle({
  InputIdentifier: "Scania",
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([0.2, 0.4, 0.3])
});
equal(readKneelingButtonState(scaniaRaisedKneeling), undefined, "Scania ignoriert den live als unzuverlaessig bestaetigten Kneeling-Button");
equal(readKneelingState(scaniaRaisedKneeling), false, "Scania erkennt den angehobenen Zustand mechanisch");
equal(readKneelingState(vehicle({
  InputIdentifier: "Scania",
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([10.0, 10.3, 9.4])
})), true, "Scania erkennt den abgesenkten Zustand mechanisch trotz unveraendertem Button");
const manRaisedKneeling = vehicle({
  InputIdentifier: "MAN",
  Buttons: [{ Name: "Kneeling", State: "Secondary" }],
  Wheels: wheels([1.0, 1.1, 0.9])
});
equal(readKneelingButtonState(manRaisedKneeling), false, "MAN Secondary bestaetigt live den angehobenen Zustand");
equal(readKneelingState(manRaisedKneeling), false, "MAN zeigt den angehobenen Zustand korrekt an");
const manLoweredKneeling = vehicle({
  InputIdentifier: "MAN",
  Buttons: [{ Name: "Kneeling", State: "Primary" }],
  Wheels: wheels([3.7, 3.8, 3.6])
});
equal(readKneelingButtonState(manLoweredKneeling), true, "MAN Primary bestaetigt live den abgesenkten Zustand");
equal(readKneelingState(manLoweredKneeling), true, "MAN zeigt den abgesenkten Zustand korrekt an");
equal(resolveManualKneelingEvent(manRaisedKneeling, true), "KneelDown", "MAN senkt mit dem live bestaetigten Event ab");
equal(resolveManualKneelingEvent(manLoweredKneeling, false), "KneelUp", "MAN hebt mit dem live bestaetigten Event an");

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
