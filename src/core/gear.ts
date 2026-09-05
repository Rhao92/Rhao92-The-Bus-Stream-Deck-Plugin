import type { VehicleTelemetry } from "./telemetry";
import { findVehicleButton, readVehicleButtonState } from "./vehicle-buttons";
import { vehicleIdentityContains } from "./vehicle-identity";

export type GearPosition = "D" | "N" | "R";

export const GEAR_EVENTS: Readonly<Record<GearPosition, string>> = {
  D: "SetGearD",
  N: "SetGearN",
  R: "SetGearR"
};

// Live am Ebusco 2.2 ueber die offizielle lokale TML-API bestaetigt:
// GearUp bewegt in Richtung D, GearDown in Richtung R.
const EBUSCO_GEAR_ORDER: readonly GearPosition[] = ["D", "N", "R"];

function listedGearAction(
  vehicle: VehicleTelemetry | undefined,
  eventName: string
): string | undefined {
  return findVehicleButton(vehicle, "Gear Selector")?.Actions?.find(
    (action) => action.trim().toLowerCase() === eventName.toLowerCase()
  );
}

/**
 * Erzeugt ausschließlich aus den vom konkreten Bus gemeldeten Gang-Events
 * eine Befehlsfolge. Der Ebusco besitzt kein SetGearN und reagierte im
 * Praxistest nicht auf seine beiden direkten SetGear-Events. Seine echte
 * Up/Down-Schaltung wird deshalb relativ vom bestätigten Ist-Gang aus bedient.
 */
export function resolveGearCommand(
  vehicle: VehicleTelemetry | undefined,
  current: GearPosition,
  target: GearPosition
): string[] | undefined {
  if (current === target) {
    return [];
  }

  if (vehicleIdentityContains(vehicle, "ebusco")) {
    const currentIndex = EBUSCO_GEAR_ORDER.indexOf(current);
    const targetIndex = EBUSCO_GEAR_ORDER.indexOf(target);
    const difference = targetIndex - currentIndex;
    const eventName = listedGearAction(
      vehicle,
      difference > 0 ? "GearDown" : "GearUp"
    );

    if (!eventName || difference === 0) {
      return undefined;
    }

    return Array.from(
      { length: Math.abs(difference) },
      () => eventName
    );
  }

  const direct = listedGearAction(vehicle, GEAR_EVENTS[target]);
  return [direct ?? GEAR_EVENTS[target]];
}

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

    // Beim Urbino meldet Gearbox.CurrentSelector in Neutral dauerhaft "R",
    // waehrend der offizielle Gear-Selector-Button korrekt "Neutral" liefert.
    // Nur fuer diese live bestaetigte Fahrzeugfamilie hat daher der
    // Buttonzustand Vorrang; alle bisherigen Fahrzeuge behalten die bewaehrte
    // direkte Getriebequelle.
    const observed = vehicleIdentityContains(vehicle, "urbino")
      ? button ?? direct
      : direct ?? button;

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
