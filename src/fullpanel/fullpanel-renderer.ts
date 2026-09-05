import {
  FullpanelLayer,
  FullpanelOverlay,
  FullpanelViewModel
} from "./types";
import {
  ManeuverKind,
  RouteGuidanceModel
} from "../navigation/route-guidance";
import { formatBatteryPercent } from "./renderers";
import { getDisplayLanguage, translateUi } from "../core/localization";

export const FULLPANEL_LAYOUT = "layouts/touch-segment.json";
export const FULLPANEL_OVERLAY_MS = 1200;

const dataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

const columnIndex = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(3, Math.trunc(number)))
    : 0;
};

const escapeXml = (value: unknown): string => String(value ?? "--")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const metric = (
  x: number,
  label: string,
  value: string,
  accent: string,
  colorValue = false
): string => `<text x="${x}" y="62" class="fpLabel" fill="${accent}">${label}</text>
<text x="${x}" y="87" class="fpMetric" fill="${colorValue ? accent : "#fff"}">${escapeXml(value)}</text>`;

function definitions(): string {
  return `<defs>
  <filter id="fpPanelGreen" x="-10%" y="-60%" width="120%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#78d83a" flood-opacity=".72"/></filter>
  <filter id="fpPanelRed" x="-10%" y="-60%" width="120%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff4050" flood-opacity=".82"/></filter>
  <filter id="fpPanelCyan" x="-10%" y="-60%" width="120%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#38c9ff" flood-opacity=".72"/></filter>
  <filter id="fpSoftGreen" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#78d83a" flood-opacity=".85"/></filter>
  <filter id="fpSoftRed" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="#ff4050" flood-opacity=".9"/></filter>
  <filter id="fpStopBright" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff3345" flood-opacity="1"/><feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#ff3345" flood-opacity=".54"/></filter>
  <filter id="fpStopDim" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#a52634" flood-opacity=".8"/></filter>
  <filter id="fpViolet" x="-30%" y="-80%" width="160%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#a970ff" flood-opacity=".85"/></filter>
  <filter id="fpAmber" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f4b942" flood-opacity=".75"/></filter>
  <filter id="fpNeutral" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#717985" flood-opacity=".55"/></filter>
  <style>.fpTop{font-family:Arial,Helvetica,sans-serif;font-size:7px;font-weight:800;text-anchor:middle;letter-spacing:.45px}.fpStopName{font-family:Arial,Helvetica,sans-serif;font-weight:800;text-anchor:middle;fill:#fff}.fpLabel{font-family:Arial,Helvetica,sans-serif;font-size:7px;font-weight:800;text-anchor:middle;letter-spacing:.35px}.fpMetric{font-family:Arial,Helvetica,sans-serif;font-size:25px;font-weight:800;text-anchor:middle}.fpStatus{font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800;text-anchor:middle}.fpDivider{stroke:#fff;stroke-opacity:.24;stroke-width:1}.fpSmall{font-family:Arial,Helvetica,sans-serif;font-size:7px;font-weight:700;letter-spacing:.35px}.fpVehicleLabel{font-family:Arial,Helvetica,sans-serif;font-size:7px;font-weight:700;fill:#9fdfff}.fpVehicleValue{font-family:Arial,Helvetica,sans-serif;font-size:8px;font-weight:800}</style>
</defs>`;
}

function svg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100" viewBox="0 0 800 100">${definitions()}${content}</svg>`;
}

function stopRequest(bright: boolean, language: string): string {
  const fill = bright ? "#d8172b" : "#070304";
  const outline = bright ? "#ff4656" : "#a52634";
  const glow = bright ? "url(#fpStopBright)" : "url(#fpStopDim)";
  return `<g filter="${glow}">
  <path d="M650 60 L663 50 H748 L761 60 V86 L748 96 H663 L650 86 Z" fill="${fill}" stroke="${outline}" stroke-width="2.2"/>
  <text x="706" y="62" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7" font-weight="800" letter-spacing=".5" fill="#ff7782">${translateUi("stop_request", language)}</text>
  <text x="706" y="89" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="900" fill="#fff">STOP</text>
</g>`;
}

function stopNameMetrics(value: unknown): {
  text: string;
  fontSize: number;
  width: number;
  fitted: boolean;
} {
  const text = String(value ?? "--");
  let units = 0;

  for (const character of text) {
    if (character === " ") units += 0.34;
    else if (/[MWÄÖÜ@%&]/u.test(character)) units += 0.92;
    else if (/[Iil1|.,:;'!]/u.test(character)) units += 0.34;
    else if (/[A-Z0-9]/u.test(character)) units += 0.68;
    else units += 0.56;
  }

  const naturalWidth = Math.max(40, units * 27);
  const maxWidth = 480;
  const fontSize = Math.max(18, Math.min(27, 27 * maxWidth / naturalWidth));
  const scaledWidth = naturalWidth * fontSize / 27;
  const fitted = scaledWidth > maxWidth + 1;
  return {
    text,
    fontSize: Number(fontSize.toFixed(1)),
    width: Math.ceil(fitted ? maxWidth : scaledWidth),
    fitted
  };
}

function timetable(
  view: FullpanelViewModel,
  bright: boolean
): string {
  const language = view.language;
  const stop = Boolean(view.stopRequest);
  const late = view.status === translateUi("late", language);
  const early = view.status === translateUi("early", language);
  const unknown = view.status === translateUi("unknown", language);
  const unavailable = view.runtimeState !== "bus-ready" && view.runtimeState !== "mission-ready";
  const accent = unavailable
    ? "#8d96a3"
    : unknown
      ? "#f4b942"
    : late
      ? "#ff4050"
      : early
        ? "#ffc21d"
        : "#78d83a";
  const routeStatus = late
    ? "#ff4050"
    : unavailable
      ? "#8d96a3"
      : early || unknown
        ? "#ffc21d"
      : "#6fbe36";
  const routeSignal = stop
    ? bright ? "#ff4050" : "#4a0f16"
    : routeStatus;
  const routeGlow = stop
    ? bright ? "url(#fpStopBright)" : "url(#fpStopDim)"
    : late
      ? "url(#fpSoftRed)"
      : unavailable
        ? "url(#fpNeutral)"
        : early || unknown
        ? "url(#fpAmber)"
        : "url(#fpSoftGreen)";
  const delta = unavailable ? "#8d96a3" : late ? "#ff3345" : early || unknown ? "#ffc21d" : "#7edb3f";
  const tint = unavailable ? "#0b0f14" : late ? "#160607" : early || unknown ? "#171203" : "#071108";
  const panelFilter = unavailable
    ? "url(#fpNeutral)"
    : late
    ? "url(#fpPanelRed)"
    : early || unknown
      ? "url(#fpAmber)"
      : "url(#fpPanelGreen)";
  const name = stopNameMetrics(view.stopName);
  const routeGap = Math.min(530, Math.max(120, name.width + 24));
  const routeLeft = Math.round((800 - routeGap) / 2);
  const routeRight = 800 - routeLeft;
  const routeLeftKnee = Math.max(135, Math.min(225, routeLeft - 30));
  const routeRightKnee = 800 - routeLeftKnee;
  const routeInnerDots = routeLeftKnee > 150
    ? `<circle cx="${routeLeftKnee}" cy="29" r="4" fill="${routeSignal}" fill-opacity=".45"/><circle cx="${routeRightKnee}" cy="29" r="4" fill="${routeSignal}" filter="${routeGlow}"/>`
    : "";
  const nameFit = name.fitted
    ? ' textLength="480" lengthAdjust="spacingAndGlyphs"'
    : "";
  const status = stop
    ? stopRequest(bright, language)
    : `<text x="700" y="61" class="fpLabel" fill="${accent}">${translateUi("status", language)}</text><text x="700" y="84" class="fpStatus" fill="${accent}">${escapeXml(!unavailable ? view.status : view.connectionLabel)}</text>`;

  return `<rect width="800" height="100" fill="#020403"/>
  <rect x="3" y="3" width="794" height="94" rx="10" fill="${tint}" stroke="${accent}" stroke-width="2" filter="${panelFilter}"/>
  <rect x="6" y="6" width="788" height="88" rx="8" fill="#020604" fill-opacity=".72" stroke="#fff" stroke-opacity=".05"/>
  <text x="400" y="15" class="fpTop" fill="${routeStatus}">${translateUi("next_stop", language)}</text>
  <path d="M135 29H${routeLeftKnee}L${routeLeft} 48" fill="none" stroke="${routeSignal}" stroke-opacity=".78" stroke-width="1.5"/>
  <path d="M${routeRight} 48L${routeRightKnee} 29H665" fill="none" stroke="${routeSignal}" stroke-opacity=".78" stroke-width="1.5"/>
  <circle cx="135" cy="29" r="4" fill="${routeSignal}" filter="${routeGlow}"/>
  ${routeInnerDots}
  <circle cx="665" cy="29" r="4" fill="${routeSignal}"/>
  <text x="400" y="43" text-anchor="middle" class="fpStopName" font-size="${name.fontSize}"${nameFit}>${escapeXml(name.text)}</text>
  <line x1="170" y1="58" x2="170" y2="91" class="fpDivider"/>
  <line x1="330" y1="58" x2="330" y2="91" class="fpDivider"/>
  <line x1="490" y1="58" x2="490" y2="91" class="fpDivider"/>
  <line x1="625" y1="58" x2="625" y2="91" class="fpDivider"/>
  ${metric(90, translateUi("arrival_short", language), view.arrival, accent)}
  ${metric(250, translateUi("departure_short", language), view.departure, accent)}
  ${metric(410, translateUi("deviation", language), view.deltaText, delta, true)}
  ${metric(558, translateUi("ingame_time", language), view.ingameTime, accent)}
  ${status}
  <text x="789" y="12" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="5" font-weight="700" fill="#fff" fill-opacity=".28">2.17</text>`;
}

function vehicle(view: FullpanelViewModel): string {
  const language = view.language;
  const battery = view.batteryPercent === undefined
    ? "–"
    : formatBatteryPercent(view.batteryPercent, language);
  const batteryWidth = view.batteryPercent === undefined
    ? 0
    : Math.round(80 * view.batteryPercent / 100);
  const online = view.runtimeState === "bus-ready" || view.runtimeState === "mission-ready";
  const accent = online ? "#38c9ff" : "#8d96a3";
  const layerLabel = online ? `ECITARO · ${translateUi("live_telemetry", language)}` : view.connectionLabel;
  const speed = online ? view.speed : "--";
  const allowedSpeed = online && view.allowedSpeed > 0 ? view.allowedSpeed : "--";
  const neutralValue = "#d2d6dc";
  const doorColor = !online ? neutralValue : view.doors === translateUi("open", language) ? "#ff4050" : "#8fd7ee";
  const brakeColor = !online ? neutralValue : view.parkingBrake === translateUi("on", language) ? "#ff4050" : "#8a949c";
  const kneelingColor = !online
    ? neutralValue
    : view.mechanicalKneeling === translateUi("active", language)
    ? "#ff4050"
    : view.mechanicalKneeling === translateUi("off", language) || view.mechanicalKneeling === "–"
      ? "#8a949c"
      : "#f4c842";
  const speedColor = !online
    ? neutralValue
    : view.speedLevel === "critical"
    ? "#ff4050"
    : view.speedLevel === "warning"
      ? "#ffc21d"
      : "#fff";
  const speedFilter = !online
    ? ""
    : view.speedLevel === "critical"
    ? ' filter="url(#fpSoftRed)"'
    : view.speedLevel === "warning"
      ? ' filter="url(#fpAmber)"'
      : "";

  return `<rect width="800" height="100" fill="#020407"/>
  <rect x="3" y="3" width="794" height="94" rx="10" fill="#061018" stroke="${accent}" stroke-width="2" filter="${online ? "url(#fpPanelCyan)" : "url(#fpNeutral)"}"/>
  <rect x="6" y="6" width="788" height="88" rx="8" fill="#02070b" fill-opacity=".76" stroke="#fff" stroke-opacity=".05"/>
  <text x="20" y="16" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".6" fill="${accent}">${translateUi("vehicle", language)}</text>
  <text x="790" y="15" text-anchor="end" class="fpSmall" fill="${accent}">${escapeXml(layerLabel)}</text>
  <text x="98" y="72" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="55" font-weight="800" fill="${speedColor}"${speedFilter}>${speed}</text>
  <text x="98" y="88" text-anchor="middle" class="fpSmall" fill="${online ? "#9fdfff" : neutralValue}">km/h</text>
  <circle cx="224" cy="52" r="31" fill="#f5f5f5" stroke="${online ? "#ff3345" : neutralValue}" stroke-width="5"${online ? ' filter="url(#fpSoftRed)"' : ""}/>
  <text x="224" y="61" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="800" fill="#111">${allowedSpeed}</text>
  <text x="224" y="91" text-anchor="middle" class="fpSmall" fill="${online ? "#9fdfff" : neutralValue}">${translateUi("speed_limit", language)}</text>
  <line x1="275" y1="18" x2="275" y2="88" class="fpDivider"/>
  <line x1="405" y1="18" x2="405" y2="88" class="fpDivider"/>
  <line x1="555" y1="18" x2="555" y2="88" class="fpDivider"/>
  <text x="340" y="31" text-anchor="middle" class="fpLabel" fill="${accent}">${translateUi("gear", language)}</text>
  <text x="340" y="75" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="800" fill="${online ? "#ff4050" : neutralValue}"${online ? ' filter="url(#fpSoftRed)"' : ""}>${escapeXml(view.gear)}</text>
  <text x="480" y="31" text-anchor="middle" class="fpLabel" fill="${accent}">${translateUi("battery", language)}</text>
  <text x="480" y="63" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="29" font-weight="800" fill="${online ? "#7ee65b" : neutralValue}"${online ? ' filter="url(#fpSoftGreen)"' : ""}>${battery}</text>
  <rect x="438" y="72" width="84" height="8" rx="4" fill="#10251a" stroke="${online ? "#7ee65b" : neutralValue}" stroke-opacity=".6"/>
  <rect x="440" y="74" width="${batteryWidth}" height="4" rx="2" fill="${online ? "#7ee65b" : neutralValue}"/>
  <text x="632" y="28" class="fpVehicleLabel">${translateUi("doors", language)}</text><text x="770" y="28" text-anchor="end" class="fpVehicleValue" fill="${doorColor}">${view.doors}</text>
  <text x="632" y="48" class="fpVehicleLabel">${translateUi("parking_brake", language)}</text><text x="770" y="48" text-anchor="end" class="fpVehicleValue" fill="${brakeColor}">${view.parkingBrake}</text>
  <text x="632" y="68" class="fpVehicleLabel">${translateUi("kneeling", language)}</text><text x="770" y="68" text-anchor="end" class="fpVehicleValue" fill="${kneelingColor}">${view.mechanicalKneeling}</text>
  <text x="632" y="88" class="fpVehicleLabel">${view.powerSource === "average-consumption" || view.powerSource === "average-consumption-pending" ? translateUi("average_consumption", language) : translateUi("power", language)}</text><text x="770" y="88" text-anchor="end" class="fpVehicleValue" fill="${online ? "#7ee65b" : neutralValue}">${view.power}</text>`;
}

function navigationDistance(
  value: number | undefined,
  approximate = false,
  language = "de"
): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  const safe = Math.max(0, value);
  const formatted = safe < 1_000
    ? `${Math.round(safe)} m`
    : `${language === "de" ? (safe / 1_000).toFixed(1).replace(".", ",") : (safe / 1_000).toFixed(1)} km`;
  return approximate ? `≈${formatted}` : formatted;
}

function navigationPredictedDelta(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "--:--";
  const seconds = Math.trunc(value);
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "±";
  const absolute = Math.abs(seconds);
  return `${sign}${Math.floor(absolute / 60)}:${(absolute % 60).toString().padStart(2, "0")}`;
}

function navigationConfidence(value: RouteGuidanceModel["predictionConfidence"], language: string): string {
  if (value === "high") return translateUi("high", language);
  if (value === "medium") return translateUi("medium", language);
  if (value === "low") return translateUi("low", language);
  return "--";
}

function navigationManeuverLabel(kind: ManeuverKind, language: string): string {
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
    default: return "--";
  }
}

function navigationManeuverIcon(kind: ManeuverKind, color: string): string {
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
      return `<path d="M101 108V92C101 75 90 66 72 63L53 59V38M37 55L53 37L69 55" ${stroke}/>`;
    case "lane-right":
      return `<g transform="translate(144 0) scale(-1 1)"><path d="M101 108V92C101 75 90 66 72 63L53 59V38M37 55L53 37L69 55" ${stroke}/></g>`;
    case "uturn":
      return `<path d="M102 108V70C102 35 50 35 50 70V92M31 72L50 94L69 72" ${stroke}/>`;
    case "stop":
      return `<circle cx="72" cy="69" r="39" fill="#061018" stroke="${color}" stroke-width="6"/><text x="72" y="86" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="51" font-weight="900" fill="${color}">H</text>`;
    case "pause":
      return `<circle cx="72" cy="69" r="39" fill="#061018" stroke="${color}" stroke-width="6"/><path d="M58 48V90M86 48V90" ${stroke}/>`;
    case "destination":
      return `<path d="M48 108V34M50 37H101L90 55L101 73H50" ${stroke}/>`;
    default:
      return `<text x="72" y="92" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="67" font-weight="900" fill="${color}">?</text>`;
  }
}

function navigationTextUnits(value: string): number {
  let units = 0;
  for (const character of value) {
    if (character === " ") units += 0.35;
    else if (/[MWÄÖÜ@%&]/u.test(character)) units += 0.95;
    else if (/[Iil1|.,:;'!]/u.test(character)) units += 0.36;
    else if (/[A-Z0-9]/u.test(character)) units += 0.7;
    else units += 0.58;
  }
  return units;
}

function navigation(model: RouteGuidanceModel | undefined, language: string): string {
  if (!model || model.status === "offline") return offline(language);
  const active = model.activeManeuver;
  const maneuver = model.status === "live"
    && active?.id
    && Number.isFinite(active.distance)
    && active.kind !== "unavailable"
    && active.kind !== "recalculating"
    ? active
    : undefined;
  const uncertain = ["loading-map", "stale-route", "reversing"].includes(model.status)
    || model.status === "live" && !maneuver;
  const color = model.status === "off-route"
    ? "#ff4050"
    : uncertain
      ? "#ffc21d"
      : model.status === "live" && maneuver
        ? "#38c9ff"
        : "#8d96a3";
  const filter = model.status === "off-route"
    ? "url(#fpPanelRed)"
    : uncertain
      ? "url(#fpAmber)"
      : model.status === "live" && maneuver
        ? "url(#fpPanelCyan)"
        : "url(#fpNeutral)";
  const tint = model.status === "off-route"
    ? "#160607"
    : uncertain
      ? "#171203"
      : model.status === "live" && maneuver
        ? "#061018"
        : "#0b0f14";
  const maneuverKind = maneuver?.kind ?? "unavailable";
  const maneuverLabel = navigationManeuverLabel(maneuverKind, language);
  const maneuverDistance = navigationDistance(maneuver?.distance, false, language);
  const stopDistance = model.status === "live"
    ? navigationDistance(model.nextRelevantStopDistance, false, language)
    : "--";
  const stopName = model.status === "live"
    ? String(model.nextRelevantStop || "--")
    : "--";
  const targetLabel = model.nextTargetKind === "terminal-pause"
    ? translateUi("terminal_pause", language)
    : model.nextTargetKind === "destination" ? translateUi("destination", language) : translateUi("next_stop_short", language);
  const routeAvailable = model.status === "live";
  const remainingDistance = routeAvailable
    ? navigationDistance(model.remainingRouteDistance, model.routeDistanceEstimated, language)
    : "--";
  const routeProgress = routeAvailable && model.routeProgress !== undefined
    ? `${Math.round(100 * Math.max(0, Math.min(1, model.routeProgress)))}%`
    : "--";
  const eta = routeAvailable && model.estimatedArrivalTime
    ? `≈${model.estimatedArrivalTime}`
    : "--:--";
  const predictedDelta = routeAvailable
    ? navigationPredictedDelta(model.predictedScheduleDelta)
    : "--:--";
  const confidence = routeAvailable
    ? navigationConfidence(model.predictionConfidence, language)
    : "--";
  const predictionColor = !routeAvailable || model.predictedScheduleDelta === undefined
    ? color
    : model.predictedScheduleDelta >= 30
      ? "#ffc21d"
      : model.predictedScheduleDelta < -60
        ? "#ff4050"
        : "#78d83a";
  const stopSize = Math.max(
    9,
    Math.min(14, 190 / Math.max(navigationTextUnits(stopName), 1))
  );
  const maneuverSize = maneuverLabel.length >= 13 ? 13 : 16;

  return `<rect width="800" height="100" fill="#020407"/>
  <rect x="3" y="3" width="794" height="94" rx="10" fill="${tint}" stroke="${color}" stroke-width="2" filter="${filter}"/>
  <rect x="6" y="6" width="788" height="88" rx="8" fill="#02070b" fill-opacity=".76" stroke="#fff" stroke-opacity=".05"/>
  <text x="20" y="16" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".6" fill="${color}">${translateUi("navigation", language)}</text>
  <line x1="160" y1="20" x2="160" y2="88" class="fpDivider"/>
  <line x1="400" y1="20" x2="400" y2="88" class="fpDivider"/>
  <line x1="585" y1="20" x2="585" y2="88" class="fpDivider"/>
  <g data-active-maneuver-id="${escapeXml(maneuver?.id ?? "")}" transform="translate(42 7) scale(.7)" filter="${filter}">${navigationManeuverIcon(maneuverKind, color)}</g>
  <g data-active-maneuver-distance="${escapeXml(maneuver?.distance ?? "")}">
    <text x="280" y="32" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${maneuverSize}" font-weight="850" fill="${color}">${escapeXml(maneuverLabel)}</text>
    <text x="280" y="73" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#fff" filter="${filter}">${escapeXml(maneuverDistance)}</text>
  </g>
  <text x="492" y="29" text-anchor="middle" class="fpLabel" fill="${color}">${targetLabel}</text>
  <text x="492" y="52" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${stopSize.toFixed(1)}" font-weight="800" fill="#fff">${escapeXml(stopName)}</text>
  <text x="492" y="79" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="900" fill="${color}">${escapeXml(stopDistance)}</text>
  <line x1="594" y1="51" x2="788" y2="51" class="fpDivider"/>
  <g data-route-remaining="${escapeXml(remainingDistance)}">
    <text x="638" y="21" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" letter-spacing=".4" fill="${color}">${translateUi("remaining", language)}</text>
    <text x="638" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="#fff">${escapeXml(remainingDistance)}</text>
  </g>
  <g data-route-eta="${escapeXml(eta)}">
    <text x="744" y="21" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" letter-spacing=".4" fill="${color}">ETA</text>
    <text x="744" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="#fff">${escapeXml(eta)}</text>
  </g>
  <g data-route-progress="${escapeXml(routeProgress)}">
    <text x="638" y="66" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".25" fill="${color}">${translateUi("progress", language)}</text>
    <text x="638" y="91" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="#fff">${escapeXml(routeProgress)}</text>
  </g>
  <g data-route-predicted-delta="${escapeXml(predictedDelta)}" data-route-confidence="${escapeXml(confidence)}">
    <text x="744" y="64" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".35" fill="${predictionColor}">${translateUi("prediction", language)}</text>
    <text x="744" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" fill="${predictionColor}">${escapeXml(predictedDelta)}</text>
    <text x="744" y="94" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".25" fill="${predictionColor}">${escapeXml(confidence)}</text>
  </g>
  <text x="789" y="12" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="5" font-weight="700" fill="#fff" fill-opacity=".28">2.17</text>`;
}

function offline(language = getDisplayLanguage()): string {
  return `<rect width="800" height="100" fill="#05070a"/>
  <rect x="3" y="3" width="794" height="94" rx="10" fill="#0b0f14" stroke="#717985" stroke-width="2" filter="url(#fpNeutral)"/>
  <path d="M190 35H610M190 50H610M190 65H610" stroke="#717985" stroke-width="4" stroke-linecap="round" opacity=".22"/>
  <text x="400" y="58" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" letter-spacing="4" fill="#d2d6dc">${translateUi("offline", language)}</text>
  <text x="400" y="78" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" letter-spacing="1" fill="#8d96a3">${translateUi("game_disconnected", language)}</text>`;
}

function overlay(value: FullpanelOverlay): string {
  return `<g>
  <rect x="225" y="20" width="350" height="60" rx="10" fill="#030609" fill-opacity=".96" stroke="#a970ff" stroke-width="2.2" filter="url(#fpViolet)"/>
  <text x="400" y="42" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="#cda9ff">${escapeXml(value.title)}</text>
  <text x="400" y="66" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="800" fill="#fff">${escapeXml(value.value)}</text>
</g>`;
}

export function renderFullpanel(
  view: FullpanelViewModel,
  layer: FullpanelLayer,
  bright: boolean,
  activeOverlay?: FullpanelOverlay,
  guidance?: RouteGuidanceModel
): string {
  if (layer === "navigation") {
    return svg(
      navigation(guidance, view.language)
      + (activeOverlay ? overlay(activeOverlay) : "")
    );
  }
  if (view.runtimeState === "offline") {
    return svg(offline(view.language));
  }

  const content = layer === "timetable"
    ? timetable(view, bright)
    : vehicle(view);
  return svg(content + (activeOverlay ? overlay(activeOverlay) : ""));
}

export function renderFullpanelSegment(full: string, column: number): string {
  const start = full.indexOf(">");
  const inner = full.slice(start + 1, full.lastIndexOf("</svg>"));
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${columnIndex(column) * 200} 0 200 100">${inner}</svg>`
  );
}

export function renderFullpanelSetup(column: number, count: number): string {
  const language = getDisplayLanguage();
  const segment = columnIndex(column) + 1;
  const safeCount = Math.max(0, Math.min(4, Math.trunc(count)));
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <defs><filter id="a" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f4b942" flood-opacity=".75"/></filter></defs>
  <rect width="200" height="100" fill="#040507"/>
  <rect x="3" y="3" width="194" height="94" rx="10" fill="#120c03" stroke="#f4b942" stroke-width="2" filter="url(#a)"/>
  <text x="100" y="25" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="800" fill="#fff">${translateUi("fullpanel", language)}</text>
  <text x="100" y="48" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="700" fill="#f4b942">${translateUi("segment", language)} ${segment}</text>
  <text x="100" y="69" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#fff0c4">${translateUi("occupy_all_encoders", language)}</text>
  <text x="100" y="85" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#c9b892">${translateUi("detected", language)}: ${safeCount} / 4</text>
</svg>`);
}
