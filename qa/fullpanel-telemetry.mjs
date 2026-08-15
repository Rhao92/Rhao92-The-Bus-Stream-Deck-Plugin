import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const telemetryPath = new URL(
  "../src/fullpanel/view-model.ts",
  import.meta.url,
);
const telemetrySource = await readFile(telemetryPath, "utf8");
const telemetryModule = await import(
  `data:text/javascript;base64,${Buffer.from(telemetrySource).toString("base64")}`
);
const {
  calculateRouteProgressDelta,
  calculateStopPhaseDelta,
  createViewModel,
  formatVehiclePower,
  FULLPANEL_POLL_INTERVALS,
  FullpanelTelemetryClient,
  scheduleDifferenceSeconds,
} = telemetryModule;

function stop(name, time, extra = {}) {
  return {
    StopName: name,
    GroupName: name,
    ArrivalTime: time,
    DepartureTime: time,
    ...extra,
  };
}

function snapshot({
  worldTime = "2026-08-18T16:51:12",
  playerLocation,
  vehicle = {},
  mission = {},
} = {}) {
  return {
    online: true,
    player: {
      Mode: "Vehicle",
      CurrentVehicle: "BP_TestBus_C_0",
      ...(playerLocation ? { GeoLocation: playerLocation } : {}),
    },
    world: {
      DateTime: worldTime,
    },
    vehicle,
    mission,
  };
}

assert.equal(formatVehiclePower("-0.03981"), "−39,8 kW");
assert.equal(formatVehiclePower(0), "0,0 kW");
assert.equal(formatVehiclePower("0.0454"), "+45,4 kW");
assert.equal(formatVehiclePower("-0.00004"), "0,0 kW");
assert.equal(formatVehiclePower("ungueltig"), "–");
assert.equal(formatVehiclePower("0.1", false), "–");

{
  const raisedAtStop = createViewModel(
    snapshot({
      vehicle: {
        Speed: 0,
        Powermeter: "-0.03981",
        DisplayFuel: "0.956842",
        Buttons: [
          { Name: "Kneeling", State: "Primary" },
          { Name: "Automatic Kneeling", State: "true" },
        ],
      },
    }),
    undefined,
    { mechanicalKneeling: false },
  );
  assert.equal(raisedAtStop.mechanicalKneeling, "READY");
  assert.equal(raisedAtStop.power, "−39,8 kW");
  assert.equal(raisedAtStop.batteryPercent, 96);
  assert.equal(raisedAtStop.autoKneeling, false);

  const autoKneelingEnabled = createViewModel(snapshot({
    vehicle: {
      Speed: 0,
      Buttons: [{ Name: "Automatic Kneeling", State: "false" }],
    },
  }));
  assert.equal(autoKneelingEnabled.autoKneeling, true);

  const raisedWhileDriving = createViewModel(
    snapshot({ vehicle: { Speed: 52, Powermeter: "0.0454" } }),
    undefined,
    { mechanicalKneeling: false },
  );
  assert.equal(raisedWhileDriving.mechanicalKneeling, "AUS");
  assert.equal(raisedWhileDriving.power, "+45,4 kW");

  const emptyBattery = createViewModel(snapshot({
    vehicle: { DisplayFuel: -0.2 },
  }));
  const overfullBattery = createViewModel(snapshot({
    vehicle: { DisplayFuel: 1.2 },
  }));
  const missingBattery = createViewModel(snapshot({
    vehicle: { DisplayFuel: "ungueltig" },
  }));
  assert.equal(emptyBattery.batteryPercent, 0);
  assert.equal(overfullBattery.batteryPercent, 100);
  assert.equal(missingBattery.batteryPercent, undefined);

  const lowered = createViewModel(
    snapshot({ vehicle: { Speed: 0, Powermeter: 0 } }),
    undefined,
    { mechanicalKneeling: true },
  );
  assert.equal(lowered.mechanicalKneeling, "AKTIV");

  const lowering = createViewModel(
    snapshot({ vehicle: { Speed: 0 } }),
    undefined,
    { mechanicalKneeling: false, kneelingTargetLowered: true },
  );
  assert.equal(lowering.mechanicalKneeling, "SENKT AB");

  const raising = createViewModel(
    snapshot({ vehicle: { Speed: 0 } }),
    undefined,
    { mechanicalKneeling: true, kneelingTargetLowered: false },
  );
  assert.equal(raising.mechanicalKneeling, "HEBT AN");
}

const plannedKruppstrasse = stop(
  "Kruppstraße",
  "2026-08-18T16:50:00",
);

// The Bus kann direkt nach Mitternacht Weltzeit und Missionsfahrplan mit
// benachbarten Kalendertagen liefern. 00:26:00 minus 00:25:41 sind +0:19 und
// dürfen niemals als +1440:19 erscheinen.
assert.equal(
  scheduleDifferenceSeconds(
    "2026-08-18T00:25:41",
    "2026-08-19T00:26:00",
  ),
  19,
);
assert.equal(
  scheduleDifferenceSeconds(
    "2026-08-19T00:26:41",
    "2026-08-18T00:26:00",
  ),
  -41,
);

// Ein echter, korrekt datierter Übergang über Mitternacht bleibt erhalten.
assert.equal(
  scheduleDifferenceSeconds(
    "2026-08-18T23:59:50",
    "2026-08-19T00:00:10",
  ),
  20,
);
assert.equal(
  scheduleDifferenceSeconds(
    "2026-08-19T00:00:10",
    "2026-08-18T23:59:50",
  ),
  -20,
);

// Eine reguläre Tour darf am vorherigen Kalendertag beginnen und am nächsten
// enden. Vor dem Tageswechsel, direkt darüber hinweg und danach bleiben die
// korrekt datierten Abweichungen erhalten.
assert.deepEqual(
  [
    scheduleDifferenceSeconds(
      "2026-08-18T23:58:10",
      "2026-08-18T23:58:30",
    ),
    scheduleDifferenceSeconds(
      "2026-08-18T23:59:50",
      "2026-08-19T00:00:10",
    ),
    scheduleDifferenceSeconds(
      "2026-08-19T00:05:10",
      "2026-08-19T00:05:30",
    ),
  ],
  [20, 20, 20],
);

{
  const leopoldplatz = stop("U Leopoldplatz", "2026-08-19T00:25:30", {
    DepartureTime: "2026-08-19T00:26:00",
  });
  const mission = {
    CurrentStop: { ...leopoldplatz },
    CurrentStopIndex: 0,
    NextStop: stop("Folgehalt", "2026-08-19T00:30:00"),
    NextStopIndex: 1,
    Stops: [
      { ...leopoldplatz },
      stop("Folgehalt", "2026-08-19T00:30:00"),
    ],
  };
  const view = createViewModel(snapshot({
    worldTime: "2026-08-18T00:25:41",
    vehicle: { IsAtStop: true },
    mission,
  }));
  assert.equal(view.deltaText, "+0:19");
  assert.equal(view.status, "PÜNKTLICH");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...plannedKruppstrasse },
    NextStopIndex: 0,
    Stops: [{ ...plannedKruppstrasse }],
  };
  const view = createViewModel(snapshot({ mission }), undefined);
  assert.equal(view.deltaText, "−1:12");
  assert.equal(view.deltaSource, "overdue-stop-clock");
  assert.equal(view.status, "VERSPÄTET");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Folgehalt", "2026-08-18T16:53:00"),
    NextStopIndex: 1,
    LastStopReached: { ...plannedKruppstrasse },
    LastStopReachedIndex: 0,
    Stops: [
      { ...plannedKruppstrasse },
      stop("Folgehalt", "2026-08-18T16:53:00"),
    ],
  };
  const view = createViewModel(
    snapshot({ mission }),
    undefined,
    { stopReachedChanged: true },
  );
  assert.equal(view.deltaText, "−1:12");
  assert.equal(view.deltaSource, "reached-stop-clock");
  assert.equal(view.status, "VERSPÄTET");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: {
      ...plannedKruppstrasse,
      EstimatedArrivalTime: "2026-08-18T16:50:30",
    },
    NextStopIndex: 0,
    Stops: [{ ...plannedKruppstrasse }],
  };
  const view = createViewModel(snapshot({ mission }), undefined);
  assert.equal(view.deltaText, "−0:30");
  assert.equal(view.deltaSource, "next-stop");
  assert.equal(view.status, "PÜNKTLICH");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Folgehalt", "2026-08-18T16:53:00"),
    NextStopIndex: 1,
    LastStopReached: { ...plannedKruppstrasse },
    LastStopReachedIndex: 0,
    Stops: [
      { ...plannedKruppstrasse },
      stop("Folgehalt", "2026-08-18T16:53:00"),
    ],
  };
  const view = createViewModel(
    snapshot({
      mission,
      vehicle: { IsAtStop: true },
    }),
    undefined,
  );
  assert.equal(view.deltaText, "−1:12");
  assert.equal(view.deltaSource, "confirmed-stop-clock");
  assert.equal(view.status, "VERSPÄTET");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...plannedKruppstrasse },
    NextStopIndex: 0,
    Stops: [{ ...plannedKruppstrasse }],
  };
  const view = createViewModel(
    snapshot({
      worldTime: "2026-08-18T16:49:20",
      mission,
    }),
    -45,
  );
  assert.equal(view.deltaText, "−0:45");
  assert.equal(view.deltaSource, "cached");
  assert.equal(view.status, "PÜNKTLICH");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...plannedKruppstrasse },
    NextStopIndex: 0,
    Stops: [{ ...plannedKruppstrasse }],
  };
  const view = createViewModel(
    snapshot({
      worldTime: "2026-08-18T16:49:20",
      mission,
    }),
    undefined,
  );
  assert.equal(view.deltaText, "--:--");
  assert.equal(view.deltaSource, "unavailable");
  assert.equal(view.status, "UNBEKANNT");
}

for (const [delta, expectedStatus] of [
  [-61, "VERSPÄTET"],
  [-60, "PÜNKTLICH"],
  [0, "PÜNKTLICH"],
  [60, "PÜNKTLICH"],
  [61, "VERFRÜHT"],
]) {
  const mission = {
    ScheduleDelta: delta,
    NextStop: { ...plannedKruppstrasse },
    NextStopIndex: 0,
    Stops: [{ ...plannedKruppstrasse }],
  };
  const view = createViewModel(snapshot({ mission }), undefined);
  assert.equal(view.status, expectedStatus);
  assert.equal(view.deltaSource, "telemetry");
}

{
  const invalidenpark = stop("Invalidenpark", "2026-08-18T17:40:00", {
    DepartureTime: "2026-08-18T17:41:00",
    GeoLocation: [52, 13.004],
  });
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...invalidenpark },
    NextStopIndex: 1,
    LastStopReached: stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
      GeoLocation: [52, 13],
    }),
    LastStopReachedIndex: 0,
    Stops: [
      stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
        GeoLocation: [52, 13],
      }),
      { ...invalidenpark },
      stop("Robert-Koch-Platz", "2026-08-18T17:42:00", {
        DepartureTime: "2026-08-18T17:43:00",
        GeoLocation: [52, 13.006],
      }),
    ],
  };

  // Rund 100 Meter vor Invalidenpark gilt nur dessen geplante Ankunft.
  // 17:40:00 gegen 17:40:09 ergibt −0:09 und nicht die alte
  // positionsinterpolierte Prognose von etwa −0:49.
  const approaching = calculateStopPhaseDelta(snapshot({
    worldTime: "2026-08-18T17:40:09",
    playerLocation: [52, 13.0025],
    mission,
  }));
  assert.equal(approaching.seconds, -9);
  assert.equal(approaching.source, "next-stop-arrival");
  assert.equal(approaching.stop.StopName, "Invalidenpark");
  assert.equal(approaching.arrivalStop.StopName, "Invalidenpark");
  assert.equal(approaching.departureStop.StopName, "Invalidenpark");
  assert.equal(approaching.state.phase, "en-route");
  assert.equal(approaching.state.passThroughArmed, false);

  // Der reine Durchfahrtsweg braucht weder Stillstand noch Tuerfreigabe.
  // Die Einfahrt in den 25-m-Bereich merkt den bevorstehenden Halt vor.
  const passThroughEntered = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:10",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 25,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(passThroughEntered.state.phase, "en-route");
  assert.equal(passThroughEntered.stop.StopName, "Invalidenpark");
  assert.equal(passThroughEntered.state.passThroughArmed, true);

  // Nach dem Verlassen der 30-m-Zone muessen Name, ANK, ABF und Delta auch
  // bei unveraendertem Mission.NextStop gemeinsam zum Folgehalt wechseln.
  const passThroughExited = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.00445],
      vehicle: {
        Speed: 25,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    passThroughEntered.state,
  );
  assert.equal(passThroughExited.seconds, 100);
  assert.equal(passThroughExited.source, "next-stop-arrival");
  assert.equal(passThroughExited.stop.StopName, "Robert-Koch-Platz");
  assert.equal(passThroughExited.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(passThroughExited.departureStop.StopName, "Robert-Koch-Platz");
  assert.equal(passThroughExited.state.stopIndex, 2);
  assert.equal(passThroughExited.state.passThroughArmed, false);

  const passThroughView = createViewModel(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.00445],
      vehicle: {
        Speed: 25,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    undefined,
    {
      stopPhaseDelta: passThroughExited.seconds,
      stopPhaseSource: passThroughExited.source,
      displayStop: passThroughExited.stop,
      arrivalStop: passThroughExited.arrivalStop,
      departureStop: passThroughExited.departureStop,
    },
  );
  assert.equal(passThroughView.stopName, "Robert-Koch-Platz");
  assert.equal(passThroughView.arrival, "17:42");
  assert.equal(passThroughView.departure, "17:43");
  assert.equal(passThroughView.deltaText, "+1:40");

  // Der erzwungene Fortschritt bleibt verriegelt, solange die Mission noch
  // den alten Halt meldet. Auch kurzes Positionsrauschen darf nicht zurueck.
  const passThroughHeld = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:21",
      playerLocation: [52, 13.0044],
      vehicle: {
        Speed: 25,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    passThroughExited.state,
  );
  assert.equal(passThroughHeld.stop.StopName, "Robert-Koch-Platz");
  assert.equal(passThroughHeld.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(passThroughHeld.departureStop.StopName, "Robert-Koch-Platz");

  // Ohne vorherige Einfahrt in die 25-m-Zone darf eine einzelne Position
  // ausserhalb der 30-m-Zone keinen Halt ueberspringen.
  const outsideWithoutArming = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.00445],
      vehicle: {
        Speed: 25,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(outsideWithoutArming.stop.StopName, "Invalidenpark");
  assert.equal(outsideWithoutArming.state.passThroughArmed, false);

  // Nur Position + Stillstand reichen nicht: Ohne Fahrgasttuer bleibt ANK
  // am aktuellen bevorstehenden Halt.
  const stoppedWithDoorsClosed = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(stoppedWithDoorsClosed.state.phase, "en-route");
  assert.equal(stoppedWithDoorsClosed.arrivalStop.StopName, "Invalidenpark");

  // Auch Position + offene Tuer reichen bei rollendem Fahrzeug nicht.
  const movingWithDoorsOpen = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 3,
        PassengerDoorsOpen: true,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(movingWithDoorsOpen.state.phase, "en-route");
  assert.equal(movingWithDoorsOpen.arrivalStop.StopName, "Invalidenpark");

  // Eine Gepaeckraumtuer ist keine Fahrgasttuer und darf den Wechsel nicht
  // ausloesen.
  const stoppedWithLuggageDoorOpen = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        LuggageDoorsOpen: true,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(stoppedWithLuggageDoorOpen.state.phase, "en-route");
  assert.equal(stoppedWithLuggageDoorOpen.arrivalStop.StopName, "Invalidenpark");

  // Die physische Dreifachbestaetigung darf vor der Missionsumschaltung
  // ausschliesslich ANK auf den Folgehalt schalten.
  const physicallyConfirmed = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        PassengerDoorsOpen: true,
      },
      mission,
    }),
    approaching.state,
  );
  assert.equal(physicallyConfirmed.seconds, 51);
  assert.equal(physicallyConfirmed.source, "current-stop-departure");
  assert.equal(physicallyConfirmed.stop.StopName, "Invalidenpark");
  assert.equal(physicallyConfirmed.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(physicallyConfirmed.departureStop.StopName, "Invalidenpark");
  assert.equal(physicallyConfirmed.state.phase, "at-stop");
  assert.equal(physicallyConfirmed.state.arrivalConfirmed, true);

  // Das Oeffnen wird verriegelt: Tuer schliessen darf ANK nicht
  // zurueckspringen lassen.
  const confirmedWithDoorsClosed = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:10",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        PassengerDoorsOpen: false,
      },
      mission,
    }),
    physicallyConfirmed.state,
  );
  assert.equal(confirmedWithDoorsClosed.stop.StopName, "Invalidenpark");
  assert.equal(confirmedWithDoorsClosed.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(confirmedWithDoorsClosed.departureStop.StopName, "Invalidenpark");
  assert.equal(confirmedWithDoorsClosed.state.arrivalConfirmed, true);

  const physicallyConfirmedView = createViewModel(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        PassengerDoorsOpen: true,
      },
      mission,
    }),
    undefined,
    {
      stopPhaseDelta: physicallyConfirmed.seconds,
      stopPhaseSource: physicallyConfirmed.source,
      displayStop: physicallyConfirmed.stop,
      arrivalStop: physicallyConfirmed.arrivalStop,
      departureStop: physicallyConfirmed.departureStop,
    },
  );
  assert.equal(physicallyConfirmedView.stopName, "Invalidenpark");
  assert.equal(physicallyConfirmedView.arrival, "17:42");
  assert.equal(physicallyConfirmedView.departure, "17:41");
  assert.equal(physicallyConfirmedView.deltaText, "+0:51");

  const reachedMission = {
    ...mission,
    NextStop: { ...mission.Stops[2] },
    NextStopIndex: 2,
    LastStopReached: { ...invalidenpark },
    LastStopReachedIndex: 1,
  };
  const confirmedAfterMissionSwitch = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:11",
      playerLocation: [52, 13.004],
      vehicle: {
        Speed: 0,
        PassengerDoorsOpen: false,
      },
      mission: reachedMission,
    }),
    confirmedWithDoorsClosed.state,
    { stopReachedChanged: true },
  );
  assert.equal(confirmedAfterMissionSwitch.stop.StopName, "Invalidenpark");
  assert.equal(confirmedAfterMissionSwitch.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(confirmedAfterMissionSwitch.departureStop.StopName, "Invalidenpark");
  assert.equal(confirmedAfterMissionSwitch.state.arrivalConfirmed, true);

  const atStop = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.004],
      mission: reachedMission,
    }),
    approaching.state,
    { stopReachedChanged: true },
  );
  assert.equal(atStop.seconds, 51);
  assert.equal(atStop.source, "current-stop-departure");
  assert.equal(atStop.stop.StopName, "Invalidenpark");
  assert.equal(atStop.arrivalStop.StopName, "Invalidenpark");
  assert.equal(atStop.departureStop.StopName, "Invalidenpark");
  assert.equal(atStop.state.phase, "at-stop");

  // Rund 27 Meter vom Haltepunkt bleibt der aktuelle Halt innerhalb der
  // 30-Meter-Ausfahrtsschwelle stabil und flackert nicht zur NextStop.
  const stillAtStop = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.0044],
      mission: reachedMission,
    }),
    atStop.state,
  );
  assert.equal(stillAtStop.seconds, 40);
  assert.equal(stillAtStop.source, "current-stop-departure");
  assert.equal(stillAtStop.stop.StopName, "Invalidenpark");

  const staleCurrentMission = {
    ...reachedMission,
    CurrentStop: { ...invalidenpark },
    CurrentStopIndex: 1,
  };
  const staleCurrentInsideExit = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.0044],
      mission: staleCurrentMission,
    }),
    atStop.state,
  );
  assert.equal(staleCurrentInsideExit.seconds, 40);
  assert.equal(staleCurrentInsideExit.source, "current-stop-departure");

  // Rund 31 Meter vom Haltepunkt ist die 30-Meter-Ausfahrtsschwelle verlassen.
  // Ein noch gemeldeter CurrentStop darf den Wechsel zur naechsten Ankunft
  // dann nicht mehr blockieren.
  const staleCurrentOutsideExit = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.00445],
      mission: staleCurrentMission,
    }),
    staleCurrentInsideExit.state,
  );
  assert.equal(staleCurrentOutsideExit.seconds, 100);
  assert.equal(staleCurrentOutsideExit.source, "next-stop-arrival");
  assert.equal(staleCurrentOutsideExit.stop.StopName, "Robert-Koch-Platz");
  assert.equal(staleCurrentOutsideExit.arrivalStop.StopName, "Robert-Koch-Platz");
  assert.equal(staleCurrentOutsideExit.departureStop.StopName, "Robert-Koch-Platz");

  // Erst nach dem echten Entfernen schaltet die Referenz auf die Ankunft des
  // naechsten Halts.
  const departed = calculateStopPhaseDelta(
    snapshot({
      worldTime: "2026-08-18T17:40:20",
      playerLocation: [52, 13.005],
      mission: reachedMission,
    }),
    stillAtStop.state,
  );
  assert.equal(departed.seconds, 100);
  assert.equal(departed.source, "next-stop-arrival");
  assert.equal(departed.stop.StopName, "Robert-Koch-Platz");
  assert.equal(departed.state.phase, "en-route");

  const view = createViewModel(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.0025],
      mission,
    }),
    undefined,
    {
      stopPhaseDelta: approaching.seconds,
      stopPhaseSource: approaching.source,
      displayStop: approaching.stop,
    },
  );
  assert.equal(view.deltaText, "−0:09");
  assert.equal(view.deltaSource, "next-stop-arrival");
  assert.equal(view.stopName, "Invalidenpark");
  assert.equal(view.status, "PÜNKTLICH");

  const directTelemetryView = createViewModel(
    snapshot({
      worldTime: "2026-08-18T17:40:09",
      playerLocation: [52, 13.0025],
      mission: {
        ...mission,
        ScheduleDelta: -31,
      },
    }),
    undefined,
    {
      stopPhaseDelta: approaching.seconds,
      stopPhaseSource: approaching.source,
      displayStop: approaching.stop,
    },
  );
  assert.equal(directTelemetryView.deltaText, "−0:31");
  assert.equal(directTelemetryView.deltaSource, "telemetry");
}

{
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Ziel", "2026-08-18T16:52:00", {
      GeoLocation: [52, 13.002],
    }),
    NextStopIndex: 1,
    LastStopReached: stop("Start", "2026-08-18T16:50:00", {
      GeoLocation: [52, 13],
    }),
    LastStopReachedIndex: 0,
    Stops: [
      stop("Start", "2026-08-18T16:50:00", {
        GeoLocation: [52, 13],
      }),
      stop("Ziel", "2026-08-18T16:52:00", {
        GeoLocation: [52, 13.002],
      }),
    ],
  };
  const roadmapFeatures = [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [13, 52],
          [13.001, 52],
          [13.002, 52],
        ],
      },
    },
  ];
  const route = {
    Paths: [
      {
        PathLanes: [0],
      },
    ],
  };
  const first = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:20",
      playerLocation: [52, 13.001],
      mission,
    }),
    route,
    roadmapFeatures,
  );
  assert.equal(first.seconds, -20);
  assert.equal(first.rawSeconds, -20);

  const seeded = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:20",
      playerLocation: [52, 13.001],
      mission,
    }),
    route,
    roadmapFeatures,
    {},
    -45,
  );
  assert.equal(seeded.rawSeconds, -20);
  assert.equal(seeded.seconds, -45);

  const seededFollowUp = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:21",
      playerLocation: [52, 13.0015],
      mission,
    }),
    route,
    roadmapFeatures,
    seeded.state,
    -45,
  );
  assert.equal(seededFollowUp.rawSeconds, 9);
  assert.equal(seededFollowUp.seconds, -42);

  const second = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:21",
      playerLocation: [52, 13.0015],
      mission,
    }),
    route,
    roadmapFeatures,
    first.state,
  );
  assert.equal(second.rawSeconds, 9);
  assert.equal(second.seconds, -17);

  const stopped = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:22",
      playerLocation: [52, 13.0015],
      mission,
    }),
    route,
    roadmapFeatures,
    second.state,
  );
  assert.equal(stopped.rawSeconds, 8);
  assert.equal(stopped.seconds, -14);

  const afterLongGap = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:51:30",
      playerLocation: [52, 13.0015],
      mission,
    }),
    route,
    roadmapFeatures,
    first.state,
  );
  assert.equal(afterLongGap.rawSeconds, 0);
  assert.equal(afterLongGap.seconds, 0);

  const view = createViewModel(
    snapshot({
      worldTime: "2026-08-18T16:51:21",
      playerLocation: [52, 13.0015],
      mission,
    }),
    -45,
    { routeProgressDelta: second.seconds },
  );
  assert.equal(view.deltaText, "−0:17");
  assert.equal(view.deltaSource, "route-progress");
  assert.equal(view.status, "PÜNKTLICH");

  const directTelemetryView = createViewModel(
    snapshot({
      worldTime: "2026-08-18T16:51:21",
      playerLocation: [52, 13.0015],
      mission: {
        ...mission,
        ScheduleDelta: -31,
      },
    }),
    -45,
    { routeProgressDelta: second.seconds },
  );
  assert.equal(directTelemetryView.deltaText, "−0:31");
  assert.equal(directTelemetryView.deltaSource, "telemetry");
  assert.equal(directTelemetryView.status, "PÜNKTLICH");

  const atStopView = createViewModel(
    snapshot({
      worldTime: "2026-08-18T16:50:45",
      playerLocation: [52, 13],
      vehicle: { IsAtStop: true },
      mission,
    }),
    -45,
    { routeProgressDelta: second.seconds },
  );
  assert.equal(atStopView.deltaText, "−0:45");
  assert.equal(atStopView.deltaSource, "confirmed-stop-clock");

  const nextMission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Danach", "2026-08-18T16:54:00", {
      GeoLocation: [52, 13.004],
    }),
    NextStopIndex: 2,
    LastStopReached: stop("Ziel", "2026-08-18T16:52:00", {
      GeoLocation: [52, 13.002],
    }),
    LastStopReachedIndex: 1,
    Stops: [
      ...mission.Stops,
      stop("Danach", "2026-08-18T16:54:00", {
        GeoLocation: [52, 13.004],
      }),
    ],
  };
  const nextRoadmapFeatures = [
    ...roadmapFeatures,
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [13.002, 52],
          [13.003, 52],
          [13.004, 52],
        ],
      },
    },
  ];
  const nextSegment = calculateRouteProgressDelta(
    snapshot({
      worldTime: "2026-08-18T16:52:40",
      playerLocation: [52, 13.0025],
      mission: nextMission,
    }),
    {
      Paths: [
        {
          PathLanes: [1],
        },
      ],
    },
    nextRoadmapFeatures,
    second.state,
  );
  assert.equal(nextSegment.seconds, -10);
  assert.equal(nextSegment.rawSeconds, -10);
  assert.notEqual(nextSegment.state.segmentIdentity, second.state.segmentIdentity);
}

{
  const views = [];
  const client = new FullpanelTelemetryClient(
    (_snapshot, view) => views.push(view),
    () => {},
  );
  const passedStop = stop("Invalidenpark", "2026-08-18T17:40:00", {
    DepartureTime: "2026-08-18T17:41:00",
    GeoLocation: [52, 13.004],
  });
  const followingStop = stop("Robert-Koch-Platz", "2026-08-18T17:42:00", {
    DepartureTime: "2026-08-18T17:43:00",
    GeoLocation: [52, 13.006],
  });
  const staleMission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...passedStop },
    NextStopIndex: 1,
    LastStopReached: stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
      GeoLocation: [52, 13],
    }),
    LastStopReachedIndex: 0,
    Stops: [
      stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
        GeoLocation: [52, 13],
      }),
      { ...passedStop },
      { ...followingStop },
    ],
  };

  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:08",
    playerLocation: [52, 13.0025],
    vehicle: {
      Speed: 25,
      PassengerDoorsOpen: false,
    },
    mission: staleMission,
  }));
  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:09",
    playerLocation: [52, 13.004],
    vehicle: {
      Speed: 25,
      PassengerDoorsOpen: false,
    },
    mission: staleMission,
  }));
  assert.equal(views.at(-1).stopName, "Invalidenpark");
  assert.equal(views.at(-1).arrival, "17:40");
  assert.equal(views.at(-1).departure, "17:41");

  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:10",
    playerLocation: [52, 13.00445],
    vehicle: {
      Speed: 25,
      PassengerDoorsOpen: false,
    },
    mission: staleMission,
  }));
  assert.equal(views.at(-1).stopName, "Robert-Koch-Platz");
  assert.equal(views.at(-1).arrival, "17:42");
  assert.equal(views.at(-1).departure, "17:43");
  assert.equal(views.at(-1).deltaText, "+1:50");
  assert.equal(views.at(-1).deltaSource, "next-stop-arrival");

  // Selbst ein verspaetet nachgereichter CurrentStop des durchfahrenen Halts
  // darf den vollstaendigen Wechsel nicht mehr rueckgaengig machen.
  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:11",
    playerLocation: [52, 13.0044],
    vehicle: {
      Speed: 25,
      PassengerDoorsOpen: false,
    },
    mission: {
      ...staleMission,
      CurrentStop: { ...passedStop },
      CurrentStopIndex: 1,
    },
  }));
  assert.equal(views.at(-1).stopName, "Robert-Koch-Platz");
  assert.equal(views.at(-1).arrival, "17:42");
  assert.equal(views.at(-1).departure, "17:43");
}

{
  const views = [];
  const client = new FullpanelTelemetryClient(
    (_snapshot, view) => views.push(view),
    () => {},
  );
  const kruppStop = stop("Kruppstraße", "2026-08-18T16:50:00", {
    GeoLocation: [52, 13.004],
  });
  const followingStop = stop("Folgehalt", "2026-08-18T16:53:00", {
    GeoLocation: [52, 13.006],
  });
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...kruppStop },
    NextStopIndex: 0,
    LastStopReached: {},
    LastStopReachedIndex: -1,
    Stops: [
      { ...kruppStop },
      { ...followingStop },
    ],
  };

  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:12",
    playerLocation: [52, 13.0025],
    mission,
  }));
  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:13",
    playerLocation: [52, 13.0025],
    mission,
  }));

  assert.equal(views.at(-2).deltaText, "−1:12");
  assert.equal(views.at(-2).deltaSource, "next-stop-arrival");
  assert.equal(views.at(-1).deltaText, "−1:13");
  assert.equal(views.at(-1).deltaSource, "next-stop-arrival");

  const reachedMission = {
    ...mission,
    NextStop: { ...followingStop },
    NextStopIndex: 1,
    LastStopReached: { ...kruppStop },
    LastStopReachedIndex: 0,
  };
  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:14",
    playerLocation: [52, 13.004],
    mission: reachedMission,
  }));
  assert.equal(views.at(-1).deltaText, "−1:14");
  assert.equal(views.at(-1).deltaSource, "current-stop-departure");

  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:30",
    playerLocation: [52, 13.0044],
    mission: reachedMission,
  }));
  assert.equal(views.at(-1).deltaText, "−1:30");
  assert.equal(views.at(-1).deltaSource, "current-stop-departure");
}

{
  const views = [];
  const client = new FullpanelTelemetryClient(
    (_snapshot, view) => views.push(view),
    () => {},
  );
  const currentStop = stop("Invalidenpark", "2026-08-18T17:40:00", {
    DepartureTime: "2026-08-18T17:41:00",
    GeoLocation: [52, 13.004],
  });
  const followingStop = stop("Robert-Koch-Platz", "2026-08-18T17:42:00", {
    DepartureTime: "2026-08-18T17:43:00",
    GeoLocation: [52, 13.006],
  });
  const staleMission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: { ...currentStop },
    NextStopIndex: 1,
    LastStopReached: stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
      GeoLocation: [52, 13],
    }),
    LastStopReachedIndex: 0,
    Stops: [
      stop("S+U Hauptbahnhof", "2026-08-18T17:38:00", {
        GeoLocation: [52, 13],
      }),
      { ...currentStop },
      { ...followingStop },
    ],
  };

  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:09",
    playerLocation: [52, 13.004],
    vehicle: {
      Speed: 0,
      PassengerDoorsOpen: true,
    },
    mission: staleMission,
  }));
  assert.equal(views.at(-1).stopName, "Invalidenpark");
  assert.equal(views.at(-1).arrival, "17:42");
  assert.equal(views.at(-1).departure, "17:41");
  assert.equal(views.at(-1).deltaText, "+0:51");

  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:10",
    playerLocation: [52, 13.004],
    vehicle: {
      Speed: 0,
      PassengerDoorsOpen: false,
    },
    mission: staleMission,
  }));
  assert.equal(views.at(-1).stopName, "Invalidenpark");
  assert.equal(views.at(-1).arrival, "17:42");
  assert.equal(views.at(-1).departure, "17:41");

  // Selbst bei noch unveraenderter Mission schaltet die Ausfahrt alle
  // Referenzen gemeinsam auf den Folgehalt.
  client.publish(snapshot({
    worldTime: "2026-08-18T17:40:10",
    playerLocation: [52, 13.00445],
    vehicle: {
      Speed: 5,
      PassengerDoorsOpen: false,
    },
    mission: staleMission,
  }));
  assert.equal(views.at(-1).stopName, "Robert-Koch-Platz");
  assert.equal(views.at(-1).arrival, "17:42");
  assert.equal(views.at(-1).departure, "17:43");
  assert.equal(views.at(-1).deltaText, "+1:50");
  assert.equal(views.at(-1).deltaSource, "next-stop-arrival");
}

{
  const views = [];
  const client = new FullpanelTelemetryClient(
    (_snapshot, view) => views.push(view),
    () => {},
  );
  client.roadmapFeatures = [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [13, 52],
          [13.001, 52],
          [13.002, 52],
        ],
      },
    },
  ];
  client.lastRoute = {
    Paths: [
      {
        PathLanes: [0],
      },
    ],
  };
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Ziel", "2026-08-18T16:52:00", {
      GeoLocation: [52, 13.002],
    }),
    NextStopIndex: 1,
    LastStopReached: stop("Start", "2026-08-18T16:50:00", {
      GeoLocation: [52, 13],
    }),
    LastStopReachedIndex: 0,
    Stops: [
      stop("Start", "2026-08-18T16:50:00", {
        GeoLocation: [52, 13],
      }),
      stop("Ziel", "2026-08-18T16:52:00", {
        GeoLocation: [52, 13.002],
      }),
    ],
  };

  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:20",
    playerLocation: [52, 13.001],
    mission,
  }));
  client.publish(snapshot({
    worldTime: "2026-08-18T16:51:21",
    playerLocation: [52, 13.0015],
    mission,
  }));

  assert.equal(views.at(-2).deltaText, "+0:40");
  assert.equal(views.at(-2).deltaSource, "next-stop-arrival");
  assert.equal(views.at(-1).deltaText, "+0:39");
  assert.equal(views.at(-1).deltaSource, "next-stop-arrival");
}

{
  for (const [speed, allowedSpeed, expectedSpeed, expectedOver, expectedLevel] of [
    [50, 50, 50, 0, "normal"],
    [51, 50, 51, 1, "warning"],
    [54, 50, 54, 4, "warning"],
    [55, 50, 55, 5, "critical"],
    [54.6, 50, 55, 5, "critical"],
    [65, 0, 65, 0, "normal"],
    [65, undefined, 65, 0, "normal"],
  ]) {
    const view = createViewModel(snapshot({
      vehicle: {
        Speed: speed,
        ...(allowedSpeed === undefined ? {} : { AllowedSpeed: allowedSpeed }),
      },
      mission: {},
    }));
    assert.equal(view.speed, expectedSpeed);
    assert.equal(view.speedOverLimit, expectedOver);
    assert.equal(view.speedLevel, expectedLevel);
  }
}

{
  assert.deepEqual(FULLPANEL_POLL_INTERVALS, {
    vehicleMs: 100,
    coreMs: 500,
  });

  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const fakeTimer = { type: "fullpanel-test-timer" };
  let timerDelay;
  let clearedTimer;
  let immediatePolls = 0;
  try {
    globalThis.setInterval = (_callback, delay) => {
      timerDelay = delay;
      return fakeTimer;
    };
    globalThis.clearInterval = (timer) => {
      clearedTimer = timer;
    };
    const timerClient = new FullpanelTelemetryClient(() => {}, () => {});
    timerClient.poll = () => {
      immediatePolls += 1;
    };
    timerClient.start();
    assert.equal(immediatePolls, 1);
    assert.equal(timerDelay, FULLPANEL_POLL_INTERVALS.vehicleMs);
    timerClient.stop();
    assert.equal(clearedTimer, fakeTimer);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }

  const requestedPaths = [];
  const views = [];
  const warnings = [];
  const speeds = [10, 11, 12];
  const mission = {
    CurrentStop: {},
    CurrentStopIndex: -1,
    NextStop: stop("Testhalt", "2026-08-18T17:42:00", {
      GeoLocation: [52, 13.002],
    }),
    NextStopIndex: 0,
    Stops: [
      stop("Testhalt", "2026-08-18T17:42:00", {
        GeoLocation: [52, 13.002],
      }),
    ],
  };
  const client = new FullpanelTelemetryClient(
    (_snapshot, view) => views.push(view),
    (message) => warnings.push(message),
  );
  client.request = async (path) => {
    requestedPaths.push(path);
    if (path === "/player") {
      return {
        Mode: "Vehicle",
        CurrentVehicle: "BP_TestBus_C_0",
        GeoLocation: [52, 13],
      };
    }
    if (path === "/world") return { DateTime: "2026-08-18T17:40:00" };
    if (path === "/mission") return mission;
    if (path === "/vehicles/BP_TestBus_C_0") {
      return {
        Speed: speeds.shift(),
        AllowedSpeed: 50,
      };
    }
    throw new Error(`Unerwarteter Testpfad: ${path}`);
  };

  // Der erste Zyklus befuellt alle Caches.
  await client.poll();
  assert.deepEqual(requestedPaths, [
    "/player",
    "/world",
    "/vehicles/BP_TestBus_C_0",
    "/mission",
  ]);
  assert.equal(views.at(-1).speed, 10);

  // Innerhalb des 500-ms-Kernintervalls wird ausschliesslich das Fahrzeug
  // erneut gelesen. Die geaenderte Geschwindigkeit erreicht sofort das ViewModel.
  requestedPaths.length = 0;
  await client.poll();
  assert.deepEqual(requestedPaths, ["/vehicles/BP_TestBus_C_0"]);
  assert.equal(views.at(-1).speed, 11);

  // Nach Ablauf des Kernintervalls werden Player, Welt und Mission wieder
  // gemeinsam aktualisiert, waehrend der schnelle Fahrzeugtakt erhalten bleibt.
  client.lastCorePollAt = Date.now() - FULLPANEL_POLL_INTERVALS.coreMs;
  requestedPaths.length = 0;
  await client.poll();
  assert.deepEqual(requestedPaths, [
    "/player",
    "/world",
    "/vehicles/BP_TestBus_C_0",
    "/mission",
  ]);
  assert.equal(views.at(-1).speed, 12);
  assert.deepEqual(warnings, []);
}

console.log("telemetry-delta: all tests passed");
