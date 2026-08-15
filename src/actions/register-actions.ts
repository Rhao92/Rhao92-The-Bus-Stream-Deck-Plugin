import { ActionRegistry, type ActionConstructor } from "../core/action-registry";
import {
  ConfigurableGearSelectorAction,
  DoorControlAction,
  IndicatorControlAction,
  KneelingControlAction,
  PassengerLightControlAction
} from "./consolidated-controls";
import { AutomaticDoorClosingAction } from "./automatic-door-closing";
import { AutomaticKneelingAction } from "./automatic-kneeling";
import { DoorClearanceAction } from "./door-clearance";
import {
  IndicatorLeftAction,
  IndicatorRightAction,
  ParkingBrakeAction,
  WarningLightsAction
} from "./driving-controls";
import {
  ExteriorLightControlAction,
  RetarderControlAction,
  SunBlindAction,
  TicketControlAction,
  WiperControlAction
} from "./extended-controls";
import {
  AllDoorsAction,
  Door1Action,
  Door2Action,
  Door3Action,
  Door4Action
} from "./doors";
import { IgnitionAction } from "./ignition";
import { HvacControlAction } from "./hvac";
import { HvacDialAction } from "./hvac-dial";
import { FullpanelAction } from "./fullpanel";
import {
  TimetableButtonAction,
  TimetablePanelAction,
  VehicleBatteryAction,
  VehiclePowerAction,
  VehicleSpeedAction,
  VehicleSpeedLimitAction
} from "./fullpanel-displays";
import {
  GearDriveAction,
  GearNeutralAction,
  GearReverseAction
} from "./gear-selector";
import { KneelingAction } from "./kneeling";
import {
  NavigationAction,
  NavigationConfidenceAction,
  NavigationEtaAction,
  NavigationManeuverDistanceAction,
  NavigationNextStopAction,
  NavigationPredictedDeltaAction,
  NavigationRemainingDistanceAction,
  NavigationRouteProgressAction
} from "./navigation";
import { NavigationDebugCaptureAction } from "./navigation-debug";
import {
  PassengerLightsAction,
  PassengerLightsBrightAction,
  PassengerLightsDimAction
} from "./passenger-lights";
import { RampAction } from "./ramp";
import { StopRequestAction } from "./stop-request";

/**
 * Vollstaendiger Action-Katalog des Manifests.
 *
 * Neue Actions werden kuenftig nur noch hier ergaenzt. plugin.ts muss weder
 * Instanzen erzeugen noch einzelne SDK-Registrierungen kennen.
 */
const PLUGIN_ACTIONS = [
  FullpanelAction,
  TimetablePanelAction,
  TimetableButtonAction,
  NavigationAction,
  NavigationManeuverDistanceAction,
  NavigationNextStopAction,
  NavigationRemainingDistanceAction,
  NavigationRouteProgressAction,
  NavigationEtaAction,
  NavigationPredictedDeltaAction,
  NavigationConfidenceAction,
  NavigationDebugCaptureAction,
  VehicleSpeedAction,
  VehicleSpeedLimitAction,
  VehiclePowerAction,
  VehicleBatteryAction,
  HvacControlAction,
  HvacDialAction,
  DoorControlAction,
  ConfigurableGearSelectorAction,
  IndicatorControlAction,
  RetarderControlAction,
  SunBlindAction,
  WiperControlAction,
  KneelingControlAction,
  PassengerLightControlAction,
  ExteriorLightControlAction,
  TicketControlAction,
  StopRequestAction,
  KneelingAction,
  RampAction,
  DoorClearanceAction,
  AutomaticDoorClosingAction,
  AutomaticKneelingAction,
  PassengerLightsAction,
  PassengerLightsDimAction,
  PassengerLightsBrightAction,
  IgnitionAction,
  GearDriveAction,
  GearNeutralAction,
  GearReverseAction,
  ParkingBrakeAction,
  IndicatorLeftAction,
  IndicatorRightAction,
  WarningLightsAction,
  AllDoorsAction,
  Door1Action,
  Door2Action,
  Door3Action,
  Door4Action
] satisfies readonly ActionConstructor[];

export function registerPluginActions(): ActionRegistry {
  const registry = new ActionRegistry();
  registry.registerAll(PLUGIN_ACTIONS);
  return registry;
}
