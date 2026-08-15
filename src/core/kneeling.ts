import type { VehicleTelemetry } from "./telemetry";
import { readVehicleButtonState } from "./vehicle-buttons";

const KNEELING_BUTTON = "Kneeling";
const WHEEL_LOWERED_THRESHOLD = 2;
const WHEEL_TRANSITION_DELTA = 1.25;
const WHEEL_MOTION_START_DELTA = 0.65;
const WHEEL_IDLE_NOISE_DELTA = 0.2;
const MIN_TRANSITION_MS = 900;
const BUTTON_FALLBACK_MS = 2_800;
const TARGET_STABLE_MS = 500;
const TRANSITION_TIMEOUT_MS = 10_000;

export function normalizeKneelingState(
  value: unknown
): boolean | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "primary" || normalized === "up" || normalized === "raised") {
    return false;
  }

  if (normalized === "secondary" || normalized === "down" || normalized === "lowered") {
    return true;
  }

  return undefined;
}

export function readKneelingButtonState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  return normalizeKneelingState(
    readVehicleButtonState(vehicle, KNEELING_BUTTON)
  );
}

/** Median der links/rechts-Differenzen aller gelieferten Achspaare. */
export function readKneelingWheelMetric(
  vehicle: VehicleTelemetry | undefined
): number | undefined {
  const wheels = vehicle?.Wheels;

  if (!Array.isArray(wheels) || wheels.length < 4) {
    return undefined;
  }

  const differences: number[] = [];

  for (let index = 0; index + 1 < wheels.length; index += 2) {
    const leftZ = Number(wheels[index]?.Location?.Z);
    const rightZ = Number(wheels[index + 1]?.Location?.Z);

    if (Number.isFinite(leftZ) && Number.isFinite(rightZ)) {
      differences.push(Math.abs(leftZ - rightZ));
    }
  }

  if (differences.length === 0) {
    return undefined;
  }

  differences.sort((a, b) => a - b);
  const middle = Math.floor(differences.length / 2);

  return differences.length % 2 === 0
    ? (differences[middle - 1] + differences[middle]) / 2
    : differences[middle];
}

/**
 * Fuer den statischen Zustand hat der explizite Kneeling-Button Vorrang.
 * Damit fuehrt ein Bordstein beziehungsweise eine Fahrzeugneigung nicht mehr
 * zu einem falschen LOWERED-Zustand. Die Radmetrik bleibt als Fallback fuer
 * Fahrzeuge ohne diesen Button erhalten.
 */
export function readKneelingState(
  vehicle: VehicleTelemetry | undefined
): boolean | undefined {
  const button = readKneelingButtonState(vehicle);

  if (button !== undefined) {
    return button;
  }

  const wheelMetric = readKneelingWheelMetric(vehicle);
  return wheelMetric === undefined
    ? undefined
    : wheelMetric > WHEEL_LOWERED_THRESHOLD;
}

/**
 * Verfolgt sowohl manuell gestartete als auch durch Auto-Kneeling ausgelöste
 * mechanische Bewegungen. Auto-Kneeling kann den expliziten Kneeling-Button
 * unverändert lassen; deshalb wird in diesem Modus zusätzlich eine echte
 * Änderung der Radmetrik gegenüber der letzten stabilen Ausgangslage erkannt.
 * Ein statischer Bordsteinwert allein startet keine Bewegung.
 */
export class KneelingMotionTracker {
  private targetLowered: boolean | undefined;
  private startedAt = 0;
  private reachedAt: number | undefined;
  private baselineWheelMetric: number | undefined;

  private observationInitialized = false;
  private lastButtonState: boolean | undefined;
  private lastWheelMetric: number | undefined;
  private idleWheelMetric: number | undefined;
  private confirmedMechanicalState: boolean | undefined;

  get target(): boolean | undefined {
    return this.targetLowered;
  }

  start(
    targetLowered: boolean,
    vehicle: VehicleTelemetry | undefined,
    now = Date.now()
  ): void {
    this.initializeObservation(vehicle);
    this.beginMotion(
      targetLowered,
      readKneelingWheelMetric(vehicle),
      now
    );
  }

  /**
   * Erkennt eine fremd ausgelöste Bewegung, etwa durch Auto-Kneeling.
   * Liefert true, solange die gemeinsame Kneeling-Animation laufen soll.
   */
  observe(
    vehicle: VehicleTelemetry | undefined,
    automaticKneelingActive: boolean,
    now = Date.now()
  ): boolean {
    if (!vehicle) {
      this.stop();
      return false;
    }

    const buttonState = readKneelingButtonState(vehicle);
    const wheelMetric = readKneelingWheelMetric(vehicle);

    if (!this.observationInitialized) {
      this.initializeObservation(vehicle);
    }

    if (this.targetLowered === undefined) {
      const buttonChanged = buttonState !== undefined
        && this.lastButtonState !== undefined
        && buttonState !== this.lastButtonState;

      if (buttonChanged) {
        this.beginMotion(
          buttonState,
          this.idleWheelMetric ?? this.lastWheelMetric,
          now
        );
      } else if (
        automaticKneelingActive
        && wheelMetric !== undefined
        && this.idleWheelMetric !== undefined
      ) {
        const delta = wheelMetric - this.idleWheelMetric;

        if (Math.abs(delta) >= WHEEL_MOTION_START_DELTA) {
          this.beginMotion(delta > 0, this.idleWheelMetric, now);
        } else if (Math.abs(delta) <= WHEEL_IDLE_NOISE_DELTA) {
          // Kleine Messwertschwankungen werden geglaettet, ohne den stabilen
          // Ausgangspunkt einer beginnenden Auto-Kneeling-Bewegung zu verlieren.
          this.idleWheelMetric = (
            this.idleWheelMetric * 3 + wheelMetric
          ) / 4;
        }
      }
    }

    this.lastButtonState = buttonState;
    this.lastWheelMetric = wheelMetric;

    if (this.targetLowered === undefined) {
      if (!automaticKneelingActive && buttonState !== undefined) {
        this.confirmedMechanicalState = buttonState;
      }

      return false;
    }

    return this.isAnimating(vehicle, now);
  }

  /**
   * Liefert den zuletzt bestaetigten mechanischen Zustand. Im Auto-Modus wird
   * ein durch echte Radbewegung bestaetigter Zustand verwendet, selbst wenn
   * der manuelle Kneeling-Button unveraendert bleibt.
   */
  readMechanicalState(
    vehicle: VehicleTelemetry | undefined,
    automaticKneelingActive: boolean
  ): boolean | undefined {
    if (!vehicle) {
      return undefined;
    }

    const buttonState = readKneelingButtonState(vehicle);

    if (automaticKneelingActive && this.confirmedMechanicalState !== undefined) {
      return this.confirmedMechanicalState;
    }

    if (buttonState !== undefined) {
      this.confirmedMechanicalState = buttonState;
      return buttonState;
    }

    const wheelMetric = readKneelingWheelMetric(vehicle);
    const fallback = wheelMetric === undefined
      ? undefined
      : wheelMetric > WHEEL_LOWERED_THRESHOLD;

    if (fallback !== undefined) {
      this.confirmedMechanicalState = fallback;
    }

    return fallback;
  }

  stop(): void {
    this.stopMotion();
    this.observationInitialized = false;
    this.lastButtonState = undefined;
    this.lastWheelMetric = undefined;
    this.idleWheelMetric = undefined;
    this.confirmedMechanicalState = undefined;
  }

  isAnimating(
    vehicle: VehicleTelemetry | undefined,
    now = Date.now()
  ): boolean {
    const target = this.targetLowered;

    if (target === undefined || !vehicle) {
      this.stopMotion();
      return false;
    }

    const elapsed = now - this.startedAt;

    if (elapsed >= TRANSITION_TIMEOUT_MS) {
      this.stopMotion();
      return false;
    }

    const buttonState = readKneelingButtonState(vehicle);
    const currentMetric = readKneelingWheelMetric(vehicle);
    const wheelConfirmed = this.isWheelTargetConfirmed(target, currentMetric);
    const buttonFallbackConfirmed = elapsed >= BUTTON_FALLBACK_MS
      && buttonState === target;
    const targetConfirmed = elapsed >= MIN_TRANSITION_MS
      && (wheelConfirmed || buttonFallbackConfirmed);

    if (targetConfirmed) {
      this.reachedAt ??= now;

      if (now - this.reachedAt >= TARGET_STABLE_MS) {
        this.confirmedMechanicalState = target;
        this.lastButtonState = buttonState;
        this.lastWheelMetric = currentMetric;
        this.idleWheelMetric = currentMetric;
        this.stopMotion();
        return false;
      }
    } else {
      this.reachedAt = undefined;
    }

    return true;
  }

  private initializeObservation(
    vehicle: VehicleTelemetry | undefined
  ): void {
    this.observationInitialized = true;
    this.lastButtonState = readKneelingButtonState(vehicle);
    this.lastWheelMetric = readKneelingWheelMetric(vehicle);
    this.idleWheelMetric = this.lastWheelMetric;
    this.confirmedMechanicalState = readKneelingState(vehicle);
  }

  private beginMotion(
    targetLowered: boolean,
    baselineWheelMetric: number | undefined,
    now: number
  ): void {
    this.targetLowered = targetLowered;
    this.startedAt = now;
    this.reachedAt = undefined;
    this.baselineWheelMetric = baselineWheelMetric;
  }

  private stopMotion(): void {
    this.targetLowered = undefined;
    this.startedAt = 0;
    this.reachedAt = undefined;
    this.baselineWheelMetric = undefined;
  }

  private isWheelTargetConfirmed(
    targetLowered: boolean,
    currentMetric: number | undefined
  ): boolean {
    if (currentMetric === undefined) {
      return false;
    }

    if (this.baselineWheelMetric === undefined) {
      return targetLowered
        ? currentMetric > WHEEL_LOWERED_THRESHOLD
        : currentMetric <= WHEEL_LOWERED_THRESHOLD;
    }

    const delta = currentMetric - this.baselineWheelMetric;

    if (targetLowered) {
      return delta >= WHEEL_TRANSITION_DELTA
        || (
          this.baselineWheelMetric <= WHEEL_LOWERED_THRESHOLD
          && currentMetric > WHEEL_LOWERED_THRESHOLD
        );
    }

    return delta <= -WHEEL_TRANSITION_DELTA
      || (
        this.baselineWheelMetric > WHEEL_LOWERED_THRESHOLD
        && currentMetric <= WHEEL_LOWERED_THRESHOLD
      );
  }
}
