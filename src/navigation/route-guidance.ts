// @ts-nocheck -- Geometrie wird durch eigene Regressionstests abgedeckt.
import streamDeck from "@elgato/streamdeck";
import {
  MissionStop,
  MissionTelemetry,
  TelemetryClient,
  TelemetrySnapshot
} from "../core/telemetry";

export type ManeuverKind =
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "lane-left"
  | "lane-right"
  | "uturn"
  | "stop"
  | "destination"
  | "recalculating"
  | "unavailable";

export type GuidanceStatus =
  | "offline"
  | "no-vehicle"
  | "bus-not-ready"
  | "loading-map"
  | "no-route"
  | "stale-route"
  | "off-route"
  | "reversing"
  | "live";

export type PredictionConfidence = "none" | "low" | "medium" | "high";

export type ActiveManeuver = {
  id: string;
  kind: ManeuverKind;
  distance: number;
};

type RouteGuidanceDebugManeuver = {
  kind: ManeuverKind;
  along: number;
  completeAlong: number;
  distance: number;
};

export type RouteGuidanceDebugInfo = {
  at: number;
  stage?: string;
  routeSignature?: string;
  routeStableForMs?: number;
  laneIds?: number[];
  polyline?: {
    points: Array<[number, number]>;
    total: number;
    gapTotal: number;
    maximumGap: number;
    laneJoints: Array<{
      along: number;
      gap: number;
      confirmedChange?: "lane-left" | "lane-right";
    }>;
  };
  orderedStopProjections?: Array<{
    distance: number;
    along: number;
    segmentIndex: number;
  }>;
  targetIndex?: number;
  targetName?: string;
  targetFinal?: boolean;
  currentAlong?: number;
  rawAlong?: number;
  projectionDistance?: number;
  playerProjectionCandidates?: Array<{
    distance: number;
    along: number;
    segmentIndex: number;
  }>;
  segmentStartAlong?: number;
  segmentEndAlong?: number;
  stopAlong?: number;
  nextStopDistance?: number;
  stopProjectionCandidates?: Array<{
    distance: number;
    along: number;
    segmentIndex: number;
  }>;
  maneuverClassificationEnd?: number;
  maneuverScan?: {
    searchStart?: number;
    searchEnd?: number;
    evidenceCount?: number;
    groups: Array<{
      startAlong: number;
      endAlong: number;
      sign: number;
      sampleCount: number;
      windowAngle?: number;
      classifiedKind?: ManeuverKind;
      selected?: boolean;
      rejection?: string;
    }>;
    laneJoint?: {
      along: number;
      gap: number;
      kind: "lane-left" | "lane-right";
    };
  };
  geometryManeuver?: RouteGuidanceDebugManeuver;
  detectedManeuver?: RouteGuidanceDebugManeuver;
  fallbackManeuver?: {
    kind: ManeuverKind;
    along: number;
    distance: number;
  };
  straightManeuver?: {
    along: number;
    distance: number;
  };
  straightChecks?: Record<string, boolean>;
  latchedManeuver?: RouteGuidanceDebugManeuver;
  lockedManeuverActive?: boolean;
  pendingProjectionJump?: {
    along: number;
    samples: number;
    ageMs: number;
  };
  pendingManeuverExit?: {
    kind: ManeuverKind;
    along: number;
    samples: number;
    ageMs: number;
  };
  chosenManeuver?: RouteGuidanceDebugManeuver;
  selectionReason?: string;
  rejectReason?: string;
};

export type RouteGuidanceModel = {
  online: boolean;
  inVehicle: boolean;
  status: GuidanceStatus;
  activeManeuver?: ActiveManeuver;
  nextManeuver: ManeuverKind;
  maneuverDistance?: number;
  nextCurveDistance?: number;
  nextRelevantStop: string;
  nextRelevantStopDistance?: number;
  totalRouteDistance?: number;
  remainingRouteDistance?: number;
  routeDistanceEstimated?: boolean;
  routeProgress?: number;
  estimatedArrivalTime?: string;
  estimatedArrivalSeconds?: number;
  predictedScheduleDelta?: number;
  predictionConfidence: PredictionConfidence;
  projectionDistance?: number;
  routeLaneCount: number;
  debug?: RouteGuidanceDebugInfo;
};

type GeoPoint = [number, number];
type Projection = { distance: number; along: number; segmentIndex: number };
type LaneChange = "lane-left" | "lane-right";
type RouteManeuver = {
  kind: ManeuverKind;
  along: number;
  completeAlong: number;
};
type Polyline = {
  points: GeoPoint[];
  cumulative: number[];
  total: number;
  gapTotal: number;
  maximumGap: number;
  laneJoints: Array<{ along: number; gap: number; confirmedChange?: LaneChange }>;
};

const EARTH_RADIUS_METERS = 6_371_000;
// Der Route-Endpunkt darf waehrend mehrerer 1,5-s-Timeouts aussetzen, ohne
// einen weiterhin raeumlich passenden Linienzug sofort grau zu schalten.
const ROUTE_STALE_MS = 10_000;
const MAX_ROUTE_PROJECTION_METERS = 100;
const MAX_STOP_PROJECTION_METERS = 150;
const STOP_ORDER_TOLERANCE_METERS = 15;
const STOP_REACHED_RADIUS_METERS = 45;
const DISTANCE_SANITY_TOLERANCE_METERS = 25;
const MAX_STOP_PROJECTION_CANDIDATES = 96;
const MAX_CONTINUITY_GAP_METERS = 120;
// Reale The-Bus-Duplikate liegen nicht immer exakt uebereinander: Im
// Habermannzeile-Mitschnitt sind die paarweisen Endpunkte 3,1 bis 3,5 m
// versetzt. Fuenf Meter erfassen diese Parallelspur-Duplikate, waehrend die
// beidseitige Vollspurpruefung und explizite Lane-Change-Metadaten echte
// Spurwechsel weiterhin schuetzen.
// The Bus liefert an breiten Strassen auch Dreiergruppen paralleler Lane-IDs.
// Die beiden aeusseren Alternativen liegen dabei bis rund 6,7 m auseinander.
// Ohne explizite Spurwechsel-Metadaten beschreiben sie denselben Routenast und
// duerfen nicht als Hin-und-zurueck-Schleife verkettet werden.
const REDUNDANT_LANE_ENDPOINT_TOLERANCE_METERS = 7;
const REDUNDANT_LANE_TRACE_TOLERANCE_METERS = 7;
const MANEUVER_SEARCH_METERS = 1_500;
const PROJECTION_JUMP_METERS = 70;
const PROJECTION_JUMP_TOLERANCE_METERS = 35;
const PROJECTION_CONFIRMATION_SAMPLES = 3;
const PROJECTION_CONFIRMATION_MS = 250;
const MANEUVER_EXIT_HYSTERESIS_METERS = 8;
const MANEUVER_EXIT_CONFIRMATION_SAMPLES = 3;
const MANEUVER_EXIT_CONFIRMATION_MS = 250;
// Zwei enge Gegenabbieger duerfen nicht allein wegen ihrer nahezu geraden
// Nettoausrichtung verschwinden. Die Begrenzung auf kurze, jeweils deutlich
// abknickende Gruppen trennt reale Kreuzungs-S-Folgen von langen Strassenboegen
// wie der Gegenkurve vor U Jakob-Kaiser-Platz.
const COMPACT_S_MANEUVER_MAX_LENGTH_METERS = 100;
const COMPACT_S_GROUP_MAX_LENGTH_METERS = 60;
const COMPACT_S_MIN_TURN_DEGREES = 45;
const COMPACT_S_BEARING_SPAN_METERS = 10;
const STRAIGHT_GUIDANCE_CONFIRMATION_MS = 500;
const STRAIGHT_GUIDANCE_MAX_GAP_METERS = 12;
// Ein Halt kann unmittelbar hinter einer Kurve liegen. Fuer die Klassifikation
// des davor beginnenden Manoevers darf die Geometrie deshalb etwas ueber den
// Halteanker hinaus betrachtet werden. Als aktives Manoever wird weiterhin
// ausschliesslich ein Richtungswechsel akzeptiert, dessen Eintritt klar vor
// dem Halt liegt; ein Folgeabbieger hinter dem Halt kann dadurch nicht gewinnen.
const MANEUVER_POST_STOP_CONTEXT_METERS = 120;
// Der kuenstliche Geradeaus-Hinweis schliesst nur die schmale Luecke zwischen
// einem echten Manoever und der ab 300 m sichtbaren Haltestellenanfahrt. Er ist
// kein Ersatz fuer eine ueber lange Distanz fehlende Manoevererkennung.
// Schließt auch längere, vollständig projizierte Stadtabschnitte wie
// Buchholzweg -> Gedenkstätte Plötzensee ein, ohne die frühere unsichere
// 1,3-km-Geradeausanzeige wieder zuzulassen.
const STRAIGHT_GUIDANCE_MAX_DISTANCE_METERS = 750;

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isTelemetryTrue(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === "string"
    && ["true", "1", "on"].includes(value.trim().toLowerCase());
}

function asObject(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object"
    ? value as Record<string, any>
    : undefined;
}

function latLon(value: unknown): GeoPoint | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const latitude = asNumber(value[0]);
  const longitude = asNumber(value[1]);
  if (
    latitude === undefined
    || longitude === undefined
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) return undefined;
  return [latitude, longitude];
}

function geoJsonPoint(value: unknown): GeoPoint | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const longitude = asNumber(value[0]);
  const latitude = asNumber(value[1]);
  if (
    latitude === undefined
    || longitude === undefined
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) return undefined;
  return [latitude, longitude];
}

function localMeters(to: GeoPoint, from: GeoPoint): [number, number] {
  const latitude = from[0] * Math.PI / 180;
  return [
    (to[1] - from[1]) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(latitude),
    (to[0] - from[0]) * Math.PI / 180 * EARTH_RADIUS_METERS
  ];
}

function metersBetween(first: GeoPoint, second: GeoPoint): number {
  const [east, north] = localMeters(second, first);
  return Math.hypot(east, north);
}

function missionStopSegmentDistances(
  mission: MissionTelemetry | undefined
): number[] | undefined {
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  if (stops.length < 2) return undefined;
  const locations = stops.map((stop) => latLon(stop?.GeoLocation));
  if (locations.some((location) => !location)) return undefined;
  const distances: number[] = [];
  for (let index = 1; index < locations.length; index += 1) {
    const value = metersBetween(locations[index - 1]!, locations[index]!);
    if (!Number.isFinite(value)) return undefined;
    distances.push(Math.max(0, value));
  }
  return distances;
}

function linesFromGeometry(geometry: any): GeoPoint[][] {
  if (!geometry) return [];
  if (geometry.type === "LineString") {
    const points = Array.isArray(geometry.coordinates)
      ? geometry.coordinates.map(geoJsonPoint).filter(Boolean)
      : [];
    return points.length >= 2 ? [points] : [];
  }
  if (geometry.type === "MultiLineString") {
    return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
      .map((coordinates: unknown) => Array.isArray(coordinates)
        ? coordinates.map(geoJsonPoint).filter(Boolean)
        : [])
      .filter((points: GeoPoint[]) => points.length >= 2);
  }
  if (geometry.type === "GeometryCollection") {
    return (Array.isArray(geometry.geometries) ? geometry.geometries : [])
      .flatMap(linesFromGeometry);
  }
  return [];
}

function featureForLane(features: any[], laneId: number): any {
  const direct = features[Math.trunc(laneId)];
  if (direct) return direct;
  const idKeys = ["id", "ID", "Id", "LaneId", "LaneID", "laneId"];
  return features.find((feature) => {
    const source = asObject(feature);
    const properties = asObject(source?.properties);
    return idKeys.some((key) => (
      asNumber(source?.[key]) === laneId
      || asNumber(properties?.[key]) === laneId
    ));
  });
}

function confirmedLaneChange(...sources: any[]): LaneChange | undefined {
  const keys = new Set([
    "lanechange",
    "lanechangedirection",
    "lanechangetype",
    "lanetransition",
    "lanetransitiondirection",
    "spurwechsel",
    "spurwechselrichtung"
  ]);
  for (const sourceValue of sources) {
    for (const source of [
      asObject(sourceValue),
      asObject(sourceValue?.properties)
    ].filter(Boolean)) {
      for (const [rawKey, rawValue] of Object.entries(source)) {
        const key = rawKey.toLowerCase().replaceAll(/[^a-z]/gu, "");
        if (!keys.has(key)) continue;
        const value = String(rawValue ?? "")
          .trim()
          .toLowerCase()
          .replaceAll(/[_-]+/gu, " ");
        if (/\b(left|links)\b/u.test(value)) return "lane-left";
        if (/\b(right|rechts)\b/u.test(value)) return "lane-right";
      }
    }
  }
  return undefined;
}

function appendPoint(points: GeoPoint[], point: GeoPoint): void {
  const previous = points.at(-1);
  if (!previous || metersBetween(previous, point) > 0.2) points.push(point);
}

function buildPolylineMetrics(
  points: GeoPoint[],
  gapTotal: number,
  maximumGap: number,
  rawJoints: Array<{ pointIndex: number; gap: number; confirmedChange?: LaneChange }>
): Polyline | undefined {
  if (points.length < 2) return undefined;
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += metersBetween(points[index - 1], points[index]);
    cumulative.push(total);
  }
  if (!Number.isFinite(total) || total < 5) return undefined;
  return {
    points,
    cumulative,
    total,
    gapTotal,
    maximumGap,
    laneJoints: rawJoints.map((joint) => ({
      along: cumulative[joint.pointIndex] ?? 0,
      gap: joint.gap,
      confirmedChange: joint.confirmedChange
    }))
  };
}

function projectAll(point: GeoPoint, polyline: Polyline): Projection[] {
  const projections: Projection[] = [];
  for (let index = 1; index < polyline.points.length; index += 1) {
    const start = localMeters(polyline.points[index - 1], point);
    const end = localMeters(polyline.points[index], point);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (length < 0.01) continue;
    const fraction = Math.max(0, Math.min(
      1,
      -(start[0] * dx + start[1] * dy) / lengthSquared
    ));
    const east = start[0] + fraction * dx;
    const north = start[1] + fraction * dy;
    projections.push({
      distance: Math.hypot(east, north),
      along: polyline.cumulative[index - 1] + fraction * length,
      segmentIndex: index - 1
    });
  }
  return projections;
}

function nearestProjection(
  point: GeoPoint,
  polyline: Polyline
): Projection | undefined {
  return projectAll(point, polyline).reduce<Projection | undefined>(
    (best, candidate) => !best || candidate.distance < best.distance
      ? candidate
      : best,
    undefined
  );
}

function projectionCandidates(
  point: GeoPoint,
  polyline: Polyline,
  maximumDistance: number
): Projection[] {
  const candidates = projectAll(point, polyline)
    .filter((candidate) => candidate.distance <= maximumDistance)
    .sort((first, second) => first.along - second.along);
  const unique: Projection[] = [];
  for (const candidate of candidates) {
    const previous = unique.at(-1);
    if (previous && Math.abs(previous.along - candidate.along) <= 3) {
      if (candidate.distance < previous.distance) unique[unique.length - 1] = candidate;
    } else {
      unique.push(candidate);
    }
  }
  if (unique.length <= MAX_STOP_PROJECTION_CANDIDATES) return unique;
  return unique
    .sort((first, second) => first.distance - second.distance)
    .slice(0, MAX_STOP_PROJECTION_CANDIDATES)
    .sort((first, second) => first.along - second.along);
}

/**
 * Ordnet Haltestellen nicht einzeln dem geometrisch naechsten Routenteil zu,
 * sondern gemeinsam in Fahrtrichtung. Das ist fuer Schleifen, Gegenfahrbahnen
 * und wiederkehrende Strassen zwingend: derselbe Kartenpunkt kann mehrfach auf
 * dem Linienzug vorkommen.
 */
function orderedMissionStopProjections(
  stops: MissionStop[],
  polyline: Polyline
): Projection[] | undefined {
  if (stops.length < 2) return undefined;
  const locations = stops.map((stop) => latLon(stop?.GeoLocation));
  if (locations.some((location) => !location)) return undefined;
  const candidates = locations.map((location) => (
    projectionCandidates(location!, polyline, MAX_STOP_PROJECTION_METERS)
  ));
  if (candidates.some((values) => values.length === 0)) return undefined;

  type State = { projection: Projection; cost: number; path: Projection[] };
  let states: State[] = candidates[0].map((projection) => ({
    projection,
    cost: projection.distance * 20 + projection.along * 0.01,
    path: [projection]
  }));

  for (let index = 1; index < candidates.length; index += 1) {
    const directDistance = metersBetween(locations[index - 1]!, locations[index]!);
    const nextStates: State[] = [];
    for (const projection of candidates[index]) {
      let best: State | undefined;
      for (const previous of states) {
        const alongGap = projection.along - previous.projection.along;
        if (alongGap < -STOP_ORDER_TOLERANCE_METERS) continue;
        const representedDistance = Math.max(0, alongGap)
          + previous.projection.distance
          + projection.distance
          + DISTANCE_SANITY_TOLERANCE_METERS;
        if (representedDistance < directDistance) continue;
        const cost = previous.cost
          + projection.distance * 20
          + Math.max(0, alongGap) * 0.0005;
        if (!best || cost < best.cost) {
          best = {
            projection,
            cost,
            path: [...previous.path, projection]
          };
        }
      }
      if (best) nextStates.push(best);
    }
    if (nextStates.length === 0) return undefined;
    states = nextStates;
  }

  return states.reduce((best, candidate) => {
    const bestCost = best.cost
      + Math.max(0, polyline.total - best.projection.along) * 0.01;
    const candidateCost = candidate.cost
      + Math.max(0, polyline.total - candidate.projection.along) * 0.01;
    return candidateCost < bestCost ? candidate : best;
  }).path;
}

function choosePlayerProjection(
  projections: Projection[],
  previousAlong: number | undefined,
  segmentStartAlong: number | undefined,
  segmentEndAlong: number | undefined
): Projection | undefined {
  if (projections.length === 0) return undefined;
  if (previousAlong !== undefined) {
    const forward = projections.filter(
      (candidate) => candidate.along >= previousAlong - 30
        && (segmentEndAlong === undefined
          || candidate.along <= segmentEndAlong + 100)
    );
    return (forward.length > 0 ? forward : projections).reduce(
      (best, candidate) => {
        const bestJump = Math.abs(best.along - previousAlong);
        const candidateJump = Math.abs(candidate.along - previousAlong);
        const bestScore = best.distance + 0.05 * Math.max(0, bestJump - 250);
        const candidateScore = candidate.distance
          + 0.05 * Math.max(0, candidateJump - 250);
        return candidateScore < bestScore ? candidate : best;
      }
    );
  }

  const segmentCandidates = projections.filter((candidate) => (
    (segmentStartAlong === undefined
      || candidate.along >= segmentStartAlong - 100)
    && (segmentEndAlong === undefined
      || candidate.along <= segmentEndAlong + STOP_REACHED_RADIUS_METERS)
  ));
  const candidates = segmentCandidates.length > 0
    ? segmentCandidates
    : projections;
  const minimum = Math.min(...candidates.map((candidate) => candidate.distance));
  return candidates
    .filter((candidate) => candidate.distance <= minimum + 8)
    .sort((first, second) => first.along - second.along)[0];
}

function chooseTargetProjection(
  target: GeoPoint,
  player: GeoPoint,
  playerProjection: Projection,
  polyline: Polyline,
  currentAlong: number,
  preferred?: Projection,
  suppliedCandidates?: Projection[]
): Projection | undefined {
  const directDistance = metersBetween(player, target);
  const candidates = suppliedCandidates ?? projectionCandidates(
      target,
      polyline,
      MAX_STOP_PROJECTION_METERS
    );
  let best: { projection: Projection; score: number } | undefined;
  for (const candidate of candidates) {
    const routeDistance = Math.max(0, candidate.along - currentAlong);
    const behind = candidate.along < currentAlong - STOP_ORDER_TOLERANCE_METERS;
    if (behind && directDistance > STOP_REACHED_RADIUS_METERS) continue;
    const representedDistance = routeDistance
      + playerProjection.distance
      + candidate.distance
      + DISTANCE_SANITY_TOLERANCE_METERS;
    if (representedDistance < directDistance) continue;
    const preferredCandidate = preferred
      && Math.abs(preferred.along - candidate.along) <= 3;
    const score = routeDistance + candidate.distance * 2
      - (preferredCandidate ? 10_000 : 0);
    if (!best || score < best.score) best = { projection: candidate, score };
  }
  return best?.projection;
}

function pointOnPolyline(polyline: Polyline, along: number): GeoPoint {
  const target = Math.max(0, Math.min(polyline.total, along));
  let index = 1;
  while (
    index < polyline.cumulative.length
    && polyline.cumulative[index] < target
  ) index += 1;
  if (index >= polyline.points.length) return polyline.points.at(-1)!;
  const startAlong = polyline.cumulative[index - 1];
  const span = polyline.cumulative[index] - startAlong;
  const ratio = span <= 0 ? 0 : (target - startAlong) / span;
  const start = polyline.points[index - 1];
  const end = polyline.points[index];
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio
  ];
}

function isContinuousRouteInterval(
  polyline: Polyline,
  startAlong: number,
  endAlong: number
): boolean {
  const start = Math.min(startAlong, endAlong);
  const end = Math.max(startAlong, endAlong);
  return polyline.laneJoints.every((joint) => (
    joint.along <= start
    || joint.along >= end
    || joint.gap <= STRAIGHT_GUIDANCE_MAX_GAP_METERS
  ));
}

function bearing(first: GeoPoint, second: GeoPoint): number {
  const [east, north] = localMeters(second, first);
  return 180 * Math.atan2(east, north) / Math.PI;
}

function angleDelta(first: number, second: number): number {
  return (second - first + 540) % 360 - 180;
}

function bearingBetween(
  polyline: Polyline,
  fromAlong: number,
  toAlong: number
): number | undefined {
  const start = Math.max(0, Math.min(polyline.total, fromAlong));
  const end = Math.max(0, Math.min(polyline.total, toAlong));
  if (end - start < 8) return undefined;
  const first = pointOnPolyline(polyline, start);
  const second = pointOnPolyline(polyline, end);
  return metersBetween(first, second) < 5
    ? undefined
    : bearing(first, second);
}

function distanceToLine(point: GeoPoint, points: GeoPoint[]): number {
  const metrics = buildPolylineMetrics(points, 0, 0, []);
  return metrics
    ? nearestProjection(point, metrics)?.distance ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
}

/**
 * Erkennt Lane-Geometrien, die denselben kurzen Strassenverlauf beschreiben.
 * The Bus liefert solche IDs vereinzelt direkt hintereinander. Eine erzwungene
 * Verkettung wuerde die zweite Linie rueckwaerts durchlaufen und vor der
 * Folgelane eine kuenstliche Luecke erzeugen.
 */
function redundantLaneTrace(first: GeoPoint[], second: GeoPoint[]): boolean {
  const sameDirection = metersBetween(first[0], second[0])
      <= REDUNDANT_LANE_ENDPOINT_TOLERANCE_METERS
    && metersBetween(first.at(-1)!, second.at(-1)!)
      <= REDUNDANT_LANE_ENDPOINT_TOLERANCE_METERS;
  const oppositeDirection = metersBetween(first[0], second.at(-1)!)
      <= REDUNDANT_LANE_ENDPOINT_TOLERANCE_METERS
    && metersBetween(first.at(-1)!, second[0])
      <= REDUNDANT_LANE_ENDPOINT_TOLERANCE_METERS;
  if (!sameDirection && !oppositeDirection) return false;
  return first.every((point) => (
    distanceToLine(point, second) <= REDUNDANT_LANE_TRACE_TOLERANCE_METERS
  )) && second.every((point) => (
    distanceToLine(point, first) <= REDUNDANT_LANE_TRACE_TOLERANCE_METERS
  ));
}

/**
 * Waehlt pro Lane genau ein kontinuierliches LineString-Teil.
 * Parallele MultiLineString-Teile werden nicht mehr hintereinander gehaengt.
 */
function routeForOrder(
  laneIds: number[],
  features: any[],
  player: GeoPoint,
  finalStop?: GeoPoint,
  startReference?: GeoPoint
): Polyline | undefined {
  const laneFeatures = laneIds.map((id) => featureForLane(features, id));
  const points: GeoPoint[] = [];
  const joints: Array<{
    pointIndex: number;
    gap: number;
    confirmedChange?: LaneChange;
  }> = [];
  let gapTotal = 0;
  let maximumGap = 0;
  let previousSelectedFeature: any;
  let previousLanePoints: GeoPoint[] | undefined;

  for (let laneIndex = 0; laneIndex < laneFeatures.length; laneIndex += 1) {
    const feature = laneFeatures[laneIndex];
    const candidates = linesFromGeometry(feature?.geometry);
    if (candidates.length === 0) continue;
    const nextCandidates = laneIndex + 1 < laneFeatures.length
      ? linesFromGeometry(laneFeatures[laneIndex + 1]?.geometry)
      : [];
    const cursor = points.at(-1);
    let best:
      | { points: GeoPoint[]; score: number; gap: number }
      | undefined;

    for (const rawCandidate of candidates) {
      for (const reversed of [false, true]) {
        const candidate = reversed
          ? [...rawCandidate].reverse()
          : [...rawCandidate];
        const start = candidate[0];
        const end = candidate.at(-1)!;
        const gap = cursor ? metersBetween(cursor, start) : 0;
        const playerDistance = laneIndex === 0
          ? distanceToLine(player, candidate)
          : 0;
        const startGap = laneIndex === 0 && startReference
          ? metersBetween(start, startReference)
          : 0;
        const nextGap = nextCandidates.length > 0
          ? Math.min(...nextCandidates.flatMap((line) => [
            metersBetween(end, line[0]),
            metersBetween(end, line.at(-1)!)
          ]))
          : finalStop
            ? metersBetween(end, finalStop)
            : 0;
        const score = gap * 30
          + playerDistance * 24
          + startGap * 8
          + nextGap * 4;
        if (!best || score < best.score) best = { points: candidate, score, gap };
      }
    }

    if (!best) return undefined;
    const laneChange = confirmedLaneChange(previousSelectedFeature, feature);
    if (
      cursor
      && previousLanePoints
      && !laneChange
      && redundantLaneTrace(previousLanePoints, best.points)
    ) continue;

    if (cursor && best.gap > MAX_CONTINUITY_GAP_METERS) {
      return undefined;
    }

    if (cursor) {
      gapTotal += best.gap;
      maximumGap = Math.max(maximumGap, best.gap);
      const pointIndex = points.length - 1;
      joints.push({
        pointIndex,
        gap: best.gap,
        confirmedChange: laneChange
      });
    }
    for (const point of best.points) appendPoint(points, point);
    previousSelectedFeature = feature;
    previousLanePoints = best.points;
  }

  return buildPolylineMetrics(points, gapTotal, maximumGap, joints);
}

function routeScore(
  polyline: Polyline,
  player: GeoPoint,
  finalStop?: GeoPoint,
  orderedStops: Projection[] = [],
  targetIndex?: number
): number {
  const segmentStartAlong = targetIndex !== undefined && targetIndex > 0
    ? orderedStops[targetIndex - 1]?.along
    : undefined;
  const segmentEndAlong = targetIndex !== undefined
    ? orderedStops[targetIndex]?.along
    : undefined;
  const playerProjection = orderedStops.length > 0
    ? choosePlayerProjection(
      projectAll(player, polyline),
      undefined,
      segmentStartAlong,
      segmentEndAlong
    )
    : nearestProjection(player, polyline);
  if (!playerProjection) return Number.POSITIVE_INFINITY;
  let score = playerProjection.distance * 20
    + polyline.gapTotal * 1.5
    + polyline.maximumGap * 3;
  if (orderedStops.length > 0) {
    score += orderedStops.reduce(
      (sum, projection) => sum + projection.distance * 8,
      0
    );
    const first = orderedStops[0];
    const last = orderedStops.at(-1)!;
    score += first.along * 0.005;
    score += Math.max(0, polyline.total - last.along) * 0.005;
    if (
      segmentStartAlong !== undefined
      && playerProjection.along < segmentStartAlong - 100
    ) score += 100_000;
    if (
      segmentEndAlong !== undefined
      && playerProjection.along > segmentEndAlong + STOP_REACHED_RADIUS_METERS
    ) score += 100_000;
  } else if (finalStop) {
    const stopProjection = nearestProjection(finalStop, polyline);
    if (!stopProjection) return Number.POSITIVE_INFINITY;
    score += stopProjection.distance * 8;
    if (stopProjection.along + 10 < playerProjection.along) score += 100_000;
  }
  return score;
}

export function buildRoutePolyline(
  laneIds: number[],
  features: any[],
  player: GeoPoint,
  finalStop?: GeoPoint,
  missionStops: MissionStop[] = [],
  targetIndex?: number
): Polyline | undefined {
  if (laneIds.length === 0 || features.length === 0) return undefined;
  // /routelaneids liefert in der Praxis oft nur den aktuellen Abschnitt.
  // Dessen Fahrtrichtung darf weder vom weit entfernten Linienstart noch vom
  // Linienendhalt bestimmt werden. Als Richtungsanker gelten deshalb der
  // bestaetigte vorherige Halt und der aktuelle Zielhalt dieses Abschnitts.
  // Ohne vorherigen Halt bleibt die Fahrzeugposition der Start-Fallback; nur
  // ohne aktuellen Zielindex bleibt der Linienendhalt der End-Fallback.
  const segmentStartStop = targetIndex !== undefined && targetIndex > 0
    ? missionStops[targetIndex - 1]
    : undefined;
  const segmentEndStop = targetIndex !== undefined
    ? missionStops[targetIndex]
    : undefined;
  const startReference = latLon(segmentStartStop?.GeoLocation) ?? player;
  const endReference = latLon(segmentEndStop?.GeoLocation) ?? finalStop;
  const candidates = [
    routeForOrder(laneIds, features, player, endReference, startReference),
    routeForOrder(
      [...laneIds].reverse(),
      features,
      player,
      endReference,
      startReference
    )
  ].filter(Boolean) as Polyline[];
  const scoredCandidates = candidates.map((candidate) => ({
    polyline: candidate,
    orderedStops: missionStops.length >= 2
      ? orderedMissionStopProjections(missionStops, candidate) ?? []
      : []
  }));
  const orderedCandidates = scoredCandidates.filter(
    (candidate) => candidate.orderedStops.length === missionStops.length
  );
  const selection = orderedCandidates.length > 0
    ? orderedCandidates
    : scoredCandidates;
  return selection.reduce<{
    polyline: Polyline;
    orderedStops: Projection[];
  } | undefined>(
    (best, candidate) => !best
      || routeScore(
        candidate.polyline,
        player,
        endReference,
        candidate.orderedStops,
        targetIndex
      ) < routeScore(
        best.polyline,
        player,
        endReference,
        best.orderedStops,
        targetIndex
      )
      ? candidate
      : best,
    undefined
  )?.polyline;
}

function maneuverWindow(
  polyline: Polyline,
  startAlong: number,
  endAlong: number,
  routeEnd: number,
  nextGroupAlong?: number
): {
  incomingBearing: number;
  outgoingBearing: number;
  angle: number;
  startAlong: number;
  endAlong: number;
} | undefined {
  let incomingEnd = Math.max(0, startAlong - 10);
  if (incomingEnd < 8 && startAlong >= 8) incomingEnd = startAlong;
  const incomingStart = Math.max(0, incomingEnd - 90);
  let outgoingStart = Math.min(routeEnd, endAlong + 10);
  if (routeEnd - outgoingStart < 8 && routeEnd - endAlong >= 8) {
    outgoingStart = endAlong;
  }
  let outgoingEnd = Math.min(routeEnd, outgoingStart + 110);
  if (nextGroupAlong !== undefined) {
    outgoingEnd = Math.min(outgoingEnd, Math.max(outgoingStart, nextGroupAlong - 10));
  }
  const incomingBearing = bearingBetween(polyline, incomingStart, incomingEnd);
  const outgoingBearing = bearingBetween(polyline, outgoingStart, outgoingEnd);
  if (incomingBearing === undefined || outgoingBearing === undefined) return undefined;
  return {
    incomingBearing,
    outgoingBearing,
    angle: angleDelta(incomingBearing, outgoingBearing),
    startAlong: incomingEnd,
    endAlong: outgoingStart
  };
}

function weightedAlong(group: any): number {
  let weighted = 0;
  let weight = 0;
  for (const evidence of group.evidence) {
    const magnitude = Math.abs(evidence.angle);
    weighted += evidence.along * magnitude;
    weight += magnitude;
  }
  return weight > 0
    ? weighted / weight
    : (group.startAlong + group.endAlong) / 2;
}

function compactSShapeFirstTurn(
  polyline: Polyline,
  first: any,
  second: any,
  routeEnd: number
): number | undefined {
  if (
    second.endAlong - first.startAlong > COMPACT_S_MANEUVER_MAX_LENGTH_METERS
    || first.endAlong - first.startAlong > COMPACT_S_GROUP_MAX_LENGTH_METERS
    || second.endAlong - second.startAlong > COMPACT_S_GROUP_MAX_LENGTH_METERS
    || first.evidence.length < 3
    || second.evidence.length < 3
  ) return undefined;

  const groupAngle = (group: any): number | undefined => {
    const incoming = bearingBetween(
      polyline,
      Math.max(0, group.startAlong - COMPACT_S_BEARING_SPAN_METERS),
      group.startAlong
    );
    const outgoing = bearingBetween(
      polyline,
      group.endAlong,
      Math.min(routeEnd, group.endAlong + COMPACT_S_BEARING_SPAN_METERS)
    );
    return incoming === undefined || outgoing === undefined
      ? undefined
      : angleDelta(incoming, outgoing);
  };
  const firstAngle = groupAngle(first);
  const secondAngle = groupAngle(second);
  if (
    firstAngle === undefined
    || secondAngle === undefined
    || Math.sign(firstAngle) !== first.sign
    || Math.sign(secondAngle) !== second.sign
    || Math.abs(firstAngle) < COMPACT_S_MIN_TURN_DEGREES
    || Math.abs(secondAngle) < COMPACT_S_MIN_TURN_DEGREES
    || Math.abs(firstAngle) >= 155
    || Math.abs(secondAngle) >= 155
  ) return undefined;
  return firstAngle;
}

function continuousUturn(polyline: Polyline, window: any): boolean {
  const sign = window.angle < 0 ? -1 : 1;
  const start = Math.max(0, window.startAlong - 5);
  const end = Math.min(polyline.total, window.endAlong + 5);
  const samples: Array<{ along: number; bearing: number }> = [];
  for (let along = start + 5; along <= end - 5; along += 5) {
    const value = bearingBetween(polyline, along - 5, along + 5);
    if (value !== undefined) samples.push({ along, bearing: value });
  }
  if (samples.length < 5) return false;
  let firstTurnAlong: number | undefined;
  let lastTurnAlong: number | undefined;
  let sameDirection = 0;
  let oppositeDirection = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const delta = angleDelta(samples[index - 1].bearing, samples[index].bearing);
    const magnitude = Math.abs(delta);
    if (magnitude > 65) return false;
    if (magnitude < 1) continue;
    if (Math.sign(delta) === sign) {
      sameDirection += magnitude;
      if (magnitude >= 3) {
        firstTurnAlong ??= samples[index - 1].along;
        lastTurnAlong = samples[index].along;
      }
    } else {
      oppositeDirection += magnitude;
    }
  }
  const turnLength = firstTurnAlong === undefined || lastTurnAlong === undefined
    ? 0
    : lastTurnAlong - firstTurnAlong;
  return sameDirection >= 135 && oppositeDirection <= 35 && turnLength >= 25;
}

function classifyTurn(angle: number): ManeuverKind {
  const magnitude = Math.abs(angle);
  if (magnitude >= 155) return "uturn";
  const side = angle < 0 ? "left" : "right";
  if (magnitude >= 115) return side === "left" ? "sharp-left" : "sharp-right";
  if (magnitude >= 45) return side;
  return side === "left" ? "slight-left" : "slight-right";
}

function findNextManeuver(
  polyline: Polyline,
  currentAlong: number,
  routeEnd: number,
  debug?: NonNullable<RouteGuidanceDebugInfo["maneuverScan"]>
): RouteManeuver | undefined {
  const searchStart = Math.min(routeEnd, currentAlong + 12);
  const searchEnd = Math.min(routeEnd, currentAlong + MANEUVER_SEARCH_METERS);
  if (debug) {
    debug.searchStart = searchStart;
    debug.searchEnd = searchEnd;
  }
  const evidence: Array<{ along: number; angle: number }> = [];
  for (let along = searchStart; along <= searchEnd; along += 5) {
    const incoming = bearingBetween(polyline, along - 24, along - 6);
    const outgoing = bearingBetween(polyline, along + 6, along + 24);
    if (incoming === undefined || outgoing === undefined) continue;
    const angle = angleDelta(incoming, outgoing);
    if (Math.abs(angle) >= 5) evidence.push({ along, angle });
  }
  const groups: any[] = [];
  for (const sample of evidence) {
    const sign = sample.angle < 0 ? -1 : 1;
    const previous = groups.at(-1);
    const previousSample = previous?.evidence.at(-1);
    if (
      previous
      && previousSample
      && previous.sign === sign
      && sample.along - previousSample.along <= 25
    ) {
      previous.evidence.push(sample);
      previous.endAlong = sample.along;
    } else {
      groups.push({
        evidence: [sample],
        startAlong: sample.along,
        endAlong: sample.along,
        sign
      });
    }
  }
  if (debug) {
    debug.evidenceCount = evidence.length;
    debug.groups = groups.map((group) => ({
      startAlong: group.startAlong,
      endAlong: group.endAlong,
      sign: group.sign,
      sampleCount: group.evidence.length
    }));
  }

  for (let index = 0; index < groups.length; index += 1) {
    const first = groups[index];
    const second = groups[index + 1];
    const isSShape = Boolean(
      second
      && second.sign !== first.sign
      && second.startAlong - first.endAlong <= 40
    );
    const compactFirstAngle = isSShape
      ? compactSShapeFirstTurn(polyline, first, second, routeEnd)
      : undefined;
    const groupDebug = debug?.groups[index];
    if (compactFirstAngle !== undefined) {
      const kind = classifyTurn(compactFirstAngle);
      if (groupDebug) {
        groupDebug.windowAngle = compactFirstAngle;
        groupDebug.classifiedKind = kind;
        groupDebug.selected = true;
      }
      const weighted = weightedAlong(first);
      const entryAlong = Math.min(weighted, first.startAlong + 12);
      return {
        kind,
        along: entryAlong,
        completeAlong: Math.max(
          entryAlong,
          Math.min(routeEnd, first.endAlong + 12)
        )
      };
    }
    const last = isSShape ? second : first;
    const window = maneuverWindow(
      polyline,
      first.startAlong,
      last.endAlong,
      routeEnd,
      groups[index + (isSShape ? 2 : 1)]?.startAlong
    );
    if (!window) {
      if (groupDebug) groupDebug.rejection = "bearing-window-unavailable";
      if (isSShape) index += 1;
      continue;
    }
    if (groupDebug) groupDebug.windowAngle = window.angle;
    if (Math.abs(window.angle) < 24) {
      if (groupDebug) groupDebug.rejection = "combined-angle-below-24-deg";
      if (isSShape) index += 1;
      continue;
    }
    const kind = classifyTurn(window.angle);
    if (groupDebug) groupDebug.classifiedKind = kind;
    if (kind === "uturn" && !continuousUturn(polyline, window)) {
      if (groupDebug) groupDebug.rejection = "uturn-not-continuous";
      if (isSShape) index += 1;
      continue;
    }
    const combined = isSShape
      ? {
        evidence: [...first.evidence, ...second.evidence],
        startAlong: first.startAlong,
        endAlong: second.endAlong
      }
      : first;
    // Gegenkurven werden fuer stabile Ein-/Ausgangspeilungen gemeinsam
    // betrachtet. Der daraus resultierende Richtungspfeil gehoert aber nur zu
    // dem Teilbogen mit demselben Vorzeichen. Sonst kann eine lange linke
    // Zufahrtskurve den Anker eines folgenden Rechtsbogens hunderte Meter nach
    // hinten ziehen und den verriegelten Pfeil dort bei 0 m festhalten.
    const maneuverGroup = isSShape && kind !== "uturn"
      ? (first.sign === Math.sign(window.angle) ? first : second)
      : combined;
    const weighted = weightedAlong(maneuverGroup);
    // Die Distanz soll bis zum Beginn des Manövers laufen, nicht bis zu einem
    // gewichteten Punkt mitten in der Kurve. Der lokale 24-m-Messbereich
    // erkennt die Kurve etwas vor ihrem tatsächlichen Beginn; die halbe
    // Messbreite verschiebt den Anker wieder an den belastbaren Kurveneintritt.
    const entryAlong = Math.min(weighted, maneuverGroup.startAlong + 12);
    const selectedDebug = isSShape && maneuverGroup === second
      ? debug?.groups[index + 1]
      : groupDebug;
    if (selectedDebug) selectedDebug.selected = true;
    return {
      kind,
      along: entryAlong,
      completeAlong: Math.max(
        entryAlong,
        Math.min(routeEnd, maneuverGroup.endAlong + 12)
      )
    };
  }

  // Spurwechsel nur an explizit bestaetigten Lane-Nahtstellen. Die
  // Routengeometrie allein darf keinen Spurwechsel erfinden.
  for (const joint of polyline.laneJoints) {
    if (
      joint.confirmedChange
      && joint.along >= currentAlong + 8
      && joint.along <= searchEnd
      && joint.gap >= 2
      && joint.gap <= 33
    ) {
      if (debug) {
        debug.laneJoint = {
          along: joint.along,
          gap: joint.gap,
          kind: joint.confirmedChange
        };
      }
      return {
        kind: joint.confirmedChange,
        along: joint.along,
        completeAlong: Math.min(routeEnd, joint.along + 20)
      };
    }
  }
  return undefined;
}

function stopName(stop: MissionStop | undefined): string {
  const value = stop?.StopName ?? stop?.GroupName ?? asObject(stop)?.Name;
  return value == null || String(value).trim() === ""
    ? "--"
    : String(value).trim();
}

function missionLineIdentity(mission: MissionTelemetry | undefined): string {
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  return stops.length === 0
    ? "no-line"
    : JSON.stringify([
      mission?.MissionClassName ?? "",
      stops.map((stop) => [
        stopName(stop),
        latLon(stop.GeoLocation) ?? null,
        stop.ArrivalTime ?? "",
        stop.DepartureTime ?? ""
      ])
    ]);
}

function resolveTarget(mission: MissionTelemetry | undefined): any {
  if (!mission) return {
    name: "--",
    final: false,
    identity: "no-mission",
    segmentIdentity: "no-mission"
  };
  const stops = Array.isArray(mission.Stops) ? mission.Stops : [];
  const lastReached = asNumber(mission.LastStopReachedIndex);
  const nextIndex = asNumber(mission.NextStopIndex);
  const confirmedNext = lastReached !== undefined
    ? Math.trunc(lastReached) + 1
    : nextIndex !== undefined
      ? Math.trunc(nextIndex)
      : undefined;
  const boundedIndex = confirmedNext === undefined
    ? undefined
    : Math.max(0, Math.min(stops.length - 1, confirmedNext));
  const stop = (boundedIndex !== undefined ? stops[boundedIndex] : undefined)
    ?? mission.NextStop;
  const name = stopName(stop);
  const plannedArrival = asObject(stop)?.PlannedArrivalTime
    ?? stop?.ArrivalTime
    ?? asObject(stop)?.EstimatedArrivalTime;
  const finalStop = stops.at(-1);
  return {
    stop,
    name,
    location: latLon(stop?.GeoLocation),
    plannedArrival,
    index: boundedIndex,
    final: boundedIndex !== undefined
      && stops.length > 0
      && boundedIndex >= stops.length - 1,
    finalLocation: latLon(finalStop?.GeoLocation),
    firstLocation: latLon(stops[0]?.GeoLocation),
    identity: JSON.stringify([boundedIndex ?? -1, name, plannedArrival ?? ""]),
    segmentIdentity: JSON.stringify([
      mission.MissionClassName ?? "",
      Math.trunc(lastReached ?? -1),
      boundedIndex ?? -1
    ])
  };
}

function extractLaneIds(route: any): number[] {
  const source = asObject(route);
  const candidates: unknown[][] = [];
  if (Array.isArray(source?.PathLanes)) candidates.push(source.PathLanes);
  if (Array.isArray(source?.Paths)) {
    for (const path of source.Paths) {
      if (Array.isArray(path?.PathLanes) && path.PathLanes.length > 0) {
        candidates.push(path.PathLanes);
        break;
      }
    }
  }
  return (candidates[0] ?? [])
    .map(asNumber)
    .filter((value) => value !== undefined && value >= 0)
    .map((value) => Math.trunc(value));
}

function parseTime(value: unknown): { seconds: number; hasDate: boolean } | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    const date = text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/
    );
    if (date) {
      const seconds = Date.UTC(
        Number(date[1]),
        Number(date[2]) - 1,
        Number(date[3]),
        Number(date[4]),
        Number(date[5]),
        Number(date[6] ?? 0)
      ) / 1000;
      if (Number.isFinite(seconds)) return { seconds, hasDate: true };
    }
    const clock = text.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/);
    if (clock) return {
      seconds: Number(clock[1]) * 3600
        + Number(clock[2]) * 60
        + Number(clock[3] ?? 0),
      hasDate: false
    };
  }
  const numeric = asNumber(value);
  if (numeric !== undefined) return { seconds: numeric, hasDate: false };
  const source = asObject(value);
  if (!source) return undefined;
  const hours = asNumber(source.Hours ?? source.hours);
  const minutes = asNumber(source.Minutes ?? source.minutes);
  const seconds = asNumber(source.Seconds ?? source.seconds);
  if (hours !== undefined || minutes !== undefined || seconds !== undefined) {
    return {
      seconds: (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0),
      hasDate: false
    };
  }
  const total = asNumber(source.TotalSeconds ?? source.totalSeconds);
  return total === undefined ? undefined : { seconds: total, hasDate: false };
}

function worldTime(snapshot: TelemetrySnapshot) {
  const world = asObject(snapshot.world);
  for (const key of [
    "DateTime",
    "CurrentDateTime",
    "WorldDateTime",
    "GameDateTime",
    "GameTime",
    "Time",
    "Clock"
  ]) {
    const parsed = parseTime(world?.[key]);
    if (parsed) return parsed;
  }
  return undefined;
}

function formatClock(seconds: number): string {
  const day = (Math.trunc(seconds) % 86_400 + 86_400) % 86_400;
  return `${Math.floor(day / 3600).toString().padStart(2, "0")}:${Math.floor(day % 3600 / 60).toString().padStart(2, "0")}`;
}

function scheduleDifference(
  estimatedSeconds: number | undefined,
  plannedValue: unknown
): number | undefined {
  const planned = parseTime(plannedValue);
  if (estimatedSeconds === undefined || !planned) return undefined;
  let difference = planned.seconds - estimatedSeconds;
  if (!planned.hasDate || Math.abs(difference) > 43_200) {
    difference = ((difference + 43_200) % 86_400 + 86_400) % 86_400 - 43_200;
  }
  return Math.trunc(difference);
}

function unavailableModel(
  snapshot: TelemetrySnapshot,
  status: GuidanceStatus,
  laneCount = 0,
  debug?: RouteGuidanceDebugInfo
): RouteGuidanceModel {
  const online = snapshot.runtimeState !== "offline";
  return {
    online,
    inVehicle: online && snapshot.runtimeState !== "no-bus",
    status,
    nextManeuver: status === "loading-map" ? "recalculating" : "unavailable",
    nextRelevantStop: stopName(snapshot.mission?.NextStop),
    predictionConfidence: "none",
    routeLaneCount: laneCount,
    debug
  };
}

export class RouteGuidanceEngine {
  private routeSignature = "";
  private routeStableSince = 0;
  private polyline: Polyline | undefined;
  private orderedStopProjectionCache: Projection[] = [];
  private previousAlong: number | undefined;
  private lineIdentity = "";
  private confirmedLineProgress: number | undefined;
  private latchedManeuver: RouteManeuver | undefined;
  private pendingProjectionJump:
    | { along: number; samples: number; since: number }
    | undefined;
  private pendingManeuverExit:
    | { maneuver: RouteManeuver; samples: number; since: number }
    | undefined;
  private confirmedSegmentDistances = new Map<number, number>();
  private observedSegmentLowerBounds = new Map<number, number>();
  private segmentIdentity = "";
  private speedSamples: Array<{ at: number; speed: number }> = [];
  private lastSpeedTimestamp: number | undefined;
  private lastMovingAt: number | undefined;
  private smoothedEtaSeconds: number | undefined;
  private smoothedEtaAt: number | undefined;

  reset(): void {
    this.routeSignature = "";
    this.routeStableSince = 0;
    this.polyline = undefined;
    this.orderedStopProjectionCache = [];
    this.previousAlong = undefined;
    this.lineIdentity = "";
    this.confirmedLineProgress = undefined;
    this.latchedManeuver = undefined;
    this.pendingProjectionJump = undefined;
    this.pendingManeuverExit = undefined;
    this.confirmedSegmentDistances.clear();
    this.observedSegmentLowerBounds.clear();
    this.resetSegment();
  }

  private debugState(
    now: number,
    stage: string,
    rejectReason: string | undefined,
    laneIds: number[] = [],
    additions: Partial<RouteGuidanceDebugInfo> = {}
  ): RouteGuidanceDebugInfo {
    const polyline = this.polyline;
    return {
      at: now,
      stage,
      rejectReason,
      laneIds,
      routeSignature: this.routeSignature || undefined,
      routeStableForMs: this.routeStableSince > 0
        ? Math.max(0, now - this.routeStableSince)
        : undefined,
      polyline: polyline
        ? {
          points: polyline.points,
          total: polyline.total,
          gapTotal: polyline.gapTotal,
          maximumGap: polyline.maximumGap,
          laneJoints: polyline.laneJoints
        }
        : undefined,
      orderedStopProjections: this.orderedStopProjectionCache,
      latchedManeuver: this.latchedManeuver
        ? {
          ...this.latchedManeuver,
          distance: this.previousAlong === undefined
            ? 0
            : Math.max(0, this.latchedManeuver.along - this.previousAlong)
        }
        : undefined,
      pendingProjectionJump: this.pendingProjectionJump
        ? {
          along: this.pendingProjectionJump.along,
          samples: this.pendingProjectionJump.samples,
          ageMs: Math.max(0, now - this.pendingProjectionJump.since)
        }
        : undefined,
      pendingManeuverExit: this.pendingManeuverExit
        ? {
          kind: this.pendingManeuverExit.maneuver.kind,
          along: this.pendingManeuverExit.maneuver.along,
          samples: this.pendingManeuverExit.samples,
          ageMs: Math.max(0, now - this.pendingManeuverExit.since)
        }
        : undefined,
      ...additions
    };
  }

  update(snapshot: TelemetrySnapshot, now = Date.now()): RouteGuidanceModel {
    if (snapshot.runtimeState === "offline") {
      this.reset();
      return unavailableModel(
        snapshot,
        "offline",
        0,
        this.debugState(now, "runtime", "telemetry-offline")
      );
    }
    if (snapshot.runtimeState === "no-bus") {
      this.reset();
      return unavailableModel(
        snapshot,
        "no-vehicle",
        0,
        this.debugState(now, "runtime", "no-vehicle")
      );
    }
    if (snapshot.runtimeState === "bus-not-ready" || !snapshot.vehicle) {
      this.resetRouteState();
      return unavailableModel(
        snapshot,
        "bus-not-ready",
        0,
        this.debugState(now, "runtime", "bus-not-ready")
      );
    }

    const laneIds = extractLaneIds(snapshot.route);
    if (laneIds.length === 0) {
      this.resetRouteState();
      return unavailableModel(
        snapshot,
        "no-route",
        0,
        this.debugState(now, "route", "no-lane-ids")
      );
    }
    if (
      snapshot.routeUpdatedAt !== undefined
      && now - snapshot.routeUpdatedAt > ROUTE_STALE_MS
    ) return unavailableModel(
      snapshot,
      "stale-route",
      laneIds.length,
      this.debugState(now, "route", "route-snapshot-stale", laneIds)
    );

    const features = snapshot.roadmap?.features;
    if (!Array.isArray(features) || features.length === 0) {
      return unavailableModel(
        snapshot,
        "loading-map",
        laneIds.length,
        this.debugState(now, "roadmap", "roadmap-unavailable", laneIds)
      );
    }
    const player = latLon(snapshot.player?.GeoLocation);
    if (!player) return unavailableModel(
      snapshot,
      "off-route",
      laneIds.length,
      this.debugState(now, "projection", "player-position-invalid", laneIds)
    );

    const target = resolveTarget(snapshot.mission);
    const missionStops = Array.isArray(snapshot.mission?.Stops)
      ? snapshot.mission.Stops
      : [];
    const targetIndex = target.index === undefined
      ? undefined
      : Math.max(0, Math.min(missionStops.length - 1, target.index));
    const currentLineIdentity = missionLineIdentity(snapshot.mission);
    if (currentLineIdentity !== this.lineIdentity) {
      this.lineIdentity = currentLineIdentity;
      this.confirmedLineProgress = undefined;
      this.previousAlong = undefined;
      this.orderedStopProjectionCache = [];
      this.confirmedSegmentDistances.clear();
      this.observedSegmentLowerBounds.clear();
    }
    if (target.segmentIdentity !== this.segmentIdentity) {
      this.segmentIdentity = target.segmentIdentity;
      // Die ETA-Glättung gehört zum Zielabschnitt und wird verworfen. Die
      // rollende, höchstens 90 s alte Fahrhistorie bleibt dagegen als
      // Kaltstart für den Folgeabschnitt erhalten. Andernfalls bleiben ETA
      // und Prognose am Halt leer, bis nach der Abfahrt erneut fünf Sekunden
      // Bewegung gesammelt wurden.
      this.resetSegment(true);
    }
    this.recordSpeed(snapshot, now);

    const signature = `${laneIds.join(",")}|${currentLineIdentity}`;
    if (signature !== this.routeSignature || !this.polyline) {
      this.routeSignature = signature;
      this.routeStableSince = now;
      this.polyline = buildRoutePolyline(
        laneIds,
        features,
        player,
        target.finalLocation,
        missionStops,
        targetIndex
      );
      this.orderedStopProjectionCache = this.polyline
        ? orderedMissionStopProjections(missionStops, this.polyline) ?? []
        : [];
      this.previousAlong = undefined;
      this.latchedManeuver = undefined;
      this.pendingProjectionJump = undefined;
      this.pendingManeuverExit = undefined;
    }
    const polyline = this.polyline;
    if (!polyline) return unavailableModel(
      snapshot,
      "no-route",
      laneIds.length,
      this.debugState(now, "polyline", "route-polyline-build-failed", laneIds, {
        targetIndex,
        targetName: target.name,
        targetFinal: target.final
      })
    );

    const segmentStartAlong = targetIndex !== undefined && targetIndex > 0
      ? this.orderedStopProjectionCache[targetIndex - 1]?.along
      : undefined;
    const segmentEndAlong = targetIndex !== undefined
      ? this.orderedStopProjectionCache[targetIndex]?.along
      : undefined;
    const playerProjections = projectAll(player, polyline);
    const projection = choosePlayerProjection(
      playerProjections,
      this.previousAlong,
      segmentStartAlong,
      segmentEndAlong
    );
    if (!projection || projection.distance > MAX_ROUTE_PROJECTION_METERS) {
      return {
        ...unavailableModel(
          snapshot,
          "off-route",
          laneIds.length,
          this.debugState(now, "projection", projection
            ? "player-projection-too-far"
            : "player-projection-missing", laneIds, {
            targetIndex,
            targetName: target.name,
            targetFinal: target.final,
            rawAlong: projection?.along,
            projectionDistance: projection?.distance,
            segmentStartAlong,
            segmentEndAlong,
            playerProjectionCandidates: playerProjections
              .slice()
              .sort((first, second) => first.distance - second.distance)
              .slice(0, 16)
          })
        ),
        nextRelevantStop: target.name,
        projectionDistance: projection?.distance
      };
    }

    const reversing = String(snapshot.vehicle.Gearbox?.CurrentSelector ?? "")
      .trim().toUpperCase() === "R";
    const rawAlong = projection.along;
    const currentAlong = this.stabilizeProjection(rawAlong, reversing, now);
    if (!reversing) this.previousAlong = currentAlong;

    const preferredStopProjection = targetIndex === undefined
      ? undefined
      : this.orderedStopProjectionCache[targetIndex];
    const stopProjectionCandidates = target.location
      ? projectionCandidates(
        target.location,
        polyline,
        MAX_STOP_PROJECTION_METERS
      )
      : [];
    const stopProjection = target.location
      ? chooseTargetProjection(
        target.location,
        player,
        projection,
        polyline,
        currentAlong,
        preferredStopProjection,
        stopProjectionCandidates
      )
      : undefined;
    const stopAlong = stopProjection
      ? Math.max(currentAlong, stopProjection.along)
      : undefined;
    const nextStopDistance = stopAlong === undefined
      ? undefined
      : Math.max(0, stopAlong - currentAlong);

    const missionStopProjections = this.orderedStopProjectionCache;
    const hasCompleteLineGeometry = Boolean(
      missionStopProjections.length === missionStops.length
      && missionStopProjections.length >= 2
      && missionStopProjections.at(-1)!.along
        > missionStopProjections[0]!.along + 5
    );
    const finalAlong = hasCompleteLineGeometry
      ? missionStopProjections.at(-1)!.along
      : undefined;
    const lineStartAlong = hasCompleteLineGeometry
      ? missionStopProjections[0]!.along
      : undefined;
    const exactTotalRouteDistance = finalAlong !== undefined
      && lineStartAlong !== undefined
      ? Math.max(0, finalAlong - lineStartAlong)
      : undefined;
    const exactPositionWithinLine = finalAlong !== undefined
      && currentAlong <= finalAlong + STOP_REACHED_RADIUS_METERS;
    const exactRemainingRouteDistance = exactPositionWithinLine
      ? Math.max(0, finalAlong - currentAlong)
      : undefined;
    if (
      targetIndex !== undefined
      && targetIndex > 0
      && nextStopDistance !== undefined
    ) {
      this.observedSegmentLowerBounds.set(
        targetIndex,
        Math.max(
          this.observedSegmentLowerBounds.get(targetIndex) ?? 0,
          nextStopDistance
        )
      );
      const previousStopProjection = missionStopProjections[targetIndex - 1];
      const targetStopProjection = missionStopProjections[targetIndex];
      if (
        previousStopProjection
        && targetStopProjection
        && targetStopProjection.along > previousStopProjection.along + 5
      ) {
        this.confirmedSegmentDistances.set(
          targetIndex,
          targetStopProjection.along - previousStopProjection.along
        );
      }
    }
    const directSegments = missionStopSegmentDistances(snapshot.mission);
    const fallbackSegments = directSegments?.map((distance, index) => {
      const targetStopIndex = index + 1;
      return this.confirmedSegmentDistances.get(targetStopIndex)
        ?? Math.max(
          distance,
          this.observedSegmentLowerBounds.get(targetStopIndex) ?? 0
        );
    });
    const fallbackTotalRouteDistance = fallbackSegments
      ? fallbackSegments.reduce((sum, distance) => sum + distance, 0)
      : undefined;
    const fallbackRemainingRouteDistance = fallbackSegments
      && targetIndex !== undefined
      && nextStopDistance !== undefined
      ? targetIndex <= 0
        ? fallbackTotalRouteDistance
        : nextStopDistance
          + fallbackSegments.slice(targetIndex).reduce(
            (sum, distance) => sum + distance,
            0
          )
      : undefined;
    const totalRouteDistance = exactTotalRouteDistance
      ?? fallbackTotalRouteDistance;
    const remainingRouteDistance = exactRemainingRouteDistance
      ?? fallbackRemainingRouteDistance;
    const routeDistanceEstimated = exactTotalRouteDistance === undefined
      && fallbackTotalRouteDistance !== undefined;
    const geometricProgress = exactTotalRouteDistance !== undefined
      && exactTotalRouteDistance > 5
      && lineStartAlong !== undefined
      && exactPositionWithinLine
      ? Math.max(0, Math.min(
        1,
        (currentAlong - lineStartAlong) / exactTotalRouteDistance
      ))
      : undefined;
    const distanceFallbackProgress = fallbackTotalRouteDistance !== undefined
      && fallbackTotalRouteDistance > 5
      && fallbackRemainingRouteDistance !== undefined
      ? Math.max(0, Math.min(
        1,
        1 - fallbackRemainingRouteDistance / fallbackTotalRouteDistance
      ))
      : undefined;
    const fallbackProgress = nextStopDistance === undefined
      || stopAlong === undefined
      ? undefined
      : this.fallbackLineProgress(
        snapshot.mission,
        target,
        nextStopDistance,
        Math.max(1, stopAlong)
      );
    const rawCandidateProgress = geometricProgress
      ?? distanceFallbackProgress
      ?? fallbackProgress;
    const destinationStopReached = isTelemetryTrue(
      snapshot.mission?.DestinationStopReached
    );
    const candidateProgress = rawCandidateProgress === undefined
      ? undefined
      : destinationStopReached
        ? rawCandidateProgress
        : Math.min(0.99, rawCandidateProgress);
    const routeProgress = candidateProgress === undefined
      ? this.confirmedLineProgress
      : reversing
        ? this.confirmedLineProgress ?? candidateProgress
        : Math.max(this.confirmedLineProgress ?? 0, candidateProgress);
    if (!reversing && routeProgress !== undefined) {
      this.confirmedLineProgress = routeProgress;
    }

    // Die Haltestelle begrenzt, welches Manoever angezeigt werden darf, aber
    // nicht die fuer dessen Erkennung verfuegbare Kurvengeometrie. Wird genau
    // am Halt abgeschnitten, fehlt bei einem Abbieger kurz vor der Haltestelle
    // der ausgehende Ast und der H-Fallback verdraengt faelschlich den Pfeil.
    const maneuverClassificationEnd = stopAlong === undefined
      ? undefined
      : Math.min(
        polyline.total,
        stopAlong + MANEUVER_POST_STOP_CONTEXT_METERS
      );
    const maneuverScan: NonNullable<RouteGuidanceDebugInfo["maneuverScan"]> = {
      groups: []
    };
    const geometryManeuver = maneuverClassificationEnd === undefined
      ? undefined
      : findNextManeuver(
        polyline,
        currentAlong,
        maneuverClassificationEnd,
        maneuverScan
      );
    const detectedManeuver = geometryManeuver
      && stopAlong !== undefined
      && geometryManeuver.along < stopAlong - 8
      ? geometryManeuver
      : undefined;
    const fallbackManeuver: RouteManeuver | undefined = target.name !== "--"
      && stopAlong !== undefined
      && nextStopDistance !== undefined
      && nextStopDistance <= 300
      ? {
        kind: target.final ? "destination" : "stop",
        along: stopAlong,
        completeAlong: stopAlong
      }
      : undefined;
    // Liegt zwischen Bus und Halt nach stabiler, lueckenarmer Geometrie kein
    // Abbiege-/Spurmanoever, ist "geradeaus bis zum Halt" selbst die
    // validierte aktive Anweisung. Pfeil und Distanz bleiben dabei atomar am
    // selben Stop-Anker; die Haltestellendistanz wird nicht als Fremdfeld in
    // ein anderes Manoever kopiert.
    const straightChecks = {
      noDetectedManeuver: !detectedManeuver,
      movingForward: !reversing,
      targetKnown: target.name !== "--",
      stopProjectionKnown: stopAlong !== undefined,
      stopDistanceKnown: nextStopDistance !== undefined,
      fartherThanStopFallback: nextStopDistance !== undefined
        && nextStopDistance > 300,
      withinStraightLimit: nextStopDistance !== undefined
        && nextStopDistance <= STRAIGHT_GUIDANCE_MAX_DISTANCE_METERS,
      routeStable: now - this.routeStableSince
        >= STRAIGHT_GUIDANCE_CONFIRMATION_MS,
      continuousGeometry: stopAlong !== undefined
        && isContinuousRouteInterval(polyline, currentAlong, stopAlong)
    };
    const straightManeuver: RouteManeuver | undefined = Object.values(
      straightChecks
    ).every(Boolean)
      ? {
        kind: "straight",
        along: stopAlong,
        completeAlong: stopAlong
      }
      : undefined;
    const lockedManeuverActive = stopAlong !== undefined
      && this.shouldKeepLatchedManeuver(
        currentAlong,
        rawAlong,
        reversing,
        now
      );
    let maneuver: RouteManeuver | undefined;
    let selectionReason = "none";

    if (lockedManeuverActive) {
      maneuver = this.latchedManeuver!;
      selectionReason = "latched-maneuver";
    } else if (detectedManeuver) {
      maneuver = detectedManeuver;
      selectionReason = "detected-maneuver";
      this.latchedManeuver = detectedManeuver;
      this.pendingManeuverExit = undefined;
    } else if (fallbackManeuver) {
      maneuver = fallbackManeuver;
      selectionReason = "stop-fallback";
      this.latchedManeuver = undefined;
      this.pendingManeuverExit = undefined;
    } else if (straightManeuver) {
      maneuver = straightManeuver;
      selectionReason = "straight-fallback";
      this.latchedManeuver = undefined;
      this.pendingManeuverExit = undefined;
    } else {
      maneuver = undefined;
      this.latchedManeuver = undefined;
      this.pendingManeuverExit = undefined;
    }

    const maneuverDistance = maneuver
      ? Math.max(0, maneuver.along - currentAlong)
      : undefined;
    const activeManeuver: ActiveManeuver | undefined = maneuver
      && maneuverDistance !== undefined
      ? {
        id: maneuver === fallbackManeuver
          ? `target:${target.segmentIdentity}:${maneuver.kind}`
          : maneuver === straightManeuver
            ? `target:${target.segmentIdentity}:straight:${Math.round(maneuver.along * 10)}`
          : [
            "route",
            signature,
            maneuver.kind,
            Math.round(maneuver.along * 10),
            Math.round(maneuver.completeAlong * 10)
          ].join(":"),
        kind: maneuver.kind,
        distance: maneuverDistance
      }
      : undefined;
    const nextCurveDistance = [
      "slight-left", "left", "sharp-left",
      "slight-right", "right", "sharp-right", "uturn"
    ].includes(maneuver?.kind ?? "unavailable")
      ? maneuverDistance
      : undefined;
    const estimated = reversing || nextStopDistance === undefined
      ? undefined
      : this.estimateArrival(snapshot, nextStopDistance, now);
    const movingSpan = this.movingSampleSpan(now);
    const stoppedFor = this.lastMovingAt === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, now - this.lastMovingAt);
    const confidence: PredictionConfidence = reversing
      ? "low"
      : estimated === undefined
        ? "low"
        : movingSpan >= 60_000
          && now - this.routeStableSince >= 30_000
          && projection.distance <= 10
          && stoppedFor <= 15_000
          ? "high"
          : movingSpan >= 15_000
            && now - this.routeStableSince >= 10_000
            && projection.distance <= 30
            && stoppedFor <= 30_000
            ? "medium"
            : "low";
    const debugManeuver = (
      candidate: RouteManeuver | undefined
    ): RouteGuidanceDebugInfo["chosenManeuver"] =>
      candidate
        ? {
          kind: candidate.kind,
          along: candidate.along,
          completeAlong: candidate.completeAlong,
          distance: Math.max(0, candidate.along - currentAlong)
        }
        : undefined;
    const failedStraightCheck = Object.entries(straightChecks)
      .find(([, passed]) => !passed)?.[0];
    const rejectReason = maneuver
      ? undefined
      : geometryManeuver
        ? "geometry-maneuver-after-stop-or-too-close-to-stop"
        : nextStopDistance === undefined
          ? "no-stop-distance"
          : failedStraightCheck
            ? `straight-check-failed:${failedStraightCheck}`
            : "no-valid-maneuver";

    return {
      online: true,
      inVehicle: true,
      status: reversing ? "reversing" : "live",
      activeManeuver,
      nextManeuver: maneuver?.kind ?? "unavailable",
      maneuverDistance,
      nextCurveDistance,
      nextRelevantStop: target.name,
      nextRelevantStopDistance: nextStopDistance,
      totalRouteDistance,
      remainingRouteDistance,
      routeDistanceEstimated,
      routeProgress,
      estimatedArrivalTime: estimated
        ? formatClock(estimated.seconds)
        : undefined,
      estimatedArrivalSeconds: estimated?.seconds,
      predictedScheduleDelta: scheduleDifference(
        estimated?.seconds,
        target.plannedArrival
      ),
      predictionConfidence: confidence,
      projectionDistance: projection.distance,
      routeLaneCount: laneIds.length,
      debug: this.debugState(now, reversing ? "reversing" : "live", rejectReason, laneIds, {
        routeSignature: signature,
        targetIndex,
        targetName: target.name,
        targetFinal: target.final,
        currentAlong,
        rawAlong,
        projectionDistance: projection.distance,
        playerProjectionCandidates: playerProjections
          .slice()
          .sort((first, second) => first.distance - second.distance)
          .slice(0, 16),
        segmentStartAlong,
        segmentEndAlong,
        stopAlong,
        nextStopDistance,
        stopProjectionCandidates: stopProjectionCandidates
          .slice()
          .sort((first, second) => first.distance - second.distance)
          .slice(0, 24),
        maneuverClassificationEnd,
        maneuverScan,
        geometryManeuver: debugManeuver(geometryManeuver),
        detectedManeuver: debugManeuver(detectedManeuver),
        fallbackManeuver: fallbackManeuver
          ? {
            kind: fallbackManeuver.kind,
            along: fallbackManeuver.along,
            distance: Math.max(0, fallbackManeuver.along - currentAlong)
          }
          : undefined,
        straightManeuver: straightManeuver
          ? {
            along: straightManeuver.along,
            distance: Math.max(0, straightManeuver.along - currentAlong)
          }
          : undefined,
        straightChecks,
        latchedManeuver: debugManeuver(this.latchedManeuver),
        lockedManeuverActive,
        chosenManeuver: debugManeuver(maneuver),
        selectionReason,
        rejectReason
      })
    };
  }

  private resetRouteState(): void {
    this.routeSignature = "";
    this.routeStableSince = 0;
    this.polyline = undefined;
    this.orderedStopProjectionCache = [];
    this.previousAlong = undefined;
    this.latchedManeuver = undefined;
    this.pendingProjectionJump = undefined;
    this.pendingManeuverExit = undefined;
  }

  /**
   * Ignoriert einen einzelnen grossen Sprung auf eine weiter vorne liegende
   * Parallelprojektion. Erst mehrere raeumlich zusammenpassende Samples ueber
   * mindestens 250 ms duerfen den monotonen Routenanker vorsetzen.
   */
  private stabilizeProjection(
    rawAlong: number,
    reversing: boolean,
    now: number
  ): number {
    if (this.previousAlong === undefined) {
      this.pendingProjectionJump = undefined;
      return rawAlong;
    }

    if (reversing) {
      this.pendingProjectionJump = undefined;
      return this.previousAlong;
    }

    if (rawAlong <= this.previousAlong + PROJECTION_JUMP_METERS) {
      this.pendingProjectionJump = undefined;
      return Math.max(this.previousAlong, rawAlong);
    }

    const pending = this.pendingProjectionJump;
    if (
      pending
      && Math.abs(rawAlong - pending.along) <= PROJECTION_JUMP_TOLERANCE_METERS
    ) {
      pending.along = rawAlong;
      pending.samples += 1;
    } else {
      this.pendingProjectionJump = {
        along: rawAlong,
        samples: 1,
        since: now
      };
    }

    const confirmed = this.pendingProjectionJump;
    if (
      confirmed.samples >= PROJECTION_CONFIRMATION_SAMPLES
      && now - confirmed.since >= PROJECTION_CONFIRMATION_MS
    ) {
      this.pendingProjectionJump = undefined;
      return Math.max(this.previousAlong, rawAlong);
    }

    return this.previousAlong;
  }

  /**
   * NAV-07: Der Kurvenausgang muss in mehreren aufeinanderfolgenden aktuellen
   * Projektionen bestaetigt sein. Ein einzelner Sprung hinter completeAlong
   * kann dadurch weder Pfeil noch Manövertext vorzeitig freigeben.
   */
  private shouldKeepLatchedManeuver(
    currentAlong: number,
    rawAlong: number,
    reversing: boolean,
    now: number
  ): boolean {
    const maneuver = this.latchedManeuver;
    if (
      !maneuver
      || ["stop", "destination", "straight"].includes(maneuver.kind)
    ) {
      this.pendingManeuverExit = undefined;
      return false;
    }

    const exitAlong = maneuver.completeAlong + MANEUVER_EXIT_HYSTERESIS_METERS;
    if (reversing || currentAlong <= exitAlong || rawAlong <= exitAlong) {
      this.pendingManeuverExit = undefined;
      return true;
    }

    const pending = this.pendingManeuverExit;
    const sameManeuver = pending
      && pending.maneuver.kind === maneuver.kind
      && Math.abs(pending.maneuver.along - maneuver.along) < 0.5
      && Math.abs(pending.maneuver.completeAlong - maneuver.completeAlong) < 0.5;
    if (sameManeuver) {
      pending.samples += 1;
    } else {
      this.pendingManeuverExit = {
        maneuver,
        samples: 1,
        since: now
      };
    }

    const confirmed = this.pendingManeuverExit;
    if (
      confirmed.samples >= MANEUVER_EXIT_CONFIRMATION_SAMPLES
      && now - confirmed.since >= MANEUVER_EXIT_CONFIRMATION_MS
    ) {
      this.pendingManeuverExit = undefined;
      return false;
    }

    return true;
  }

  private resetSegment(preserveRecentSpeed = false): void {
    if (!preserveRecentSpeed) {
      this.speedSamples = [];
      this.lastSpeedTimestamp = undefined;
      this.lastMovingAt = undefined;
    }
    this.smoothedEtaSeconds = undefined;
    this.smoothedEtaAt = undefined;
  }

  private recordSpeed(snapshot: TelemetrySnapshot, now: number): void {
    const timestamp = snapshot.vehicleUpdatedAt ?? snapshot.updatedAt ?? now;
    if (timestamp === this.lastSpeedTimestamp) return;
    this.lastSpeedTimestamp = timestamp;
    const speed = asNumber(snapshot.vehicle?.Speed);
    if (speed === undefined || speed < 0) return;
    this.speedSamples.push({ at: timestamp, speed });
    this.speedSamples = this.speedSamples.filter(
      (sample) => timestamp - sample.at <= 120_000
    );
    if (speed >= 2) this.lastMovingAt = timestamp;
  }

  private movingSamples(now: number) {
    return this.speedSamples.filter(
      (sample) => now - sample.at <= 90_000 && sample.speed >= 2
    );
  }

  private movingSampleSpan(now: number): number {
    const samples = this.movingSamples(now);
    return samples.length < 2 ? 0 : samples.at(-1)!.at - samples[0].at;
  }

  private estimateArrival(
    snapshot: TelemetrySnapshot,
    distance: number,
    now: number
  ): { seconds: number; hasDate: boolean } | undefined {
    const currentWorldTime = worldTime(snapshot);
    if (!currentWorldTime) return undefined;
    if (distance <= 15) return currentWorldTime;
    const samples = this.movingSamples(now);
    if (samples.length < 6) return undefined;
    const newest = samples.at(-1)!.at;
    if (newest - samples[0].at < 5_000 || now - newest > 60_000) return undefined;
    let weightedSpeed = 0;
    let totalWeight = 0;
    for (const sample of samples) {
      const age = Math.max(0, newest - sample.at);
      const weight = Math.max(0.2, 1 - age / 90_000);
      weightedSpeed += sample.speed * weight;
      totalWeight += weight;
    }
    const averageKmh = totalWeight > 0 ? weightedSpeed / totalWeight : 0;
    if (!Number.isFinite(averageKmh) || averageKmh < 2) return undefined;
    const travelSeconds = distance / (averageKmh / 3.6);
    if (!Number.isFinite(travelSeconds) || travelSeconds < 0 || travelSeconds > 14_400) {
      return undefined;
    }
    const rawEta = currentWorldTime.seconds + travelSeconds;
    if (this.smoothedEtaSeconds === undefined || this.smoothedEtaAt === undefined) {
      this.smoothedEtaSeconds = rawEta;
      this.smoothedEtaAt = now;
    } else {
      const elapsedSeconds = Math.max(0, (now - this.smoothedEtaAt) / 1000);
      const expected = this.smoothedEtaSeconds + elapsedSeconds;
      const maximumCorrection = Math.max(2, elapsedSeconds * 2);
      const correction = Math.max(
        -maximumCorrection,
        Math.min(maximumCorrection, rawEta - expected)
      );
      this.smoothedEtaSeconds = expected + correction;
      this.smoothedEtaAt = now;
    }
    return {
      seconds: this.smoothedEtaSeconds,
      hasDate: currentWorldTime.hasDate
    };
  }

  private fallbackLineProgress(
    mission: MissionTelemetry | undefined,
    target: any,
    remainingToStop: number,
    segmentLength: number
  ): number | undefined {
    const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
    if (stops.length < 2 || target.index === undefined) return undefined;
    if (isTelemetryTrue(mission?.DestinationStopReached)) return 1;
    const index = Math.max(0, Math.min(stops.length - 1, target.index));
    if (index === 0) return 0;
    const segmentProgress = Math.max(
      0,
      Math.min(1, 1 - remainingToStop / Math.max(1, segmentLength))
    );
    return Math.max(0, Math.min(
      1,
      (index - 1 + segmentProgress) / (stops.length - 1)
    ));
  }
}

type GuidanceListener = (
  snapshot: TelemetrySnapshot,
  model: RouteGuidanceModel
) => void;

const INITIAL_SNAPSHOT: TelemetrySnapshot = {
  connected: false,
  online: false,
  runtimeState: "offline"
};
const INITIAL_MODEL: RouteGuidanceModel = {
  online: false,
  inVehicle: false,
  status: "offline",
  nextManeuver: "unavailable",
  nextRelevantStop: "--",
  predictionConfidence: "none",
  routeLaneCount: 0
};

export class RouteGuidanceHub {
  private static readonly singleton = new RouteGuidanceHub();

  static get instance(): RouteGuidanceHub {
    return this.singleton;
  }

  private readonly telemetry = TelemetryClient.instance;
  private readonly engine = new RouteGuidanceEngine();
  private readonly listeners = new Set<GuidanceListener>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private releaseRouteData: (() => void) | undefined;
  private snapshotValue = INITIAL_SNAPSHOT;
  private modelValue = INITIAL_MODEL;

  get snapshot(): TelemetrySnapshot {
    return this.snapshotValue;
  }

  get model(): RouteGuidanceModel {
    return this.modelValue;
  }

  subscribe(listener: GuidanceListener): () => void {
    this.listeners.add(listener);
    if (!this.unsubscribeTelemetry) {
      this.releaseRouteData = this.telemetry.acquireRouteGuidanceData();
      this.unsubscribeTelemetry = this.telemetry.subscribe((snapshot) => {
        this.publish(snapshot);
      });
    } else {
      listener(this.snapshotValue, this.modelValue);
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.unsubscribeTelemetry?.();
        this.unsubscribeTelemetry = undefined;
        this.releaseRouteData?.();
        this.releaseRouteData = undefined;
        this.engine.reset();
      }
    };
  }

  dispose(): void {
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.releaseRouteData?.();
    this.releaseRouteData = undefined;
    this.listeners.clear();
    this.engine.reset();
    this.snapshotValue = INITIAL_SNAPSHOT;
    this.modelValue = INITIAL_MODEL;
  }

  private publish(snapshot: TelemetrySnapshot): void {
    try {
      const model = this.engine.update(snapshot);
      this.snapshotValue = snapshot;
      this.modelValue = model;
      for (const listener of [...this.listeners]) {
        try {
          listener(snapshot, model);
        } catch (error) {
          streamDeck.logger.warn(
            "[RouteGuidanceHub] Navigationsanzeige konnte nicht aktualisiert werden.",
            error
          );
        }
      }
    } catch (error) {
      streamDeck.logger.error(
        "[RouteGuidanceHub] RouteGuidanceEngine konnte nicht ausgewertet werden.",
        error
      );
    }
  }
}
