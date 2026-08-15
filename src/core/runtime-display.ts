import type { TelemetrySnapshot } from "./telemetry";
import { renderOfflineKey, renderUnavailableKey } from "./offline-renderer";

export type RuntimeDisplayOverride = {
  state: number;
  title: null;
  image: string;
};

/**
 * Eine gemeinsame visuelle Entscheidung fuer alle normalen Key-Actions.
 * OFFLINE ist ausschließlich ein Verbindungszustand. Erreichbare Telemetrie
 * ohne Bus beziehungsweise mit noch unvollstaendigem Buskontext bleibt grau
 * und zeigt den neutralen Platzhalter statt eines Offline-Bilds.
 */
export function runtimeDisplayOverride(
  snapshot: TelemetrySnapshot
): RuntimeDisplayOverride | undefined {
  switch (snapshot.runtimeState) {
    case "offline":
      return { state: 0, title: null, image: renderOfflineKey() };
    case "no-bus":
    case "bus-not-ready":
      return { state: 0, title: null, image: renderUnavailableKey() };
    default:
      return undefined;
  }
}
