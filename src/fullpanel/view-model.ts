// @ts-nocheck -- getestete 2.13.0.27-Lablogik, unverändert migriert.
import {
  formatUiDecimal,
  getDisplayLanguage,
  normalizeDisplayLanguage,
  translateUi,
} from "../core/localization";
const API_BASE = "http://127.0.0.1:37337";
export const FULLPANEL_POLL_INTERVALS = Object.freeze({
  vehicleMs: 100,
  coreMs: 500,
});
const VEHICLE_POLL_INTERVAL_MS = FULLPANEL_POLL_INTERVALS.vehicleMs;
const CORE_POLL_INTERVAL_MS = FULLPANEL_POLL_INTERVALS.coreMs;
const REQUEST_TIMEOUT_MS = 1200;
const ROADMAP_REQUEST_TIMEOUT_MS = 12000;
const ROADMAP_RETRY_MS = 10000;
const PUNCTUAL_TOLERANCE_SECONDS = 60;
const MAX_PLAYER_ROUTE_DISTANCE_METERS = 120;
const ROUTE_DELTA_SLEW_SECONDS_PER_SECOND = 3;
const ROUTE_DELTA_MIN_STEP_SECONDS = 1;
const ROUTE_DELTA_RESET_GAP_SECONDS = 5;
const STOP_PHASE_ENTER_DISTANCE_METERS = 25;
const STOP_PHASE_EXIT_DISTANCE_METERS = 30;
const STOP_CONFIRM_MAX_SPEED_KMH = 0.5;
const EARTH_RADIUS_METERS = 6371000;
const AVERAGE_CONSUMPTION_MIN_DISTANCE_KM = 0.2;
const AVERAGE_CONSUMPTION_MAX_TIME_STEP_SECONDS = 5;
const AVERAGE_CONSUMPTION_STALE_REAL_MS = 5000;
const AVERAGE_CONSUMPTION_MAX_ABSOLUTE_KWH_PER_100_KM = 500;

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "on" || normalized === "primary") return true;
    if (normalized === "false" || normalized === "off" || normalized === "none") return false;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed !== 0;
  }
  return false;
}

function firstValue(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      if (current == null || typeof current !== "object" || !(key in current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return undefined;
}

function pad2(value) {
  return Math.trunc(Math.abs(value)).toString().padStart(2, "0");
}

function secondsFromValue(value) {
  const numeric = asNumber(value);
  if (numeric !== undefined) return numeric;
  if (value && typeof value === "object") {
    const hours = asNumber(value.Hours ?? value.hours);
    const minutes = asNumber(value.Minutes ?? value.minutes);
    const seconds = asNumber(value.Seconds ?? value.seconds);
    if (hours !== undefined || minutes !== undefined || seconds !== undefined) {
      return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
    }
    return asNumber(value.TotalSeconds ?? value.totalSeconds);
  }
  return undefined;
}

function formatClock(value, includeSeconds = false) {
  if (typeof value === "string") {
    const match = value.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/);
    if (match) {
      const base = `${pad2(Number(match[1]))}:${match[2]}`;
      return !includeSeconds || match[3] === undefined ? base : `${base}:${match[3]}`;
    }
    const theBusDateTime = value.trim().match(
      /^\d{4}\.\d{2}\.\d{2}-(\d{1,2})\.(\d{2})(?:\.(\d{2}))?/
    );
    if (theBusDateTime) {
      const base = `${pad2(Number(theBusDateTime[1]))}:${theBusDateTime[2]}`;
      return !includeSeconds || theBusDateTime[3] === undefined
        ? base
        : `${base}:${theBusDateTime[3]}`;
    }
  }
  if (value && typeof value === "object") {
    const hours = asNumber(value.Hours ?? value.hours);
    const minutes = asNumber(value.Minutes ?? value.minutes);
    const seconds = asNumber(value.Seconds ?? value.seconds);
    if (hours !== undefined || minutes !== undefined || seconds !== undefined) {
      const base = `${pad2(hours ?? 0)}:${pad2(minutes ?? 0)}`;
      return !includeSeconds || seconds === undefined ? base : `${base}:${pad2(seconds)}`;
    }
  }
  const seconds = secondsFromValue(value);
  if (seconds === undefined) return includeSeconds ? "--:--:--" : "--:--";
  const daySeconds = ((Math.trunc(seconds) % 86400) + 86400) % 86400;
  const base = `${pad2(Math.floor(daySeconds / 3600))}:${pad2(Math.floor((daySeconds % 3600) / 60))}`;
  return includeSeconds ? `${base}:${pad2(daySeconds % 60)}` : base;
}

function deltaSeconds(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^([+-])?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const first = Number(match[2]);
      const second = Number(match[3]);
      const third = match[4] === undefined ? undefined : Number(match[4]);
      const seconds = third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
      return sign * seconds;
    }
  }
  return secondsFromValue(value);
}

function formatDelta(seconds) {
  if (seconds === undefined) return "--:--";
  const rounded = Math.trunc(seconds);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  const absolute = Math.abs(rounded);
  return `${sign}${Math.floor(absolute / 60)}:${pad2(absolute % 60)}`;
}

function scheduleStatus(seconds, language) {
  if (seconds === undefined) return translateUi("unknown", language);
  if (seconds > PUNCTUAL_TOLERANCE_SECONDS) return translateUi("early", language);
  if (seconds < -PUNCTUAL_TOLERANCE_SECONDS) return translateUi("late", language);
  return translateUi("punctual", language);
}

function timePoint(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const dateTime = trimmed.match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/,
    );
    if (dateTime) {
      const seconds =
        Date.UTC(
          Number(dateTime[1]),
          Number(dateTime[2]) - 1,
          Number(dateTime[3]),
          Number(dateTime[4]),
          Number(dateTime[5]),
          Number(dateTime[6] ?? 0),
        ) / 1000;
      if (Number.isFinite(seconds)) return { seconds, hasDate: true };
    }

    // The Bus liefert Missionszeiten live auch als
    // "YYYY.MM.DD-HH.MM.SS". Dieses Format ist datiert und darf nicht wie
    // eine unbekannte Uhrzeit verworfen werden.
    const theBusDateTime = trimmed.match(
      /^(\d{4})\.(\d{2})\.(\d{2})-(\d{1,2})\.(\d{2})(?:\.(\d{2}))?/
    );
    if (theBusDateTime) {
      const seconds =
        Date.UTC(
          Number(theBusDateTime[1]),
          Number(theBusDateTime[2]) - 1,
          Number(theBusDateTime[3]),
          Number(theBusDateTime[4]),
          Number(theBusDateTime[5]),
          Number(theBusDateTime[6] ?? 0),
        ) / 1000;
      if (Number.isFinite(seconds)) return { seconds, hasDate: true };
    }

    const clock = trimmed.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/);
    if (clock) {
      return {
        seconds: Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0),
        hasDate: false,
      };
    }
  }

  const seconds = secondsFromValue(value);
  return seconds === undefined ? undefined : { seconds, hasDate: false };
}

function nearestClockDifference(seconds) {
  return ((((seconds + 43200) % 86400) + 86400) % 86400) - 43200;
}

export function scheduleDifferenceSeconds(actualValue, plannedValue) {
  const actual = timePoint(actualValue);
  const planned = timePoint(plannedValue);
  if (!actual || !planned) return undefined;

  // The Bus / Atron: positiv = vor dem Fahrplan, negativ = hinter dem Fahrplan.
  let difference = planned.seconds - actual.seconds;
  if (
    !actual.hasDate
    || !planned.hasDate
    || Math.abs(difference) > 43200
  ) {
    // Rund um Mitternacht können Weltzeit und Missionsfahrplan denselben
    // Betriebstag mit benachbarten Kalendertagen melden. Ein scheinbares
    // Delta von etwa 24 Stunden ist deshalb auf die zeitlich nächste
    // Uhrzeitinstanz zu beziehen. Echte Übergänge über Mitternacht bleiben
    // unverändert, solange ihre datierte Differenz bereits unter 12 Stunden
    // liegt.
    difference = nearestClockDifference(difference);
  }
  return Math.trunc(difference);
}

function latLon(value) {
  const latitude = Array.isArray(value)
    ? asNumber(value[0])
    : value && typeof value === "object"
      ? asNumber(value.Y ?? value.Latitude)
      : undefined;
  const longitude = Array.isArray(value)
    ? asNumber(value[1])
    : value && typeof value === "object"
      ? asNumber(value.X ?? value.Longitude)
      : undefined;
  if (
    latitude === undefined
    || longitude === undefined
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) {
    return undefined;
  }
  return [latitude, longitude];
}

function geoJsonPoint(value) {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const longitude = asNumber(value[0]);
  const latitude = asNumber(value[1]);
  if (
    latitude === undefined
    || longitude === undefined
    || Math.abs(latitude) > 90
    || Math.abs(longitude) > 180
  ) {
    return undefined;
  }
  return [latitude, longitude];
}

function metersBetween(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const latitude1 = first[0] * Math.PI / 180;
  const latitude2 = second[0] * Math.PI / 180;
  const latitudeDelta = latitude2 - latitude1;
  const longitudeDelta = (second[1] - first[1]) * Math.PI / 180;
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const root =
    sinLatitude * sinLatitude
    + Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude * sinLongitude;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(root)));
}

function lineStringsFromGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return [];

  if (geometry.type === "LineString") {
    const points = Array.isArray(geometry.coordinates)
      ? geometry.coordinates.map(geoJsonPoint).filter(Boolean)
      : [];
    return points.length >= 2 ? [points] : [];
  }

  if (geometry.type === "MultiLineString") {
    return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
      .map((coordinates) => (
        Array.isArray(coordinates)
          ? coordinates.map(geoJsonPoint).filter(Boolean)
          : []
      ))
      .filter((points) => points.length >= 2);
  }

  if (geometry.type === "GeometryCollection") {
    return (Array.isArray(geometry.geometries) ? geometry.geometries : [])
      .flatMap(lineStringsFromGeometry);
  }

  return [];
}

function lineStringsFromFeature(feature) {
  if (!feature || typeof feature !== "object") return [];
  return lineStringsFromGeometry(feature.type === "Feature" ? feature.geometry : feature);
}

function appendPoint(polyline, point) {
  const previous = polyline.at(-1);
  if (!previous || metersBetween(previous, point) > 0.2) polyline.push(point);
}

function appendNearestLines(polyline, lines, preferredStart) {
  const remaining = lines
    .filter((line) => Array.isArray(line) && line.length >= 2)
    .map((line) => [...line]);

  while (remaining.length) {
    const cursor = polyline.at(-1) ?? preferredStart;
    let bestIndex = 0;
    let reverse = false;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const line = remaining[index];
      const firstDistance = metersBetween(cursor, line[0]);
      const lastDistance = metersBetween(cursor, line.at(-1));
      if (firstDistance < bestDistance) {
        bestIndex = index;
        reverse = false;
        bestDistance = firstDistance;
      }
      if (lastDistance < bestDistance) {
        bestIndex = index;
        reverse = true;
        bestDistance = lastDistance;
      }
    }

    const [selected] = remaining.splice(bestIndex, 1);
    if (reverse) selected.reverse();
    for (const point of selected) appendPoint(polyline, point);
  }
}

function routePolylineForOrder(laneIds, roadmapFeatures, start, end) {
  const polyline = [];
  for (const laneId of laneIds) {
    const index = asNumber(laneId);
    if (index === undefined || index < 0) continue;
    const feature = roadmapFeatures[Math.trunc(index)];
    appendNearestLines(polyline, lineStringsFromFeature(feature), start);
  }

  if (polyline.length < 2) return undefined;

  const forwardScore =
    metersBetween(start, polyline[0])
    + metersBetween(end, polyline.at(-1));
  const reverseScore =
    metersBetween(start, polyline.at(-1))
    + metersBetween(end, polyline[0]);
  if (reverseScore < forwardScore) polyline.reverse();

  if (metersBetween(start, polyline[0]) > 0.2) polyline.unshift(start);
  if (metersBetween(end, polyline.at(-1)) > 0.2) polyline.push(end);
  return polyline;
}

function buildRoutePolyline(laneIds, roadmapFeatures, start, end) {
  if (
    !Array.isArray(laneIds)
    || !Array.isArray(roadmapFeatures)
    || laneIds.length === 0
    || !start
    || !end
  ) {
    return undefined;
  }

  const forward = routePolylineForOrder(laneIds, roadmapFeatures, start, end);
  const backward = routePolylineForOrder([...laneIds].reverse(), roadmapFeatures, start, end);
  if (!forward) return backward;
  if (!backward) return forward;

  const length = (polyline) => {
    let total = 0;
    for (let index = 1; index < polyline.length; index += 1) {
      total += metersBetween(polyline[index - 1], polyline[index]);
    }
    return total;
  };
  return length(backward) < length(forward) ? backward : forward;
}

function localMeters(point, origin) {
  const latitudeRadians = origin[0] * Math.PI / 180;
  return [
    (point[1] - origin[1]) * Math.PI / 180 * EARTH_RADIUS_METERS * Math.cos(latitudeRadians),
    (point[0] - origin[0]) * Math.PI / 180 * EARTH_RADIUS_METERS,
  ];
}

function projectOntoPolyline(point, polyline) {
  if (!point || !Array.isArray(polyline) || polyline.length < 2) return undefined;
  let best;
  let accumulated = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    const start = localMeters(polyline[index - 1], point);
    const end = localMeters(polyline[index], point);
    const segmentX = end[0] - start[0];
    const segmentY = end[1] - start[1];
    const segmentSquared = segmentX * segmentX + segmentY * segmentY;
    const segmentLength = Math.sqrt(segmentSquared);
    if (segmentLength < 0.01) continue;

    const rawProjection = -(start[0] * segmentX + start[1] * segmentY) / segmentSquared;
    const projection = Math.max(0, Math.min(1, rawProjection));
    const projectedX = start[0] + projection * segmentX;
    const projectedY = start[1] + projection * segmentY;
    const distance = Math.hypot(projectedX, projectedY);
    const along = accumulated + projection * segmentLength;
    if (!best || distance < best.distance) best = { distance, along };
    accumulated += segmentLength;
  }

  if (!best || accumulated <= 0) return undefined;
  return { ...best, total: accumulated };
}

function plannedTravelWindow(mission) {
  const nextIndexValue = asNumber(mission?.NextStopIndex);
  if (nextIndexValue === undefined) return undefined;
  const nextIndex = Math.trunc(nextIndexValue);
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  if (nextIndex <= 0 || nextIndex >= stops.length) return undefined;

  const previousStop = stops[nextIndex - 1];
  const nextStop = stops[nextIndex];
  const start = latLon(previousStop?.GeoLocation);
  const end = latLon(nextStop?.GeoLocation);
  const plannedStart = timePoint(firstValue(previousStop, [
    ["PlannedDepartureTime"],
    ["DepartureTime"],
    ["PlannedArrivalTime"],
    ["ArrivalTime"],
  ]));
  const plannedEnd = timePoint(firstValue(nextStop, [
    ["PlannedArrivalTime"],
    ["ArrivalTime"],
    ["PlannedDepartureTime"],
    ["DepartureTime"],
  ]));
  if (!start || !end || !plannedStart || !plannedEnd) return undefined;

  let endSeconds = plannedEnd.seconds;
  if (!plannedStart.hasDate || !plannedEnd.hasDate) {
    while (endSeconds <= plannedStart.seconds) endSeconds += 86400;
  }
  const duration = endSeconds - plannedStart.seconds;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 14400) return undefined;

  return {
    identity: JSON.stringify([
      nextIndex,
      normalizedStopName(previousStop),
      normalizedStopName(nextStop),
      plannedStart.seconds,
      endSeconds,
    ]),
    start,
    end,
    plannedStart,
    plannedEndSeconds: endSeconds,
    duration,
  };
}

function alignClockToInterval(clockSeconds, intervalStart) {
  let aligned = clockSeconds;
  while (aligned < intervalStart - 43200) aligned += 86400;
  while (aligned > intervalStart + 43200) aligned -= 86400;
  return aligned;
}

function smoothRouteDelta(
  rawSeconds,
  actualSeconds,
  previousState,
  segmentIdentity,
  seedDelta,
) {
  const sameSegment = previousState.segmentIdentity === segmentIdentity;
  const previousSmoothed = sameSegment
    ? asNumber(previousState.smoothedDelta)
    : asNumber(seedDelta);
  const previousSampleSeconds = sameSegment
    ? asNumber(previousState.deltaSampleSeconds)
    : undefined;

  if (previousSmoothed === undefined) return rawSeconds;

  // Ein bestätigter Haltwert dient beim Beginn eines neuen Abschnitts als
  // nahtloser Startpunkt. Ab dem nächsten Poll wird zur laufenden
  // Routenabweichung übergeblendet.
  if (previousSampleSeconds === undefined) return previousSmoothed;

  const elapsedSeconds = actualSeconds - previousSampleSeconds;
  if (
    !Number.isFinite(elapsedSeconds)
    || elapsedSeconds < 0
    || elapsedSeconds > ROUTE_DELTA_RESET_GAP_SECONDS
  ) {
    return rawSeconds;
  }

  // Die Weltzeit besitzt teilweise nur Sekundenschritte, während mit 500 ms
  // gepollt wird. Der Mindestwert hält die Glättung auch bei zwei Messungen
  // innerhalb derselben Spielsekunde in Bewegung.
  const effectiveElapsed = Math.max(CORE_POLL_INTERVAL_MS / 1000, elapsedSeconds);
  const maximumChange = Math.max(
    ROUTE_DELTA_MIN_STEP_SECONDS,
    ROUTE_DELTA_SLEW_SECONDS_PER_SECOND * effectiveElapsed,
  );
  const difference = rawSeconds - previousSmoothed;

  if (Math.abs(difference) <= maximumChange) return rawSeconds;
  return previousSmoothed + Math.sign(difference) * maximumChange;
}

export function calculateRouteProgressDelta(
  snapshot,
  route,
  roadmapFeatures,
  previousState = {},
  seedDelta,
) {
  const mission = snapshot?.mission;
  const window = plannedTravelWindow(mission);
  const playerLocation = latLon(snapshot?.player?.GeoLocation);
  const laneIds = route?.Paths?.[0]?.PathLanes;
  if (!window || !playerLocation || !Array.isArray(laneIds) || laneIds.length === 0) {
    return { seconds: undefined, state: {} };
  }

  const laneSignature = laneIds.map((laneId) => Math.trunc(asNumber(laneId) ?? -1)).join(",");
  const canReusePolyline =
    previousState.segmentIdentity === window.identity
    && previousState.laneSignature === laneSignature
    && Array.isArray(previousState.polyline);
  const polyline = canReusePolyline
    ? previousState.polyline
    : buildRoutePolyline(laneIds, roadmapFeatures, window.start, window.end);
  if (!polyline) return { seconds: undefined, state: {} };

  const projection = projectOntoPolyline(playerLocation, polyline);
  if (!projection || projection.distance > MAX_PLAYER_ROUTE_DISTANCE_METERS) {
    const sameSegment = previousState.segmentIdentity === window.identity;
    return {
      seconds: undefined,
      state: {
        segmentIdentity: window.identity,
        laneSignature,
        polyline,
        progress: sameSegment
          ? previousState.progress
          : undefined,
        smoothedDelta: sameSegment
          ? previousState.smoothedDelta
          : asNumber(seedDelta),
        deltaSampleSeconds: sameSegment
          ? previousState.deltaSampleSeconds
          : undefined,
      },
    };
  }

  const measuredProgress = Math.max(0, Math.min(1, projection.along / projection.total));
  const progress =
    previousState.segmentIdentity === window.identity
    && Number.isFinite(previousState.progress)
      ? Math.max(previousState.progress, measuredProgress)
      : measuredProgress;
  const actual = timePoint(gameTime(
    snapshot?.world,
    snapshot?.player,
    snapshot?.vehicle,
    mission,
  ));
  const sameSegment = previousState.segmentIdentity === window.identity;
  const state = {
    segmentIdentity: window.identity,
    laneSignature,
    polyline,
    progress,
    smoothedDelta: sameSegment
      ? previousState.smoothedDelta
      : asNumber(seedDelta),
    deltaSampleSeconds: sameSegment
      ? previousState.deltaSampleSeconds
      : undefined,
  };
  if (!actual) return { seconds: undefined, state };

  const plannedSeconds = window.plannedStart.seconds + window.duration * progress;
  const actualSeconds =
    window.plannedStart.hasDate && actual.hasDate
      ? actual.seconds
      : alignClockToInterval(actual.seconds, window.plannedStart.seconds);
  const rawSeconds = Math.trunc(plannedSeconds - actualSeconds);
  const smoothedDelta = smoothRouteDelta(
    rawSeconds,
    actualSeconds,
    previousState,
    window.identity,
    seedDelta,
  );
  state.smoothedDelta = smoothedDelta;
  state.deltaSampleSeconds = actualSeconds;
  return {
    seconds: Math.trunc(smoothedDelta),
    rawSeconds,
    state,
  };
}

function usableStop(stop) {
  if (!stop || typeof stop !== "object") return false;
  return firstValue(stop, [["StopName"], ["GroupName"], ["Name"]]) !== undefined;
}

function indexedStop(mission, indexKey) {
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  const index = asNumber(mission?.[indexKey]);
  if (index === undefined) return undefined;
  const stop = stops[Math.trunc(index)];
  return usableStop(stop) ? stop : undefined;
}

function normalizedStopName(stop) {
  const name = firstValue(stop, [["StopName"], ["GroupName"], ["Name"]]);
  return name === undefined ? "" : String(name).trim().toLowerCase();
}

function matchingMissionStopIndex(mission, liveStop) {
  if (!usableStop(liveStop)) return -1;
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  const liveName = normalizedStopName(liveStop);
  const liveArrival = firstValue(liveStop, [
    ["PlannedArrivalTime"],
    ["ArrivalTime"],
  ]);
  const liveDeparture = firstValue(liveStop, [
    ["PlannedDepartureTime"],
    ["DepartureTime"],
  ]);
  const liveLocation = latLon(liveStop?.GeoLocation);

  const candidates = stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => normalizedStopName(stop) === liveName);
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0].index;

  const timeCandidates = liveArrival !== undefined || liveDeparture !== undefined
    ? candidates.filter(({ stop }) => (
        (liveArrival === undefined || firstValue(stop, [
          ["PlannedArrivalTime"],
          ["ArrivalTime"],
        ]) === liveArrival)
        && (liveDeparture === undefined || firstValue(stop, [
          ["PlannedDepartureTime"],
          ["DepartureTime"],
        ]) === liveDeparture)
      ))
    : [];
  if (timeCandidates.length === 1) return timeCandidates[0].index;

  if (liveLocation) {
    const locationCandidates = (
      timeCandidates.length > 0 ? timeCandidates : candidates
    ).filter(({ stop }) => {
      const location = latLon(stop?.GeoLocation);
      return location && metersBetween(liveLocation, location) < 1;
    });
    if (locationCandidates.length === 1) return locationCandidates[0].index;
  }

  // Gleichnamige Halte ohne eindeutige Zeit oder Position bleiben
  // absichtlich unaufgeloest; erst dann darf der numerische Legacy-Index als
  // Fallback verwendet werden.
  return -1;
}

function plannedStopFor(mission, liveStop, indexKey) {
  const matchedIndex = matchingMissionStopIndex(mission, liveStop);
  if (matchedIndex >= 0) return mission.Stops[matchedIndex];

  const indexed = indexedStop(mission, indexKey);
  if (indexed) return indexed;

  const name = normalizedStopName(liveStop);
  if (!name) return undefined;
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  return stops.find((stop) => normalizedStopName(stop) === name);
}

function missionStop(mission) {
  if (!mission || typeof mission !== "object") return undefined;
  if (usableStop(mission.CurrentStop)) return mission.CurrentStop;
  const indexedCurrent = indexedStop(mission, "CurrentStopIndex");
  if (usableStop(indexedCurrent)) return indexedCurrent;
  if (usableStop(mission.NextStop)) return mission.NextStop;
  const indexedNext = indexedStop(mission, "NextStopIndex");
  if (usableStop(indexedNext)) return indexedNext;
  return undefined;
}

function stopName(mission, stop, language) {
  const direct = firstValue(stop, [["StopName"], ["GroupName"], ["Name"]]);
  if (direct !== undefined) return String(direct);
  const current = mission?.CurrentStop;
  if (typeof current === "string" && current.trim() !== "") return current;
  const next = mission?.NextStop;
  if (typeof next === "string" && next.trim() !== "") return next;
  return mission
    ? translateUi("no_stop", language)
    : translateUi("no_mission", language);
}

function buttonByName(vehicle, name) {
  const buttons = vehicle?.Buttons;
  const normalized = name.trim().toLowerCase();

  if (Array.isArray(buttons)) {
    return buttons.find(
      (button) => String(button?.Name ?? "").trim().toLowerCase() === normalized,
    );
  }

  if (buttons && typeof buttons === "object") {
    const direct = buttons[name];
    if (direct) return direct;
    return Object.values(buttons).find(
      (button) => String(button?.Name ?? "").trim().toLowerCase() === normalized,
    );
  }

  return undefined;
}

function normalizeMechanicalKneeling(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "secondary" || normalized === "down" || normalized === "lowered") {
    return true;
  }

  if (normalized === "primary" || normalized === "up" || normalized === "raised") {
    return false;
  }

  return undefined;
}

function formatMechanicalKneeling(
  mechanicalState,
  targetLowered,
  vehicle,
  vehicleReady,
  language,
) {
  if (!vehicleReady) return "–";
  if (targetLowered === true) return translateUi("lowering", language);
  if (targetLowered === false) return translateUi("raising", language);
  if (mechanicalState === true) return translateUi("active", language);
  if (mechanicalState !== false) return "–";

  const speed = asNumber(vehicle?.Speed);
  return speed !== undefined && Math.abs(speed) === 0
    ? translateUi("ready", language)
    : translateUi("off", language);
}

/**
 * The Bus liefert den eCitaro-Powermeter als MW-Wert. Fuer die kompakte
 * Fahrzeuganzeige wird dieser echte Telemetriewert mit einer Nachkommastelle
 * in kW und deutschem Dezimalkomma dargestellt.
 */
export function formatVehiclePower(
  value,
  vehicleReady = true,
  language = getDisplayLanguage(),
) {
  if (!vehicleReady) return "–";
  const megawatts = asNumber(value);
  if (megawatts === undefined) return "–";

  const deciKilowatts = Math.round(megawatts * 10_000);
  if (deciKilowatts === 0) return `${formatUiDecimal(0, 1, language)} kW`;

  const sign = deciKilowatts > 0 ? "+" : "−";
  const absoluteKilowatts = formatUiDecimal(
    Math.abs(deciKilowatts) / 10,
    1,
    language,
  );
  return `${sign}${absoluteKilowatts} kW`;
}

function formatAverageConsumption(
  value,
  vehicleReady = true,
  language = getDisplayLanguage(),
) {
  if (!vehicleReady) return "–";
  const consumption = asNumber(value);
  if (consumption === undefined) return "–";

  const deciConsumption = Math.round(consumption * 10);
  if (deciConsumption === 0) {
    return `${formatUiDecimal(0, 1, language)} kWh/100 km`;
  }

  const sign = deciConsumption < 0 ? "−" : "";
  const absoluteConsumption = formatUiDecimal(
    Math.abs(deciConsumption) / 10,
    1,
    language,
  );
  return `${sign}${absoluteConsumption} kWh/100 km`;
}

function electricEnergyTelemetry(vehicle, vehicleId) {
  if (!vehicle || typeof vehicle !== "object") return undefined;
  const identity = `${vehicle.VehicleModel ?? ""} ${vehicleId ?? ""}`.toLowerCase();
  if (!/(?:ecitybus|ecitaro|electric|e[-_ ]?bus)/.test(identity)) return undefined;

  const currentEnergy = asNumber(vehicle.CurrentFuel);
  const maxEnergy = asNumber(vehicle.MaxFuel);
  const displayEnergy = asNumber(vehicle.DisplayFuel);
  if (
    currentEnergy === undefined
    || maxEnergy === undefined
    || displayEnergy === undefined
    || maxEnergy <= 0
    || currentEnergy < 0
    || currentEnergy > maxEnergy * 1.01
    || displayEnergy < 0
    || displayEnergy > 1.01
  ) {
    return undefined;
  }

  // Beim live geprueften eBus 2.2 entspricht CurrentFuel / MaxFuel exakt
  // DisplayFuel. Nur diese gegenseitige Bestaetigung erlaubt, CurrentFuel als
  // verbleibenden Energiespeicher fuer eine streckenbezogene Verbrauchsbildung zu
  // verwenden. Diesel-/Kraftstoffwerte werden durch die Fahrzeugidentitaet
  // ausgeschlossen.
  if (Math.abs(currentEnergy / maxEnergy - displayEnergy) > 0.005) {
    return undefined;
  }

  return { currentEnergy, maxEnergy };
}

export function supportsAverageVehicleConsumption(vehicle, vehicleId) {
  return electricEnergyTelemetry(vehicle, vehicleId) !== undefined;
}

/**
 * Ermittelt den Fahrtverbrauch wie ein Bordcomputer aus der bestaetigten
 * Aenderung des eBus-Energiespeichers und der tatsaechlich gefahrenen Strecke.
 * Die Strecke wird aus offizieller Geschwindigkeit und fortlaufender Spielzeit
 * integriert. Sinkende Energie ergibt positiven Verbrauch; eine echte
 * Nettozunahme durch Rekuperation kann einen negativen Fahrtwert ergeben.
 *
 * Das Ergebnis ist ein seit Messbeginn gebildeter Durchschnitt in kWh/100 km
 * und niemals Ersatz fuer das direkte Powermeter. Nach der Lernphase bleibt
 * der letzte bestaetigte Fahrt-Durchschnitt bei Stillstand und pausierter
 * Spielzeit sowie ueber einzelne unvollstaendige API-Proben sichtbar.
 * Bestaetigtes Verlassen des Busses, Fahrzeugwechsel und unplausible
 * Ergebnisse setzen die Messung dagegen weiterhin sicher zurueck.
 */
export class VehicleAverageConsumptionTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.vehicleId = "";
    this.startEnergy = undefined;
    this.distanceKm = 0;
    this.lastAverage = undefined;
    this.lastGameSeconds = undefined;
    this.lastSpeedKmh = undefined;
    this.lastGameAdvanceObservedAt = undefined;
  }

  initialize(vehicleId, energy, gameSeconds, speedKmh, observedAt) {
    this.vehicleId = vehicleId;
    this.startEnergy = energy.currentEnergy;
    this.distanceKm = 0;
    this.lastGameSeconds = gameSeconds;
    this.lastSpeedKmh = speedKmh;
    this.lastGameAdvanceObservedAt = observedAt;
  }

  update(snapshot, observedAt = Date.now()) {
    const vehicle = snapshot?.vehicle;
    const vehicleId = snapshot?.vehicleId ?? snapshot?.player?.CurrentVehicle ?? "";
    const directPower = asNumber(vehicle?.Powermeter);
    if (directPower !== undefined) {
      this.reset();
      return undefined;
    }

    const runtimeState = snapshot?.runtimeState;
    const vehicleReady = snapshot?.vehicleReady === true
      || runtimeState === "bus-ready"
      || runtimeState === "mission-ready";
    const energy = electricEnergyTelemetry(vehicle, vehicleId);
    const gameTime = timePoint(snapshot?.world?.DateTime);
    const speedKmh = asNumber(vehicle?.Speed);

    if (runtimeState === "no-bus") {
      this.reset();
      return undefined;
    }

    if (vehicleId && this.vehicleId && vehicleId !== this.vehicleId) {
      this.reset();
      if (vehicleReady && energy && gameTime && speedKmh !== undefined && speedKmh >= 0) {
        this.initialize(vehicleId, energy, gameTime.seconds, speedKmh, observedAt);
      }
      return undefined;
    }

    if (
      !vehicleReady
      || !vehicleId
      || !energy
      || !gameTime
      || speedKmh === undefined
      || speedKmh < 0
    ) {
      // Einzelne Fahrzeugantworten koennen waehrend Halten, Missionswechseln
      // oder kurzen API-Luecken unvollstaendig sein. Das ist weder ein
      // Fahrzeugwechsel noch ein manueller Reset. Der letzte bestaetigte
      // Fahrtwert bleibt deshalb intern erhalten und wird bei der naechsten
      // vollstaendigen Probe fortgesetzt beziehungsweise sicher neu verankert.
      return this.lastAverage;
    }

    if (!this.vehicleId) {
      this.initialize(vehicleId, energy, gameTime.seconds, speedKmh, observedAt);
      return undefined;
    }

    const gameSeconds = gameTime.seconds;
    if (this.lastGameSeconds === undefined || this.lastSpeedKmh === undefined) {
      this.initialize(vehicleId, energy, gameSeconds, speedKmh, observedAt);
      return undefined;
    }

    const elapsedSeconds = gameSeconds - this.lastGameSeconds;
    if (
      elapsedSeconds < 0
      || elapsedSeconds > AVERAGE_CONSUMPTION_MAX_TIME_STEP_SECONDS
    ) {
      const heldAverage = this.lastAverage;
      this.initialize(vehicleId, energy, gameSeconds, speedKmh, observedAt);
      this.lastAverage = heldAverage;
      return heldAverage;
    }

    if (elapsedSeconds > 0) {
      const averageSpeedKmh = (this.lastSpeedKmh + speedKmh) / 2;
      this.distanceKm += averageSpeedKmh * elapsedSeconds / 3600;
      this.lastGameSeconds = gameSeconds;
      this.lastSpeedKmh = speedKmh;
      this.lastGameAdvanceObservedAt = observedAt;
    }

    if (
      this.lastGameAdvanceObservedAt === undefined
      || observedAt - this.lastGameAdvanceObservedAt > AVERAGE_CONSUMPTION_STALE_REAL_MS
      || this.startEnergy === undefined
      || this.distanceKm < AVERAGE_CONSUMPTION_MIN_DISTANCE_KM
    ) {
      return this.lastAverage;
    }

    const consumption = -(energy.currentEnergy - this.startEnergy)
      / this.distanceKm
      * 100;
    if (
      !Number.isFinite(consumption)
      || Math.abs(consumption) > AVERAGE_CONSUMPTION_MAX_ABSOLUTE_KWH_PER_100_KM
    ) {
      this.initialize(vehicleId, energy, gameSeconds, speedKmh, observedAt);
      return undefined;
    }

    this.lastAverage = consumption;
    return this.lastAverage;
  }
}

function stopRequested(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return false;
  if (asBoolean(vehicle.AllLamps?.["LED StopRequest"])) return true;
  if (["SecondDoorRequest", "ThirdDoorRequest", "FourthDoorRequest"].some((key) => asBoolean(vehicle[key]))) {
    return true;
  }
  return Array.isArray(vehicle.doors) && vehicle.doors.some((door) => asBoolean(door?.StopRequest));
}

function doorsOpen(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return false;
  if (asBoolean(vehicle.PassengerDoorsOpen) || asBoolean(vehicle.LuggageDoorsOpen)) return true;
  return Array.isArray(vehicle.doors) && vehicle.doors.some((door) => {
    const progress = asNumber(door?.Progress);
    return asBoolean(door?.IsOpen ?? door?.Open) || (progress !== undefined && progress > 0.01);
  });
}

function passengerDoorsOpen(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return false;
  if (asBoolean(vehicle.PassengerDoorsOpen)) return true;

  return Array.isArray(vehicle.doors) && vehicle.doors.some((door) => {
    const name = String(
      firstValue(door, [["Name"], ["DoorName"], ["Type"]]) ?? "",
    ).trim().toLowerCase();
    if (
      name.includes("luggage")
      || name.includes("koffer")
      || name.includes("gepäck")
      || name.includes("gepaeck")
    ) {
      return false;
    }

    const passengerMarker = firstValue(door, [
      ["IsPassengerDoor"],
      ["PassengerDoor"],
    ]);
    if (passengerMarker !== undefined && !asBoolean(passengerMarker)) return false;

    const progress = asNumber(door?.Progress);
    return (
      asBoolean(door?.IsOpen ?? door?.Open)
      || (progress !== undefined && progress > 0.01)
    );
  });
}

function gameTime(world, player, vehicle, mission) {
  const worldValue = firstValue(world, [
    ["DateTime"],
    ["CurrentDateTime"],
    ["GameDateTime"],
  ]);
  if (worldValue !== undefined) return worldValue;

  const paths = [
    ["DateTime"],
    ["CurrentTime"],
    ["GameTime"],
    ["IngameTime"],
    ["InGameTime"],
    ["WorldTime"],
    ["TimeOfDay"],
    ["DayTime"],
    ["Time"],
  ];
  return firstValue(mission, paths) ?? firstValue(player, paths) ?? firstValue(vehicle, paths);
}

function stopTimeDelta(liveStop, plannedStop, departureFirst, includeGenericTimes = false) {
  if (!usableStop(liveStop) || !usableStop(plannedStop)) return undefined;
  const fields = departureFirst
    ? [
        {
          live: [["ActualDepartureTime"], ["EstimatedDepartureTime"]],
          planned: [["PlannedDepartureTime"], ["DepartureTime"]],
        },
        {
          live: [["ActualArrivalTime"], ["EstimatedArrivalTime"]],
          planned: [["PlannedArrivalTime"], ["ArrivalTime"]],
        },
      ]
    : [
        {
          live: [["ActualArrivalTime"], ["EstimatedArrivalTime"]],
          planned: [["PlannedArrivalTime"], ["ArrivalTime"]],
        },
        {
          live: [["ActualDepartureTime"], ["EstimatedDepartureTime"]],
          planned: [["PlannedDepartureTime"], ["DepartureTime"]],
        },
      ];

  for (const field of fields) {
    const difference = scheduleDifferenceSeconds(
      firstValue(liveStop, field.live),
      firstValue(plannedStop, field.planned),
    );
    if (difference !== undefined) return difference;
  }

  if (!includeGenericTimes) return undefined;

  const genericFields = departureFirst
    ? [
        { live: [["DepartureTime"]], planned: [["PlannedDepartureTime"], ["DepartureTime"]] },
        { live: [["ArrivalTime"]], planned: [["PlannedArrivalTime"], ["ArrivalTime"]] },
      ]
    : [
        { live: [["ArrivalTime"]], planned: [["PlannedArrivalTime"], ["ArrivalTime"]] },
        { live: [["DepartureTime"]], planned: [["PlannedDepartureTime"], ["DepartureTime"]] },
      ];

  for (const field of genericFields) {
    const difference = scheduleDifferenceSeconds(
      firstValue(liveStop, field.live),
      firstValue(plannedStop, field.planned),
    );

    // CurrentStop/NextStop/LastStopReached enthalten in The Bus häufig nur
    // Kopien der statischen Stops-Zeiten. Gleichheit ist deshalb kein
    // bestätigtes Live-Delta von null.
    if (difference !== undefined && difference !== 0) return difference;
  }

  return undefined;
}

function stopClockDelta(world, plannedStop, departureFirst) {
  if (!usableStop(plannedStop)) return undefined;
  const plannedTime = departureFirst
    ? firstValue(plannedStop, [
        ["PlannedDepartureTime"],
        ["DepartureTime"],
        ["PlannedArrivalTime"],
        ["ArrivalTime"],
      ])
    : firstValue(plannedStop, [
        ["PlannedArrivalTime"],
        ["ArrivalTime"],
        ["PlannedDepartureTime"],
        ["DepartureTime"],
      ]);
  return scheduleDifferenceSeconds(gameTime(world), plannedTime);
}

function stopAtVehicle(mission) {
  const candidates = [
    {
      stop: mission?.CurrentStop,
      indexKey: "CurrentStopIndex",
    },
    {
      stop: mission?.LastStopReached,
      indexKey: "LastStopReachedIndex",
    },
    {
      stop: mission?.NextStop,
      indexKey: "NextStopIndex",
    },
  ];

  for (const candidate of candidates) {
    if (!usableStop(candidate.stop)) continue;
    return {
      liveStop: candidate.stop,
      plannedStop: plannedStopFor(mission, candidate.stop, candidate.indexKey) ?? candidate.stop,
    };
  }
  return undefined;
}

function plannedDisplayedStop(mission, displayedStop) {
  if (!usableStop(displayedStop)) return undefined;

  if (displayedStop === mission?.CurrentStop) {
    return plannedStopFor(mission, displayedStop, "CurrentStopIndex") ?? displayedStop;
  }

  const indexedCurrent = indexedStop(mission, "CurrentStopIndex");
  if (displayedStop === indexedCurrent) return displayedStop;

  if (displayedStop === mission?.NextStop) {
    return plannedStopFor(mission, displayedStop, "NextStopIndex") ?? displayedStop;
  }

  const indexedNext = indexedStop(mission, "NextStopIndex");
  if (displayedStop === indexedNext) return displayedStop;

  const name = normalizedStopName(displayedStop);
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  return stops.find((stop) => normalizedStopName(stop) === name) ?? displayedStop;
}

function stopIndexFor(mission, stop, indexKey) {
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  const matchedIndex = matchingMissionStopIndex(mission, stop);
  if (matchedIndex >= 0) return matchedIndex;

  const indexValue = asNumber(mission?.[indexKey]);
  if (indexValue !== undefined) {
    const index = Math.trunc(indexValue);
    if (index >= 0 && index < stops.length) return index;
  }

  const name = normalizedStopName(stop);
  return name
    ? stops.findIndex((candidate) => normalizedStopName(candidate) === name)
    : -1;
}

function createStopPhaseCandidate(liveStop, plannedStop, index) {
  const identity = JSON.stringify([
    index,
    normalizedStopName(plannedStop),
    firstValue(plannedStop, [["ArrivalTime"], ["PlannedArrivalTime"]]) ?? "",
    firstValue(plannedStop, [["DepartureTime"], ["PlannedDepartureTime"]]) ?? "",
  ]);

  return {
    identity,
    index,
    liveStop,
    plannedStop,
    location: latLon(plannedStop?.GeoLocation) ?? latLon(liveStop?.GeoLocation),
  };
}

function stopPhaseCandidate(mission, liveStop, indexKey) {
  const stop = usableStop(liveStop) ? liveStop : indexedStop(mission, indexKey);
  if (!usableStop(stop)) return undefined;

  const plannedStop = plannedStopFor(mission, stop, indexKey) ?? stop;
  const index = stopIndexFor(mission, plannedStop, indexKey);
  return createStopPhaseCandidate(stop, plannedStop, index);
}

function stopPhaseCandidateAtIndex(mission, index) {
  const stops = Array.isArray(mission?.Stops) ? mission.Stops : [];
  const normalizedIndex = Math.trunc(asNumber(index) ?? -1);
  const stop = stops[normalizedIndex];
  if (normalizedIndex < 0 || !usableStop(stop)) return undefined;
  return createStopPhaseCandidate(stop, stop, normalizedIndex);
}

function followingStopPhaseCandidate(mission, candidate) {
  if (!candidate) return undefined;
  const indexedCandidate = candidate.index >= 0
    ? candidate
    : stopPhaseCandidateAtIndex(
        mission,
        stopIndexFor(mission, candidate.plannedStop, ""),
      );
  return indexedCandidate
    ? stopPhaseCandidateAtIndex(mission, indexedCandidate.index + 1)
    : undefined;
}

function nearestStopPhaseCandidate(playerLocation, candidates) {
  if (!playerLocation) return undefined;
  let nearest;

  for (const candidate of candidates) {
    if (!candidate?.location) continue;
    const distance = metersBetween(playerLocation, candidate.location);
    if (!nearest || distance < nearest.distance) {
      nearest = { candidate, distance };
    }
  }

  return nearest;
}

function stopReferenceDelta(snapshot, plannedStop, departureFirst) {
  if (!usableStop(plannedStop)) return undefined;
  const plannedTime = departureFirst
    ? firstValue(plannedStop, [
        ["PlannedDepartureTime"],
        ["DepartureTime"],
        ["PlannedArrivalTime"],
        ["ArrivalTime"],
      ])
    : firstValue(plannedStop, [
        ["PlannedArrivalTime"],
        ["ArrivalTime"],
        ["PlannedDepartureTime"],
        ["DepartureTime"],
      ]);
  return scheduleDifferenceSeconds(
    gameTime(
      snapshot?.world,
      snapshot?.player,
      snapshot?.vehicle,
      snapshot?.mission,
    ),
    plannedTime,
  );
}

/**
 * Waehlt dieselbe zeitliche Referenz, die auch das Atron waehrend einer Fahrt
 * verwendet: am Halt die Abfahrt des aktuellen Halts, unterwegs die Ankunft
 * des naechsten Halts. Sobald Position, Stillstand und eine geoeffnete
 * Fahrgasttuer zusammenpassen, darf ANK bereits den Folgehalt zeigen. Name,
 * ABF und Delta bleiben bis zum Verlassen der Ausfahrtsschwelle am aktuellen
 * Halt. Wird ein Halt ohne Tuerfreigabe und Stillstand durchfahren, merkt die
 * Einfahrtsschwelle ihn trotzdem vor. Nach der Ausfahrt wechseln Name, ANK,
 * ABF und Delta dann zwingend gemeinsam auf den Folgehalt.
 *
 * Die Position entscheidet nur ueber den Zustand "am Halt/unterwegs". Sie
 * fliesst nicht mehr in die Delta-Berechnung ein. Zwei unterschiedliche
 * Entfernungsschwellen verhindern ein Hin-und-her-Schalten am Haltepunkt.
 */
export function calculateStopPhaseDelta(
  snapshot,
  previousState = {},
  scheduleState = {},
) {
  const mission = snapshot?.mission;
  if (!mission || typeof mission !== "object") {
    return { seconds: undefined, source: "unavailable", stop: undefined, state: {} };
  }

  const current = stopPhaseCandidate(
    mission,
    mission?.CurrentStop,
    "CurrentStopIndex",
  );
  const lastReached = stopPhaseCandidate(
    mission,
    mission?.LastStopReached,
    "LastStopReachedIndex",
  );
  const next = stopPhaseCandidate(
    mission,
    mission?.NextStop,
    "NextStopIndex",
  );
  const previousIndexedStop = previousState.phase === "at-stop"
    ? stopPhaseCandidateAtIndex(mission, previousState.stopIndex)
    : undefined;
  const previousEnRouteStop = previousState.phase === "en-route"
    ? stopPhaseCandidateAtIndex(mission, previousState.stopIndex)
    : undefined;
  const candidates = [
    current,
    lastReached,
    next,
    previousIndexedStop,
    previousEnRouteStop,
  ]
    .filter((candidate, index, values) => (
      candidate
      && !(
        previousEnRouteStop?.index >= 0
        && candidate.index >= 0
        && candidate.index < previousEnRouteStop.index
      )
      && values.findIndex((value) => value?.identity === candidate.identity) === index
    ));
  const playerLocation = latLon(snapshot?.player?.GeoLocation);
  const nearestPhysicalStop = nearestStopPhaseCandidate(
    playerLocation,
    candidates,
  );
  const speed = asNumber(snapshot?.vehicle?.Speed);
  const physicalArrivalConfirmed = Boolean(
    nearestPhysicalStop
    && nearestPhysicalStop.distance <= STOP_PHASE_ENTER_DISTANCE_METERS
    && speed !== undefined
    && Math.abs(speed) <= STOP_CONFIRM_MAX_SPEED_KMH
    && passengerDoorsOpen(snapshot?.vehicle),
  );
  const atStopSignal = firstValue(snapshot?.vehicle, [
    ["IsAtStop"],
    ["AtStop"],
  ]);
  const confirmedAtStop =
    atStopSignal !== undefined && asBoolean(atStopSignal);
  const stopReachedChanged = scheduleState.stopReachedChanged === true;

  let activeStop;

  // Die physische Dreifachbestaetigung darf die Missionsumschaltung
  // ueberholen. Dadurch kann ANK schon beim Tuerfreigeben auf den Folgehalt
  // wechseln, ohne die Abfahrtsreferenz vorzeitig zu verlassen.
  if (physicalArrivalConfirmed) {
    activeStop = nearestPhysicalStop.candidate;
  }

  // IsAtStop ist die staerkste strukturierte Bestaetigung des Spiels.
  if (!activeStop) {
    if (confirmedAtStop) {
      activeStop =
        nearestPhysicalStop?.candidate
        ?? candidates[0];
    } else if (current) {
      const currentDistance = playerLocation && current.location
        ? metersBetween(playerLocation, current.location)
        : undefined;
      const currentIsBehindLatchedEnRouteStop = Boolean(
        previousEnRouteStop
        && current.index >= 0
        && previousEnRouteStop.index >= 0
        && current.index < previousEnRouteStop.index,
      );

      // CurrentStop bleibt nach dem Losfahren bei manchen Bussen noch kurz
      // stehen. Sobald die Position die Ausfahrtsschwelle verlassen hat, darf
      // dieser veraltete Wert den Wechsel zur naechsten Ankunft nicht blockieren.
      // Nach einem erzwungenen Durchfahrtswechsel darf er die Anzeige auch bei
      // kurzem Positionsrauschen nicht wieder auf den vorherigen Halt ziehen.
      if (
        !currentIsBehindLatchedEnRouteStop
        && (
          currentDistance === undefined
          || currentDistance <= STOP_PHASE_EXIT_DISTANCE_METERS
        )
      ) {
        activeStop = current;
      }
    } else if (
      stopReachedChanged
      && lastReached
      && !(
        previousEnRouteStop?.index >= 0
        && lastReached.index >= 0
        && lastReached.index < previousEnRouteStop.index
      )
    ) {
      activeStop = lastReached;
    }
  }

  // Ein bereits bestaetigter Halt bleibt mit einer groesseren Ausfahrts-
  // schwelle aktiv. So kann Positionsrauschen den Bezug nicht umschalten.
  if (!activeStop && previousState.phase === "at-stop") {
    const previousStop = candidates.find(
      (candidate) => candidate.identity === previousState.stopIdentity,
    );
    if (previousStop) {
      const distance = playerLocation && previousStop.location
        ? metersBetween(playerLocation, previousStop.location)
        : Number.POSITIVE_INFINITY;
      if (distance <= STOP_PHASE_EXIT_DISTANCE_METERS) activeStop = previousStop;
    }
  }

  // Beim Pluginstart kann der Bus bereits an einem Halt stehen. In diesem
  // Fall ist LastStopReached zusammen mit der Position die belastbare
  // Referenz; die noch nicht erreichte NextStop wird nie vorzeitig als Halt
  // interpretiert.
  if (
    !activeStop
    && lastReached?.location
    && playerLocation
    && !(
      previousEnRouteStop?.index >= 0
      && lastReached.index >= 0
      && lastReached.index < previousEnRouteStop.index
    )
  ) {
    const distance = metersBetween(playerLocation, lastReached.location);
    if (distance <= STOP_PHASE_ENTER_DISTANCE_METERS) activeStop = lastReached;
  }

  if (activeStop) {
    const arrivalConfirmed = (
      physicalArrivalConfirmed
      && nearestPhysicalStop?.candidate.identity === activeStop.identity
    ) || (
      previousState.phase === "at-stop"
      && previousState.stopIdentity === activeStop.identity
      && previousState.arrivalConfirmed === true
    );
    const followingStop = followingStopPhaseCandidate(mission, activeStop);

    return {
      seconds: stopReferenceDelta(snapshot, activeStop.plannedStop, true),
      source: "current-stop-departure",
      stop: activeStop.plannedStop,
      arrivalStop: arrivalConfirmed && followingStop
        ? followingStop.plannedStop
        : activeStop.plannedStop,
      departureStop: activeStop.plannedStop,
      state: {
        phase: "at-stop",
        stopIdentity: activeStop.identity,
        stopIndex: activeStop.index,
        arrivalConfirmed,
      },
    };
  }

  const previousStop = previousState.phase === "at-stop"
    ? previousIndexedStop
      ?? candidates.find(
        (candidate) => candidate.identity === previousState.stopIdentity,
      )
    : undefined;
  const previousEnRouteIsAheadOfMission = Boolean(
    previousEnRouteStop
    && (
      !next
      || next.index < 0
      || (
        previousEnRouteStop.index >= 0
        && previousEnRouteStop.index > next.index
      )
    ),
  );
  let upcomingStop =
    followingStopPhaseCandidate(mission, previousStop)
    ?? (previousEnRouteIsAheadOfMission ? previousEnRouteStop : next)
    ?? previousEnRouteStop
    ?? current
    ?? lastReached;
  if (!upcomingStop) {
    return { seconds: undefined, source: "unavailable", stop: undefined, state: {} };
  }

  // Auch ohne Halt, Stillstand oder Tuerfreigabe muss die Anzeige nach einer
  // echten Durchfahrt weiterschalten. Die Einfahrt in den 25-m-Bereich scharf
  // schaltet den Schutz; erst das anschliessende Verlassen des 30-m-Bereichs
  // loest den gemeinsamen Wechsel aus. Ein direkt ausserhalb gestarteter Bus
  // kann dadurch keinen Halt versehentlich ueberspringen.
  let passThroughArmed = Boolean(
    previousState.phase === "en-route"
    && previousState.stopIdentity === upcomingStop.identity
    && previousState.passThroughArmed === true,
  );
  const upcomingDistance = playerLocation && upcomingStop.location
    ? metersBetween(playerLocation, upcomingStop.location)
    : undefined;

  if (
    upcomingDistance !== undefined
    && upcomingDistance <= STOP_PHASE_ENTER_DISTANCE_METERS
  ) {
    passThroughArmed = true;
  }

  if (
    passThroughArmed
    && upcomingDistance !== undefined
    && upcomingDistance > STOP_PHASE_EXIT_DISTANCE_METERS
  ) {
    const followingStop = followingStopPhaseCandidate(mission, upcomingStop);
    if (followingStop) {
      upcomingStop = followingStop;
      passThroughArmed = false;
    }
  }

  return {
    seconds: stopReferenceDelta(snapshot, upcomingStop.plannedStop, false),
    source: "next-stop-arrival",
    stop: upcomingStop.plannedStop,
    arrivalStop: upcomingStop.plannedStop,
    departureStop: upcomingStop.plannedStop,
    state: {
      phase: "en-route",
      stopIdentity: upcomingStop.identity,
      stopIndex: upcomingStop.index,
      arrivalConfirmed: false,
      passThroughArmed,
    },
  };
}

function scheduleDelta(mission, world, vehicle, previousDelta, scheduleState = {}) {
  const stopReachedChanged = scheduleState.stopReachedChanged === true;
  const paths = [
    ["ScheduleDelta"],
    ["ScheduleDeviation"],
    ["CurrentDelay"],
    ["CurrentDeviation"],
    ["Deviation"],
    ["TimeDelta"],
    ["Delay"],
    ["Delta"],
  ];

  const vehicleDelta = deltaSeconds(firstValue(vehicle, [
    ["ScheduleDelta"],
    ["ScheduleDeviation"],
    ["ScheduleDelay"],
    ["CurrentDelay"],
    ["CurrentDeviation"],
    ["TimetableDelta"],
    ["TimetableDeviation"],
  ]));
  if (vehicleDelta !== undefined) {
    return { seconds: vehicleDelta, source: "telemetry" };
  }

  for (const source of [
    mission,
    mission?.CurrentStop,
    mission?.NextStop,
    mission?.LastStopReached,
  ]) {
    const direct = deltaSeconds(firstValue(source, paths));
    if (direct !== undefined) return { seconds: direct, source: "telemetry" };
  }

  const stopPairs = [
    {
      liveStop: mission?.CurrentStop,
      indexKey: "CurrentStopIndex",
      departureFirst: true,
      source: "current-stop",
    },
    {
      liveStop: mission?.NextStop,
      indexKey: "NextStopIndex",
      departureFirst: false,
      source: "next-stop",
    },
    {
      liveStop: mission?.LastStopReached,
      indexKey: "LastStopReachedIndex",
      departureFirst: true,
      source: "last-stop",
    },
  ];

  for (const pair of stopPairs) {
    const plannedStop = plannedStopFor(mission, pair.liveStop, pair.indexKey);
    const stopDelta = stopTimeDelta(pair.liveStop, plannedStop, pair.departureFirst);
    if (stopDelta !== undefined) return { seconds: stopDelta, source: pair.source };
  }

  for (const pair of stopPairs) {
    const plannedStop = plannedStopFor(mission, pair.liveStop, pair.indexKey);
    const stopDelta = stopTimeDelta(
      pair.liveStop,
      plannedStop,
      pair.departureFirst,
      true,
    );
    if (stopDelta !== undefined) {
      return { seconds: stopDelta, source: `${pair.source}-inferred` };
    }
  }

  const stopPhaseDelta = asNumber(scheduleState.stopPhaseDelta);
  if (stopPhaseDelta !== undefined) {
    return {
      seconds: Math.trunc(stopPhaseDelta),
      source: typeof scheduleState.stopPhaseSource === "string"
        ? scheduleState.stopPhaseSource
        : "stop-phase",
    };
  }

  if (asBoolean(vehicle?.IsAtStop)) {
    const current = stopAtVehicle(mission);
    const clockDelta = stopClockDelta(world, current?.plannedStop, true);
    if (clockDelta !== undefined) {
      return { seconds: clockDelta, source: "confirmed-stop-clock" };
    }
  }

  if (stopReachedChanged && usableStop(mission?.LastStopReached)) {
    const plannedReached =
      plannedStopFor(mission, mission.LastStopReached, "LastStopReachedIndex")
      ?? mission.LastStopReached;
    const clockDelta = stopClockDelta(world, plannedReached, false);
    if (clockDelta !== undefined) {
      return { seconds: clockDelta, source: "reached-stop-clock" };
    }
  }

  const routeDelta = asNumber(scheduleState.routeProgressDelta);
  if (routeDelta !== undefined) {
    return { seconds: Math.trunc(routeDelta), source: "route-progress" };
  }

  if (previousDelta !== undefined) return { seconds: previousDelta, source: "cached" };

  const displayedStop = missionStop(mission);
  const overdueDelta = stopClockDelta(
    world,
    plannedDisplayedStop(mission, displayedStop),
    false,
  );

  // Vor der Sollzeit wäre dieser Wert nur ein Countdown bis zum nächsten Halt,
  // keine belastbare Fahrplanabweichung. Nach Überschreiten der Sollzeit ist
  // dagegen sicher, dass der Bus mindestens um diesen Betrag verspätet ist.
  if (overdueDelta !== undefined && overdueDelta < 0) {
    return { seconds: overdueDelta, source: "overdue-stop-clock" };
  }

  return { seconds: undefined, source: "unavailable" };
}

export function missionIdentity(mission) {
  if (!mission || typeof mission !== "object") return "";
  const stops = Array.isArray(mission.Stops) ? mission.Stops : [];
  const first = stops[0];
  const last = stops.at(-1);
  return JSON.stringify([
    mission.MissionClassName ?? "",
    stops.length,
    normalizedStopName(first),
    firstValue(first, [["ArrivalTime"], ["DepartureTime"]]) ?? "",
    normalizedStopName(last),
    firstValue(last, [["DepartureTime"], ["ArrivalTime"]]) ?? "",
  ]);
}

export function reachedStopIdentity(mission) {
  const index = asNumber(mission?.LastStopReachedIndex);
  if (index === undefined || index < 0) return "";
  return `${Math.trunc(index)}:${normalizedStopName(mission?.LastStopReached)}`;
}

export function createViewModel(snapshot, previousDelta, scheduleState = {}) {
  const language = normalizeDisplayLanguage(
    scheduleState.language ?? getDisplayLanguage(),
  );
  const player = snapshot?.player;
  const vehicle = snapshot?.vehicle;
  const mission = snapshot?.mission;
  const world = snapshot?.world;
  const runtimeState = snapshot?.runtimeState
    ?? (!(snapshot?.online === true || snapshot?.connected === true)
      ? "offline"
      : player?.Mode !== "Vehicle" || typeof player?.CurrentVehicle !== "string"
        ? "no-bus"
        : !vehicle || typeof vehicle !== "object"
          ? "bus-not-ready"
          : "bus-ready");
  const online = runtimeState !== "offline";
  const inVehicle = runtimeState === "bus-not-ready"
    || runtimeState === "bus-ready"
    || runtimeState === "mission-ready";
  const vehicleReady = snapshot?.vehicleReady === true
    || runtimeState === "bus-ready"
    || runtimeState === "mission-ready";
  const stop = usableStop(scheduleState.displayStop)
    ? scheduleState.displayStop
    : missionStop(mission);
  const arrivalStop = usableStop(scheduleState.arrivalStop)
    ? scheduleState.arrivalStop
    : stop;
  const departureStop = usableStop(scheduleState.departureStop)
    ? scheduleState.departureStop
    : stop;
  const deltaState = scheduleDelta(
    mission,
    world,
    vehicle,
    previousDelta,
    scheduleState,
  );
  const delta = deltaState.seconds;
  const status = scheduleStatus(delta, language);
  const displayFuel = asNumber(vehicle?.DisplayFuel);
  const speed = Math.max(0, Math.round(asNumber(vehicle?.Speed) ?? 0));
  const allowedSpeed = Math.max(
    0,
    Math.round(asNumber(vehicle?.AllowedSpeed) ?? 0),
  );
  const speedOverLimit = allowedSpeed > 0
    ? Math.max(0, speed - allowedSpeed)
    : 0;
  const speedLevel = speedOverLimit >= 5
    ? "critical"
    : speedOverLimit >= 1
      ? "warning"
      : "normal";
  const gear = firstValue(vehicle, [["Gearbox", "CurrentSelector"]]) ?? buttonByName(vehicle, "Gear Selector")?.State;
  const autoKneelingDisabled = buttonByName(vehicle, "Automatic Kneeling")?.State
    ?? buttonByName(vehicle, "AutomaticKneeling")?.State
    ?? vehicle?.AllLamps?.["ButtonLight AutomaticKneeling"];
  const autoKneeling = typeof scheduleState.autoKneeling === "boolean"
    ? scheduleState.autoKneeling
    : autoKneelingDisabled === undefined || autoKneelingDisabled === null
      ? false
      : !asBoolean(autoKneelingDisabled);
  const mechanicalKneeling = typeof scheduleState.mechanicalKneeling === "boolean"
    ? scheduleState.mechanicalKneeling
    : normalizeMechanicalKneeling(buttonByName(vehicle, "Kneeling")?.State);
  const directPowerAvailable = asNumber(vehicle?.Powermeter) !== undefined;
  const averageConsumption = asNumber(scheduleState.averageConsumptionKwhPer100Km);
  const averageConsumptionSupported = supportsAverageVehicleConsumption(
    vehicle,
    snapshot?.vehicleId ?? player?.CurrentVehicle,
  );
  const powerSource = directPowerAvailable
    ? "direct"
    : averageConsumption !== undefined
      ? "average-consumption"
      : averageConsumptionSupported
        ? "average-consumption-pending"
        : "unavailable";

  return {
    language,
    online,
    inVehicle,
    runtimeState,
    connectionLabel: runtimeState === "offline"
      ? translateUi("offline", language)
      : runtimeState === "no-bus"
        ? translateUi("no_bus", language)
        : runtimeState === "bus-not-ready"
          ? translateUi("no_data", language)
          : translateUi("live", language),
    stopName: stopName(mission, stop, language),
    arrival: formatClock(firstValue(arrivalStop, [["ArrivalTime"], ["PlannedArrivalTime"]])),
    departure: formatClock(firstValue(departureStop, [["DepartureTime"], ["PlannedDepartureTime"]])),
    deltaText: formatDelta(delta),
    deltaSeconds: delta,
    deltaSource: deltaState.source,
    status,
    ingameTime: formatClock(gameTime(world, player, vehicle, mission), true),
    stopRequest: stopRequested(vehicle),
    speed,
    allowedSpeed,
    speedOverLimit,
    speedLevel,
    gear: gear == null || gear === "" ? "–" : String(gear).slice(0, 1).toUpperCase(),
    batteryPercent: displayFuel === undefined
      ? undefined
      : Math.round(Math.max(0, Math.min(1, displayFuel)) * 1_000) / 10,
    doors: doorsOpen(vehicle)
      ? translateUi("open", language)
      : inVehicle ? translateUi("closed", language) : "–",
    parkingBrake: asBoolean(vehicle?.FixingBrake)
      ? translateUi("on", language)
      : inVehicle ? translateUi("off", language) : "–",
    autoKneeling,
    mechanicalKneeling: formatMechanicalKneeling(
      mechanicalKneeling,
      scheduleState.kneelingTargetLowered,
      vehicle,
      vehicleReady,
      language,
    ),
    power: directPowerAvailable
      ? formatVehiclePower(vehicle?.Powermeter, vehicleReady, language)
      : formatAverageConsumption(averageConsumption, vehicleReady, language),
    powerSource,
  };
}

export class FullpanelTelemetryClient {
  constructor(onSnapshot, onWarning) {
    this.onSnapshot = onSnapshot;
    this.onWarning = onWarning;
    this.timer = undefined;
    this.polling = false;
    this.disposed = false;
    this.lastPlayer = undefined;
    this.lastVehicle = undefined;
    this.lastMission = undefined;
    this.lastWorld = undefined;
    this.lastRoute = undefined;
    this.roadmapFeatures = undefined;
    this.roadmapPromise = undefined;
    this.roadmapRetryAt = 0;
    this.routeProgressState = {};
    this.stopPhaseState = {};
    this.lastDelta = undefined;
    this.lastMissionIdentity = "";
    this.lastReachedStopIdentity = "";
    this.reachedStopTrackingInitialized = false;
    this.lastSignature = "";
    this.lastCorePollAt = 0;
    this.warningTimes = new Map();
  }

  start() {
    if (this.disposed || this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), VEHICLE_POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
  }

  async poll() {
    if (this.disposed || this.polling) return;
    this.polling = true;
    try {
      const now = Date.now();
      const corePollDue =
        !this.lastPlayer
        || now - this.lastCorePollAt >= CORE_POLL_INTERVAL_MS;

      // Player, Welt und Mission bleiben im bisherigen 500-ms-Takt. Nur die
      // Fahrzeugtelemetrie wird fuer Geschwindigkeit und Fahrzeug-Layer mit
      // bis zu 10 Hz aktualisiert.
      if (corePollDue) {
        this.lastCorePollAt = now;
        const [playerResult, worldResult] = await Promise.allSettled([
          this.request("/player"),
          this.request("/world"),
        ]);
        if (playerResult.status === "rejected") throw playerResult.reason;
        this.lastPlayer = playerResult.value;

        if (worldResult.status === "fulfilled") this.lastWorld = worldResult.value;
        else this.warn("Weltzeit konnte nicht gelesen werden.", worldResult.reason);
      }

      const player = this.lastPlayer;
      if (!player) throw new Error("Player-Telemetrie ist nicht verfügbar.");

      const inVehicle = player?.Mode === "Vehicle" && typeof player?.CurrentVehicle === "string" && player.CurrentVehicle !== "";
      if (!inVehicle) {
        this.lastVehicle = undefined;
        this.lastMission = undefined;
        this.lastRoute = undefined;
        this.routeProgressState = {};
        this.stopPhaseState = {};
        this.lastDelta = undefined;
        this.lastMissionIdentity = "";
        this.lastReachedStopIdentity = "";
        this.reachedStopTrackingInitialized = false;
        this.publish({
          online: true,
          player,
          vehicle: undefined,
          mission: undefined,
          world: this.lastWorld,
        });
        return;
      }

      const vehiclePath = `/vehicles/${encodeURIComponent(player.CurrentVehicle)}`;
      const missionPollDue = corePollDue || !this.lastMission;
      const [vehicleResult, missionResult] = await Promise.allSettled([
        this.request(vehiclePath),
        missionPollDue
          ? this.request("/mission")
          : Promise.resolve(this.lastMission),
      ]);

      if (vehicleResult.status === "fulfilled") this.lastVehicle = vehicleResult.value;
      else this.warn("Fahrzeugtelemetrie konnte nicht gelesen werden.", vehicleResult.reason);

      if (missionPollDue) {
        if (missionResult.status === "fulfilled") this.lastMission = missionResult.value;
        else this.warn("Missionstelemetrie konnte nicht gelesen werden.", missionResult.reason);
      }

      this.publish({
        online: true,
        player,
        vehicle: this.lastVehicle,
        mission: this.lastMission,
        world: this.lastWorld,
      });
    } catch (error) {
      this.publish({
        online: false,
        player: undefined,
        vehicle: undefined,
        mission: undefined,
        world: undefined,
      });
      this.warn("The-Bus-Telemetrie ist nicht erreichbar.", error);
    } finally {
      this.polling = false;
    }
  }

  publish(snapshot) {
    const currentMissionIdentity = missionIdentity(snapshot?.mission);
    const currentReachedStopIdentity = reachedStopIdentity(snapshot?.mission);
    let stopReachedChanged = false;

    if (currentMissionIdentity !== this.lastMissionIdentity) {
      this.lastMissionIdentity = currentMissionIdentity;
      this.routeProgressState = {};
      this.stopPhaseState = {};
      this.lastDelta = undefined;
      this.lastReachedStopIdentity = currentReachedStopIdentity;
      this.reachedStopTrackingInitialized = true;
    } else if (!this.reachedStopTrackingInitialized) {
      this.lastReachedStopIdentity = currentReachedStopIdentity;
      this.reachedStopTrackingInitialized = true;
    } else if (
      currentReachedStopIdentity
      && currentReachedStopIdentity !== this.lastReachedStopIdentity
    ) {
      this.lastReachedStopIdentity = currentReachedStopIdentity;
      stopReachedChanged = true;
      this.routeProgressState = {};
    }

    const stopPhase = calculateStopPhaseDelta(
      snapshot,
      this.stopPhaseState,
      { stopReachedChanged },
    );
    this.stopPhaseState = stopPhase.state;

    const viewModel = createViewModel(snapshot, this.lastDelta, {
      stopReachedChanged,
      stopPhaseDelta: stopPhase.seconds,
      stopPhaseSource: stopPhase.source,
      displayStop: stopPhase.stop,
      arrivalStop: stopPhase.arrivalStop,
      departureStop: stopPhase.departureStop,
    });
    if (
      viewModel.deltaSeconds !== undefined
      && viewModel.deltaSource !== "cached"
      && viewModel.deltaSource !== "overdue-stop-clock"
    ) {
      this.lastDelta = viewModel.deltaSeconds;
    }
    if (
      viewModel.deltaSeconds !== undefined
      && viewModel.deltaSource !== "route-progress"
      && viewModel.deltaSource !== "cached"
      && viewModel.deltaSource !== "overdue-stop-clock"
      && viewModel.deltaSource !== "unavailable"
      && this.routeProgressState.segmentIdentity
    ) {
      this.routeProgressState.smoothedDelta = viewModel.deltaSeconds;
    }
    const signature = JSON.stringify(viewModel);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.onSnapshot(snapshot, viewModel);
  }

  async ensureRoadmap() {
    if (
      this.disposed
      || Array.isArray(this.roadmapFeatures)
      || this.roadmapPromise
      || Date.now() < this.roadmapRetryAt
    ) {
      return;
    }

    this.roadmapPromise = this.request("/GeoJsonRoadmap", ROADMAP_REQUEST_TIMEOUT_MS)
      .then((roadmap) => {
        if (!Array.isArray(roadmap?.features) || roadmap.features.length === 0) {
          throw new Error("GeoJsonRoadmap enthält keine Fahrspuren.");
        }
        this.roadmapFeatures = roadmap.features;
        this.routeProgressState = {};
      })
      .catch((error) => {
        this.roadmapRetryAt = Date.now() + ROADMAP_RETRY_MS;
        this.warn("Straßenkarte für das Live-Delta konnte nicht gelesen werden.", error);
      })
      .finally(() => {
        this.roadmapPromise = undefined;
      });
    await this.roadmapPromise;
  }

  async request(path, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} für ${path}`);
      const text = await response.text();
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  warn(message, error) {
    const now = Date.now();
    const previous = this.warningTimes.get(message) ?? 0;
    if (now - previous < 5000) return;
    this.warningTimes.set(message, now);
    if (typeof this.onWarning === "function") this.onWarning(message, error);
  }
}
