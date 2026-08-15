import type { VehicleTelemetry } from "./telemetry";
import { readVehicleButtonState } from "./vehicle-buttons";

export type GearPosition = "D" | "N" | "R";

export const GEAR_EVENTS: Readonly<Record<GearPosition, string>> = {
  D: "SetGearD",
  N: "SetGearN",
  R: "SetGearR"
};

const TELEMETRY_GAP_GRACE_MS = 900;
const CANDIDATE_WINDOW_MS = 700;
const EXPECTED_GEAR_TIMEOUT_MS = 1800;
const REQUIRED_UNEXPECTED_SAMPLES = 2;

/**
 * Normalisiert beide vom eCitaro gelieferten Gangquellen:
 * - Vehicle.Gearbox.CurrentSelector: D / N / R
 * - Buttons -> Gear Selector -> State: Drive / Neutral / Reverse
 */
export function normalizeGear(value: unknown): GearPosition | undefined {
  const normalized = String(value ?? "").trim().toLowerCase();

  switch (normalized) {
    case "d":
    case "drive":
      return "D";
    case "n":
    case "neutral":
      return "N";
    case "r":
    case "reverse":
      return "R";
    default:
      return undefined;
  }
}

export type GearSources = {
  direct?: GearPosition;
  button?: GearPosition;
};

export function readGearSources(
  vehicle: VehicleTelemetry | undefined
): GearSources {
  return {
    direct: normalizeGear(vehicle?.Gearbox?.CurrentSelector),
    button: normalizeGear(readVehicleButtonState(vehicle, "Gear Selector"))
  };
}

/**
 * Stabilisiert die Gangtelemetrie, ohne einen Gang optimistisch vorwegzunehmen.
 *
 * - Der erste gültige Zustand wird sofort übernommen.
 * - Ein vom Plugin angeforderter Zielgang wird beim ersten echten Treffer sofort
 *   akzeptiert.
 * - Ein unerwarteter abweichender Einzelwert muss zweimal hintereinander
 *   erscheinen. Dadurch blitzen beim erneuten Druck auf den bereits aktiven
 *   Gang weder Offline- noch Inaktivbild kurz auf.
 * - Sehr kurze Telemetrielücken behalten den zuletzt bestätigten Gang; bei
 *   längerer Trennung wird weiterhin korrekt OFFLINE angezeigt.
 */
export class GearStateResolver {
  private lastConfirmed: GearPosition | undefined;
  private lastValidAt = 0;
  private candidate: GearPosition | undefined;
  private candidateCount = 0;
  private candidateSeenAt = 0;
  private expected: GearPosition | undefined;
  private expectedUntil = 0;

  reset(): void {
    this.lastConfirmed = undefined;
    this.lastValidAt = 0;
    this.clearCandidate();
    this.expected = undefined;
    this.expectedUntil = 0;
  }

  /**
   * Merkt sich nur das erwartete Telemetrieziel. Der sichtbare Zustand wird
   * dadurch nicht geändert; erst ein echter Telemetrietreffer bestätigt ihn.
   */
  expect(target: GearPosition, now = Date.now()): void {
    this.expected = target;
    this.expectedUntil = now + EXPECTED_GEAR_TIMEOUT_MS;
  }

  resolve(
    vehicle: VehicleTelemetry | undefined,
    now = Date.now()
  ): GearPosition | undefined {
    if (!vehicle) {
      return this.lastConfirmed !== undefined
        && now - this.lastValidAt <= TELEMETRY_GAP_GRACE_MS
        ? this.lastConfirmed
        : undefined;
    }

    const { direct, button } = readGearSources(vehicle);
    const observed = direct ?? button;

    if (observed === undefined) {
      return this.lastConfirmed !== undefined
        && now - this.lastValidAt <= TELEMETRY_GAP_GRACE_MS
        ? this.lastConfirmed
        : undefined;
    }

    this.lastValidAt = now;

    if (this.expected !== undefined && now > this.expectedUntil) {
      this.expected = undefined;
      this.expectedUntil = 0;
    }

    if (this.lastConfirmed === undefined) {
      return this.confirm(observed);
    }

    if (observed === this.lastConfirmed) {
      if (this.expected === observed) {
        this.expected = undefined;
        this.expectedUntil = 0;
      }
      this.clearCandidate();
      return this.lastConfirmed;
    }

    if (this.expected === observed) {
      this.expected = undefined;
      this.expectedUntil = 0;
      return this.confirm(observed);
    }

    if (
      this.candidate === observed
      && now - this.candidateSeenAt <= CANDIDATE_WINDOW_MS
    ) {
      this.candidateCount += 1;
    } else {
      this.candidate = observed;
      this.candidateCount = 1;
    }
    this.candidateSeenAt = now;

    if (this.candidateCount >= REQUIRED_UNEXPECTED_SAMPLES) {
      return this.confirm(observed);
    }

    return this.lastConfirmed;
  }

  private confirm(gear: GearPosition): GearPosition {
    this.lastConfirmed = gear;
    this.clearCandidate();
    return gear;
  }

  private clearCandidate(): void {
    this.candidate = undefined;
    this.candidateCount = 0;
    this.candidateSeenAt = 0;
  }
}
