import { RefreshRegistry } from "./refresh-registry";
import { readKneelingState } from "./kneeling";
import {
  readAutomaticKneelingState,
  readIgnitionState
} from "./vehicle-controls";

export type PluginRuntimeState =
  | "offline"
  | "no-bus"
  | "bus-not-ready"
  | "bus-ready"
  | "mission-ready";

export type VehicleButton = {
  Name?: string;
  Tooltip?: string;
  State?: unknown;
  Value?: unknown;
  Actions?: string[];
  States?: string[];
};

export type DoorTelemetry = {
  Name?: string;
  Open?: unknown;
  Progress?: unknown;
  StopRequest?: unknown;
};

export type WheelTelemetry = {
  Location?: {
    X?: unknown;
    Y?: unknown;
    Z?: unknown;
  };
};

export type PlayerTelemetry = {
  Mode?: string;
  CurrentVehicle?: string;
  GeoLocation?: [number, number];
  Rotation?: {
    Pitch?: unknown;
    Yaw?: unknown;
    Roll?: unknown;
  };
};

export type MissionStop = {
  StopName?: string;
  GroupName?: string;
  ArrivalTime?: string;
  DepartureTime?: string;
  BoardingPeopleCount?: number;
  DeboardingPeopleCount?: number;
  GeoLocation?: [number, number] | {
    X?: unknown;
    Y?: unknown;
  };
};

export type MissionTelemetry = {
  MissionClassName?: string;
  CurrentStop?: MissionStop;
  CurrentStopIndex?: number;
  NextStop?: MissionStop;
  NextStopIndex?: number;
  LastStopReached?: MissionStop;
  LastStopReachedIndex?: number;
  StartStopReached?: unknown;
  DestinationStopReached?: unknown;
  Stops?: MissionStop[];
  PassengersAtCurrentStopCount?: number;
  CurrentCheckedPassengers?: number;
  IsInCheckInMode?: unknown;
  Statistics?: unknown;
};

export type VehicleTelemetry = {
  Speed?: unknown;
  Powermeter?: unknown;
  CurrentFuel?: unknown;
  MaxFuel?: unknown;
  DisplayFuel?: unknown;
  VehicleModel?: unknown;
  AllowedSpeed?: unknown;
  FixingBrake?: unknown;
  IgnitionEnabled?: unknown;
  EngineStarted?: unknown;
  Gearbox?: {
    CurrentSelector?: unknown;
  };
  Buttons?: VehicleButton[] | Record<string, VehicleButton>;
  AllLamps?: Record<string, unknown>;
  doors?: DoorTelemetry[];
  Wheels?: WheelTelemetry[];
  [key: string]: unknown;
};

export type WorldTelemetry = Record<string, unknown>;

export type RouteTelemetry = {
  PathLanes?: unknown[];
  Paths?: Array<{ Color?: unknown; PathLanes?: unknown[] }>;
  [key: string]: unknown;
};

export type RoadmapTelemetry = {
  features?: unknown[];
  [key: string]: unknown;
};

export type TelemetrySnapshot = {
  connected: boolean;
  online?: boolean;
  runtimeState?: PluginRuntimeState;
  busContextSince?: number;
  vehicleReady?: boolean;
  missionReady?: boolean;
  vehicleReadyForAutoKneeling?: boolean;
  player?: PlayerTelemetry;
  vehicleId?: string;
  vehicle?: VehicleTelemetry;
  mission?: MissionTelemetry;
  world?: WorldTelemetry;
  route?: RouteTelemetry;
  roadmap?: RoadmapTelemetry;
  updatedAt?: number;
  playerUpdatedAt?: number;
  vehicleUpdatedAt?: number;
  missionUpdatedAt?: number;
  worldUpdatedAt?: number;
  routeUpdatedAt?: number;
  roadmapUpdatedAt?: number;
};

type Listener = (snapshot: TelemetrySnapshot) => void;
type EventMode = "push" | "press" | "release";

const BASE_URL = "http://127.0.0.1:37337";
const POLL_TICK_MS = 100;
const PLAYER_POLL_INTERVAL_MS = 250;
const VEHICLE_POLL_INTERVAL_MS = 100;
const MISSION_POLL_INTERVAL_MS = 500;
const WORLD_POLL_INTERVAL_MS = 500;
const POLL_REQUEST_TIMEOUT_MS = 1500;
const EVENT_REQUEST_TIMEOUT_MS = 2500;
const OFFLINE_ENTER_GRACE_MS = 1800;
const ONLINE_RECOVERY_SAMPLES = 2;
const ROUTE_POLL_INTERVAL_MS = 500;
const ROUTE_REQUEST_TIMEOUT_MS = 1500;
const ROUTE_EMPTY_CONFIRMATION_SAMPLES = 3;
const ROUTE_EMPTY_CONFIRMATION_MS = 1000;
const ROADMAP_REQUEST_TIMEOUT_MS = 12000;
const ROADMAP_RETRY_MS = 10000;
const AUTO_KNEELING_READY_DELAY_MS = 5000;
const TELEMETRY_REFRESH_TARGET = "telemetry";
const TELEMETRY_REFRESH_DELAYS_MS = [100, 450, 1000] as const;

export function deriveVehicleReadyState(
  vehicle: VehicleTelemetry | undefined,
  mission: MissionTelemetry | undefined,
  busContextAgeMs: number
): Pick<
  TelemetrySnapshot,
  | "runtimeState"
  | "vehicleReady"
  | "missionReady"
  | "vehicleReadyForAutoKneeling"
> {
  const buttons = vehicle?.Buttons;
  const buttonsAvailable = Array.isArray(buttons)
    ? buttons.length > 0
    : Boolean(buttons && typeof buttons === "object");
  const speedAvailable = Number.isFinite(Number(vehicle?.Speed));
  const ignitionState = readIgnitionState(vehicle);
  const vehicleReady = Boolean(
    vehicle
    && buttonsAvailable
    && speedAvailable
    && ignitionState !== undefined
  );
  const missionReady = Boolean(
    vehicleReady
    && mission
    && (Boolean(mission.MissionClassName) || Array.isArray(mission.Stops))
  );
  const vehicleReadyForAutoKneeling = Boolean(
    vehicleReady
    && ignitionState === "engine"
    && readKneelingState(vehicle) !== undefined
    && readAutomaticKneelingState(vehicle) !== undefined
    && busContextAgeMs >= AUTO_KNEELING_READY_DELAY_MS
  );

  return {
    runtimeState: missionReady
      ? "mission-ready"
      : vehicleReady
        ? "bus-ready"
        : "bus-not-ready",
    vehicleReady,
    missionReady,
    vehicleReadyForAutoKneeling
  };
}

function routeLaneValues(route: RouteTelemetry | undefined): unknown[][] {
  if (!route || typeof route !== "object") return [];
  const candidates: unknown[][] = [];
  if (Array.isArray(route.PathLanes)) candidates.push(route.PathLanes);
  if (Array.isArray(route.Paths)) {
    for (const path of route.Paths) {
      if (Array.isArray(path?.PathLanes)) candidates.push(path.PathLanes);
    }
  }
  return candidates;
}

/**
 * Ein Routen-Snapshot ist erst dann belastbar, wenn mindestens eine echte
 * Lane-ID enthalten ist. Leere Erfolgsantworten des optionalen Route-Endpunkts
 * duerfen einen zuvor bestaetigten Linienzug nicht sofort verdraengen.
 */
export function hasUsableRouteTelemetry(
  route: RouteTelemetry | undefined
): boolean {
  return routeLaneValues(route).some((values) => values.some((value) => {
    const lane = Number(value);
    return Number.isFinite(lane) && lane >= 0;
  }));
}

export type StabilizedRouteTelemetry = {
  route?: RouteTelemetry;
  updatedAt?: number;
};

/**
 * Haelt einen bestaetigten Routenstand durch einzelne leere API-Snapshots.
 * Ein echter Routenverlust wird weiterhin uebernommen, aber erst nach drei
 * zusammenhaengenden leeren Antworten ueber mindestens eine Sekunde.
 */
export class RouteTelemetryStabilizer {
  private vehicleId: string | undefined;
  private route: RouteTelemetry | undefined;
  private updatedAt: number | undefined;
  private emptySince: number | undefined;
  private emptySamples = 0;

  reset(vehicleId?: string): void {
    this.vehicleId = vehicleId;
    this.route = undefined;
    this.updatedAt = undefined;
    this.emptySince = undefined;
    this.emptySamples = 0;
  }

  update(
    vehicleId: string,
    sample: RouteTelemetry,
    now = Date.now()
  ): StabilizedRouteTelemetry {
    if (vehicleId !== this.vehicleId) this.reset(vehicleId);

    if (hasUsableRouteTelemetry(sample)) {
      this.route = sample;
      this.updatedAt = now;
      this.emptySince = undefined;
      this.emptySamples = 0;
      return this.value;
    }

    if (!hasUsableRouteTelemetry(this.route)) {
      this.route = sample;
      this.updatedAt = now;
      this.emptySince = undefined;
      this.emptySamples = 0;
      return this.value;
    }

    if (this.emptySince === undefined) {
      this.emptySince = now;
      this.emptySamples = 1;
    } else {
      this.emptySamples += 1;
    }

    if (
      this.emptySamples >= ROUTE_EMPTY_CONFIRMATION_SAMPLES
      && now - this.emptySince >= ROUTE_EMPTY_CONFIRMATION_MS
    ) {
      this.route = sample;
      this.updatedAt = now;
      this.emptySince = undefined;
      this.emptySamples = 0;
    }

    return this.value;
  }

  get value(): StabilizedRouteTelemetry {
    return { route: this.route, updatedAt: this.updatedAt };
  }
}

/**
 * Zentrale Datenquelle fuer das gesamte Plugin.
 *
 * - genau ein Polling-Loop fuer Player, Fahrzeug, Mission und Weltzeit
 * - gemeinsamer Snapshot/Cache fuer alle Actions
 * - Fahrzeug-ID wird immer dynamisch aus /player gelesen
 * - Mission ist optional und darf den Fahrzeugstatus nicht auf Offline setzen
 * - Icons/Aktionen lesen ausschliesslich bestaetigte Telemetriezustaende
 */
export class TelemetryClient {
  private static readonly singleton = new TelemetryClient();

  static get instance(): TelemetryClient {
    return this.singleton;
  }

  private readonly listeners = new Set<Listener>();
  private readonly refreshRegistry = RefreshRegistry.instance;
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  private lastPlayerPollAt = 0;
  private lastVehiclePollAt = 0;
  private lastMissionPollAt = 0;
  private lastWorldPollAt = 0;
  private lastRoutePollAt = 0;
  private lastSuccessfulPlayerPollAt = 0;
  private onlineRecoverySamples = 0;
  private navigationConsumers = 0;
  private routeValue: RouteTelemetry | undefined;
  private routeUpdatedAtValue: number | undefined;
  private routeVehicleId: string | undefined;
  private readonly routeStabilizer = new RouteTelemetryStabilizer();
  private routePromise: Promise<void> | undefined;
  private roadmapValue: RoadmapTelemetry | undefined;
  private roadmapUpdatedAt: number | undefined;
  private roadmapPromise: Promise<void> | undefined;
  private roadmapRetryAt = 0;
  private busContextVehicleId: string | undefined;
  private busContextSince: number | undefined;
  private current: TelemetrySnapshot = {
    connected: false,
    online: false,
    runtimeState: "offline"
  };

  private constructor() {
    this.refreshRegistry.register({
      id: TELEMETRY_REFRESH_TARGET,
      delaysMs: TELEMETRY_REFRESH_DELAYS_MS,
      refresh: () => this.poll(true)
    });
  }

  get snapshot(): TelemetrySnapshot {
    return this.current;
  }

  get currentStop(): MissionStop | undefined {
    return this.current.mission?.CurrentStop;
  }

  get nextStop(): MissionStop | undefined {
    return this.current.mission?.NextStop;
  }

  get lastStopReached(): MissionStop | undefined {
    return this.current.mission?.LastStopReached;
  }

  /** Aktiviert die getrennten Route-/Roadmap-Abfragen nur bei Bedarf. */
  acquireRouteGuidanceData(): () => void {
    this.navigationConsumers += 1;
    this.lastRoutePollAt = 0;
    let active = true;

    return () => {
      if (!active) {
        return;
      }

      active = false;
      this.navigationConsumers = Math.max(0, this.navigationConsumers - 1);
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    this.start();

    return () => {
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  getButton(
    vehicle: VehicleTelemetry | undefined,
    name: string
  ): VehicleButton | undefined {
    const buttons = vehicle?.Buttons;

    if (Array.isArray(buttons)) {
      return buttons.find((button) => button?.Name === name);
    }

    if (buttons && typeof buttons === "object") {
      return buttons[name];
    }

    return undefined;
  }

  lamp(vehicle: VehicleTelemetry | undefined, name: string): number {
    return Number(vehicle?.AllLamps?.[name] ?? 0);
  }

  toBoolean(value: unknown): boolean {
    return value === true
      || value === 1
      || String(value).toLowerCase() === "true";
  }

  sendEventDetached(eventName: string, mode: EventMode = "push"): boolean {
    const vehicleId = this.current.vehicleId;

    if (!vehicleId) {
      return false;
    }

    this.sendEventForVehicleDetached(vehicleId, eventName, mode);
    return true;
  }

  sendEventForVehicleDetached(
    vehicleId: string,
    eventName: string,
    mode: EventMode = "push"
  ): void {
    const path = this.eventPath(vehicleId, eventName, mode);
    void this.requestWithoutTimeout(path);
  }

  async sendEvent(
    eventName: string,
    mode: EventMode = "push"
  ): Promise<boolean> {
    const vehicleId = this.current.vehicleId;

    if (!vehicleId) {
      return false;
    }

    return this.request(
      this.eventPath(vehicleId, eventName, mode),
      EVENT_REQUEST_TIMEOUT_MS
    );
  }

  /**
   * Fordert gebuendelte Kontrollabrufe an, ohne den bestaetigten Zustand lokal
   * zu aendern. Wiederholte Anforderungen teilen sich die zentralen
   * 100-/450-/1000-ms-Zeitstufen der RefreshRegistry.
   */
  refreshSoon(): void {
    this.refreshRegistry.request(TELEMETRY_REFRESH_TARGET);
  }

  private eventPath(
    vehicleId: string,
    eventName: string,
    mode: EventMode
  ): string {
    const endpoint = mode === "press"
      ? "sendeventpress"
      : mode === "release"
        ? "sendeventrelease"
        : "sendevent";

    return `vehicles/${encodeURIComponent(vehicleId)}/${endpoint}`
      + `?event=${encodeURIComponent(eventName)}`;
  }

  private start(): void {
    if (this.timer) {
      return;
    }

    void this.poll(true);
    this.timer = setInterval(() => void this.poll(), POLL_TICK_MS);
  }

  private stop(): void {
    this.refreshRegistry.cancel(TELEMETRY_REFRESH_TARGET);

    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async poll(force = false): Promise<void> {
    if (this.polling) {
      return;
    }

    this.polling = true;

    try {
      const now = Date.now();
      let player = this.current.player;
      let playerUpdatedAt = this.current.playerUpdatedAt;

      if (force || !player || now - this.lastPlayerPollAt >= PLAYER_POLL_INTERVAL_MS) {
        this.lastPlayerPollAt = now;
        player = await this.fetchJson<PlayerTelemetry>(
          `${BASE_URL}/player`,
          POLL_REQUEST_TIMEOUT_MS
        );
        playerUpdatedAt = Date.now();
        this.lastSuccessfulPlayerPollAt = playerUpdatedAt;
        this.onlineRecoverySamples = Math.min(
          ONLINE_RECOVERY_SAMPLES,
          this.onlineRecoverySamples + 1
        );

        // OFFLINE wird erst nach zwei aufeinanderfolgenden aktuellen
        // Player-Antworten verlassen. Dadurch springt die gesamte UI beim
        // Starten/Beenden des Spiels nicht zwischen OFFLINE und NO_BUS.
        if (
          this.current.runtimeState === "offline"
          && this.onlineRecoverySamples < ONLINE_RECOVERY_SAMPLES
        ) {
          return;
        }
      }

      let world = this.current.world;
      let worldUpdatedAt = this.current.worldUpdatedAt;

      if (force || !world || now - this.lastWorldPollAt >= WORLD_POLL_INTERVAL_MS) {
        this.lastWorldPollAt = now;

        try {
          world = await this.fetchJson<WorldTelemetry>(
            `${BASE_URL}/world`,
            POLL_REQUEST_TIMEOUT_MS
          );
          worldUpdatedAt = Date.now();
        } catch {
          // Weltzeit ist fuer Fahrzeugfunktionen optional. Der letzte
          // bestaetigte Wert darf fuer Fahrplananzeigen erhalten bleiben.
        }
      }

      const vehicleId = player?.Mode === "Vehicle"
        ? player.CurrentVehicle
        : undefined;

      if (!vehicleId) {
        this.resetBusContext();
        this.lastVehiclePollAt = 0;
        this.lastMissionPollAt = 0;
        this.lastRoutePollAt = 0;
        this.routeValue = undefined;
        this.routeUpdatedAtValue = undefined;
        this.routeVehicleId = undefined;
        this.routeStabilizer.reset();
        this.publish({
          connected: false,
          online: true,
          runtimeState: "no-bus",
          vehicleReady: false,
          missionReady: false,
          vehicleReadyForAutoKneeling: false,
          player,
          world,
          roadmap: this.roadmapValue,
          playerUpdatedAt,
          worldUpdatedAt,
          roadmapUpdatedAt: this.roadmapUpdatedAt,
          updatedAt: Date.now()
        });
        return;
      }

      let vehicle = vehicleId === this.current.vehicleId
        ? this.current.vehicle
        : undefined;
      let vehicleUpdatedAt = vehicleId === this.current.vehicleId
        ? this.current.vehicleUpdatedAt
        : undefined;

      if (force || !vehicle || now - this.lastVehiclePollAt >= VEHICLE_POLL_INTERVAL_MS) {
        this.lastVehiclePollAt = now;
        vehicle = await this.fetchJson<VehicleTelemetry>(
          `${BASE_URL}/vehicles/${encodeURIComponent(vehicleId)}`,
          POLL_REQUEST_TIMEOUT_MS
        );
        vehicleUpdatedAt = Date.now();
      }

      let mission = vehicleId === this.current.vehicleId
        ? this.current.mission
        : undefined;
      let missionUpdatedAt = vehicleId === this.current.vehicleId
        ? this.current.missionUpdatedAt
        : undefined;

      if (force || !mission || now - this.lastMissionPollAt >= MISSION_POLL_INTERVAL_MS) {
        this.lastMissionPollAt = now;

        try {
          mission = await this.fetchJson<MissionTelemetry>(
            `${BASE_URL}/mission`,
            POLL_REQUEST_TIMEOUT_MS
          );
          missionUpdatedAt = Date.now();
        } catch {
          // Freie Fahrt oder Missionswechsel: Fahrzeugtelemetrie bleibt gueltig.
        }
      }

      if (this.routeVehicleId !== vehicleId) {
        this.routeVehicleId = vehicleId;
        this.routeValue = undefined;
        this.routeUpdatedAtValue = undefined;
        this.routeStabilizer.reset(vehicleId);
        this.lastRoutePollAt = 0;
      }

      if (
        this.navigationConsumers > 0
        && (
          force
          || this.lastRoutePollAt === 0
          || now - this.lastRoutePollAt >= ROUTE_POLL_INTERVAL_MS
        )
      ) {
        this.lastRoutePollAt = now;
        this.pollRoute(vehicleId);
      }

      const route = this.routeVehicleId === vehicleId
        ? this.routeValue
        : undefined;
      const routeUpdatedAt = this.routeVehicleId === vehicleId
        ? this.routeUpdatedAtValue
        : undefined;
      const runtime = this.deriveVehicleRuntime(vehicleId, vehicle, mission);

      this.publish({
        connected: Boolean(vehicle),
        online: true,
        ...runtime,
        player,
        vehicleId,
        vehicle,
        mission,
        world,
        route,
        roadmap: this.roadmapValue,
        playerUpdatedAt,
        vehicleUpdatedAt,
        missionUpdatedAt,
        worldUpdatedAt,
        routeUpdatedAt,
        roadmapUpdatedAt: this.roadmapUpdatedAt,
        updatedAt: Date.now()
      });
    } catch {
      this.onlineRecoverySamples = 0;
      const lastCoreSuccessAge = this.lastSuccessfulPlayerPollAt > 0
        ? Date.now() - this.lastSuccessfulPlayerPollAt
        : Number.POSITIVE_INFINITY;

      // Ein einzelner kurzer Aussetzer behaelt den letzten bestaetigten
      // Zustand unsichtbar bei. Erst eine veraltete Player-Verbindung setzt
      // zentral OFFLINE und invalidiert alle Fahrzeug-/Missionswerte.
      if (lastCoreSuccessAge >= OFFLINE_ENTER_GRACE_MS) {
        this.resetBusContext();
        this.routeValue = undefined;
        this.routeUpdatedAtValue = undefined;
        this.routeVehicleId = undefined;
        this.routeStabilizer.reset();
        this.publish({
          connected: false,
          online: false,
          runtimeState: "offline",
          vehicleReady: false,
          missionReady: false,
          vehicleReadyForAutoKneeling: false,
          world: this.current.world,
          roadmap: this.roadmapValue,
          worldUpdatedAt: this.current.worldUpdatedAt,
          roadmapUpdatedAt: this.roadmapUpdatedAt,
          updatedAt: Date.now()
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private deriveVehicleRuntime(
    vehicleId: string,
    vehicle: VehicleTelemetry | undefined,
    mission: MissionTelemetry | undefined
  ): Pick<
    TelemetrySnapshot,
    | "runtimeState"
    | "busContextSince"
    | "vehicleReady"
    | "missionReady"
    | "vehicleReadyForAutoKneeling"
  > {
    const now = Date.now();

    if (vehicleId !== this.busContextVehicleId) {
      this.busContextVehicleId = vehicleId;
      this.busContextSince = now;
    }

    const contextAge = this.busContextSince === undefined
      ? 0
      : now - this.busContextSince;
    const ready = deriveVehicleReadyState(vehicle, mission, contextAge);

    return {
      ...ready,
      busContextSince: this.busContextSince,
    };
  }

  private resetBusContext(): void {
    this.busContextVehicleId = undefined;
    this.busContextSince = undefined;
  }

  private publish(snapshot: TelemetrySnapshot): void {
    this.current = snapshot;

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private ensureRoadmap(): void {
    if (
      this.roadmapValue
      || this.roadmapPromise
      || Date.now() < this.roadmapRetryAt
    ) {
      return;
    }

    this.roadmapPromise = this.fetchJson<RoadmapTelemetry>(
      `${BASE_URL}/GeoJsonRoadmap`,
      ROADMAP_REQUEST_TIMEOUT_MS
    ).then((roadmap) => {
      if (!Array.isArray(roadmap.features) || roadmap.features.length === 0) {
        throw new Error("GeoJsonRoadmap enthaelt keine Fahrspuren.");
      }

      this.roadmapValue = roadmap;
      this.roadmapUpdatedAt = Date.now();
    }).catch(() => {
      this.roadmapRetryAt = Date.now() + ROADMAP_RETRY_MS;
    }).finally(() => {
      this.roadmapPromise = undefined;
    });
  }

  private pollRoute(vehicleId: string): void {
    if (this.routePromise) {
      return;
    }

    this.routePromise = this.fetchJson<RouteTelemetry>(
      `${BASE_URL}/routelaneids`,
      ROUTE_REQUEST_TIMEOUT_MS
    ).then((route) => {
      if (this.routeVehicleId !== vehicleId) {
        return;
      }

      const stabilized = this.routeStabilizer.update(
        vehicleId,
        route,
        Date.now()
      );
      this.routeValue = stabilized.route;
      this.routeUpdatedAtValue = stabilized.updatedAt;
      if (hasUsableRouteTelemetry(stabilized.route)) this.ensureRoadmap();
    }).catch(() => {
      // Routendaten sind optional und beeinflussen den Fahrzeugpoller nicht.
    }).finally(() => {
      this.routePromise = undefined;
    });
  }

  private async fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(path: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${BASE_URL}/${path}`, {
        method: "GET",
        signal: controller.signal
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestWithoutTimeout(path: string): Promise<void> {
    try {
      await fetch(`${BASE_URL}/${path}`, { method: "GET" });
    } catch {
      // Nicht kritisch: Die Anzeige bleibt an bestaetigte Telemetrie gebunden.
    }
  }
}
