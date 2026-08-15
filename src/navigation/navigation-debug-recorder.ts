import {
  mkdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  MissionStop,
  TelemetrySnapshot
} from "../core/telemetry";
import {
  RouteGuidanceHub,
  RouteGuidanceModel
} from "./route-guidance";

type StoredSample = {
  at: number;
  routeContextId?: string;
  data: Record<string, unknown>;
};

type StoredRouteContext = {
  id: string;
  firstSeen: number;
  lastSeen: number;
  data: Record<string, unknown>;
};

export type NavigationDebugExport = {
  path: string;
  directory: string;
  destination: NavigationDebugDestinationKind;
  sampleCount: number;
  routeContextCount: number;
  durationSeconds: number;
  byteLength: number;
  from?: number;
  to?: number;
};

export type NavigationDebugDestinationKind =
  | "configured"
  | "custom";

export type NavigationDebugDestination = {
  directory: string;
  kind: NavigationDebugDestinationKind;
};

export type NavigationDebugWriteAttempt = {
  directory: string;
  destination: NavigationDebugDestinationKind;
  code?: string;
  message: string;
};

export class NavigationDebugExportError extends Error {
  constructor(readonly attempts: NavigationDebugWriteAttempt[]) {
    super(
      attempts.length > 0
        ? `Navi-Debug-Export fehlgeschlagen: ${attempts
          .map((attempt) => `${attempt.destination}:${attempt.code ?? "ERROR"}`)
          .join(", ")}`
        : "Kein beschreibbarer Navi-Debug-Ordner gefunden."
    );
    this.name = "NavigationDebugExportError";
  }
}

const FORMAT_VERSION = 2;
const PLUGIN_VERSION = "2.15.0.18-beta";
const BUFFER_MS = 60_000;
const BUFFER_RETENTION_MS = BUFFER_MS + 5_000;
export const NAVIGATION_DEBUG_OUTPUT_DIRECTORY =
  join(homedir(), "Documents", "Projekte", "The Bus", "NaviDebug");

function clip(value: unknown, maxLength = 360): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength - 3)}...`;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolOrUndefined(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "on", "yes"].includes(normalized)) return true;
    if (["false", "off", "no"].includes(normalized)) return false;
  }
  return undefined;
}

function roundNumber(value: unknown, digits = 2): number | undefined {
  const parsed = numberOrUndefined(value);
  if (parsed === undefined) return undefined;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function jsonSafe<T>(value: T): T | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return undefined;
  }
}

/** Nutzt exakt dieselbe aktive PathLanes-Auswahl wie RouteGuidanceEngine. */
function activeRouteLaneIds(snapshot: TelemetrySnapshot): number[] {
  const route = snapshot.route;
  const candidates: unknown[][] = [];
  if (Array.isArray(route?.PathLanes)) candidates.push(route.PathLanes);
  if (Array.isArray(route?.Paths)) {
    for (const path of route.Paths) {
      if (Array.isArray(path?.PathLanes) && path.PathLanes.length > 0) {
        candidates.push(path.PathLanes);
        break;
      }
    }
  }
  return (candidates[0] ?? [])
    .map(numberOrUndefined)
    .filter((value): value is number => value !== undefined && value >= 0)
    .map((value) => Math.trunc(value));
}

function stopSummary(stop: MissionStop | undefined): Record<string, unknown> {
  return {
    name: stop?.StopName ?? stop?.GroupName,
    geo: stop?.GeoLocation,
    arrival: stop?.ArrivalTime,
    departure: stop?.DepartureTime
  };
}

function timestampAge(now: number, timestamp: number | undefined): number | undefined {
  return timestamp === undefined ? undefined : Math.max(0, now - timestamp);
}

function featureForLane(features: unknown[], laneId: number): unknown {
  const direct = features[Math.trunc(laneId)];
  if (direct) return direct;
  const idKeys = ["id", "ID", "Id", "LaneId", "LaneID", "laneId"];
  return features.find((feature) => {
    if (!feature || typeof feature !== "object") return false;
    const source = feature as Record<string, unknown>;
    const properties = source.properties && typeof source.properties === "object"
      ? source.properties as Record<string, unknown>
      : undefined;
    return idKeys.some((key) => (
      numberOrUndefined(source[key]) === laneId
      || numberOrUndefined(properties?.[key]) === laneId
    ));
  });
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function routeContextIdentity(
  snapshot: TelemetrySnapshot,
  laneIds: number[]
): string | undefined {
  if (laneIds.length === 0 && !snapshot.route) return undefined;
  const missionStops = Array.isArray(snapshot.mission?.Stops)
    ? snapshot.mission.Stops.map((stop) => [
      stop.StopName ?? stop.GroupName ?? "",
      stop.GeoLocation ?? null
    ])
    : [];
  const signature = JSON.stringify([
    laneIds,
    snapshot.mission?.MissionClassName ?? "",
    missionStops
  ]);
  return `route-${hashText(signature)}`;
}

function buildRouteContext(
  id: string,
  snapshot: TelemetrySnapshot,
  model: RouteGuidanceModel,
  laneIds: number[]
): Record<string, unknown> {
  const features = Array.isArray(snapshot.roadmap?.features)
    ? snapshot.roadmap.features
    : [];
  const debug = model.debug;
  return {
    id,
    activeLaneIds: laneIds,
    rawRouteResponse: jsonSafe(snapshot.route),
    mission: {
      className: snapshot.mission?.MissionClassName,
      currentStopIndex: snapshot.mission?.CurrentStopIndex,
      nextStopIndex: snapshot.mission?.NextStopIndex,
      lastStopReachedIndex: snapshot.mission?.LastStopReachedIndex,
      stops: snapshot.mission?.Stops?.map(stopSummary)
    },
    roadmap: {
      totalFeatureCount: features.length,
      relevantLaneFeatures: laneIds.map((laneId) => {
        const feature = featureForLane(features, laneId);
        return {
          laneId,
          found: feature !== undefined,
          feature: jsonSafe(feature)
        };
      })
    },
    engineRoute: debug?.polyline
      ? {
        routeSignature: debug.routeSignature,
        polyline: jsonSafe(debug.polyline),
        orderedStopProjections: jsonSafe(debug.orderedStopProjections)
      }
      : undefined
  };
}

function compactSample(
  snapshot: TelemetrySnapshot,
  model: RouteGuidanceModel,
  at: number,
  routeContextId: string | undefined,
  laneIds: number[]
): Record<string, unknown> {
  const debug = model.debug;
  return {
    at: new Date(at).toISOString(),
    routeContextId,
    runtime: {
      connected: snapshot.connected,
      online: snapshot.online,
      state: snapshot.runtimeState,
      vehicleReady: snapshot.vehicleReady,
      missionReady: snapshot.missionReady,
      busContextAgeMs: timestampAge(at, snapshot.busContextSince)
    },
    freshnessMs: {
      snapshot: timestampAge(at, snapshot.updatedAt),
      player: timestampAge(at, snapshot.playerUpdatedAt),
      vehicle: timestampAge(at, snapshot.vehicleUpdatedAt),
      mission: timestampAge(at, snapshot.missionUpdatedAt),
      world: timestampAge(at, snapshot.worldUpdatedAt),
      route: timestampAge(at, snapshot.routeUpdatedAt),
      roadmap: timestampAge(at, snapshot.roadmapUpdatedAt)
    },
    player: {
      mode: snapshot.player?.Mode,
      vehicleId: snapshot.vehicleId,
      geo: snapshot.player?.GeoLocation,
      rotation: {
        pitch: roundNumber(snapshot.player?.Rotation?.Pitch),
        yaw: roundNumber(snapshot.player?.Rotation?.Yaw),
        roll: roundNumber(snapshot.player?.Rotation?.Roll)
      }
    },
    vehicle: {
      speed: roundNumber(snapshot.vehicle?.Speed),
      allowedSpeed: roundNumber(snapshot.vehicle?.AllowedSpeed),
      gear: clip(snapshot.vehicle?.Gearbox?.CurrentSelector, 20),
      ignition: boolOrUndefined(snapshot.vehicle?.IgnitionEnabled),
      engine: boolOrUndefined(snapshot.vehicle?.EngineStarted)
    },
    mission: {
      className: clip(snapshot.mission?.MissionClassName, 160),
      currentStopIndex: snapshot.mission?.CurrentStopIndex,
      nextStopIndex: snapshot.mission?.NextStopIndex,
      lastStopReachedIndex: snapshot.mission?.LastStopReachedIndex,
      currentStop: stopSummary(snapshot.mission?.CurrentStop),
      nextStop: stopSummary(snapshot.mission?.NextStop),
      lastStopReached: stopSummary(snapshot.mission?.LastStopReached),
      stopCount: snapshot.mission?.Stops?.length,
      startStopReached: boolOrUndefined(snapshot.mission?.StartStopReached),
      destinationStopReached: boolOrUndefined(
        snapshot.mission?.DestinationStopReached
      )
    },
    route: {
      activeLaneCount: laneIds.length,
      activeLaneIds: laneIds,
      roadmapFeatureCount: Array.isArray(snapshot.roadmap?.features)
        ? snapshot.roadmap.features.length
        : undefined
    },
    guidance: {
      status: model.status,
      activeManeuver: model.activeManeuver,
      nextManeuver: model.nextManeuver,
      maneuverDistance: roundNumber(model.maneuverDistance),
      nextCurveDistance: roundNumber(model.nextCurveDistance),
      nextRelevantStop: model.nextRelevantStop,
      nextRelevantStopDistance: roundNumber(model.nextRelevantStopDistance),
      totalRouteDistance: roundNumber(model.totalRouteDistance),
      remainingRouteDistance: roundNumber(model.remainingRouteDistance),
      routeDistanceEstimated: model.routeDistanceEstimated,
      routeProgressPercent: roundNumber(
        model.routeProgress === undefined ? undefined : model.routeProgress * 100
      ),
      eta: model.estimatedArrivalTime,
      etaSeconds: model.estimatedArrivalSeconds,
      predictedScheduleDelta: model.predictedScheduleDelta,
      predictionConfidence: model.predictionConfidence,
      projectionDistance: roundNumber(model.projectionDistance),
      routeLaneCount: model.routeLaneCount
    },
    decision: debug
      ? {
        stage: debug.stage,
        routeSignature: clip(debug.routeSignature),
        routeStableForMs: debug.routeStableForMs,
        targetIndex: debug.targetIndex,
        targetName: debug.targetName,
        targetFinal: debug.targetFinal,
        currentAlong: roundNumber(debug.currentAlong),
        rawAlong: roundNumber(debug.rawAlong),
        projectionDistance: roundNumber(debug.projectionDistance),
        playerProjectionCandidates: debug.playerProjectionCandidates,
        segmentStartAlong: roundNumber(debug.segmentStartAlong),
        segmentEndAlong: roundNumber(debug.segmentEndAlong),
        stopAlong: roundNumber(debug.stopAlong),
        nextStopDistance: roundNumber(debug.nextStopDistance),
        stopProjectionCandidates: debug.stopProjectionCandidates,
        maneuverClassificationEnd: roundNumber(debug.maneuverClassificationEnd),
        maneuverScan: debug.maneuverScan,
        geometryManeuver: debug.geometryManeuver,
        detectedManeuver: debug.detectedManeuver,
        fallbackManeuver: debug.fallbackManeuver,
        straightManeuver: debug.straightManeuver,
        straightChecks: debug.straightChecks,
        latchedManeuver: debug.latchedManeuver,
        lockedManeuverActive: debug.lockedManeuverActive,
        pendingProjectionJump: debug.pendingProjectionJump,
        pendingManeuverExit: debug.pendingManeuverExit,
        chosenManeuver: debug.chosenManeuver,
        selectionReason: debug.selectionReason,
        rejectReason: debug.rejectReason
      }
      : undefined
  };
}

function formatExport(
  samples: StoredSample[],
  routeContexts: StoredRouteContext[],
  exportedAt: number
): string {
  const from = samples[0]?.at;
  const to = samples.at(-1)?.at;
  const duration = from === undefined || to === undefined
    ? 0
    : Math.max(0, (to - from) / 1000);
  const contextPayload = routeContexts.map((context) => ({
    firstSeen: new Date(context.firstSeen).toISOString(),
    lastSeen: new Date(context.lastSeen).toISOString(),
    ...context.data
  }));
  const header = [
    "Rhao92 The Bus Telemetry Interface - Navigation Blackbox",
    `Format-Version: ${FORMAT_VERSION}`,
    `Plugin-Version: ${PLUGIN_VERSION}`,
    `Exported: ${new Date(exportedAt).toISOString()}`,
    `Window: ${from ? new Date(from).toISOString() : "--"}`
      + ` -> ${to ? new Date(to).toISOString() : "--"}`,
    `Captured-Duration-Seconds: ${duration.toFixed(1)}`,
    `Samples: ${samples.length}`,
    `Route-Contexts: ${routeContexts.length}`,
    "",
    "Die Datei enthaelt die 60 Sekunden VOR dem Tastendruck.",
    "ROUTE_CONTEXTS enthaelt die dazugehoerigen Lane-/Polyline-Geometrien.",
    "SAMPLES_JSONL enthaelt pro Zeile einen zeitlich geordneten Navi-Snapshot.",
    "",
    "=== ROUTE_CONTEXTS_JSON ===",
    JSON.stringify(contextPayload, undefined, 2),
    "",
    "=== SAMPLES_JSONL ==="
  ].join("\n");
  const sampleLines = samples.map((sample) => JSON.stringify(sample.data));
  return `${header}\n${sampleLines.join("\n")}\n=== END ===\n`;
}

function timestampName(now: number): string {
  return new Date(now)
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
}

function outputDirectories(): NavigationDebugDestination[] {
  return [{
    directory: NAVIGATION_DEBUG_OUTPUT_DIRECTORY,
    kind: "configured"
  }];
}

function writeAttempt(
  error: unknown,
  target: NavigationDebugDestination
): NavigationDebugWriteAttempt {
  const source = error as NodeJS.ErrnoException;
  return {
    directory: target.directory,
    destination: target.kind,
    code: typeof source?.code === "string" ? source.code : undefined,
    message: error instanceof Error ? error.message : String(error)
  };
}

export class NavigationDebugRecorder {
  private static readonly singleton = new NavigationDebugRecorder();

  static get instance(): NavigationDebugRecorder {
    return this.singleton;
  }

  private readonly guidanceHub = RouteGuidanceHub.instance;
  private readonly samples: StoredSample[] = [];
  private readonly routeContexts = new Map<string, StoredRouteContext>();
  private releaseGuidance: (() => void) | undefined;

  /** Dev-Blackbox startet einmalig mit dem Plugin und schreibt noch nichts. */
  start(): void {
    if (this.releaseGuidance) return;
    this.releaseGuidance = this.guidanceHub.subscribe((snapshot, model) => {
      this.record(snapshot, model);
    });
  }

  stop(): void {
    this.releaseGuidance?.();
    this.releaseGuidance = undefined;
  }

  clear(): void {
    this.samples.length = 0;
    this.routeContexts.clear();
  }

  record(
    snapshot: TelemetrySnapshot,
    model: RouteGuidanceModel,
    now = Date.now()
  ): void {
    const laneIds = activeRouteLaneIds(snapshot);
    const routeContextId = routeContextIdentity(snapshot, laneIds);
    if (routeContextId) {
      const existing = this.routeContexts.get(routeContextId);
      const roadmap = existing?.data.roadmap as
        | { relevantLaneFeatures?: unknown[] }
        | undefined;
      const needsRefresh = !existing
        || (!existing.data.engineRoute && model.debug?.polyline)
        || (!(roadmap?.relevantLaneFeatures?.length)
          && Array.isArray(snapshot.roadmap?.features));
      if (!existing || needsRefresh) {
        this.routeContexts.set(routeContextId, {
          id: routeContextId,
          firstSeen: existing?.firstSeen ?? now,
          lastSeen: now,
          data: buildRouteContext(
            routeContextId,
            snapshot,
            model,
            laneIds
          )
        });
      } else {
        existing.lastSeen = now;
      }
    }
    this.samples.push({
      at: now,
      routeContextId,
      data: compactSample(snapshot, model, now, routeContextId, laneIds)
    });
    this.trim(now);
  }

  exportLastMinute(now = Date.now(), directory?: string): NavigationDebugExport {
    this.trim(now);
    const samples = this.samples.filter((sample) => now - sample.at <= BUFFER_MS);
    const contextIds = new Set(
      samples.map((sample) => sample.routeContextId).filter(Boolean)
    );
    const contexts = [...this.routeContexts.values()]
      .filter((context) => contextIds.has(context.id))
      .sort((first, second) => first.firstSeen - second.firstSeen);
    const content = formatExport(samples, contexts, now);
    const filename = `thebus-navigation-debug-${timestampName(now)}.txt`;
    const destinations: NavigationDebugDestination[] = directory
      ? [{ directory, kind: "custom" }]
      : outputDirectories();
    const attempts: NavigationDebugWriteAttempt[] = [];
    for (const destination of destinations) {
      try {
        mkdirSync(destination.directory, { recursive: true });
        const path = join(destination.directory, filename);
        writeFileSync(path, content, "utf8");
        const expectedBytes = Buffer.byteLength(content, "utf8");
        if (statSync(path).size !== expectedBytes) {
          throw new Error("Die geschriebene TXT-Datei ist unvollstaendig.");
        }
        const from = samples[0]?.at;
        const to = samples.at(-1)?.at;
        return {
          path,
          directory: destination.directory,
          destination: destination.kind,
          sampleCount: samples.length,
          routeContextCount: contexts.length,
          durationSeconds: from === undefined || to === undefined
            ? 0
            : Math.max(0, (to - from) / 1000),
          byteLength: expectedBytes,
          from,
          to
        };
      } catch (error) {
        attempts.push(writeAttempt(error, destination));
      }
    }
    throw new NavigationDebugExportError(attempts);
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  private trim(now: number): void {
    const keepAfter = now - BUFFER_RETENTION_MS;
    while (this.samples.length > 0 && this.samples[0]!.at < keepAfter) {
      this.samples.shift();
    }
    const referencedContexts = new Set(
      this.samples.map((sample) => sample.routeContextId).filter(Boolean)
    );
    for (const [id, context] of this.routeContexts) {
      if (!referencedContexts.has(id) && context.lastSeen < keepAfter) {
        this.routeContexts.delete(id);
      }
    }
  }
}
