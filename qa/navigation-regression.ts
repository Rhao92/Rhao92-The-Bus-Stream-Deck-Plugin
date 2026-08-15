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
    false,
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
    false,
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
    false,
    true,
    undefined,
    model
  );
  assert.match(fullpanel, /Hertzallee/);
  assert.match(fullpanel, /AKTIV/);
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
  const deltaSvg = decode(renderNavigationKey(liveModel, "predicted-delta"));
  assert.match(deltaSvg, /#ffc21d/i);
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

  const switchedAt = 37_000;
  model = engine.update(
    snapshot(line, latLon(0, 170), switchedAt, 1),
    switchedAt
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
    recorder.record(snapshot(line, latLon(0, 40), at, 0, 28), model, at);
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
  assert.match(text, /Format-Version: 2/);
  assert.match(text, /ROUTE_CONTEXTS_JSON/);
  assert.match(text, /"relevantLaneFeatures"/);
  assert.match(text, /"engineRoute"/);
  assert.match(text, /"polyline"/);
  assert.match(text, /SAMPLES_JSONL/);
  assert.match(text, /"status":"live"/);
  assert.match(text, /"nextRelevantStop"/);
  assert.match(text, /"selectionReason"/);
  assert.doesNotMatch(text, /THIS_SAMPLE_MUST_NOT_BE_EXPORTED/);
  recorder.clear();
}

console.log("navigation-regression: all tests passed");
