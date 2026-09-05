import { renderOfflineKey } from "../core/offline-renderer";
import { formatUiDecimal, getDisplayLanguage, translateUi } from "../core/localization";
import {
  GuidanceStatus,
  ManeuverKind,
  RouteGuidanceModel
} from "./route-guidance";

export type NavigationDisplayKind =
  | "maneuver"
  | "maneuver-distance"
  | "next-stop"
  | "total-distance"
  | "remaining-distance"
  | "route-progress"
  | "eta"
  | "predicted-delta"
  | "confidence";

const COLORS = {
  cyan: "#38c9ff",
  green: "#78d83a",
  yellow: "#ffc21d",
  red: "#ff4050",
  neutral: "#7b858c",
} as const;

const escapeXml = (value: unknown): string => String(value ?? "--")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const dataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

function distance(value: number | undefined, approximate = false): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const clamped = Math.max(0, value);
  const formatted = clamped < 1_000
    ? `${Math.round(clamped)} m`
    : `${formatUiDecimal(clamped / 1_000, 1, getDisplayLanguage())} km`;
  return approximate ? `≈${formatted}` : formatted;
}

function frame(
  content: string,
  color: string,
  glow = color,
  title = "NAVIGATION"
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <title>${escapeXml(title)}</title>
  <defs>
    <filter id="navGlow" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${glow}" flood-opacity=".86"/></filter>
    <filter id="valueGlow" x="-45%" y="-55%" width="190%" height="210%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${glow}" flood-opacity=".78"/></filter>
  </defs>
  <rect width="144" height="144" fill="#020407"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="#061018" stroke="${color}" stroke-width="3" filter="url(#navGlow)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#02070b" fill-opacity=".84" stroke="#fff" stroke-opacity=".07"/>
  ${content}
  <text x="135" y="136" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4" font-weight="700" fill="#fff" fill-opacity=".22">2.17</text>
  </svg>`;
}

function valueIcon(kind: NavigationDisplayKind, color: string): string {
  const stroke = `fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "maneuver-distance") {
    return `<path d="M96 68V55Q96 39 80 39H49M62 26L48 39L62 52" ${stroke}/>`;
  }
  if (kind === "total-distance") {
    return `<circle cx="39" cy="48" r="9" fill="#061018" stroke="${color}" stroke-width="5"/><circle cx="105" cy="48" r="9" fill="#061018" stroke="${color}" stroke-width="5"/><path d="M48 48H96" ${stroke} stroke-dasharray="8 8"/>`;
  }
  return `<path d="M42 66V28M45 31H91L82 43L91 55H45M42 66Q72 48 104 66" ${stroke}/>`;
}

function valuePanel(
  kind: NavigationDisplayKind,
  value: string,
  color: string,
  title: string
): string {
  const defaultSize = value.length >= 9 ? 28 : value.length >= 7 ? 33 : 41;
  const size = kind === "total-distance" || kind === "remaining-distance"
    ? Math.min(27, Math.max(21, 106 / Math.max(widthUnits(value), 1)))
    : defaultSize;
  const content = `<g filter="url(#valueGlow)">${valueIcon(kind, color)}</g>
  <text x="72" y="112" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size.toFixed(1)}" font-weight="900" fill="#fff" filter="url(#valueGlow)">${escapeXml(value)}</text>`;
  return frame(content, color, color, title);
}

function isValueAvailable(model: RouteGuidanceModel): boolean {
  return model.status === "live" || model.status === "reversing";
}

function navigationColor(model: RouteGuidanceModel): string {
  switch (model.status) {
    case "live": return COLORS.cyan;
    case "loading-map":
    case "stale-route":
    case "reversing": return COLORS.yellow;
    case "off-route": return COLORS.red;
    default: return COLORS.neutral;
  }
}

function activeManeuver(model: RouteGuidanceModel) {
  const maneuver = model.activeManeuver;
  return model.status === "live"
    && maneuver?.id
    && Number.isFinite(maneuver.distance)
    && maneuver.kind !== "unavailable"
    && maneuver.kind !== "recalculating"
    ? maneuver
    : undefined;
}

function maneuverLabel(kind: ManeuverKind, language: string): string {
  switch (kind) {
    case "straight": return translateUi("straight", language);
    case "slight-left": return translateUi("slight_left", language);
    case "left": return translateUi("left", language);
    case "sharp-left": return translateUi("sharp_left", language);
    case "slight-right": return translateUi("slight_right", language);
    case "right": return translateUi("right", language);
    case "sharp-right": return translateUi("sharp_right", language);
    case "lane-left": return translateUi("lane_left", language);
    case "lane-right": return translateUi("lane_right", language);
    case "uturn": return translateUi("uturn", language);
    case "stop": return translateUi("stop", language);
    case "pause": return translateUi("pause", language);
    case "destination": return translateUi("destination", language);
    case "recalculating": return translateUi("recalculating", language);
    case "unavailable": return "--";
  }
}

function maneuverIcon(kind: ManeuverKind, color: string): string {
  const stroke = `fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case "straight":
      return `<path d="M72 105V42M49 65L72 39L95 65" ${stroke}/>`;
    case "left":
      return `<path d="M102 108V80Q102 56 78 56H43M62 37L42 56L62 75" ${stroke}/>`;
    case "right":
      return `<g transform="translate(144 0) scale(-1 1)"><path d="M102 108V80Q102 56 78 56H43M62 37L42 56L62 75" ${stroke}/></g>`;
    case "slight-left":
      return `<path d="M96 108V95C96 76 84 63 64 53L49 45M69 39L48 44L54 65" ${stroke}/>`;
    case "slight-right":
      return `<g transform="translate(144 0) scale(-1 1)"><path d="M96 108V95C96 76 84 63 64 53L49 45M69 39L48 44L54 65" ${stroke}/></g>`;
    case "sharp-left":
      return `<path d="M105 108V74Q105 47 78 47H69Q54 47 46 62L34 84M35 60L33 85L55 71" ${stroke}/>`;
    case "sharp-right":
      return `<g transform="translate(144 0) scale(-1 1)"><path d="M105 108V74Q105 47 78 47H69Q54 47 46 62L34 84M35 60L33 85L55 71" ${stroke}/></g>`;
    case "lane-left":
      return `<path d="M101 108V92C101 75 90 66 72 63L53 59V38M37 55L53 37L69 55" ${stroke}/><path d="M31 108V38M116 108V38" ${stroke} style="stroke-width:4" stroke-opacity=".28" stroke-dasharray="7 10"/>`;
    case "lane-right":
      return `<g transform="translate(144 0) scale(-1 1)"><path d="M101 108V92C101 75 90 66 72 63L53 59V38M37 55L53 37L69 55" ${stroke}/><path d="M31 108V38M116 108V38" ${stroke} style="stroke-width:4" stroke-opacity=".28" stroke-dasharray="7 10"/></g>`;
    case "uturn":
      return `<path d="M102 108V70C102 35 50 35 50 70V92M31 72L50 94L69 72" ${stroke}/>`;
    case "stop":
      return `<circle cx="72" cy="69" r="39" fill="#061018" stroke="${color}" stroke-width="6"/><text x="72" y="86" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="51" font-weight="900" fill="${color}">H</text>`;
    case "pause":
      return `<circle cx="72" cy="69" r="39" fill="#061018" stroke="${color}" stroke-width="6"/><path d="M58 48V90M86 48V90" ${stroke}/>`;
    case "destination":
      return `<path d="M48 108V34M50 37H101L90 55L101 73H50" ${stroke}/>`;
    case "recalculating":
      return `<text x="72" y="91" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="65" font-weight="900" fill="${color}">↻</text>`;
    case "unavailable":
      return `<text x="72" y="92" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="67" font-weight="900" fill="${color}">?</text>`;
  }
}

function targetBadge(kind: RouteGuidanceModel["nextTargetKind"], color: string): string {
  if (kind === "terminal-pause") {
    return `<circle cx="72" cy="25" r="14" fill="#061018" stroke="${color}" stroke-width="4" filter="url(#valueGlow)"/><path d="M67 17V33M77 17V33" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (kind === "destination") {
    return `<path d="M65 38V12M67 14H82L78 20L82 26H67" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#valueGlow)"/>`;
  }
  return `<circle cx="72" cy="25" r="14" fill="#061018" stroke="${color}" stroke-width="4" filter="url(#valueGlow)"/><text x="72" y="34" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="${color}">H</text>`;
}

function widthUnits(value: string): number {
  let total = 0;
  for (const character of value) {
    if (character === " ") total += 0.35;
    else if (/[MWÄÖÜ@%&]/u.test(character)) total += 0.95;
    else if (/[Iil1|.,:;'!]/u.test(character)) total += 0.36;
    else if (/[A-Z0-9]/u.test(character)) total += 0.7;
    else total += 0.58;
  }
  return total;
}

function wrapStopName(value: string): string[] {
  const text = value.trim() || "--";
  if (widthUnits(text) <= 12) return [text];
  const lines: string[] = [];
  for (const word of text.split(/\s+/u)) {
    const current = lines.at(-1);
    if (!current || (lines.length < 3 && widthUnits(`${current} ${word}`) > 12)) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  if (lines.length > 3) {
    lines[2] = lines.slice(2).join(" ");
    lines.length = 3;
  }
  return lines;
}

function predictedDelta(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "--:--";
  const seconds = Math.trunc(value);
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "±";
  const absolute = Math.abs(seconds);
  return `${sign}${Math.floor(absolute / 60)}:${(absolute % 60).toString().padStart(2, "0")}`;
}

function statusLabel(status: GuidanceStatus, language: string): string {
  switch (status) {
    case "offline": return translateUi("offline", language);
    case "no-vehicle": return translateUi("no_bus", language);
    case "bus-not-ready": return translateUi("bus_loading", language);
    case "loading-map": return translateUi("map_loading", language);
    case "no-route": return translateUi("no_route", language);
    case "stale-route": return translateUi("stale_route", language);
    case "off-route": return translateUi("off_route", language);
    case "reversing": return translateUi("reversing", language);
    case "live": return translateUi("live", language);
  }
}

export function normalizeNavigationKind(value: unknown): NavigationDisplayKind {
  switch (value) {
    case "maneuver-distance":
    case "next-stop":
    case "total-distance":
    case "remaining-distance":
    case "route-progress":
    case "eta":
    case "predicted-delta":
    case "confidence":
      return value;
    default:
      return "maneuver";
  }
}

export function renderNavigationKey(
  model: RouteGuidanceModel,
  kind: NavigationDisplayKind
): string {
  const language = getDisplayLanguage();
  if (model.status === "offline") return renderOfflineKey(translateUi("offline", language));
  const available = isValueAvailable(model);
  const color = navigationColor(model);

  if (kind === "maneuver") {
    const maneuver = activeManeuver(model);
    const icon = maneuverIcon(maneuver?.kind ?? "unavailable", color);
    const value = maneuver ? distance(maneuver.distance) : "--";
    const size = value.length >= 7 ? 27 : 32;
    const content = `<g data-active-maneuver-id="${escapeXml(maneuver?.id ?? "")}">
    <g transform="translate(18 -6) scale(.75)" filter="url(#valueGlow)">${icon}</g>
    <line x1="25" y1="94" x2="119" y2="94" stroke="${color}" stroke-opacity=".28" stroke-width="2"/>
    <text x="72" y="125" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="900" fill="#fff" filter="url(#valueGlow)">${escapeXml(value)}</text>
    </g>`;
    const title = maneuver
      ? `${translateUi("navigation", language)}: ${maneuverLabel(maneuver.kind, language)} IN ${value}; ${maneuver.id}`
      : `${translateUi("navigation", language)}: ${statusLabel(model.status, language)}`;
    return dataUri(frame(content, color, color, title));
  }
  if (kind === "maneuver-distance") {
    const maneuver = activeManeuver(model);
    const value = maneuver ? distance(maneuver.distance) : "--";
    return dataUri(valuePanel(
      "maneuver-distance",
      value,
      color,
      `${translateUi("maneuver", language)} IN ${value}`
    ));
  }
  if (kind === "next-stop") {
    const lines = wrapStopName(available ? model.nextRelevantStop : "--");
    const width = Math.max(...lines.map(widthUnits), 1);
    const size = Math.max(12, Math.min(lines.length === 1 ? 24 : 19, 113 / width));
    const spacing = lines.length === 1 ? 0 : 23;
    const start = lines.length === 1 ? 76 : 57 - 9 * (lines.length - 2);
    const body = lines.map((line, index) => `<text x="72" y="${start + index * spacing}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${size.toFixed(1)}" font-weight="850" fill="#fff">${escapeXml(line)}</text>`).join("");
    const stopDistance = available ? distance(model.nextRelevantStopDistance) : "--";
    const content = `${targetBadge(model.nextTargetKind, color)}${body}<text x="72" y="121" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="900" fill="${color}">${escapeXml(stopDistance)}</text>`;
    const targetLabel = model.nextTargetKind === "terminal-pause"
      ? translateUi("terminal_pause", language)
      : model.nextTargetKind === "destination" ? translateUi("destination", language) : translateUi("next_stop_short", language);
    return dataUri(frame(
      content,
      color,
      color,
      `${targetLabel}: ${available ? model.nextRelevantStop : "--"}; ${stopDistance}`
    ));
  }
  if (kind === "total-distance") {
    const value = available
      ? distance(model.totalRouteDistance, model.routeDistanceEstimated)
      : "--";
    return dataUri(valuePanel(
      "total-distance",
      value,
      color,
      `${translateUi("route_length", language)}: ${value}`
    ));
  }
  if (kind === "remaining-distance") {
    const value = available
      ? distance(model.remainingRouteDistance, model.routeDistanceEstimated)
      : "--";
    return dataUri(valuePanel(
      "remaining-distance",
      value,
      color,
      `${translateUi("remaining_distance", language)}: ${value}`
    ));
  }
  if (kind === "route-progress") {
    const hasProgress = available && model.routeProgress !== undefined;
    const progress = hasProgress ? Math.max(0, Math.min(1, model.routeProgress ?? 0)) : 0;
    const circumference = 2 * Math.PI * 47;
    const value = hasProgress ? `${Math.round(100 * progress)}%` : "--";
    const content = `<circle cx="72" cy="72" r="47" fill="none" stroke="#12303d" stroke-width="9"/><circle cx="72" cy="72" r="47" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(circumference * progress).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 72 72)" filter="url(#valueGlow)"/><circle cx="72" cy="25" r="5" fill="${color}"/><text x="72" y="84" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#fff">${value}</text>`;
    return dataUri(frame(content, color, color, `${translateUi("route_progress", language)}: ${value}`));
  }
  if (kind === "eta") {
    const eta = available && model.estimatedArrivalTime
      ? model.estimatedArrivalTime
      : "--:--";
    const content = `<circle cx="72" cy="48" r="26" fill="#061018" stroke="${color}" stroke-width="6" filter="url(#valueGlow)"/><path d="M72 31V49L84 57" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="72" y="111" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="900" fill="#fff" filter="url(#valueGlow)">≈${escapeXml(eta)}</text><text x="72" y="128" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900" fill="${color}">ETA</text>`;
    return dataUri(frame(content, color, color, `${translateUi("estimated_arrival", language)} ETA: ${eta}`));
  }
  if (kind === "predicted-delta") {
    const delta = available ? model.predictedScheduleDelta : undefined;
    const deltaColor = delta === undefined
      ? color
      : delta >= 30 ? COLORS.yellow : delta < -60 ? COLORS.red : COLORS.green;
    const value = predictedDelta(delta);
    const content = `<text x="72" y="66" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="55" font-weight="900" fill="${deltaColor}" filter="url(#valueGlow)">Δ</text><text x="72" y="113" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="900" fill="#fff" filter="url(#valueGlow)">${escapeXml(value)}</text>`;
    return dataUri(frame(content, deltaColor, deltaColor, `${translateUi("predicted_delta", language)}: ${value}`));
  }

  const confidence = available ? model.predictionConfidence : "none";
  const confidenceLabel = confidence === "high"
    ? translateUi("high", language)
    : confidence === "medium" ? translateUi("medium", language) : confidence === "low" ? translateUi("low", language) : "--";
  const bars = confidence === "high"
    ? 4
    : confidence === "medium" ? 3 : confidence === "low" ? 1 : 0;
  const signal = [0, 1, 2, 3].map((index) => {
    const height = 12 + index * 8;
    return `<rect x="${43 + index * 17}" y="${66 - height}" width="11" height="${height}" rx="3" fill="${index < bars ? color : "#17323e"}"/>`;
  }).join("");
  const status = statusLabel(model.status, language);
  const content = `<g filter="url(#valueGlow)">${signal}</g><text x="72" y="101" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${confidenceLabel.length >= 6 ? 25 : 32}" font-weight="900" fill="#fff">${confidenceLabel}</text><text x="72" y="125" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900" fill="${color}">${escapeXml(status)}</text>`;
  return dataUri(frame(
    content,
    color,
    color,
    `${translateUi("prediction_confidence", language)}: ${confidenceLabel}; ${status}`
  ));
}
