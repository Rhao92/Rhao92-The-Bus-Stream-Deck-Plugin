import streamDeck, {
  action,
  KeyAction,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent
} from "@elgato/streamdeck";
import {
  NavigationDebugExportError,
  NavigationDebugRecorder,
  type NavigationDebugDestinationKind
} from "../navigation/navigation-debug-recorder";
import { translateUi } from "../core/localization";

const COLORS = {
  cyan: "#38c9ff",
  green: "#78d83a",
  red: "#ff4050",
  neutral: "#7b858c"
} as const;

const dataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

function debugKey(label: string, value: string, color: string): string {
  const valueSize = value.length > 8 ? 25 : value.length > 5 ? 31 : 38;
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <title>Navigation Debug</title>
  <defs>
    <filter id="glow" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${color}" flood-opacity=".82"/></filter>
  </defs>
  <rect width="144" height="144" fill="#020407"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="#061018" stroke="${color}" stroke-width="3" filter="url(#glow)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#02070b" fill-opacity=".84" stroke="#fff" stroke-opacity=".07"/>
  <path d="M38 41H106M38 63H106M38 85H80" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" filter="url(#glow)"/>
  <circle cx="100" cy="88" r="15" fill="#02070b" stroke="${color}" stroke-width="6" filter="url(#glow)"/>
  <text x="72" y="119" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${valueSize}" font-weight="900" fill="#fff" filter="url(#glow)">${value}</text>
  <text x="72" y="132" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" fill="${color}" opacity=".9">${label}</text>
  <text x="135" y="136" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4" font-weight="700" fill="#fff" fill-opacity=".22">2.17</text>
  </svg>`);
}

function destinationLabel(destination: NavigationDebugDestinationKind): string {
  switch (destination) {
    case "configured": return "PATH";
    default: return "OK";
  }
}

function failureLabel(error: unknown): string {
  if (!(error instanceof NavigationDebugExportError)) return "E WRITE";
  const codes = new Set(error.attempts.map((attempt) => attempt.code));
  if (codes.has("EACCES") || codes.has("EPERM")) return "E PATH";
  if (codes.has("ENOSPC")) return "E SPACE";
  return "E WRITE";
}

@action({ UUID: "de.rhao92.thebus-telemetry-interface.navigation-debug-capture" })
export class NavigationDebugCaptureAction extends SingletonAction {
  private readonly recorder = NavigationDebugRecorder.instance;
  private readonly contexts = new Map<string, KeyAction>();
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  private saving = false;
  private disposed = false;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (this.disposed) return;
    const key = ev.action as KeyAction;
    this.contexts.set(key.id, key);
    this.recorder.start();
    await Promise.allSettled([
      key.setTitle(""),
      key.setImage(debugKey(translateUi("buffer_60s"), "NAV LOG", COLORS.cyan))
    ]);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.contexts.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (this.saving || this.disposed) return;
    const key = ev.action as KeyAction;
    this.saving = true;

    try {
      await key.setImage(debugKey(translateUi("please_wait"), "SAVE", COLORS.neutral));
      const result = this.recorder.exportLastMinute();
      streamDeck.logger.info(
        `[NavigationDebug] ${result.durationSeconds.toFixed(1)} s / `
          + `${result.sampleCount} Samples / ${result.routeContextCount} Routen `
          + `gespeichert (${(result.byteLength / 1024 / 1024).toFixed(2)} MiB): `
          + result.path
      );
      const seconds = Math.max(0, Math.round(result.durationSeconds));
      const location = destinationLabel(result.destination);
      await Promise.allSettled([
        key.setImage(
          debugKey(translateUi("saved_upper"), `${location} ${seconds}S`, COLORS.green)
        ),
        (key as unknown as { showOk?: () => Promise<void> }).showOk?.()
      ]);
      this.scheduleReset();
    } catch (error) {
      streamDeck.logger.error(
        "[NavigationDebug] Debug-Log konnte nicht gespeichert werden.",
        error
      );
      await Promise.allSettled([
        key.setImage(debugKey(translateUi("error"), failureLabel(error), COLORS.red)),
        (key as unknown as { showAlert?: () => Promise<void> }).showAlert?.()
      ]);
      this.scheduleReset();
    } finally {
      this.saving = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.contexts.clear();
  }

  private scheduleReset(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.resetTimer = undefined;
      void this.renderIdle();
    }, 2_500);
  }

  private async renderIdle(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of this.contexts.values()) {
      jobs.push(key.setImage(debugKey(translateUi("buffer_60s"), "NAV LOG", COLORS.cyan)));
    }
    await Promise.allSettled(jobs);
  }
}
