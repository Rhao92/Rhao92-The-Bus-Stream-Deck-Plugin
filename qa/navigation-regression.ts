import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRoutePolyline,
  RouteGuidanceEngine,
  RouteGuidanceModel
} from "../src/navigation/route-guidance";
import {
  NAVIGATION_DEBUG_OUTPUT_DIRECTORY,
  NavigationDebugRecorder
} from "../src/navigation/navigation-debug-recorder";
import {
  NavigationDisplayKind,
  renderNavigationKey
} from "../src/navigation/navigation-renderer";
import { renderFullpanel } from "../src/fullpanel/fullpanel-renderer";
import { TelemetrySnapshot } from "../src/core/telemetry";

// Das Stream-Deck-SDK protokolliert uncaughtExceptions, setzt dabei aber
// keinen Fehlercode. Regressionen muessen den QA-Prozess trotzdem sicher
// fehlschlagen lassen.
process.on("uncaughtException", (error) => {
  console.error(error);
  process.exitCode = 1;
});

const ORIGIN: [number, number] = [52, 13];
const METERS_PER_LATITUDE = 111_195;
const METERS_PER_LONGITUDE = 111_195 * Math.cos(ORIGIN[0] * Math.PI / 180);

function latLon(east: number, north: number): [number, number] {
  return [
    ORIGIN[0] + north / METERS_PER_LATITUDE,
    ORIGIN[1] + east / METERS_PER_LONGITUDE
  ];
}

function missionGeo(east: number, north: number): { X: number; Y: number } {
  const [latitude, longitude] = latLon(east, north);
  return { X: longitude, Y: latitude };
}

function geo(east: number, north: number): [number, number] {
  const point = latLon(east, north);
  return [point[1], point[0]];
}

function feature(id: number, coordinates: unknown, type = "LineString") {
  return {
    type: "Feature",
    id,
    properties: { id },
    geometry: { type, coordinates }
  };
}

function snapshot(
  points: Array<[number, number]>,
  player: [number, number],
  now: number,
  lastStopReachedIndex = 0,
  speed = 36
): TelemetrySnapshot {
  const stops = [
    { StopName: "Start", GeoLocation: latLon(0, 0), ArrivalTime: "09:55:00" },
    { StopName: "Mitte", GeoLocation: latLon(0, 500), ArrivalTime: "10:01:00" },
    { StopName: "Ziel", GeoLocation: latLon(0, 1_000), ArrivalTime: "10:03:00" }
  ];
  return {
    connected: true,
    online: true,
    runtimeState: "mission-ready",
    vehicleReady: true,
    missionReady: true,
    player: { Mode: "Vehicle", CurrentVehicle: "Bus_Test", GeoLocation: player },
    vehicleId: "Bus_Test",
    vehicle: {
      Speed: speed,
      Buttons: [{ Name: "Kneeling", State: false }],
      IgnitionEnabled: true,
      EngineStarted: true,
      Gearbox: { CurrentSelector: "D" }
    },
    mission: {
      MissionClassName: "RegressionLine",
      LastStopReachedIndex: lastStopReachedIndex,
      NextStopIndex: lastStopReachedIndex + 1,
      NextStop: stops[lastStopReachedIndex + 1],
      Stops: stops
    },
    world: { Time: `10:00:${String(Math.trunc(now / 1_000) % 60).padStart(2, "0")}` },
    route: { PathLanes: [0] },
    roadmap: { features: [feature(0, points.map(([east, north]) => geo(east, north)))] },
    routeUpdatedAt: now,
    roadmapUpdatedAt: now,
    vehicleUpdatedAt: now,
    updatedAt: now
  };
}

// NAV-01: parallele MultiLineString-Teile dürfen nicht verkettet und als
// Wendemanöver interpretiert werden.
{
  const primary = [geo(0, 0), geo(100, 0), geo(220, 0)];
  const parallel = [geo(220, 11), geo(100, 11), geo(0, 11)];
  const polyline = buildRoutePolyline(
    [0],
    [feature(0, [primary, parallel], "MultiLineString")],
    latLon(2, 0),
    latLon(220, 0)
  );
  assert.ok(polyline);
  assert.ok(polyline.total > 210 && polyline.total < 230);
  assert.ok(polyline.maximumGap < 1);
}

// NAV-01: ein geometrisch kontinuierliches Wendemanöver mit mehr als 25 m
// Kurvenentwicklung bleibt erhalten.
{
  const uturn: Array<[number, number]> = [[0, 0], [0, 50]];
  for (let degrees = 15; degrees <= 180; degrees += 15) {
    const angle = degrees * Math.PI / 180;
    uturn.push([-20 + 20 * Math.cos(angle), 50 + 20 * Math.sin(angle)]);
  }
  uturn.push([-40, 0]);
  const model = new RouteGuidanceEngine().update({
    ...snapshot(uturn, latLon(0, 0), 10_000),
    mission: {
      MissionClassName: "UturnLine",
      LastStopReachedIndex: 0,
      NextStopIndex: 1,
      NextStop: { StopName: "Ziel", GeoLocation: latLon(-40, 0), ArrivalTime: "10:05:00" },
      Stops: [
        { StopName: "Start", GeoLocation: latLon(0, 0) },
        { StopName: "Ziel", GeoLocation: latLon(-40, 0), ArrivalTime: "10:05:00" }
      ]
    }
  }, 10_000);
  assert.equal(model.status, "live");
  assert.equal(model.nextManeuver, "uturn");
  assert.ok((model.maneuverDistance ?? 0) >= 25);
  assert.equal(model.nextCurveDistance, model.maneuverDistance);
}

// NAV-06: alle Entfernungen stammen aus derselben Routenprojektion.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500], [0, 1_000]];
  const model = new RouteGuidanceEngine().update(
    snapshot(line, latLon(0, 100), 20_000),
    20_000
  );
  assert.equal(model.status, "live");
  assert.ok(Math.abs((model.totalRouteDistance ?? 0) - 1_000) < 3);
  assert.ok(Math.abs((model.remainingRouteDistance ?? 0) - 900) < 3);
  assert.ok(Math.abs((model.nextRelevantStopDistance ?? 0) - 400) < 3);
  assert.ok(Math.abs((model.routeProgress ?? 0) - 0.1) < 0.01);
  assert.equal(model.routeDistanceEstimated, false);
}

// NAV-06/NAV-07: Manövertyp und -distanz bleiben am selben Kurveneintritt
// verriegelt. Innerhalb des Kurvenbogens darf das Folgemanöver noch nicht
// übernehmen; erst nach dem bestätigten Kurvenausgang wird weitergeschaltet.
{
  const turn: Array<[number, number]> = [
    [0, 0], [0, 200], [100, 200], [300, 200]
  ];
  const mission = {
    MissionClassName: "TurnDistanceLine",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Ziel",
      GeoLocation: latLon(300, 200),
      ArrivalTime: "10:05:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      { StopName: "Ziel", GeoLocation: latLon(300, 200), ArrivalTime: "10:05:00" }
    ]
  };
  const engine = new RouteGuidanceEngine();
  let model = engine.update({
    ...snapshot(turn, latLon(0, 0), 22_000),
    mission
  }, 22_000);
  assert.equal(model.nextManeuver, "right");
  const firstDistance = model.maneuverDistance!;
  assert.ok(firstDistance > 150 && firstDistance < 220);

  model = engine.update({
    ...snapshot(turn, latLon(0, 50), 22_500),
    mission
  }, 22_500);
  assert.equal(model.nextManeuver, "right");

  model = engine.update({
    ...snapshot(turn, latLon(0, 100), 23_000),
    mission
  }, 23_000);
  assert.equal(model.nextManeuver, "right");
  assert.ok(Math.abs(firstDistance - model.maneuverDistance! - 100) < 4);

  model = engine.update({
    ...snapshot(turn, latLon(0, 150), 23_500),
    mission
  }, 23_500);
  assert.equal(model.nextManeuver, "right");

  model = engine.update({
    ...snapshot(turn, latLon(0, 195), 24_000),
    mission
  }, 24_000);
  assert.equal(model.nextManeuver, "right");

  model = engine.update({
    ...snapshot(turn, latLon(10, 200), 24_500),
    mission
  }, 24_500);
  assert.equal(model.nextManeuver, "right");
  assert.equal(model.maneuverDistance, 0);

  model = engine.update({
    ...snapshot(turn, latLon(50, 200), 25_000),
    mission
  }, 25_000);
  assert.equal(model.nextManeuver, "right");

  model = engine.update({
    ...snapshot(turn, latLon(50, 200), 25_150),
    mission
  }, 25_150);
  assert.equal(model.nextManeuver, "right");

  model = engine.update({
    ...snapshot(turn, latLon(50, 200), 25_300),
    mission
  }, 25_300);
  assert.equal(model.nextManeuver, "destination");
  assert.ok(Math.abs((model.maneuverDistance ?? 0) - 250) < 4);
}

// NAV-07: Ein einzelner Sprung auf eine weit vorausliegende Projektion darf
// weder den monotonen Routenanker vorsetzen noch das verriegelte Manöver
// freigeben. Die Rückkehr auf die räumlich plausible Position bleibt stabil.
{
  const turn: Array<[number, number]> = [
    [0, 0], [0, 200], [100, 200], [300, 200]
  ];
  const mission = {
    MissionClassName: "TransientProjectionJumpLine",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Ziel",
      GeoLocation: latLon(300, 200),
      ArrivalTime: "10:05:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      { StopName: "Ziel", GeoLocation: latLon(300, 200), ArrivalTime: "10:05:00" }
    ]
  };
  const engine = new RouteGuidanceEngine();
  engine.update({ ...snapshot(turn, latLon(0, 0), 26_000), mission }, 26_000);
  engine.update({ ...snapshot(turn, latLon(0, 50), 26_500), mission }, 26_500);
  let model = engine.update({
    ...snapshot(turn, latLon(0, 100), 27_000),
    mission
  }, 27_000);
  const beforeJumpDistance = model.maneuverDistance;

  model = engine.update({
    ...snapshot(turn, latLon(200, 200), 27_500),
    mission
  }, 27_500);
  assert.equal(model.nextManeuver, "right");
  assert.ok(Math.abs((model.maneuverDistance ?? 0) - (beforeJumpDistance ?? 0)) < 3);

  model = engine.update({
    ...snapshot(turn, latLon(0, 110), 27_700),
    mission
  }, 27_700);
  assert.equal(model.nextManeuver, "right");
  assert.ok((model.maneuverDistance ?? 0) > 60);
}

// NAV-03: eine nur bis zum nächsten Halt gelieferte PathLanes-Geometrie darf
// nicht als vollständige Missionslinie interpretiert werden. 98 % des
// aktuellen Abschnitts sind auf einer dreiteiligen Linie erst rund 49 %.
{
  const activeSegment: Array<[number, number]> = [[0, 0], [0, 500]];
  const model = new RouteGuidanceEngine().update(
    snapshot(activeSegment, latLon(0, 490), 25_000),
    25_000
  );
  assert.equal(model.status, "live");
  assert.ok(Math.abs((model.nextRelevantStopDistance ?? 0) - 10) < 3);
  assert.ok(Math.abs((model.routeProgress ?? 0) - 0.49) < 0.01);
  assert.ok(Math.abs((model.totalRouteDistance ?? 0) - 1_000) < 3);
  assert.ok(Math.abs((model.remainingRouteDistance ?? 0) - 510) < 3);
  assert.equal(model.routeDistanceEstimated, true);
}

// NAV-11: Liegt die Haltestelle kurz hinter einem echten Abbieger, darf der
// <=300-m-Haltestellenfallback den Pfeil nicht verdraengen. Zur sicheren
// Klassifikation darf die vorhandene Folgegeometrie hinter dem Halt als
// Kontext dienen; angezeigt werden weiterhin nur Manoever mit Eintritt vor H.
// Das bildet den Live-Fall "Linksabbieger, danach direkt Haltestelle" ab.
{
  const route: Array<[number, number]> = [
    [0, 0], [100, 0], [100, 150]
  ];
  const mission = {
    MissionClassName: "TurnImmediatelyBeforeStop",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Kurvenhalt",
      GeoLocation: latLon(100, 25),
      ArrivalTime: "10:02:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      {
        StopName: "Kurvenhalt",
        GeoLocation: latLon(100, 25),
        ArrivalTime: "10:02:00"
      },
      { StopName: "Folgehalt", GeoLocation: latLon(100, 150) }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot(route, latLon(20, 0), 26_000),
    mission
  }, 26_000);
  assert.equal(model.status, "live");
  assert.equal(model.activeManeuver?.kind, "left");
  assert.ok((model.activeManeuver?.distance ?? 0) > 65);
  assert.ok((model.activeManeuver?.distance ?? 0) < 85);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 95);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 115);
  assert.notEqual(model.activeManeuver?.distance, model.nextRelevantStopDistance);

  const key = Buffer.from(
    renderNavigationKey(model, "maneuver").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.match(key, /Q102 56 78 56H43/);
  assert.doesNotMatch(key, />H<\/text>/);

  const fullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    model
  );
  assert.match(fullpanel, />LINKS<\/text>/);
  assert.match(fullpanel, /Kurvenhalt/);

  // Gegenprobe: Liegt H noch vor derselben Kurve, darf die Geometrie hinter
  // dem Halt zwar zur Klassifikation gelesen, der Folgeabbieger aber niemals
  // als aktuelle Anweisung ausgegeben werden.
  const stopBeforeTurn = {
    ...mission,
    MissionClassName: "StopBeforeFollowingTurn",
    NextStop: {
      StopName: "Halt vor Kurve",
      GeoLocation: latLon(75, 0),
      ArrivalTime: "10:02:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      {
        StopName: "Halt vor Kurve",
        GeoLocation: latLon(75, 0),
        ArrivalTime: "10:02:00"
      },
      { StopName: "Folgehalt", GeoLocation: latLon(100, 150) }
    ]
  };
  const beforeTurnModel = new RouteGuidanceEngine().update({
    ...snapshot(route, latLon(20, 0), 26_500),
    mission: stopBeforeTurn
  }, 26_500);
  assert.equal(beforeTurnModel.activeManeuver?.kind, "stop");
  assert.ok(Math.abs((beforeTurnModel.activeManeuver?.distance ?? 0) - 55) < 3);
}

// NAV-09: Auf einem validierten geraden Abschnitt darf zwischen 300 m und dem
// naechsten Halt keine kuenstliche ?/-- Luecke entstehen. Das Live-Bild zeigt
// 327 m zum Halt bei rund 66 % Linienfortschritt; nach stabiler Geometrie sind
// Geradeauspfeil und 327 m ein gemeinsames aktives Manoever.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500], [0, 1_000]];
  const engine = new RouteGuidanceEngine();
  engine.update(snapshot(line, latLon(0, 673), 27_000, 1), 27_000);
  const model = engine.update(
    snapshot(line, latLon(0, 673), 27_600, 1),
    27_600
  );
  assert.equal(model.status, "live");
  assert.equal(model.activeManeuver?.kind, "straight");
  assert.ok(Math.abs((model.activeManeuver?.distance ?? 0) - 327) < 3);
  assert.ok(Math.abs((model.nextRelevantStopDistance ?? 0) - 327) < 3);
  assert.ok((model.routeProgress ?? 0) > 0.66);
  assert.ok((model.routeProgress ?? 0) < 0.68);
  const key = Buffer.from(
    renderNavigationKey(model, "maneuver").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.doesNotMatch(key, />\?</);
  assert.match(key, />327 m</);
}

// NAV-10: Die Geradeaus-Ueberbrueckung ist nur fuer die schmale Luecke vor der
// 300-m-Haltestellenanzeige bestimmt. Ein 1,3 km entfernter Halt darf nicht
// allein deshalb als bestaetigtes Geradeaus-Manoever erscheinen, weil die
// Geometrie kein belastbares Abbiegen liefert. Der separate Halteabstand darf
// erhalten bleiben, Hauptpfeil und Manoeverdistanz bleiben jedoch neutral.
{
  const line: Array<[number, number]> = [[0, 0], [0, 650], [0, 1_300]];
  const mission = {
    MissionClassName: "LongUnconfirmedStraight",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Jebensstrasse",
      GeoLocation: latLon(0, 1_300),
      ArrivalTime: "13:00:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      {
        StopName: "Jebensstrasse",
        GeoLocation: latLon(0, 1_300),
        ArrivalTime: "13:00:00"
      }
    ]
  };
  const engine = new RouteGuidanceEngine();
  engine.update({
    ...snapshot(line, latLon(0, 0), 27_000),
    mission
  }, 27_000);
  const model = engine.update({
    ...snapshot(line, latLon(0, 0), 27_600),
    mission
  }, 27_600);
  assert.equal(model.status, "live");
  assert.equal(model.activeManeuver, undefined);
  assert.equal(model.nextManeuver, "unavailable");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 1_250);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 1_350);
  const key = Buffer.from(
    renderNavigationKey(model, "maneuver").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.doesNotMatch(key, />1,3 km</);
  assert.match(key, />--</);
}

// NAVBTN-01/NAV-09: Die neue Geradeaus-Ueberbrueckung darf den frueheren
// 1,3-km-Fehler nicht zurueckbringen. Liegt ein echter Abbiegepunkt nach rund
// 390 m vor dem 1,3 km entfernten Halt, bleiben Pfeil und Distanz am
// Abbiegepunkt und verwenden niemals den Haltestellenabstand als Manoeverwert.
{
  const route: Array<[number, number]> = [
    [0, 0], [0, 390], [910, 390]
  ];
  const mission = {
    MissionClassName: "LongSegmentWithEarlyTurn",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Ziel",
      GeoLocation: latLon(910, 390),
      ArrivalTime: "10:08:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      {
        StopName: "Ziel",
        GeoLocation: latLon(910, 390),
        ArrivalTime: "10:08:00"
      }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot(route, latLon(0, 0), 28_000),
    mission
  }, 28_000);
  assert.equal(model.activeManeuver?.kind, "right");
  assert.ok((model.activeManeuver?.distance ?? 0) > 330);
  assert.ok((model.activeManeuver?.distance ?? 0) < 430);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 1_250);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 1_350);
}

// NAV-09: Mehrere fehlgeschlagene 1,5-s-Routenabrufe duerfen eine noch
// passende, bestaetigte Geometrie nicht bereits nach drei Sekunden verwerfen.
// Erst nach zehn Sekunden ohne frischen Routenstand wird neutralisiert.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500], [0, 1_000]];
  const now = 50_000;
  const withinGrace = new RouteGuidanceEngine().update({
    ...snapshot(line, latLon(0, 200), now),
    routeUpdatedAt: now - 6_000
  }, now);
  assert.equal(withinGrace.status, "live");

  const trulyStale = new RouteGuidanceEngine().update({
    ...snapshot(line, latLon(0, 200), now),
    routeUpdatedAt: now - 10_001
  }, now);
  assert.equal(trulyStale.status, "stale-route");
}

// NAV-08: Ein Haltepunkt kann auf einer Schleife bereits einmal hinter dem Bus
// liegen und spaeter erneut in Fahrtrichtung folgen. Die einzeln naechste
// Projektion waere hier der alte Routenteil und ergab bisher faelschlich 0 m.
{
  const loop: Array<[number, number]> = [
    [0, 0], [0, 400], [40, 400], [40, 0]
  ];
  const mission = {
    MissionClassName: "RepeatedRoadStopLine",
    LastStopReachedIndex: 1,
    NextStopIndex: 2,
    NextStop: {
      StopName: "Steinplatz",
      GeoLocation: latLon(0, 200),
      ArrivalTime: "11:51:00"
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      { StopName: "Wendepunkt", GeoLocation: latLon(0, 400) },
      {
        StopName: "Steinplatz",
        GeoLocation: latLon(0, 200),
        ArrivalTime: "11:51:00"
      }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot(loop, latLon(40, 300), 28_000, 1),
    mission
  }, 28_000);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Steinplatz");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 90);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 115);
  assert.notEqual(model.nextRelevantStopDistance, 0);
  assert.ok((model.totalRouteDistance ?? 0) > 630);
  assert.ok((model.totalRouteDistance ?? 0) < 650);
  assert.ok((model.remainingRouteDistance ?? 0) > 90);
  assert.ok((model.remainingRouteDistance ?? 0) < 115);
  assert.equal(model.routeDistanceEstimated, false);
  assert.ok((model.routeProgress ?? 0) > 0.83);
  assert.ok((model.routeProgress ?? 0) < 0.86);

  const fullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    model
  );
  assert.match(fullpanel, /NAVIGATION/);
  assert.match(fullpanel, /Steinplatz/);
  assert.match(fullpanel, />100 m</);
  assert.doesNotMatch(fullpanel, />0 m</);
}

// NAV-10: Am spaeten Missionsende darf die aktive PathLanes-Geometrie nicht
// mehr am allerersten Linienhalt ausgerichtet werden. An der Hertzallee liegen
// vorheriger und naechster Halt an eng parallelen Terminalaesten. Wird die
// Geometrie am weit zurueckliegenden Linienstart statt am aktuellen Abschnitt
// ausgerichtet, liegt der Zielhalt scheinbar hinter dem Bus und saemtliche
// Navigationswerte fallen trotz lebender Mission auf -- / UNSICHER.
{
  const terminal: Array<[number, number]> = [
    [0, 0], [0, 90], [8, 125], [28, 150], [55, 160]
  ];
  const mission = {
    MissionClassName: "HertzalleeTerminal",
    LastStopReachedIndex: 2,
    NextStopIndex: 3,
    NextStop: {
      StopName: "Hertzallee",
      GeoLocation: latLon(55, 160),
      ArrivalTime: "13:08:00"
    },
    Stops: [
      // Der historische Linienstart liegt absichtlich am anderen Ende der
      // aktuellen Teilgeometrie und darf deren Fahrtrichtung nicht bestimmen.
      { StopName: "Linienstart", GeoLocation: latLon(55, 160) },
      { StopName: "Vorletzter Abschnitt", GeoLocation: latLon(-500, -500) },
      { StopName: "Hertzallee unten", GeoLocation: latLon(0, 0) },
      {
        StopName: "Hertzallee",
        GeoLocation: latLon(55, 160),
        ArrivalTime: "13:08:00"
      }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot(terminal, latLon(0, 90), 28_250, 2),
    mission
  }, 28_250);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Hertzallee");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 65);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 100);
  assert.equal(model.activeManeuver?.kind, "right");

  const fullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    model
  );
  assert.match(fullpanel, /Hertzallee/);
  assert.doesNotMatch(fullpanel, /NAV-STATUS/);
  assert.doesNotMatch(fullpanel, />AKTIV</);
  assert.doesNotMatch(fullpanel, /UNSICHER/);
}

// NAV-12: Die Richtung einer nur bis zum naechsten Halt gelieferten
// PathLanes-Geometrie muss am aktuellen Zielabschnitt ausgerichtet werden.
// Der reale Mitschnitt Goebelplatz -> Popitzweg hat die komplette Geometrie
// sonst nach rund 10 m umgedreht, weil die weit entfernte Linienendhaltestelle
// geographisch naeher am Anfang dieses Teilabschnitts liegt.
{
  const laneIds = [8813, 9436, 8816, 8819, 8765, 8759, 8781, 8776];
  const laneFeatures = [
    feature(8813, [[13.279648, 52.539932], [13.279639, 52.539776]]),
    feature(9436, [
      [13.279639, 52.539776],
      [13.279653, 52.539715],
      [13.279654, 52.539703]
    ]),
    feature(8816, [[13.279654, 52.539703], [13.279651, 52.539639]]),
    feature(8819, [
      [13.279651, 52.539639],
      [13.279656, 52.539463],
      [13.279657, 52.53944]
    ]),
    feature(8765, [[13.279657, 52.53944], [13.279691, 52.538349]]),
    feature(8759, [
      [13.279691, 52.538349],
      [13.279673, 52.538319],
      [13.279618, 52.538292],
      [13.279554, 52.53828]
    ]),
    feature(8781, [
      [13.279554, 52.53828],
      [13.279411, 52.5383],
      [13.279352, 52.538307]
    ]),
    feature(8776, [[13.279352, 52.538307], [13.279078, 52.538322]])
  ];
  const mission = {
    MissionClassName: "GoebelplatzSectionOrientation",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Popitzweg",
      GeoLocation: [52.538315, 13.279208] as [number, number],
      ArrivalTime: "11:33:00"
    },
    Stops: [
      {
        StopName: "Goebelplatz",
        GeoLocation: [52.539852, 13.279645] as [number, number]
      },
      {
        StopName: "Popitzweg",
        GeoLocation: [52.538315, 13.279208] as [number, number],
        ArrivalTime: "11:33:00"
      },
      {
        StopName: "Mäckeritzwiesen",
        GeoLocation: [52.551556, 13.270525] as [number, number]
      }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot([[0, 0], [0, 100]], [52.539833, 13.279642], 28_375),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.539833, 13.279642]
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  }, 28_375);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Popitzweg");
  assert.ok((model.debug?.currentAlong ?? Number.POSITIVE_INFINITY) < 25);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 175);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 225);
  assert.notEqual(model.nextManeuver, "unavailable");
}

// NAV-13: Zwei aufeinanderfolgende Lane-IDs koennen in The Bus dieselbe
// Strassengeometrie beschreiben. Sie duerfen nicht als Hin- und Rueckfahrt
// verkettet werden: Im realen Mitschnitt Saatwinkler Damm 137 -> Saatwinkler
// Damm/Rohrdamm entstand dadurch eine kuenstliche 20,6-m-Luecke, die bei sonst
// vollstaendigen Navi-Werten ausschliesslich den Pfeil blockierte.
{
  const laneIds = [8695, 8749, 8750, 8751, 8826, 8915, 8875];
  const laneFeatures = [
    feature(8695, [
      [13.263553, 52.550083],
      [13.263215, 52.55006],
      [13.260454, 52.549892]
    ]),
    feature(8749, [
      [13.260454, 52.549892],
      [13.26024, 52.54987],
      [13.259986, 52.549839],
      [13.259646, 52.54982]
    ]),
    feature(8750, [
      [13.259646, 52.54982],
      [13.259579, 52.549805],
      [13.25957, 52.549793],
      [13.259542, 52.549732],
      [13.259543, 52.549679],
      [13.259552, 52.549644]
    ]),
    feature(8751, [
      [13.259646, 52.54982],
      [13.259585, 52.549805],
      [13.259548, 52.549778],
      [13.259533, 52.549728],
      [13.259545, 52.54966],
      [13.259552, 52.549644]
    ]),
    feature(8826, [
      [13.259552, 52.549644],
      [13.259781, 52.549194]
    ]),
    feature(8915, [
      [13.259781, 52.549194],
      [13.259787, 52.549145],
      [13.259794, 52.549057]
    ]),
    feature(8875, [
      [13.259794, 52.549057],
      [13.259876, 52.548885]
    ])
  ];
  const stops = [
    { StopName: "Mäckeritzwiesen", GeoLocation: [52.551533, 13.270367] },
    { StopName: "Mäckeritzbrücke", GeoLocation: [52.55035, 13.271014] },
    { StopName: "Saatwinkler Damm 137", GeoLocation: [52.550095, 13.263752] },
    {
      StopName: "Saatwinkler Damm/Rohrdamm",
      GeoLocation: [52.548958, 13.259845],
      ArrivalTime: "11:48:00"
    },
    { StopName: "Harriesstr.", GeoLocation: [52.547512, 13.260561] }
  ];
  const mission = {
    MissionClassName: "SaatwinklerDuplicateLaneGeometry",
    LastStopReachedIndex: 2,
    NextStopIndex: 3,
    NextStop: stops[3],
    Stops: stops
  };
  const now = 28_625;
  const current = {
    ...snapshot([[0, 0], [0, 100]], [52.550041, 13.262894], now, 2, 32),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.550041, 13.262894]
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  } as TelemetrySnapshot;
  const engine = new RouteGuidanceEngine();
  engine.update(current, now);
  const stableAt = now + 600;
  const model = engine.update({
    ...current,
    routeUpdatedAt: stableAt,
    roadmapUpdatedAt: stableAt,
    vehicleUpdatedAt: stableAt,
    updatedAt: stableAt
  }, stableAt);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Saatwinkler Damm/Rohrdamm");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 300);
  assert.ok((model.nextRelevantStopDistance ?? 0) < 350);
  assert.ok((model.debug?.polyline?.maximumGap ?? Number.POSITIVE_INFINITY) < 1);
  assert.equal(model.debug?.straightChecks?.continuousGeometry, true);
  assert.notEqual(model.nextManeuver, "unavailable");
  assert.ok(model.activeManeuver);
}

// NAV-14: Habermannzeile -> Weltlingerbruecke enthaelt zwei Paare nahezu
// deckungsgleicher Fahrspuren. Werden 9014/9015 und 9006/9007 als Hin- und
// Rueckweg verkettet, liegt der echte Rechtsabbieger scheinbar hinter einem
// falschen Halteanker. Der reale Mitschnitt zeigte deshalb vor der Kurve nur
// die Haltestelle und eine deutlich zu kurze Distanz.
{
  const laneFeatures = [
    feature(9013, [
      [13.293703, 52.540871],
      [13.293797, 52.540855],
      [13.294005, 52.540813],
      [13.29413, 52.540806]
    ]),
    feature(9217, [
      [13.29413, 52.540806],
      [13.294974, 52.540764]
    ]),
    feature(9014, [
      [13.294974, 52.540764],
      [13.295012, 52.540752],
      [13.295045, 52.540722],
      [13.295051, 52.540703],
      [13.295041, 52.540661],
      [13.295006, 52.5406]
    ]),
    feature(9015, [
      [13.294974, 52.540764],
      [13.295006, 52.540756],
      [13.295045, 52.540718],
      [13.295064, 52.540661],
      [13.295052, 52.5406],
      [13.295047, 52.540588]
    ]),
    feature(9006, [
      [13.295006, 52.5406],
      [13.294421, 52.539604],
      [13.294295, 52.539413],
      [13.294156, 52.539223],
      [13.293912, 52.53886],
      [13.293905, 52.538853]
    ]),
    feature(9007, [
      [13.295047, 52.540588],
      [13.294464, 52.539593],
      [13.294326, 52.539387],
      [13.294202, 52.539211],
      [13.29395, 52.538837]
    ])
  ];
  const stops = [
    {
      StopName: "Hofackerzeile",
      GeoLocation: [52.53825, 13.291055] as [number, number]
    },
    {
      StopName: "Habermannzeile",
      GeoLocation: [52.540646, 13.291477] as [number, number]
    },
    {
      StopName: "Weltlingerbruecke",
      GeoLocation: [52.540245, 13.294797] as [number, number],
      ArrivalTime: "12:04:00"
    },
    {
      StopName: "U Jakob-Kaiser-Platz",
      GeoLocation: [52.537922, 13.293256] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "HabermannzeileDuplicateLanes",
    LastStopReachedIndex: 1,
    NextStopIndex: 2,
    NextStop: stops[2],
    Stops: stops
  };
  const currentSnapshot = (
    laneIds: number[],
    player: [number, number],
    now: number
  ) => ({
    ...snapshot([[0, 0], [0, 100]], player, now, 1, 23),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  }) as TelemetrySnapshot;

  const beforeTurnLaneIds = [9013, 9217, 9014, 9015, 9006, 9007];
  const beforeTurnPolyline = buildRoutePolyline(
    beforeTurnLaneIds,
    laneFeatures,
    [52.540791, 13.294357],
    stops.at(-1)!.GeoLocation as [number, number],
    stops,
    2
  );
  assert.ok(beforeTurnPolyline);
  assert.ok(beforeTurnPolyline.total > 250 && beforeTurnPolyline.total < 350);
  assert.ok(beforeTurnPolyline.maximumGap < 1);

  const engine = new RouteGuidanceEngine();
  let model = engine.update(currentSnapshot(
    beforeTurnLaneIds,
    [52.540791, 13.294357],
    29_000
  ), 29_000);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Weltlingerbruecke");
  assert.equal(model.nextManeuver, "right");
  assert.ok((model.maneuverDistance ?? 0) > 30);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 60);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 100);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 140);

  model = engine.update(currentSnapshot(
    [9014, 9006, 9007],
    [52.540749, 13.294997],
    29_500
  ), 29_500);
  assert.ok(["slight-right", "right"].includes(model.nextManeuver));

  model = engine.update(currentSnapshot(
    [9006, 9007],
    [52.540413, 13.294894],
    33_500
  ), 33_500);
  assert.equal(model.nextManeuver, "stop");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 15);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 25);
  assert.ok((model.debug?.polyline?.total ?? Number.POSITIVE_INFINITY) < 230);
  assert.ok((model.debug?.polyline?.maximumGap ?? Number.POSITIVE_INFINITY) < 1);
}

// NAV-15: Buchholzweg -> Gedenkstaette Ploetzensee ist nach dem Halt ein
// lueckenloser, rund 585 m langer Abschnitt ohne belastbaren Abbieger. Der
// reale 2.15.0.13-Mitschnitt blieb hier trotz stabiler Route komplett leer,
// weil die bestaetigte Geradeaus-Anweisung bei 500 m hart endete. Bis 750 m
// darf der atomare Geradeauspfeil am naechsten Halt verankert werden; der
// separate 1,3-km-Schutz aus NAV-10 bleibt weiterhin bestehen.
{
  const laneIds = [2194, 2195, 2191, 2181, 2131, 2178, 2130];
  const laneFeatures = [
    feature(2194, [
      [13.319091, 52.547234],
      [13.319164, 52.547195],
      [13.319261, 52.547173],
      [13.319282, 52.547169],
      [13.319377, 52.547134],
      [13.31948, 52.547081]
    ]),
    feature(2195, [
      [13.319048, 52.547215],
      [13.319089, 52.547199],
      [13.319161, 52.547195],
      [13.319263, 52.547188],
      [13.319436, 52.547108],
      [13.31948, 52.547081]
    ]),
    feature(2191, [
      [13.31948, 52.547081],
      [13.319719, 52.546886],
      [13.320029, 52.546638],
      [13.320394, 52.546337],
      [13.320735, 52.546059],
      [13.321102, 52.545761],
      [13.321474, 52.54546],
      [13.321801, 52.545197]
    ]),
    feature(2181, [
      [13.321801, 52.545197],
      [13.322161, 52.544907],
      [13.322501, 52.544628],
      [13.322782, 52.544399],
      [13.323004, 52.54422],
      [13.323188, 52.544071],
      [13.323423, 52.543877],
      [13.323667, 52.543682],
      [13.323925, 52.543476],
      [13.324158, 52.543289]
    ]),
    feature(2131, [
      [13.324158, 52.543289],
      [13.324348, 52.543133]
    ]),
    feature(2178, [
      [13.324348, 52.543133],
      [13.324395, 52.543079],
      [13.324467, 52.542988]
    ]),
    feature(2130, [
      [13.324467, 52.542988],
      [13.324677, 52.542816]
    ])
  ];
  const stops = [
    {
      StopName: "Buchholzweg",
      GeoLocation: [52.547283, 13.318964] as [number, number]
    },
    {
      StopName: "Gedenkstaette Ploetzensee",
      GeoLocation: [52.542885, 13.324594] as [number, number],
      ArrivalTime: "12:18:00"
    },
    {
      StopName: "Seestr./Beusselstr.",
      GeoLocation: [52.539898, 13.326605] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "BuchholzwegLongStraight",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: stops[1],
    Stops: stops
  };
  const now = 34_000;
  const current = {
    ...snapshot([[0, 0], [0, 100]], [52.547104, 13.319427], now, 0, 22),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.547104, 13.319427]
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  } as TelemetrySnapshot;
  const engine = new RouteGuidanceEngine();
  engine.update(current, now);
  const stableAt = now + 600;
  const model = engine.update({
    ...current,
    routeUpdatedAt: stableAt,
    roadmapUpdatedAt: stableAt,
    vehicleUpdatedAt: stableAt,
    updatedAt: stableAt
  }, stableAt);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Gedenkstaette Ploetzensee");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 570);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 600);
  assert.equal(model.debug?.straightChecks?.continuousGeometry, true);
  assert.equal(model.debug?.detectedManeuver, undefined);
  assert.equal(model.activeManeuver?.kind, "straight");
  assert.ok(Math.abs(
    (model.activeManeuver?.distance ?? 0)
      - (model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY)
  ) < 0.01);
}

// NAV-16: S Beusselstr. -> Berliner Grossmarkt liefert mehrere parallele
// Lane-Gruppen mit bis zu rund 6,7 m Abstand. Werden diese Alternativen als
// aufeinanderfolgende Fahrstrecke verkettet, entstehen Hin-und-zurueck-
// Schleifen und ein kuenstlicher 69,9-m-Sprung. Im realen 2.15.0.14-Trace
// wurden dadurch aktive Anweisung, ETA und Prognose gemeinsam neutralisiert.
{
  const laneIds = [
    1301, 1302, 1303, 1304, 1306, 1294, 1316,
    1807, 1809, 1804, 1806, 1698, 1749
  ];
  const laneFeatures = [
    feature(1301, [
      [13.328572, 52.534748], [13.328569, 52.535065]
    ]),
    feature(1302, [
      [13.328614, 52.534748], [13.328611, 52.535065]
    ]),
    feature(1303, [
      [13.328668, 52.534748], [13.328665, 52.535065]
    ]),
    feature(1304, [
      [13.328569, 52.535065],
      [13.328564, 52.535343],
      [13.328466, 52.535652]
    ]),
    feature(1306, [
      [13.328665, 52.535065],
      [13.328663, 52.53524],
      [13.328658, 52.535343],
      [13.328625, 52.535469],
      [13.328554, 52.535667]
    ]),
    feature(1294, [
      [13.328466, 52.535652],
      [13.32838, 52.53582],
      [13.32828, 52.535995]
    ]),
    feature(1316, [
      [13.32828, 52.535995],
      [13.328217, 52.536087],
      [13.328132, 52.536198],
      [13.327971, 52.5364]
    ]),
    feature(1807, [
      [13.328047, 52.536423], [13.32785, 52.536667]
    ]),
    feature(1809, [
      [13.327971, 52.5364], [13.327773, 52.536648]
    ]),
    feature(1804, [
      [13.327773, 52.536648],
      [13.327557, 52.536919],
      [13.327327, 52.537209]
    ]),
    feature(1806, [
      [13.32785, 52.536667],
      [13.327634, 52.536938],
      [13.327407, 52.537235]
    ]),
    feature(1698, [
      [13.327407, 52.537235], [13.327276, 52.537411]
    ]),
    feature(1749, [
      [13.327276, 52.537411],
      [13.327144, 52.537636],
      [13.326984, 52.537903]
    ])
  ];
  const stops = [
    {
      StopName: "S Beusselstr.",
      GeoLocation: [52.534847, 13.328664] as [number, number]
    },
    {
      StopName: "Berliner Grossmarkt",
      GeoLocation: [52.537415, 13.327273] as [number, number],
      ArrivalTime: "13:22:00"
    },
    {
      StopName: "Seestr./Beusselstr.",
      GeoLocation: [52.539803, 13.32677] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "BeusselstrParallelLaneGroups",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: stops[1],
    Stops: stops
  };
  const player = [52.534874, 13.328667] as [number, number];
  const polyline = buildRoutePolyline(
    laneIds,
    laneFeatures,
    player,
    stops.at(-1)!.GeoLocation,
    stops,
    1
  );
  assert.ok(polyline);
  assert.ok(polyline.total > 280 && polyline.total < 450);
  assert.ok(polyline.maximumGap < 12);

  const now = 34_750;
  const current = {
    ...snapshot([[0, 0], [0, 100]], player, now, 0, 0),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  } as TelemetrySnapshot;
  const engine = new RouteGuidanceEngine();
  engine.update(current, now);
  const stableAt = now + 600;
  const model = engine.update({
    ...current,
    vehicle: { ...current.vehicle, Speed: 22 },
    routeUpdatedAt: stableAt,
    roadmapUpdatedAt: stableAt,
    vehicleUpdatedAt: stableAt,
    updatedAt: stableAt
  }, stableAt);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Berliner Grossmarkt");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 270);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 350);
  assert.equal(model.debug?.straightChecks?.continuousGeometry, true);
  assert.notEqual(model.nextManeuver, "unavailable");
  assert.ok(model.activeManeuver);
}

// NAV-17: Goerdelerdamm -> U Jakob-Kaiser-Platz enthaelt vor dem eigentlichen
// Rechtsbogen eine lange Gegenkurve. Werden beide Vorzeichen als ein einziges
// S-Manoever verriegelt, springt der Rechtsanker rund 165 m nach hinten und der
// Pfeil bleibt nach diesem falschen Anker bei 0 m bis zum Ende beider Kurven
// stehen. Das reale 2.15.0.15-Bild zeigte genau diesen festgehaltenen
// Rechtspfeil auf der westwaerts fuehrenden Zufahrt.
{
  const laneIds = [8244, 8236, 8238, 8204, 8914, 8213, 8217, 8943, 8846];
  const laneFeatures = [
    feature(8244, [
      [13.297503, 52.535801], [13.297254, 52.535892],
      [13.296985, 52.535984], [13.296731, 52.536045],
      [13.296478, 52.536091], [13.296222, 52.536118],
      [13.296066, 52.536121], [13.295832, 52.536121]
    ]),
    feature(8236, [
      [13.295832, 52.536121], [13.295584, 52.536102],
      [13.295409, 52.536079]
    ]),
    feature(8238, [
      [13.295409, 52.536079], [13.295144, 52.53603],
      [13.294889, 52.535965], [13.294679, 52.535904],
      [13.294531, 52.535873], [13.294502, 52.53587]
    ]),
    feature(8204, [
      [13.294502, 52.53587], [13.294399, 52.535862],
      [13.294314, 52.53587], [13.294166, 52.5359],
      [13.294101, 52.535927]
    ]),
    feature(8914, [
      [13.294101, 52.535927], [13.293911, 52.536037]
    ]),
    feature(8213, [
      [13.293911, 52.536037], [13.293864, 52.536083],
      [13.293828, 52.536148], [13.293822, 52.536179]
    ]),
    feature(8217, [
      [13.293822, 52.536179], [13.293799, 52.536507],
      [13.2938, 52.536827], [13.293846, 52.537243],
      [13.293847, 52.537247]
    ]),
    feature(8943, [
      [13.293847, 52.537247], [13.293893, 52.537449],
      [13.293925, 52.537518], [13.294022, 52.537674]
    ]),
    feature(8846, [
      [13.294022, 52.537674], [13.294109, 52.537857],
      [13.294137, 52.537903], [13.294294, 52.538147],
      [13.294348, 52.538254], [13.294388, 52.538353]
    ])
  ];
  const stops = [
    {
      StopName: "Goerdelerdamm",
      GeoLocation: [52.53611, 13.298201] as [number, number]
    },
    {
      StopName: "U Jakob-Kaiser-Platz",
      GeoLocation: [52.538116, 13.294276] as [number, number],
      ArrivalTime: "13:37:00"
    },
    {
      StopName: "Weltlingerbruecke",
      GeoLocation: [52.540905, 13.294322] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "JakobKaiserLongCounterCurve",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: stops[1],
    Stops: stops
  };
  const currentSnapshot = (player: [number, number], now: number) => ({
    ...snapshot([[0, 0], [0, 100]], player, now, 0, 24),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  }) as TelemetrySnapshot;

  const engine = new RouteGuidanceEngine();
  let model = engine.update(
    currentSnapshot([52.535805, 13.297477], 35_000),
    35_000
  );
  assert.equal(model.status, "live");
  assert.equal(model.nextManeuver, "right");
  assert.ok((model.maneuverDistance ?? 0) > 180);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 230);
  assert.ok((model.debug?.detectedManeuver?.along ?? 0) > 190);
  assert.ok(
    (model.debug?.detectedManeuver?.completeAlong ?? Number.POSITIVE_INFINITY)
      - (model.debug?.detectedManeuver?.along ?? 0) < 130
  );

  const approach: Array<[number, number]> = [
    [52.535892, 13.297254],
    [52.536045, 13.296731],
    [52.536095, 13.296432],
    [52.53611, 13.296334]
  ];
  for (let index = 0; index < approach.length; index += 1) {
    const now = 35_500 + index * 500;
    model = engine.update(currentSnapshot(approach[index], now), now);
  }
  assert.equal(model.nextManeuver, "right");
  assert.equal(model.debug?.selectionReason, "latched-maneuver");
  assert.ok((model.maneuverDistance ?? 0) > 100);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 135);
  assert.ok((model.debug?.latchedManeuver?.along ?? 0) > 190);
}

// NAV-18: Direkt hinter U Siemensdamm fuehrt die Route in einer kompakten
// Folge rund 90 Grad nach links und unmittelbar danach wieder 90 Grad nach
// rechts. Die Nettoausrichtung ist fast gerade, beide Teilmanoever sind aber
// echte enge Abbieger. Im realen 2.15.0.15-Trace wurden beide Vorzeichen zu
// 0 Grad verrechnet und der Pfeil zeigte deshalb bis Quellweg geradeaus.
{
  const laneIds = [
    8308, 8525, 8526, 8462, 8527, 8503,
    8506, 8511, 8514, 8401, 8660, 8399
  ];
  const laneFeatures = [
    feature(8308, [
      [13.27249, 52.538486], [13.272205, 52.538513]
    ]),
    feature(8525, [
      [13.272205, 52.538513], [13.272159, 52.538509],
      [13.272096, 52.538479], [13.272047, 52.538437],
      [13.272037, 52.538406]
    ]),
    feature(8526, [
      [13.272205, 52.538513], [13.272112, 52.538513],
      [13.272067, 52.53849], [13.272045, 52.538452],
      [13.272037, 52.538406]
    ]),
    feature(8462, [
      [13.272037, 52.538406], [13.272026, 52.538311]
    ]),
    feature(8527, [
      [13.272026, 52.538311], [13.272002, 52.538242],
      [13.271958, 52.538212], [13.271903, 52.538208],
      [13.271847, 52.538212]
    ]),
    feature(8503, [
      [13.271847, 52.538212], [13.271585, 52.538231]
    ]),
    feature(8506, [
      [13.271585, 52.538231], [13.271391, 52.538239],
      [13.271037, 52.538254]
    ]),
    feature(8511, [
      [13.271037, 52.538254], [13.270565, 52.538269],
      [13.26904, 52.538326]
    ]),
    feature(8514, [
      [13.26904, 52.538326], [13.268833, 52.538334],
      [13.268575, 52.538342]
    ]),
    feature(8401, [
      [13.268575, 52.538342], [13.268266, 52.538353]
    ]),
    feature(8660, [
      [13.268266, 52.538353], [13.268192, 52.538368],
      [13.268061, 52.538391]
    ]),
    feature(8399, [
      [13.268061, 52.538391], [13.267777, 52.538403]
    ])
  ];
  const stops = [
    {
      StopName: "U Siemensdamm",
      GeoLocation: [52.538471, 13.272682] as [number, number]
    },
    {
      StopName: "Quellweg",
      GeoLocation: [52.538395, 13.267921] as [number, number],
      ArrivalTime: "14:35:00"
    },
    {
      StopName: "U Rohrdamm",
      GeoLocation: [52.53883, 13.264897] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "SiemensdammCompactChicane",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: stops[1],
    Stops: stops
  };
  const current = (now: number) => ({
    ...snapshot(
      [[0, 0], [0, 100]],
      [52.538494, 13.272352],
      now,
      0,
      0
    ),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.538494, 13.272352]
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  }) as TelemetrySnapshot;

  const engine = new RouteGuidanceEngine();
  engine.update(current(39_000), 39_000);
  const model = engine.update(current(39_600), 39_600);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Quellweg");
  assert.equal(model.nextManeuver, "left");
  assert.ok((model.maneuverDistance ?? 0) > 10);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 40);
  assert.equal(model.debug?.selectionReason, "latched-maneuver");
  assert.ok(
    (model.debug?.latchedManeuver?.completeAlong ?? Number.POSITIVE_INFINITY)
      - (model.debug?.latchedManeuver?.along ?? 0) < 45
  );
}

// NAV-19: Turmstr./Beusselstr. -> U Turmstraße fuehrt zuerst nach rechts
// und kurz darauf wieder nach links. Im realen 2.15.0.18-Trace wurde der
// naehere Rechtsabbieger wegen der dicht folgenden Gegenkurven verworfen und
// stattdessen bereits der spaetere Linkspfeil als naechstes Manoever verriegelt.
{
  const laneIds = [715, 714, 745, 224, 240, 254, 252, 218, 276, 215, 216];
  const laneFeatures = [
    feature(715, [
      [13.337344, 52.527061], [13.337691, 52.527027]
    ]),
    feature(714, [
      [13.337691, 52.527027], [13.338023, 52.526993],
      [13.338606, 52.526936]
    ]),
    feature(745, [
      [13.338606, 52.526936], [13.338823, 52.526917],
      [13.338907, 52.526901], [13.338956, 52.526867],
      [13.338971, 52.526829], [13.338969, 52.52681]
    ]),
    feature(224, [
      [13.338969, 52.52681], [13.338963, 52.526695],
      [13.338968, 52.526634], [13.339003, 52.526527],
      [13.339035, 52.526455]
    ]),
    feature(240, [
      [13.339035, 52.526455], [13.33909, 52.52631]
    ]),
    feature(254, [
      [13.33909, 52.52631], [13.33912, 52.526276],
      [13.339173, 52.526253], [13.339253, 52.526249],
      [13.339326, 52.52626]
    ]),
    feature(252, [
      [13.33909, 52.52631], [13.339109, 52.526253],
      [13.339138, 52.52623], [13.3392, 52.526234],
      [13.339326, 52.52626]
    ]),
    feature(218, [
      [13.339326, 52.52626], [13.339418, 52.526268],
      [13.339491, 52.526264], [13.339752, 52.526241],
      [13.339851, 52.52623], [13.340101, 52.526199],
      [13.340267, 52.526173]
    ]),
    feature(276, [
      [13.340267, 52.526173], [13.340355, 52.52615],
      [13.34063, 52.526073]
    ]),
    feature(215, [
      [13.34063, 52.526073], [13.341013, 52.52602]
    ]),
    feature(216, [
      [13.341013, 52.52602], [13.341258, 52.52599]
    ])
  ];
  const stops = [
    {
      StopName: "Turmstr./Beusselstr.",
      GeoLocation: [52.527912, 13.329228] as [number, number]
    },
    {
      StopName: "U Turmstraße",
      GeoLocation: [52.526005, 13.341144] as [number, number],
      ArrivalTime: "16:11:00"
    },
    {
      StopName: "S+U Hauptbahnhof",
      GeoLocation: [52.526314, 13.369007] as [number, number]
    }
  ];
  const mission = {
    MissionClassName: "TurmstrasseCloseCounterTurns",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: stops[1],
    Stops: stops
  };
  const current = (now: number) => ({
    ...snapshot(
      [[0, 0], [0, 100]],
      [52.527065, 13.337386],
      now,
      0,
      22
    ),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.527065, 13.337386]
    },
    mission,
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  }) as TelemetrySnapshot;

  const engine = new RouteGuidanceEngine();
  const model = engine.update(current(42_000), 42_000);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "U Turmstraße");
  assert.equal(model.nextManeuver, "right");
  assert.ok((model.maneuverDistance ?? 0) > 55);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 130);
  assert.equal(model.debug?.selectionReason, "detected-maneuver");
}

// NAV-20: The Bus kuerzt waehrend der Fahrt die aktive Lane-Liste am Anfang.
// Im gemeldeten Mitschnitt wurden nacheinander 6060, 6062, 6023, 6003, 5999
// und 5979 entfernt, waehrend der komplette verbleibende Suffix identisch
// blieb. Diese reine Fortschrittsaktualisierung darf die bestaetigte Route
// nicht erneut fuer 500 ms sperren und den Geradeauspfeil ausblenden.
{
  const laneIds = [
    6060, 6062, 6023, 6003, 5999, 5979, 5977, 5975,
    5971, 4996, 1378, 1375, 1372, 1368, 5414, 1369
  ];
  const replacementIds = laneIds.map((laneId) => laneId + 20_000);
  const laneFeatures = [...laneIds, ...replacementIds].map((laneId, index) => {
    const routeIndex = index % laneIds.length;
    return feature(laneId, [
      geo(0, routeIndex * 50),
      geo(0, (routeIndex + 1) * 50)
    ]);
  });
  const mission = {
    MissionClassName: "LanePrefixTrimContinuation",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Marschallbrücke",
      GeoLocation: latLon(0, 650),
      ArrivalTime: "16:21:00"
    },
    Stops: [
      { StopName: "Charité - Campus Mitte", GeoLocation: latLon(0, 0) },
      {
        StopName: "Marschallbrücke",
        GeoLocation: latLon(0, 650),
        ArrivalTime: "16:21:00"
      }
    ]
  };
  const capture = (
    activeLaneIds: number[],
    playerNorth: number,
    now: number
  ): TelemetrySnapshot => ({
    ...snapshot(
      [[0, 0], [0, 800]],
      latLon(0, playerNorth),
      now,
      0,
      30
    ),
    mission,
    route: { Paths: [{ PathLanes: activeLaneIds }] },
    roadmap: { features: laneFeatures }
  });

  const engine = new RouteGuidanceEngine();
  let model = engine.update(capture(laneIds, 20, 100_000), 100_000);
  assert.equal(model.debug?.routeUpdateKind, "initial");
  model = engine.update(capture(laneIds, 20, 100_600), 100_600);
  assert.equal(model.nextManeuver, "straight");
  assert.ok(model.activeManeuver);

  for (let removed = 1; removed <= 6; removed += 1) {
    const now = 100_600 + removed * 1_000;
    model = engine.update(
      capture(laneIds.slice(removed), removed * 50 + 5, now),
      now
    );
    assert.equal(model.status, "live");
    assert.equal(model.nextManeuver, "straight");
    assert.ok(model.activeManeuver);
    assert.equal(model.debug?.routeUpdateKind, "prefix-trim-continuation");
    assert.equal(model.debug?.straightChecks?.routeStable, true);
    assert.ok((model.debug?.routeStableForMs ?? 0) >= now - 100_000);
  }

  // Gegenprobe: Andere Lane-IDs mit nur optisch gleicher Geometrie sind keine
  // bestaetigte Fortsetzung. Ein echter Routenersatz behaelt die 500-ms-Sperre.
  const replacementEngine = new RouteGuidanceEngine();
  replacementEngine.update(capture(laneIds, 20, 200_000), 200_000);
  model = replacementEngine.update(capture(laneIds, 20, 200_600), 200_600);
  assert.equal(model.nextManeuver, "straight");
  model = replacementEngine.update(
    capture(replacementIds, 25, 200_700),
    200_700
  );
  assert.equal(model.debug?.routeUpdateKind, "replacement");
  assert.equal(model.debug?.straightChecks?.routeStable, false);
  assert.equal(model.activeManeuver, undefined);
}

// NAV-29A: Wenn The Bus bereits abgefahrene Prefix-Lanes entfernt, muss ein
// verriegeltes Manoever auf die neue Suffix-Polyline umgerechnet werden. Sonst
// wandert sein alter Along-Wert bei jedem Trim wieder vor den Bus und kann wie
// im 26.08.-Trace 54,5 s lang die inzwischen gegensaetzliche Geometrie anzeigen.
{
  const laneIds = [41, 42, 43, 44];
  const laneFeatures = [
    feature(41, [geo(0, 0), geo(0, 100)]),
    feature(42, [geo(0, 100), geo(0, 200)]),
    feature(43, [geo(0, 200), geo(0, 300)]),
    feature(44, [geo(0, 300), geo(80, 300), geo(160, 300)])
  ];
  const stops = [
    { StopName: "Start", GeoLocation: latLon(0, 0) },
    {
      StopName: "Nach dem Abbieger",
      GeoLocation: latLon(160, 300),
      ArrivalTime: "16:25:00"
    }
  ];
  const capture = (
    activeLaneIds: number[],
    playerNorth: number,
    now: number
  ): TelemetrySnapshot => ({
    ...snapshot([[0, 0], [0, 500]], latLon(0, playerNorth), now, 0, 30),
    mission: {
      MissionClassName: "LatchedManeuverPrefixTrim",
      LastStopReachedIndex: 0,
      NextStopIndex: 1,
      NextStop: stops[1],
      Stops: stops
    },
    route: { Paths: [{ PathLanes: activeLaneIds }] },
    roadmap: { features: laneFeatures }
  });

  const engine = new RouteGuidanceEngine();
  engine.update(capture(laneIds, 50, 108_000), 108_000);
  let model = engine.update(capture(laneIds, 50, 108_600), 108_600);
  assert.ok(["left", "right", "sharp-left", "sharp-right"].includes(model.nextManeuver));
  const maneuverKind = model.nextManeuver;
  const beforeTrimDistance = model.maneuverDistance ?? Number.POSITIVE_INFINITY;

  model = engine.update(capture(laneIds.slice(1), 110, 109_600), 109_600);
  assert.equal(model.debug?.routeUpdateKind, "prefix-trim-continuation");
  assert.equal(model.nextManeuver, maneuverKind);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < beforeTrimDistance);
}

// NAV-29B: Auch ein Kaltstart waehrend der verfruehten Missionsumschaltung
// darf den unmittelbar folgenden Halt nicht ueberspringen. Der Bus steht am
// Start, die Missionsobjekte nennen aber bereits das uebernaechste Ziel.
{
  const now = 110_000;
  const stops = [
    { StopName: "Erreichter Halt", GeoLocation: latLon(0, 0) },
    { StopName: "Echster Folgehalt", GeoLocation: latLon(0, 500) },
    { StopName: "Zu frueh gemeldeter Halt", GeoLocation: latLon(0, 1_000) }
  ];
  const capture = {
    ...snapshot([[0, 0], [0, 1_000]], latLon(0, 0), now, 1, 0),
    mission: {
      MissionClassName: "PrematureMissionAdvanceColdStart",
      CurrentStopIndex: 1,
      NextStopIndex: 2,
      LastStopReachedIndex: 1,
      CurrentStop: stops[1],
      NextStop: stops[2],
      LastStopReached: stops[1],
      Stops: stops
    }
  } as TelemetrySnapshot;
  const engine = new RouteGuidanceEngine();
  const model = engine.update(capture, now);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Echster Folgehalt");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 495);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 505);
}

// NAV-21A: Marschallbruecke -> S+U Brandenburger Tor enthaelt vor dem Halt
// einen langen Linksbogen und kurz danach eine kleine Gegenkurve. Im realen
// Mitschnitt vom 24.08.2026 wurde die Gegenkurve als S-Paar angehaengt, obwohl
// gemeinsame Paar kein ausgehendes Peilfenster mehr vorhanden war. Dadurch
// blieb 49,7 s lang das Haltestellensymbol statt des Linkspfeils sichtbar.
{
  const laneIds = [1344, 3113, 1448, 3157, 3153, 3149];
  const laneFeatures = [
    feature(1344, [
      [13.380103, 52.51757], [13.380136, 52.517303],
      [13.380218, 52.516735]
    ]),
    feature(3113, [
      [13.380218, 52.516735], [13.380254, 52.516586],
      [13.380322, 52.516426], [13.38033, 52.516411]
    ]),
    feature(1448, [
      [13.38033, 52.516411], [13.380365, 52.516365],
      [13.380426, 52.516327], [13.380444, 52.516323],
      [13.380515, 52.516315], [13.380644, 52.516319]
    ]),
    feature(3157, [
      [13.380644, 52.516319], [13.381257, 52.51635],
      [13.381378, 52.516354]
    ]),
    feature(3153, [
      [13.381378, 52.516354], [13.381536, 52.516354],
      [13.381725, 52.516346]
    ]),
    feature(3149, [
      [13.381725, 52.516346], [13.382185, 52.516373]
    ])
  ];
  const stops = [
    {
      StopName: "Marschallbrücke",
      GeoLocation: [52.520313, 13.379681] as [number, number]
    },
    {
      StopName: "S+U Brandenburger Tor",
      GeoLocation: [52.516365, 13.382061] as [number, number],
      ArrivalTime: "16:23:00"
    },
    {
      StopName: "U Unter den Linden",
      GeoLocation: [52.516724, 13.389123] as [number, number]
    }
  ];
  const now = 107_000;
  const current = {
    ...snapshot(
      [[0, 0], [0, 100]],
      [52.516945, 13.380235],
      now,
      0,
      8.65
    ),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: [52.516945, 13.380235]
    },
    mission: {
      MissionClassName: "BrandenburgerTorMissingLeftTurn",
      LastStopReachedIndex: 0,
      NextStopIndex: 1,
      NextStop: stops[1],
      Stops: stops
    },
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  } as TelemetrySnapshot;
  const model = new RouteGuidanceEngine().update(current, now);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "S+U Brandenburger Tor");
  assert.equal(model.nextManeuver, "left");
  assert.ok((model.maneuverDistance ?? 0) > 10);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 40);
  assert.equal(model.debug?.selectionReason, "detected-maneuver");
}

// NAV-21B: Spandauer Str./Marienkirche -> Alexanderplatz liefert zwei Gruppen
// paralleler Lane-Alternativen. Im Mitschnitt vom 24.08.2026 gewann zeitweise
// der rueckwaerts aufgebaute Kandidat; der Endhalt lag damit rechnerisch hinter
// dem Bus und Pfeil sowie Haltestellendistanz verschwanden fuer 41,2 s.
{
  const laneIds = [3247, 3251, 3252, 3253, 3248, 3249, 3250, 1545, 1543];
  const laneFeatures = [
    feature(3247, [
      [13.405349, 52.51989], [13.405589, 52.520008]
    ]),
    feature(3251, [
      [13.405589, 52.520008], [13.405974, 52.520195],
      [13.40634, 52.52037], [13.407166, 52.520786]
    ]),
    feature(3252, [
      [13.405535, 52.52005], [13.405922, 52.520233],
      [13.40618, 52.520367], [13.406275, 52.52042],
      [13.407106, 52.520832]
    ]),
    feature(3253, [
      [13.405561, 52.520027], [13.405947, 52.520214],
      [13.406308, 52.520393], [13.407136, 52.520809]
    ]),
    feature(3248, [
      [13.407166, 52.520786], [13.407622, 52.521015]
    ]),
    feature(3249, [
      [13.407106, 52.520832], [13.40756, 52.521057]
    ]),
    feature(3250, [
      [13.407136, 52.520809], [13.40759, 52.521038]
    ]),
    feature(1545, [
      [13.407622, 52.521015], [13.407889, 52.521149],
      [13.407963, 52.521194], [13.408114, 52.521301],
      [13.40828, 52.521381], [13.408493, 52.521469],
      [13.408498, 52.521469], [13.40869, 52.521564]
    ]),
    feature(1543, [
      [13.40869, 52.521564], [13.408896, 52.521664]
    ])
  ];
  const stops = [
    {
      StopName: "Historischer Linienanfang",
      GeoLocation: [52.555481, 13.293956] as [number, number]
    },
    {
      StopName: "Spandauer Str./Marienkirche",
      GeoLocation: [52.519955, 13.405481] as [number, number]
    },
    {
      StopName: "S+U Alexanderplatz/Memhardstr.",
      GeoLocation: [52.52161, 13.408789] as [number, number],
      ArrivalTime: "16:30:00"
    }
  ];
  const now = 108_000;
  const player = [52.519928, 13.405416] as [number, number];
  const current = {
    ...snapshot([[0, 0], [0, 100]], player, now, 1, 13.43),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission: {
      MissionClassName: "AlexanderplatzParallelLaneDirection",
      LastStopReachedIndex: 1,
      NextStopIndex: 2,
      NextStop: stops[2],
      Stops: stops
    },
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  } as TelemetrySnapshot;
  const model = new RouteGuidanceEngine().update(current, now);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "S+U Alexanderplatz/Memhardstr.");
  assert.ok(
    (model.nextRelevantStopDistance ?? 0) > 200,
    JSON.stringify({
      nextRelevantStopDistance: model.nextRelevantStopDistance,
      nextManeuver: model.nextManeuver,
      selectionReason: model.debug?.selectionReason,
      rejectReason: model.debug?.rejectReason,
      currentAlong: model.debug?.currentAlong,
      stopAlong: model.debug?.stopAlong,
      polyline: model.debug?.polyline
    })
  );
  assert.ok(
    (model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 330
  );
  assert.equal(model.nextManeuver, "destination");
  assert.equal(model.debug?.selectionReason, "stop-fallback");
  assert.ok((model.debug?.polyline?.maximumGap ?? Number.POSITIVE_INFINITY) < 1);
  assert.ok(
    (model.debug?.currentAlong ?? Number.POSITIVE_INFINITY)
      < (model.debug?.stopAlong ?? 0)
  );
}

// NAV-22: S+U Hauptbahnhof -> U Turmstraße ist fast zwei Kilometer lang. Rund
// 620 m vor dem Bus beginnt ein ueber 60 m entwickelter Rechtsbogen. Direkt
// folgende kleine Gegenkruemmungen liessen sowohl das gemeinsame S-Fenster als
// auch das bisherige Einzelfenster kollabieren; wegen der 750-m-Sperre blieb
// dadurch im realen 2.15.0.22-Trace jede der 529 Anweisungen neutral. Die
// exakte 92-Punkt-Geometrie muss den lang und dicht belegten ersten Bogen als
// eigenstaendiges leichtes Rechtsmanoever erhalten.
{
  const routePoints = [
    [13.368617, 52.526535], [13.368122, 52.52639], [13.367835, 52.526299],
    [13.367762, 52.526276], [13.367536, 52.526196], [13.367287, 52.526112],
    [13.36706, 52.526043], [13.36681, 52.525974], [13.366488, 52.525879],
    [13.365904, 52.525715], [13.365711, 52.52565], [13.365386, 52.52552],
    [13.365321, 52.525494], [13.365082, 52.525398], [13.365019, 52.525379],
    [13.364453, 52.525215], [13.362489, 52.524647], [13.36056, 52.524082],
    [13.360168, 52.523972], [13.359812, 52.523872], [13.359596, 52.523823],
    [13.359406, 52.523796], [13.359237, 52.523788], [13.35913, 52.5238],
    [13.358533, 52.523872], [13.358523, 52.523846], [13.35809, 52.523895],
    [13.357143, 52.523972], [13.357148, 52.524002], [13.356812, 52.524021],
    [13.356475, 52.524052], [13.356324, 52.524063], [13.356188, 52.524075],
    [13.355965, 52.524094], [13.355749, 52.524109], [13.355619, 52.524117],
    [13.355304, 52.524143], [13.355103, 52.524166], [13.355026, 52.524178],
    [13.354661, 52.524235], [13.354247, 52.524288], [13.35383, 52.524353],
    [13.353538, 52.524391], [13.353136, 52.524448], [13.353124, 52.524414],
    [13.352398, 52.524517], [13.352042, 52.52457], [13.350968, 52.524734],
    [13.350723, 52.524765], [13.350653, 52.524773], [13.350549, 52.52478],
    [13.350227, 52.524826], [13.350198, 52.52483], [13.350068, 52.524857],
    [13.34997, 52.524887], [13.349814, 52.524914], [13.349725, 52.524929],
    [13.349422, 52.524971], [13.349205, 52.525002], [13.348891, 52.525043],
    [13.348475, 52.525101], [13.348001, 52.525162], [13.347623, 52.525211],
    [13.346006, 52.525433], [13.345662, 52.525478], [13.345455, 52.525505],
    [13.345157, 52.525543], [13.344824, 52.525589], [13.344518, 52.525635],
    [13.344218, 52.525677], [13.344036, 52.525711], [13.343842, 52.525753],
    [13.34366, 52.525799], [13.343499, 52.525841], [13.34324, 52.525883],
    [13.343109, 52.525902], [13.342958, 52.525925], [13.342862, 52.525951],
    [13.342834, 52.525986], [13.342837, 52.526043], [13.342843, 52.526058],
    [13.342912, 52.526222], [13.34295, 52.526417], [13.343053, 52.526661],
    [13.343061, 52.526726], [13.343036, 52.526783], [13.342978, 52.526833],
    [13.342903, 52.526863], [13.342847, 52.526871], [13.342733, 52.526882],
    [13.341887, 52.52692], [13.341537, 52.526936]
  ];
  const stops = [
    {
      StopName: "S+U Hauptbahnhof",
      GeoLocation: [52.526722, 13.369281] as [number, number]
    },
    {
      StopName: "U Turmstraße",
      GeoLocation: [52.526924, 13.341758] as [number, number],
      ArrivalTime: "16:54:00"
    }
  ];
  const now = 109_000;
  const player = [52.526321, 13.367911] as [number, number];
  const current = {
    ...snapshot([[0, 0], [0, 100]], player, now, 0, 47.67),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission: {
      MissionClassName: "HauptbahnhofTurmstrasseSustainedCurve",
      LastStopReachedIndex: 0,
      NextStopIndex: 1,
      NextStop: stops[1],
      Stops: stops
    },
    route: { Paths: [{ PathLanes: [0] }] },
    roadmap: { features: [feature(0, routePoints)] }
  } as TelemetrySnapshot;
  const model = new RouteGuidanceEngine().update(current, now);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "U Turmstraße");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 1_950);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 2_020);
  assert.equal(model.nextManeuver, "slight-right");
  assert.ok((model.maneuverDistance ?? 0) > 580);
  assert.ok((model.maneuverDistance ?? Number.POSITIVE_INFINITY) < 660);
  assert.equal(model.debug?.selectionReason, "detected-maneuver");
}

// NAV-23: Im gemeldeten Anlauf auf S Beusselstr. liegt der Halt innerhalb des
// geometrischen Ausgangs eines knapp davor beginnenden Linksabbiegers. Der
// Pfeil muss auf der Anfahrt erhalten bleiben, nach Erreichen seines Ankers
// aber an das Haltestellensymbol uebergeben. Im 2.15.0.23-Trace hielt die
// allgemeine Kurvenhysterese den Linkspfeil stattdessen bis 0 m fest. Die sechs
// Lane-Geometrien entsprechen exakt dem letzten 60-Sekunden-Log.
{
  const laneIds = [1290, 1291, 1292, 1301, 1302, 1303];
  const laneFeatures = [
    feature(1290, [
      [13.328671, 52.533787], [13.32867, 52.534019],
      [13.328669, 52.534237], [13.328669, 52.534401],
      [13.328669, 52.534592], [13.328668, 52.534748]
    ]),
    feature(1291, [
      [13.328573, 52.533783], [13.328574, 52.534016],
      [13.328576, 52.534237], [13.328576, 52.534401],
      [13.328575, 52.534592], [13.328572, 52.534748]
    ]),
    feature(1292, [
      [13.32862, 52.533783], [13.328617, 52.534016],
      [13.328618, 52.534237], [13.328618, 52.534401],
      [13.328617, 52.534592], [13.328614, 52.534748]
    ]),
    feature(1301, [
      [13.328572, 52.534748], [13.328569, 52.535065]
    ]),
    feature(1302, [
      [13.328614, 52.534748], [13.328611, 52.535065]
    ]),
    feature(1303, [
      [13.328668, 52.534748], [13.328665, 52.535065]
    ])
  ];
  const stops = [
    {
      StopName: "Turmstr./Beusselstr.",
      GeoLocation: [52.528618, 13.328732] as [number, number]
    },
    {
      StopName: "S Beusselstr.",
      GeoLocation: [52.534847, 13.328664] as [number, number],
      ArrivalTime: "16:58:00"
    },
    {
      StopName: "Buchholzweg",
      GeoLocation: [52.547409, 13.319127] as [number, number]
    }
  ];
  const liveSnapshot = (
    player: [number, number],
    now: number
  ): TelemetrySnapshot => ({
    ...snapshot([[0, 0], [0, 100]], player, now, 0, 40),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: player
    },
    mission: {
      MissionClassName: "BeusselstrasseStopInsideTurnExit",
      LastStopReachedIndex: 0,
      NextStopIndex: 1,
      NextStop: stops[1],
      Stops: stops
    },
    route: { Paths: [{ PathLanes: laneIds }] },
    roadmap: { features: laneFeatures }
  });
  const engine = new RouteGuidanceEngine();
  const approaching = engine.update(
    liveSnapshot([52.534237, 13.328669], 110_000),
    110_000
  );
  assert.equal(approaching.activeManeuver?.kind, "left");
  assert.ok((approaching.nextRelevantStopDistance ?? 0) > 50);
  assert.ok((approaching.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 65);
  assert.ok((approaching.maneuverDistance ?? 0) > 35);
  assert.ok((approaching.maneuverDistance ?? Number.POSITIVE_INFINITY) < 55);

  // Die Projektion wird wie in der realen Fahrt schrittweise bis an den
  // Kurvenanker herangefuehrt; dadurch prueft die Regression zugleich die
  // bestehende Sprung- und Manoeverhysterese.
  engine.update(liveSnapshot([52.534401, 13.328669], 110_100), 110_100);
  engine.update(liveSnapshot([52.534592, 13.328669], 110_200), 110_200);
  const turnReached = engine.update(
    liveSnapshot([52.534748, 13.328668], 110_300),
    110_300
  );
  assert.equal(turnReached.activeManeuver?.kind, "stop");
  assert.equal(
    turnReached.debug?.selectionReason,
    "stop-after-reached-maneuver"
  );
  const arrived = engine.update(
    liveSnapshot([52.534847, 13.328664], 110_400),
    110_400
  );
  assert.equal(
    arrived.activeManeuver?.kind,
    "stop",
    JSON.stringify({
      stopDistance: arrived.nextRelevantStopDistance,
      selectionReason: arrived.debug?.selectionReason,
      currentAlong: arrived.debug?.currentAlong,
      stopAlong: arrived.debug?.stopAlong,
      latchedManeuver: arrived.debug?.latchedManeuver
    })
  );
  assert.ok((arrived.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 1);
  assert.equal(arrived.debug?.selectionReason, "stop-fallback");

  const settled = engine.update(
    liveSnapshot([52.534847, 13.328664], 110_500),
    110_500
  );
  assert.equal(settled.activeManeuver?.kind, "stop");
  const key = Buffer.from(
    renderNavigationKey(settled, "maneuver").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.match(key, />H<\/text>/);
}

// NAV-24: /routelaneids liefert im Livefall getrennte, geometrisch direkt
// anschliessende Paths: den orangefarbenen Abschnitt bis zum naechsten Halt
// und den gelben Rest bis zum Linienende. Beide Bloecke muessen als ein
// bestaetigter verbleibender Linienweg genutzt werden. Vor NAV-24 brach
// extractLaneIds() nach dem ersten nichtleeren Path ab.
{
  const now = 111_000;
  const base = snapshot([[0, 0], [0, 1_000]], latLon(0, 100), now);
  const capture = (
    firstPath: number[],
    playerNorth: number,
    at: number,
    secondPath: number[] = [2]
  ): TelemetrySnapshot => ({
    ...base,
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: latLon(0, playerNorth)
    },
    routeUpdatedAt: at,
    updatedAt: at,
    route: {
      Paths: [
        { Color: "FF7300FF", PathLanes: firstPath },
        { Color: "FFCC00FF", PathLanes: secondPath }
      ]
    },
    roadmap: {
      features: [
        feature(0, [geo(0, 0), geo(0, 250)]),
        feature(1, [geo(0, 250), geo(0, 500)]),
        feature(2, [geo(0, 500), geo(0, 1_000)])
      ]
    }
  });
  const engine = new RouteGuidanceEngine();
  let model = engine.update(capture([0, 1], 100, now), now);
  assert.equal(model.status, "live");
  assert.equal(model.routeLaneCount, 3);
  assert.equal(model.debug?.routePathCount, 2);
  assert.deepEqual(model.debug?.routePathLaneCounts, [2, 1]);
  assert.equal(model.debug?.routeGeometryScope, "remaining-line");
  assert.equal(model.debug?.orderedStopProjectionStartIndex, 0);
  assert.equal(model.debug?.orderedStopProjections?.length, 3);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 395);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 405);
  assert.ok((model.totalRouteDistance ?? 0) > 995);
  assert.ok((model.totalRouteDistance ?? Number.POSITIVE_INFINITY) < 1_005);
  assert.ok((model.remainingRouteDistance ?? 0) > 895);
  assert.ok((model.remainingRouteDistance ?? Number.POSITIVE_INFINITY) < 905);
  assert.equal(model.routeDistanceEstimated, false);
  assert.ok((model.routeProgress ?? 0) > 0.095);
  assert.ok((model.routeProgress ?? Number.POSITIVE_INFINITY) < 0.105);

  // The Bus darf nur die Grenze zwischen dem aktuellen und dem folgenden
  // Path verschieben. Solange die flache Lane-Reihenfolge gleich bleibt, ist
  // das keine neue Route und darf weder Geometrie noch Pfeil resetten.
  model = engine.update(capture([0], 100, now + 100, [1, 2]), now + 100);
  assert.equal(model.debug?.routeUpdateKind, "unchanged");
  assert.deepEqual(model.debug?.routePathLaneCounts, [1, 2]);
  assert.equal(model.debug?.routeGeometryScope, "remaining-line");
  assert.ok((model.routeProgress ?? 0) > 0.095);
  assert.ok((model.routeProgress ?? Number.POSITIVE_INFINITY) < 0.105);
  const recorder = NavigationDebugRecorder.instance;
  recorder.clear();
  recorder.record(capture([0, 1], 100, now), model, now);
  const directory = mkdtempSync(join(tmpdir(), "thebus-nav24-debug-"));
  const exported = recorder.exportLastMinute(now, directory);
  const debugText = readFileSync(exported.path, "utf8");
  assert.match(debugText, /"activeLaneCount":3/);
  assert.match(debugText, /"activeLaneIds":\[0,1,2\]/);
  assert.match(debugText, /"routePathCount":\s*2/);
  assert.match(debugText, /"routeGeometryScope":\s*"remaining-line"/);
  recorder.clear();

  // Bereits abgefahrene Lanes duerfen aus Paths[0] verschwinden, ohne den
  // bestaetigten restlichen Linienweg oder die Routenkontinuitaet zu verlieren.
  model = engine.update(capture([1], 300, now + 600), now + 600);
  assert.equal(model.status, "live");
  assert.equal(model.routeLaneCount, 2);
  assert.equal(model.debug?.routeUpdateKind, "prefix-trim-continuation");
  assert.equal(model.debug?.routeGeometryScope, "remaining-line");
  assert.equal(model.debug?.orderedStopProjectionStartIndex, 1);
  assert.equal(model.debug?.orderedStopProjections?.length, 2);
  assert.ok((model.remainingRouteDistance ?? 0) > 695);
  assert.ok((model.remainingRouteDistance ?? Number.POSITIVE_INFINITY) < 705);
}

// NAV-24: Ein zusaetzlicher, aber nicht anschliessender Path darf die
// bestehende Navigation nicht auf NO ROUTE setzen. Kann die gesamte
// verbleibende Haltestellenfolge nicht bestaetigt werden, bleibt Paths[0] der
// neutrale und rueckwaertskompatible Navigationsfallback.
{
  const now = 112_000;
  const base = snapshot([[0, 0], [0, 1_000]], latLon(0, 100), now);
  const capture: TelemetrySnapshot = {
    ...base,
    route: {
      Paths: [
        { Color: "FF7300FF", PathLanes: [0] },
        { Color: "FFCC00FF", PathLanes: [1] }
      ]
    },
    roadmap: {
      features: [
        feature(0, [geo(0, 0), geo(0, 500)]),
        feature(1, [geo(2_000, 2_000), geo(2_000, 2_500)])
      ]
    }
  };
  const engine = new RouteGuidanceEngine();
  let model = engine.update(capture, now);
  assert.equal(model.status, "live");
  assert.equal(model.routeLaneCount, 2);
  assert.equal(model.debug?.routeGeometryScope, "next-segment");
  assert.ok((model.debug?.polyline?.total ?? 0) > 495);
  assert.ok((model.debug?.polyline?.total ?? Number.POSITIVE_INFINITY) < 505);
  model = engine.update(capture, now + 600);
  assert.equal(model.status, "live");
  assert.equal(model.activeManeuver?.kind, "straight");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 395);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 405);
}

// NAV-27: Im Live-Trace vom 26.08.2026 bestand Paths[0] nur aus dem kurzen
// Rest am gerade erreichten Halt. Das nächste echte Missionsziel lag erst im
// direkt anschließenden Paths[1]. Wenn ein viel späterer Halt die strenge
// Restlinienbestätigung verhindert, muss der Fallback beide benötigten Paths
// zielbezogen verbinden statt pauschal am Mini-Path[0] hängen zu bleiben.
{
  const now = 112_500;
  const stops = [
    { StopName: "Start", GeoLocation: missionGeo(0, 0) },
    { StopName: "Erreichter Halt", GeoLocation: missionGeo(0, 100) },
    {
      StopName: "Echtes nächstes Ziel",
      GeoLocation: missionGeo(0, 300),
      ArrivalTime: "2026.08.31-20.42.00"
    },
    // Absichtlich nicht auf der gelieferten Restgeometrie: Dadurch scheitert
    // die strenge Bestätigung der kompletten Restlinie wie im echten Trace.
    {
      StopName: "Später unbekannter Abschnitt",
      GeoLocation: missionGeo(1_000, 1_000)
    }
  ];
  const capture = (playerNorth: number, at: number): TelemetrySnapshot => ({
    ...snapshot([[0, 0], [0, 600]], latLon(0, playerNorth), at, 1, 30),
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "Bus_Test",
      GeoLocation: latLon(0, playerNorth)
    },
    mission: {
      MissionClassName: "ShortFirstPathLiveRegression",
      CurrentStopIndex: 1,
      // The Bus 1.2.100790 liefert diese Zahlen im Live-Trace mit anderer
      // Indexbasis: Beide stehen auf 2, obwohl LastStopReached Stops[1] und
      // NextStop Stops[2] benennt. Die echten Missionsobjekte sind führend.
      NextStopIndex: 2,
      LastStopReachedIndex: 2,
      CurrentStop: stops[1],
      NextStop: stops[2],
      LastStopReached: stops[1],
      Stops: stops
    },
    world: { DateTime: "2026-08-31T20:40:00" },
    route: {
      Paths: [
        { Color: "FF7300FF", PathLanes: [0] },
        { Color: "FFCC00FF", PathLanes: [1] }
      ]
    },
    roadmap: {
      features: [
        feature(0, [geo(0, 100), geo(0, 130)]),
        feature(1, [geo(0, 130), geo(0, 600)])
      ]
    }
  });
  const engine = new RouteGuidanceEngine();
  let model = engine.update(capture(105, now), now);
  assert.equal(model.status, "live");
  assert.equal(model.debug?.routeGeometryScope, "next-segment");
  assert.equal(model.debug?.routePathCount, 2);
  assert.ok((model.nextRelevantStopDistance ?? 0) > 190);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 200);
  assert.notEqual(model.debug?.rejectReason, "no-stop-distance");
  model = engine.update(capture(110, now + 600), now + 600);
  // Innerhalb des bestaetigten 300-m-Zielbereichs hat das echte
  // Haltestellenziel weiterhin Vorrang vor der Geradeausdarstellung.
  assert.equal(model.nextManeuver, "stop");
  assert.ok((model.nextRelevantStopDistance ?? 0) > 185);
  assert.ok((model.nextRelevantStopDistance ?? Number.POSITIVE_INFINITY) < 195);
}

// NAV-27: Das echte Punktformat der Missionszeit muss auch ETA und
// Prognose-Delta versorgen; es ist kein unbekanntes Zeitformat.
{
  const engine = new RouteGuidanceEngine();
  let model: RouteGuidanceModel | undefined;
  for (let second = 0; second <= 6; second += 1) {
    const now = 113_200 + second * 1_000;
    const live = snapshot(
      [[0, 0], [0, 500], [0, 1_000]],
      latLon(0, 100 + second * 10),
      now,
      0,
      36
    );
    live.world = { DateTime: `2026-08-31T20:40:0${second}` };
    live.mission!.Stops![1].ArrivalTime = "2026.08.31-20.42.00";
    live.mission!.NextStop = live.mission!.Stops![1];
    model = engine.update(live, now);
  }
  assert.notEqual(model?.estimatedArrivalTime, undefined);
  assert.notEqual(model?.predictedScheduleDelta, undefined);
}

// NAV-25: Der Linienstart wird von The Bus als zwei Missionspunkte mit exakt
// identischer Ankunfts- und Abfahrtszeit geliefert. Dieses reale
// Missionsmerkmal gilt unabhaengig vom Ortsnamen und kennzeichnet beide
// Punkte als betriebliches Terminal-/Pausenziel. Innerhalb des Zielbereichs
// darf eine Terminalkurve das stabile Pausensymbol nicht verdraengen.
{
  const now = 113_000;
  const terminalRoute: Array<[number, number]> = [
    [0, 0], [0, 100], [100, 100], [200, 100], [300, 100]
  ];
  const terminalStops = [
    {
      StopName: "Hertzallee",
      GeoLocation: latLon(100, 100),
      ArrivalTime: "20:30:00",
      DepartureTime: "20:30:00"
    },
    {
      StopName: "Hertzallee",
      GeoLocation: latLon(200, 100),
      ArrivalTime: "20:30:00",
      DepartureTime: "20:30:00"
    },
    {
      StopName: "S+U Zoologischer Garten",
      GeoLocation: latLon(300, 100),
      ArrivalTime: "20:33:00",
      DepartureTime: "20:33:00"
    }
  ];
  const terminalSnapshot = (
    lastReached: number,
    player: [number, number],
    at: number,
    stops = terminalStops
  ): TelemetrySnapshot => ({
    ...snapshot(terminalRoute, player, at, Math.max(0, lastReached)),
    mission: {
      MissionClassName: "MissionTerminalPair",
      LastStopReachedIndex: lastReached,
      NextStopIndex: lastReached + 1,
      NextStop: stops[lastReached + 1],
      StartStopReached: true,
      DestinationStopReached: false,
      Stops: stops
    }
  });

  const engine = new RouteGuidanceEngine();
  let model = engine.update(
    terminalSnapshot(-1, latLon(0, 0), now),
    now
  );
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStop, "Hertzallee");
  assert.equal(model.nextTargetKind, "terminal-pause");
  assert.equal(model.nextManeuver, "pause");
  assert.equal(model.activeManeuver?.kind, "pause");
  assert.equal(model.debug?.targetKind, "terminal-pause");
  assert.equal(model.debug?.selectionReason, "mission-terminal-pause");

  // Auch der zweite Punkt desselben betrieblichen Terminalpaars bleibt Pause.
  model = engine.update(
    terminalSnapshot(0, latLon(100, 100), now + 600),
    now + 600
  );
  assert.equal(model.nextTargetKind, "terminal-pause");
  assert.equal(model.nextManeuver, "pause");
  assert.equal(model.activeManeuver?.distance, 0);
  assert.equal(model.nextRelevantStopDistance, 0);
  assert.equal(model.debug?.targetOperationallyReached, true);
  assert.equal(model.debug?.guidanceStopAlong, model.debug?.currentAlong);
  assert.ok(
    (model.debug?.projectedNextStopDistance ?? 0) > 50,
    String(model.debug?.projectedNextStopDistance)
  );
  assert.equal(
    model.debug?.selectionReason,
    "mission-terminal-pause-reached"
  );

  const maneuverKey = Buffer.from(
    renderNavigationKey(model, "maneuver").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.match(maneuverKey, /M58 48V90M86 48V90/);
  assert.doesNotMatch(maneuverKey, />H<\/text>/);

  const stopKey = Buffer.from(
    renderNavigationKey(model, "next-stop").split(",", 2)[1] ?? "",
    "base64"
  ).toString("utf8");
  assert.match(stopKey, /PAUSENPUNKT/);
  assert.match(stopKey, /M67 17V33M77 17V33/);

  const fullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    model
  );
  assert.match(fullpanel, />PAUSE<\/text>/);
  assert.match(fullpanel, />PAUSENPUNKT<\/text>/);

  // Live-Regression Ostbahnhof 28.08.2026: Die Mission meldet bereits den
  // ersten Linienhalt, waehrend ein zuvor gespeicherter Zielzustand noch am
  // ersten Punkt des Terminalpaares haengt. Der exakt erreichte zweite Punkt
  // behaelt die Pause nur innerhalb seines Zielbereichs. Nach der Ausfahrt
  // muss Andreasstr. uebernehmen; ein Pausensymbol mit 0 m darf bei knapp
  // 48 km/h nicht weiterlaufen.
  const departureEngine = new RouteGuidanceEngine();
  departureEngine.update(
    terminalSnapshot(-1, latLon(0, 0), now + 1_000),
    now + 1_000
  );
  const atSecondTerminal = terminalSnapshot(
    1,
    latLon(200, 100),
    now + 1_600
  );
  atSecondTerminal.mission!.LastStopReached = terminalStops[1];
  atSecondTerminal.mission!.LastStopReachedIndex = 2;
  model = departureEngine.update(atSecondTerminal, now + 1_600);
  assert.equal(model.nextRelevantStop, "Hertzallee");
  assert.equal(model.nextTargetKind, "terminal-pause");
  assert.equal(model.nextManeuver, "pause");
  assert.equal(model.nextRelevantStopDistance, 0);

  const afterTerminalDeparture = terminalSnapshot(
    1,
    latLon(260, 100),
    now + 2_600
  );
  afterTerminalDeparture.mission!.LastStopReached = terminalStops[1];
  afterTerminalDeparture.mission!.LastStopReachedIndex = 2;
  model = departureEngine.update(afterTerminalDeparture, now + 2_600);
  assert.equal(model.nextRelevantStop, "S+U Zoologischer Garten");
  assert.equal(model.nextTargetKind, "destination");
  assert.notEqual(model.nextManeuver, "pause");
  assert.notEqual(model.debug?.selectionReason, "mission-terminal-pause-reached");

  // Der gleiche Missionsaufbau bleibt auch bei unterschiedlichen sichtbaren
  // Namen ein Terminalpaar (belegt am Alexanderplatz-Mitschnitt).
  const namedStops = terminalStops.map((stop) => ({ ...stop }));
  namedStops[0].StopName = "Alexanderplatz";
  namedStops[1].StopName = "S+U Alexanderplatz/Memhardstr.";
  const namedModel = new RouteGuidanceEngine().update(
    terminalSnapshot(-1, latLon(0, 0), now + 1_200, namedStops),
    now + 1_200
  );
  assert.equal(namedModel.nextTargetKind, "terminal-pause");
  assert.equal(namedModel.nextManeuver, "pause");

  // Gleiche Positionen oder aehnliche Namen allein reichen nicht: Weichen
  // die echten Fahrplanzeiten ab, bleibt es ein regulaeres Halteziel.
  const regularStops = terminalStops.map((stop) => ({ ...stop }));
  regularStops[1].ArrivalTime = "20:31:00";
  regularStops[1].DepartureTime = "20:31:00";
  const regularModel = new RouteGuidanceEngine().update(
    terminalSnapshot(-1, latLon(0, 0), now + 1_800, regularStops),
    now + 1_800
  );
  assert.equal(regularModel.nextTargetKind, "stop");
  assert.notEqual(regularModel.nextManeuver, "pause");

  // Lange Rest- und Gesamtstrecken muessen mit Naeherungszeichen auf dem
  // 144x144-Key innerhalb des sicheren Textbereichs bleiben.
  const distanceModel: RouteGuidanceModel = {
    ...model,
    totalRouteDistance: 11_300,
    remainingRouteDistance: 11_300,
    routeDistanceEstimated: true
  };
  for (const kind of ["total-distance", "remaining-distance"] as const) {
    const svg = Buffer.from(
      renderNavigationKey(distanceModel, kind).split(",", 2)[1] ?? "",
      "base64"
    ).toString("utf8");
    assert.match(svg, /font-size="27\.0"[^>]*>≈11,3 km<\/text>/);
  }
}

// NAV-08: Liegt jede Stopprojektion hinter dem Bus, obwohl dessen reale
// Luftlinie zum Halt deutlich groesser als der Ankunftsradius ist, bleibt die
// Distanz neutral. Ein geometrischer Widerspruch darf niemals zu 0 m werden.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500]];
  const mission = {
    MissionClassName: "ImpossibleZeroDistanceLine",
    LastStopReachedIndex: 0,
    NextStopIndex: 1,
    NextStop: {
      StopName: "Rueckwaertiger Halt",
      GeoLocation: latLon(0, 200)
    },
    Stops: [
      { StopName: "Start", GeoLocation: latLon(0, 0) },
      { StopName: "Rueckwaertiger Halt", GeoLocation: latLon(0, 200) }
    ]
  };
  const model = new RouteGuidanceEngine().update({
    ...snapshot(line, latLon(0, 400), 28_500),
    mission
  }, 28_500);
  assert.equal(model.status, "live");
  assert.equal(model.nextRelevantStopDistance, undefined);
  assert.equal(model.activeManeuver, undefined);
  assert.equal(model.nextManeuver, "unavailable");
  assert.equal(model.remainingRouteDistance, undefined);
  assert.equal(model.routeProgress, undefined);
}

// NAV-08: Direkt am echten Haltepunkt bleibt 0 m weiterhin zulaessig.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500]];
  const model = new RouteGuidanceEngine().update(
    snapshot(line, latLon(0, 500), 29_000),
    29_000
  );
  assert.equal(model.nextRelevantStopDistance, 0);
}

// Navigation bleibt im Live-Zustand durchgehend cyan. Nur das
// Prognose-Delta darf seine fachliche Grün-/Gelb-/Rot-Klassifikation zeigen.
{
  const liveModel: RouteGuidanceModel = {
    online: true,
    inVehicle: true,
    status: "live",
    nextManeuver: "stop",
    maneuverDistance: 80,
    nextRelevantStop: "Mitte",
    nextRelevantStopDistance: 250,
    totalRouteDistance: 1_000,
    remainingRouteDistance: 750,
    routeDistanceEstimated: false,
    routeProgress: 0.25,
    estimatedArrivalTime: "10:02",
    predictedScheduleDelta: 45,
    predictionConfidence: "high",
    routeLaneCount: 1
  };
  const decode = (image: string) => Buffer.from(
    image.slice(image.indexOf(",") + 1),
    "base64"
  ).toString("utf8");
  const singleColorKinds: NavigationDisplayKind[] = [
    "maneuver", "maneuver-distance", "next-stop", "total-distance",
    "remaining-distance", "route-progress", "eta", "confidence"
  ];
  for (const kind of singleColorKinds) {
    const svg = decode(renderNavigationKey(liveModel, kind));
    assert.match(svg, /#38c9ff/i);
    assert.doesNotMatch(svg, /#78d83a|#ffc21d|#ff4050/i);
  }
  assert.match(
    decode(renderNavigationKey(liveModel, "total-distance")),
    /LINIENLÄNGE/
  );
  const deltaSvg = decode(renderNavigationKey(liveModel, "predicted-delta"));
  assert.match(deltaSvg, /#ffc21d/i);

  const fullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    liveModel
  );
  assert.match(fullpanel, /data-route-remaining="750 m"/);
  assert.match(fullpanel, /data-route-progress="25%"/);
  assert.doesNotMatch(fullpanel, /NAV-STATUS/);
  assert.match(fullpanel, /font-size="16" font-weight="900" fill="#fff">750 m/);
  assert.match(fullpanel, /font-size="18" font-weight="900" fill="#fff">25%/);
  assert.match(fullpanel, /data-route-eta="≈10:02"/);
  assert.match(fullpanel, /data-route-predicted-delta="\+0:45"/);
  assert.match(fullpanel, /data-route-confidence="HOCH"/);

  const uncertainFullpanel = renderFullpanel(
    { runtimeState: "mission-ready" } as any,
    "navigation",
    true,
    undefined,
    { ...liveModel, status: "stale-route" }
  );
  assert.match(uncertainFullpanel, /data-route-remaining="--"/);
  assert.match(uncertainFullpanel, /data-route-progress="--"/);
  assert.match(uncertainFullpanel, /data-route-eta="--:--"/);
  assert.match(uncertainFullpanel, /data-route-predicted-delta="--:--"/);
  assert.match(uncertainFullpanel, /data-route-confidence="--"/);
}

// NAV-03: 100 % ist ausschließlich nach bestätigtem Erreichen des Endhalts
// zulässig; die reine Projektion auf das Linienende bleibt vorher bei 99 %.
{
  const line: Array<[number, number]> = [[0, 0], [0, 500], [0, 1_000]];
  const engine = new RouteGuidanceEngine();
  const beforeConfirmation = snapshot(line, latLon(0, 1_000), 26_000, 1, 0);
  let model = engine.update(beforeConfirmation, 26_000);
  assert.equal(model.routeProgress, 0.99);
  model = engine.update({
    ...beforeConfirmation,
    mission: {
      ...beforeConfirmation.mission,
      DestinationStopReached: true
    },
    routeUpdatedAt: 26_001,
    vehicleUpdatedAt: 26_001,
    updatedAt: 26_001
  }, 26_001);
  assert.equal(model.routeProgress, 1);
}

// NAV-04/NAV-05: ETA bleibt ohne Fahrhistorie leer. Beim bestaetigten
// Haltestellenwechsel wird die alte Glättung verworfen, die frische rollende
// Geschwindigkeitshistorie darf den neuen Abschnitt aber sofort initialisieren.
// Sonst bleiben ETA und Prognose genau dann leer, wenn der Bus unmittelbar am
// neuen Halt zum Stehen kommt (Live-Fall S Beusselstr.).
{
  const line: Array<[number, number]> = [[0, 0], [0, 500], [0, 1_000]];
  const engine = new RouteGuidanceEngine();
  let model = engine.update(snapshot(line, latLon(0, 100), 30_000), 30_000);
  assert.equal(model.estimatedArrivalTime, undefined);
  for (let second = 1; second <= 6; second += 1) {
    const now = 30_000 + second * 1_000;
    model = engine.update(snapshot(line, latLon(0, 100 + second * 10), now), now);
  }
  assert.notEqual(model.estimatedArrivalTime, undefined);
  assert.notEqual(model.predictedScheduleDelta, undefined);
  const previousEta = model.estimatedArrivalSeconds;

  // Ein bloss gemeldeter Objekt-/Indexwechsel darf das Ziel nicht ueberspringen,
  // solange der Bus den bisherigen Halt raeumlich noch nicht erreicht hat.
  const switchedAt = 37_000;
  model = engine.update(
    snapshot(line, latLon(0, 170), switchedAt, 1),
    switchedAt
  );
  assert.equal(model.nextRelevantStop, "Mitte");

  // Erst die echte Annaeherung an den bisherigen Halt bestaetigt den Wechsel.
  model = engine.update(
    snapshot(line, latLon(0, 500), switchedAt + 1_000, 1),
    switchedAt + 1_000
  );
  assert.equal(model.nextRelevantStop, "Ziel");
  assert.notEqual(model.estimatedArrivalTime, undefined);
  assert.notEqual(model.predictedScheduleDelta, undefined);
  assert.notEqual(model.estimatedArrivalSeconds, previousEta);
}

// UI-05/UI-06: Offline und No-Bus bleiben getrennte globale Zustände.
{
  const engine = new RouteGuidanceEngine();
  const offline = engine.update({ connected: false, runtimeState: "offline" });
  assert.equal(offline.status, "offline");
  assert.equal(offline.online, false);
  const noBus = engine.update({ connected: false, online: true, runtimeState: "no-bus" });
  assert.equal(noBus.status, "no-vehicle");
  assert.equal(noBus.online, true);
  assert.equal(noBus.inVehicle, false);
}

// NAV-DEBUG-01: Die Dev-Diagnose speichert auf Tastendruck die letzten
// 60 Sekunden inklusive Entscheidungs- und Routengeometrie als Textdatei.
{
  assert.equal(
    NAVIGATION_DEBUG_OUTPUT_DIRECTORY,
    join(homedir(), "Documents", "Projekte", "The Bus", "NaviDebug")
  );
  const recorder = NavigationDebugRecorder.instance;
  recorder.clear();
  const now = 90_000;
  const line: Array<[number, number]> = [[0, 0], [0, 180], [90, 180]];
  const model = new RouteGuidanceEngine().update(
    snapshot(line, latLon(0, 40), now, 0, 28),
    now
  );
  assert.equal(model.status, "live");

  const tooOld = snapshot(line, latLon(0, 10), now - 61_000, 0, 28);
  tooOld.mission = {
    ...tooOld.mission,
    MissionClassName: "THIS_SAMPLE_MUST_NOT_BE_EXPORTED"
  };
  recorder.record(tooOld, model, now - 61_000);
  // 10 Hz inklusive beider Fenstergrenzen: 601 Samples fuer exakt 60 s.
  for (let index = 0; index <= 600; index += 1) {
    const at = now - 60_000 + index * 100;
    const captured = snapshot(line, latLon(0, 40), at, 0, 28);
    if (index === 600) {
      captured.world = {
        DateTime: "2026.09.01-19.03.56",
        GameTime: "19:03:56"
      };
      captured.vehicle = {
        ...captured.vehicle,
        IsAtStop: true,
        PassengerDoorsOpen: true,
        ScheduleDelta: -60,
        doors: [{
          Name: "Door 1",
          Open: true,
          Progress: 0.75,
          StopRequest: false
        }]
      };
      captured.mission = {
        ...captured.mission,
        ScheduleDeviation: -60,
        CurrentStopIndex: 1,
        CurrentStop: {
          StopName: "Mitte",
          GeoLocation: latLon(0, 500),
          ArrivalTime: "2026.09.01-19.02.00",
          DepartureTime: "2026.09.01-19.02.00",
          PlannedArrivalTime: "2026.09.01-19.02.00",
          PlannedDepartureTime: "2026.09.01-19.02.00",
          ActualArrivalTime: "2026.09.01-19.03.00",
          EstimatedDepartureTime: "2026.09.01-19.03.00",
          ScheduleDelta: -60
        } as unknown as NonNullable<TelemetrySnapshot["mission"]>["CurrentStop"]
      } as unknown as TelemetrySnapshot["mission"];
    }
    recorder.record(captured, model, at);
  }

  const directory = mkdtempSync(join(tmpdir(), "thebus-nav-debug-"));
  const exported = recorder.exportLastMinute(now, directory);
  const text = readFileSync(exported.path, "utf8");

  assert.equal(exported.sampleCount, 601);
  assert.equal(exported.routeContextCount, 1);
  assert.equal(exported.durationSeconds, 60);
  assert.equal(exported.destination, "custom");
  assert.equal(exported.directory, directory);
  assert.match(text, /Navigation Blackbox/);
  assert.match(text, /Format-Version: 3/);
  assert.match(text, /Plugin-Version: 2\.17\.0\.0/);
  assert.match(text, /ROUTE_CONTEXTS_JSON/);
  assert.match(text, /"relevantLaneFeatures"/);
  assert.match(text, /"engineRoute"/);
  assert.match(text, /"polyline"/);
  assert.match(text, /SAMPLES_JSONL/);
  assert.match(text, /"status":"live"/);
  assert.match(text, /"nextRelevantStop"/);
  assert.match(text, /"selectionReason"/);
  assert.match(text, /"routeUpdateKind":"initial"/);
  assert.match(text, /"targetKind":"stop"/);
  assert.match(text, /"timetableDiagnostic"/);
  assert.match(text, /"phaseSource":"(?:current-stop-departure|stop-phase)"/);
  assert.match(text, /"deltaSource":"telemetry"/);
  assert.match(text, /"ScheduleDelta":-60/);
  assert.match(text, /"ScheduleDeviation":-60/);
  assert.match(text, /"ActualArrivalTime":"2026\.09\.01-19\.03\.00"/);
  assert.match(text, /"EstimatedDepartureTime":"2026\.09\.01-19\.03\.00"/);
  assert.match(text, /"GameTime":"19:03:56"/);
  assert.match(text, /"name":"Door 1"/);
  assert.match(text, /"progress":0\.75/);
  assert.doesNotMatch(text, /THIS_SAMPLE_MUST_NOT_BE_EXPORTED/);
  recorder.clear();
}

console.log("navigation-regression: all tests passed");
