export type TimetableKind =
  | "stop"
  | "arrival"
  | "departure"
  | "delta"
  | "ingame"
  | "status"
  | "stop-request";

export type FullpanelLayer = "timetable" | "vehicle" | "navigation";

export type FullpanelViewModel = {
  language: "de" | "en";
  online: boolean;
  inVehicle: boolean;
  runtimeState: PluginRuntimeState;
  connectionLabel: string;
  stopName: string;
  arrival: string;
  departure: string;
  deltaText: string;
  deltaSeconds?: number;
  deltaSource: string;
  status: string;
  ingameTime: string;
  stopRequest: boolean;
  speed: number;
  allowedSpeed: number;
  speedOverLimit: number;
  speedLevel: "normal" | "warning" | "critical";
  gear: string;
  batteryPercent?: number;
  doors: string;
  parkingBrake: string;
  autoKneeling: boolean;
  mechanicalKneeling: string;
  power: string;
  powerSource: "direct" | "average-consumption" | "average-consumption-pending" | "unavailable";
};

export type FullpanelOverlay = {
  title: string;
  value: string;
  expiresAt: number;
};

export const TIMETABLE_KINDS = new Set<TimetableKind>([
  "stop",
  "arrival",
  "departure",
  "delta",
  "ingame",
  "status",
  "stop-request"
]);

export function normalizeTimetableKind(value: unknown): TimetableKind {
  return TIMETABLE_KINDS.has(value as TimetableKind)
    ? value as TimetableKind
    : "stop";
}
import type { PluginRuntimeState } from "../core/telemetry";
