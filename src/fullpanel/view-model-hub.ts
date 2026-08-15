import streamDeck from "@elgato/streamdeck";
import {
  TelemetryClient,
  TelemetrySnapshot
} from "../core/telemetry";
import { KneelingMotionTracker } from "../core/kneeling";
import { readAutomaticKneelingState } from "../core/vehicle-controls";
import {
  calculateStopPhaseDelta,
  createViewModel,
  missionIdentity,
  reachedStopIdentity
} from "./view-model";
import { FullpanelViewModel } from "./types";

type ViewModelListener = (
  snapshot: TelemetrySnapshot,
  viewModel: FullpanelViewModel
) => void;

type StopPhaseState = Record<string, unknown>;

/**
 * Gemeinsame Fahrplan-Auswertung fuer Fullpanel, Einzelpanel und Tasten.
 *
 * Die Actions starten keinen zweiten HTTP-Client. Dieser Hub abonniert den
 * vorhandenen zentralen TelemetryClient und legt lediglich die getestete
 * Haltestellen-, Mitternachts- und Delta-Logik als gemeinsames ViewModel darueber.
 */
export class FullpanelViewModelHub {
  private static readonly singleton = new FullpanelViewModelHub();

  static get instance(): FullpanelViewModelHub {
    return this.singleton;
  }

  private readonly telemetry = TelemetryClient.instance;
  private readonly listeners = new Set<ViewModelListener>();
  private unsubscribeTelemetry: (() => void) | undefined;
  private snapshotValue: TelemetrySnapshot = {
    connected: false,
    online: false
  };
  private viewModelValue = createViewModel({
    connected: false,
    online: false
  }, undefined) as FullpanelViewModel;
  private stopPhaseState: StopPhaseState = {};
  private lastDelta: number | undefined;
  private lastMissionIdentity = "";
  private lastReachedStopIdentity = "";
  private reachedStopTrackingInitialized = false;
  private readonly kneelingMotion = new KneelingMotionTracker();
  private trackedVehicleId: string | undefined;

  private constructor() {}

  get snapshot(): TelemetrySnapshot {
    return this.snapshotValue;
  }

  get viewModel(): FullpanelViewModel {
    return this.viewModelValue;
  }

  subscribe(listener: ViewModelListener): () => void {
    this.listeners.add(listener);

    if (!this.unsubscribeTelemetry) {
      this.unsubscribeTelemetry = this.telemetry.subscribe((snapshot) => {
        this.publish(snapshot);
      });
    } else {
      listener(this.snapshotValue, this.viewModelValue);
    }

    let active = true;
    return () => {
      if (!active) {
        return;
      }

      active = false;
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.unsubscribeTelemetry?.();
        this.unsubscribeTelemetry = undefined;
      }
    };
  }

  dispose(): void {
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.listeners.clear();
    this.kneelingMotion.stop();
    this.trackedVehicleId = undefined;
    this.resetScheduleState();
  }

  private publish(snapshot: TelemetrySnapshot): void {
    try {
      const currentMissionIdentity = missionIdentity(snapshot.mission) as string;
      const currentReachedStopIdentity = reachedStopIdentity(snapshot.mission) as string;
      let stopReachedChanged = false;

      if (currentMissionIdentity !== this.lastMissionIdentity) {
        this.lastMissionIdentity = currentMissionIdentity;
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
      }

      const stopPhase = calculateStopPhaseDelta(
        snapshot,
        this.stopPhaseState,
        { stopReachedChanged }
      ) as {
        seconds?: number;
        source?: string;
        stop?: unknown;
        arrivalStop?: unknown;
        departureStop?: unknown;
        state?: StopPhaseState;
      };
      this.stopPhaseState = stopPhase.state ?? {};

      const connected = snapshot.connected === true || snapshot.online === true;
      const vehicleId = connected
        ? snapshot.vehicleId ?? snapshot.player?.CurrentVehicle
        : undefined;
      let autoKneeling: boolean | undefined;
      let mechanicalKneeling: boolean | undefined;
      let kneelingTargetLowered: boolean | undefined;

      if (!connected || !vehicleId || !snapshot.vehicle) {
        this.kneelingMotion.stop();
        this.trackedVehicleId = undefined;
      } else {
        if (vehicleId !== this.trackedVehicleId) {
          this.kneelingMotion.stop();
          this.trackedVehicleId = vehicleId;
        }

        autoKneeling = readAutomaticKneelingState(snapshot.vehicle);
        this.kneelingMotion.observe(
          snapshot.vehicle,
          autoKneeling === true
        );
        mechanicalKneeling = this.kneelingMotion.readMechanicalState(
          snapshot.vehicle,
          autoKneeling === true
        );
        kneelingTargetLowered = this.kneelingMotion.target;
      }

      const viewModel = createViewModel(snapshot, this.lastDelta, {
        stopReachedChanged,
        stopPhaseDelta: stopPhase.seconds,
        stopPhaseSource: stopPhase.source,
        displayStop: stopPhase.stop,
        arrivalStop: stopPhase.arrivalStop,
        departureStop: stopPhase.departureStop,
        autoKneeling,
        mechanicalKneeling,
        kneelingTargetLowered
      }) as FullpanelViewModel;

      if (
        viewModel.deltaSeconds !== undefined
        && viewModel.deltaSource !== "cached"
        && viewModel.deltaSource !== "overdue-stop-clock"
      ) {
        this.lastDelta = viewModel.deltaSeconds;
      }

      this.snapshotValue = snapshot;
      this.viewModelValue = viewModel;

      for (const listener of [...this.listeners]) {
        try {
          listener(snapshot, viewModel);
        } catch (error) {
          streamDeck.logger.warn(
            "[FullpanelViewModelHub] Anzeige konnte nicht aktualisiert werden.",
            error
          );
        }
      }
    } catch (error) {
      streamDeck.logger.error(
        "[FullpanelViewModelHub] Fahrplan-ViewModel konnte nicht ausgewertet werden.",
        error
      );
    }
  }

  private resetScheduleState(): void {
    this.stopPhaseState = {};
    this.lastDelta = undefined;
    this.lastMissionIdentity = "";
    this.lastReachedStopIdentity = "";
    this.reachedStopTrackingInitialized = false;
  }
}
