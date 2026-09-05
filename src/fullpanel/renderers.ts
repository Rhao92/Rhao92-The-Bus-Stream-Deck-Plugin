// @ts-nocheck -- getestete 2.13.0.27-SVG-Renderer, unverändert migriert.
import { formatUiDecimal, translateUi } from "../core/localization";
const COLORS = Object.freeze({
  green: "#78d83a",
  greenValue: "#7edb3f",
  yellow: "#ffc21d",
  amber: "#f4b942",
  red: "#ff4050",
  redValue: "#ff3345",
  cyan: "#38c9ff",
  white: "#ffffff",
});

const escapeXml = (value) => String(value ?? "--")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const asDataUri = (svg) =>
  `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

export function formatBatteryPercent(value, language = "de") {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "--";
  return `${formatUiDecimal(Math.max(0, Math.min(100, percent)), 1, language)}%`;
}

export function timetablePalette(view) {
  const language = view?.language ?? "de";
  const late = view?.status === translateUi("late", language);
  const early = view?.status === translateUi("early", language);
  const unknown = view?.status === translateUi("unknown", language);
  const offline = view?.runtimeState === "offline";
  const noBus = view?.runtimeState === "no-bus"
    || view?.runtimeState === "bus-not-ready";
  const unavailable = offline || noBus;
  const neutral = "#8d96a3";
  const accent = unavailable
    ? neutral
    : unknown
      ? COLORS.amber
      : late
        ? COLORS.red
        : early
          ? COLORS.yellow
          : COLORS.green;

  return {
    accent,
    delta: unavailable
      ? neutral
      : late
        ? COLORS.redValue
        : early || unknown
          ? COLORS.yellow
          : COLORS.greenValue,
    tint: late
      ? "#160607"
      : unavailable
        ? "#0b0f14"
        : early || unknown
          ? "#171203"
        : "#071108",
    glow: late
      ? COLORS.red
      : early || unknown || unavailable
        ? neutral
        : COLORS.green,
    route: late
      ? COLORS.red
      : unavailable
        ? neutral
        : early || unknown
          ? COLORS.yellow
        : "#6fbe36",
    late,
    early,
    unknown,
    offline,
    noBus,
  };
}

function singleFrame(content, palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <defs>
    <filter id="panel" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${palette.glow}" flood-opacity=".82"/></filter>
    <filter id="soft" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="${palette.glow}" flood-opacity=".9"/></filter>
    <filter id="stopBright" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff3345" flood-opacity="1"/><feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#ff3345" flood-opacity=".54"/></filter>
    <filter id="stopDim" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#a52634" flood-opacity=".8"/></filter>
  </defs>
  <rect width="200" height="100" fill="#020403"/>
  <rect x="3" y="3" width="194" height="94" rx="10" fill="${palette.tint}" stroke="${palette.accent}" stroke-width="2" filter="url(#panel)"/>
  <rect x="6" y="6" width="188" height="88" rx="8" fill="#020604" fill-opacity=".72" stroke="#fff" stroke-opacity=".05"/>
  ${content}
  <text x="192" y="94" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4.5" font-weight="700" fill="#fff" fill-opacity=".25">2.17</text>
  </svg>`;
}

function fittedStopName(value) {
  const text = String(value ?? "--");
  let units = 0;
  for (const character of text) {
    if (character === " ") units += 0.34;
    else if (/[MWÄÖÜ@%&]/u.test(character)) units += 0.92;
    else if (/[Iil1|.,:;'!]/u.test(character)) units += 0.34;
    else if (/[A-Z0-9]/u.test(character)) units += 0.68;
    else units += 0.56;
  }
  const naturalWidth = Math.max(40, units * 22);
  const maxWidth = 172;
  const fontSize = Math.max(10.5, Math.min(22, 22 * maxWidth / naturalWidth));
  const scaledWidth = naturalWidth * fontSize / 22;
  return {
    text,
    fontSize: Number(fontSize.toFixed(1)),
    fitted: scaledWidth > maxWidth + 1,
    maxWidth,
  };
}

function stopPanel(view, palette, bright) {
  const language = view?.language ?? "de";
  const metrics = fittedStopName(view?.stopName);
  const stopRequested = Boolean(view?.stopRequest);
  const fit = metrics.fitted
    ? ` textLength="${metrics.maxWidth}" lengthAdjust="spacingAndGlyphs"`
    : "";
  const stopBar = stopRequested
    ? `<g filter="${bright ? "url(#stopBright)" : "url(#stopDim)"}">
      <rect x="18" y="70" width="164" height="20" rx="5" fill="${bright ? "#d8172b" : "#070304"}" stroke="${bright ? "#ff4656" : "#a52634"}" stroke-width="2"/>
      <text x="100" y="85" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" letter-spacing="1.4" fill="#fff">STOP</text>
    </g>`
    : "";

  return `<text x="100" y="19" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7" font-weight="800" letter-spacing=".4" fill="${palette.route}">${translateUi("next_stop", language)}</text>
  <text x="100" y="54" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${metrics.fontSize}" font-weight="800" fill="#fff"${fit}>${escapeXml(metrics.text)}</text>
  ${stopBar}`;
}

function metricPanel(label, value, valueColor, palette, fontSize = 37) {
  return `<text x="100" y="28" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" letter-spacing=".7" fill="${palette.accent}">${label}</text>
  <text x="100" y="73" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="850" fill="${valueColor}" filter="url(#soft)">${escapeXml(value)}</text>`;
}

function stopStatusPanel(palette, bright, language = "de") {
  const fill = bright ? "#d8172b" : "#070304";
  const outline = bright ? "#ff4656" : "#a52634";
  const glow = bright ? "url(#stopBright)" : "url(#stopDim)";
  return `<g filter="${glow}">
    <path d="M22 32L35 20H165L178 32V76L165 88H35L22 76Z" fill="${fill}" stroke="${outline}" stroke-width="2.2"/>
    <text x="100" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" letter-spacing=".5" fill="#ff7782">${translateUi("stop_request", language)}</text>
    <text x="100" y="76" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#fff">STOP</text>
  </g>`;
}

export function renderSinglePanel(view, kind, bright = false) {
  const language = view?.language ?? "de";
  const palette = timetablePalette(view);
  if (view?.runtimeState === "offline") {
    const content = `<path d="M52 42H148M52 52H148M52 62H148" stroke="#717985" stroke-width="4" stroke-linecap="round" opacity=".25"/>
    <text x="100" y="58" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="23" font-weight="900" letter-spacing="2" fill="#d2d6dc">${translateUi("offline", language)}</text>`;
    return asDataUri(singleFrame(content, palette));
  }
  const live = view?.runtimeState === "bus-ready" || view?.runtimeState === "mission-ready";
  let content;

  switch (kind) {
    case "stop":
      content = stopPanel(view, palette, bright);
      break;
    case "arrival":
      content = metricPanel(translateUi("arrival", language), live ? view?.arrival : "--:--", COLORS.white, palette);
      break;
    case "departure":
      content = metricPanel(translateUi("departure", language), live ? view?.departure : "--:--", COLORS.white, palette);
      break;
    case "delta":
      content = metricPanel(translateUi("deviation", language), live ? view?.deltaText : "--:--", palette.delta, palette, 34);
      break;
    case "ingame":
      content = metricPanel(translateUi("ingame_time", language), live ? view?.ingameTime : "--:--:--", COLORS.white, palette, 30);
      break;
    case "status":
      content = view?.stopRequest
        ? stopStatusPanel(palette, bright, language)
        : metricPanel(
          translateUi("status", language),
          live ? view?.status : view?.connectionLabel ?? translateUi("offline", language),
          palette.accent,
          palette,
          live && String(view?.status ?? "").length > 9 ? 24 : 28,
        );
      break;
    default:
      throw new Error(`Unbekanntes Einzelpanel: ${kind}`);
  }

  return asDataUri(singleFrame(content, palette));
}

function vehicleKeypadFrame(content, accent, glow = accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs><filter id="keyGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${glow}" flood-opacity=".85"/></filter></defs>
  <rect width="144" height="144" fill="#020407"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="#061018" stroke="${accent}" stroke-width="3" filter="url(#keyGlow)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#02070b" fill-opacity=".8" stroke="#fff" stroke-opacity=".07"/>
  ${content}
  </svg>`;
}

function speedValueColor(view) {
  if (view?.connectionLabel !== "LIVE") return COLORS.white;
  if (view?.speedLevel === "critical") return COLORS.red;
  if (view?.speedLevel === "warning") return COLORS.yellow;
  return COLORS.white;
}

function vehicleUnavailableColor(view) {
  return view?.runtimeState === "no-bus"
    || view?.runtimeState === "bus-not-ready"
    ? "#8d96a3"
    : COLORS.amber;
}

export function renderKeypad(view, kind) {
  const language = view?.language ?? "de";
  const live = view?.runtimeState === "bus-ready" || view?.runtimeState === "mission-ready";

  if (view?.runtimeState === "offline") {
    const content = `<path d="M38 57H106M38 72H106M38 87H106" stroke="#717985" stroke-width="5" stroke-linecap="round" opacity=".35"/>
    <text x="72" y="80" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" letter-spacing="1" fill="#d2d6dc">${translateUi("offline", language)}</text>`;
    return asDataUri(vehicleKeypadFrame(content, "#717985", "#5b6470"));
  }

  if (kind === "speed") {
    const valueColor = speedValueColor(view);
    const accent = live ? COLORS.cyan : vehicleUnavailableColor(view);
    const value = live ? view?.speed ?? 0 : "--";
    const content = `<text x="72" y="88" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900" fill="${valueColor}" filter="url(#keyGlow)">${escapeXml(value)}</text>
    <text x="72" y="116" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" fill="${live ? "#9fdfff" : accent}">km/h</text>`;
    return asDataUri(vehicleKeypadFrame(content, accent, valueColor));
  }

  if (kind === "limit") {
    const accent = live ? COLORS.cyan : vehicleUnavailableColor(view);
    const value = live && Number(view?.allowedSpeed) > 0 ? view.allowedSpeed : "--";
    const content = `<circle cx="72" cy="72" r="48" fill="#f5f5f5" stroke="${live ? "#ff3345" : accent}" stroke-width="9" filter="url(#keyGlow)"/>
    <text x="72" y="87" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="43" font-weight="900" fill="#111">${escapeXml(value)}</text>`;
    return asDataUri(vehicleKeypadFrame(content, accent, "#ff3345"));
  }

  if (kind === "power") {
    const averageConsumption = view?.powerSource === "average-consumption"
      || view?.powerSource === "average-consumption-pending";
    const match = live
      ? String(view?.power ?? "").match(averageConsumption
        ? /^([−-]?\d+(?:[,.]\d)?)\s*kWh\/100 km$/u
        : /^([+−-]?\d+(?:[,.]\d)?)\s*kW$/u)
      : undefined;
    const value = match?.[1]?.replace("-", "−") ?? "--";
    const accent = live && match ? COLORS.cyan : vehicleUnavailableColor(view);
    const valueColor = live && match ? COLORS.greenValue : COLORS.white;
    const fontSize = value.length >= 7 ? 35 : value.length >= 6 ? 40 : value.length >= 5 ? 45 : 54;
    const content = `<text x="72" y="88" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="900" fill="${valueColor}" filter="url(#keyGlow)">${escapeXml(value)}</text>
    <text x="72" y="116" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${averageConsumption ? 10 : 14}" font-weight="700" fill="${live ? "#9ff2aa" : accent}">${averageConsumption ? "Ø kWh/100 km" : "kW"}</text>`;
    return asDataUri(vehicleKeypadFrame(content, accent, valueColor));
  }

  if (kind === "battery") {
    const rawPercent = Number(view?.batteryPercent);
    const hasValue = live && Number.isFinite(rawPercent);
    const percent = hasValue
      ? Math.max(0, Math.min(100, rawPercent))
      : undefined;
    const valueColor = percent === undefined
      ? vehicleUnavailableColor(view)
      : percent < 15
        ? COLORS.red
        : percent < 30
          ? COLORS.yellow
          : COLORS.greenValue;
    const accent = hasValue ? COLORS.cyan : vehicleUnavailableColor(view);
    const value = percent === undefined ? "--" : formatBatteryPercent(percent, language);
    const fillWidth = percent === undefined
      ? 0
      : Number((88 * percent / 100).toFixed(1));
    const content = `<g filter="url(#keyGlow)">
      <rect x="20" y="27" width="99" height="64" rx="10" fill="#03100b" stroke="${valueColor}" stroke-width="4"/>
      <rect x="120" y="46" width="8" height="26" rx="4" fill="${valueColor}"/>
    </g>
    <rect data-battery-track="continuous" x="26" y="35" width="88" height="48" rx="6" fill="#10241a" stroke="#ffffff" stroke-opacity=".1"/>
    <clipPath id="batteryFillClip"><rect x="26" y="35" width="88" height="48" rx="6"/></clipPath>
    <rect data-battery-fill="continuous" x="26" y="35" width="${fillWidth}" height="48" fill="${valueColor}" clip-path="url(#batteryFillClip)"/>
    <text x="72" y="122" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="900" fill="${valueColor}">${escapeXml(value)}</text>`;
    return asDataUri(vehicleKeypadFrame(content, accent, valueColor));
  }

  throw new Error(`Unbekannter Keypad-Typ: ${kind}`);
}

function timetableKeypadFrame(content, palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs>
    <filter id="keyGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${palette.glow}" flood-opacity=".85"/></filter>
    <filter id="valueGlow" x="-55%" y="-80%" width="210%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="2.3" flood-color="${palette.glow}" flood-opacity=".8"/></filter>
    <filter id="stopBright" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff3345" flood-opacity="1"/><feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#ff3345" flood-opacity=".54"/></filter>
    <filter id="stopDim" x="-60%" y="-100%" width="220%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#a52634" flood-opacity=".8"/></filter>
  </defs>
  <rect width="144" height="144" fill="#020403"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="${palette.tint}" stroke="${palette.accent}" stroke-width="3" filter="url(#keyGlow)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#020604" fill-opacity=".82" stroke="#fff" stroke-opacity=".07"/>
  ${content}
  <text x="135" y="136" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4" font-weight="700" fill="#fff" fill-opacity=".22">2.17</text>
  </svg>`;
}

function keypadTextUnits(value) {
  let units = 0;
  for (const character of String(value ?? "--")) {
    if (character === " ") units += 0.35;
    else if (/[MWÄÖÜ@%&]/u.test(character)) units += 0.95;
    else if (/[Iil1|.,:;'!]/u.test(character)) units += 0.36;
    else if (/[A-Z0-9]/u.test(character)) units += 0.7;
    else units += 0.58;
  }
  return units;
}

function splitKeypadStopName(value) {
  const text = String(value ?? "--").trim() || "--";
  if (keypadTextUnits(text) <= 12) return [text];

  const candidates = [];
  for (let index = 1; index < text.length - 1; index += 1) {
    if (/[ /-]/u.test(text[index])) candidates.push(index + (text[index] === " " ? 0 : 1));
  }
  if (!candidates.length) return [text];

  const midpoint = text.length / 2;
  const breakpoint = candidates.reduce((best, candidate) => (
    Math.abs(candidate - midpoint) < Math.abs(best - midpoint) ? candidate : best
  ));
  return [text.slice(0, breakpoint).trim(), text.slice(breakpoint).trim()];
}

function keypadStopPanel(view, palette, bright) {
  const language = view?.language ?? "de";
  const lines = splitKeypadStopName(view?.stopName);
  const requested = Boolean(view?.stopRequest);
  const maxUnits = Math.max(...lines.map(keypadTextUnits), 1);
  const maxFontSize = lines.length === 1 ? 23 : 19;
  const fontSize = Math.max(10, Math.min(maxFontSize, 116 / maxUnits));
  const fittedLines = lines.map((line) => {
    const estimatedWidth = keypadTextUnits(line) * fontSize;
    const fit = estimatedWidth > 116
      ? ' textLength="116" lengthAdjust="spacingAndGlyphs"'
      : "";
    return { line, fit };
  });
  const firstY = requested
    ? (lines.length === 1 ? 68 : 52)
    : (lines.length === 1 ? 82 : 68);
  const lineGap = fontSize + 5;
  const text = fittedLines.map(({ line, fit }, index) => (
    `<text x="72" y="${Number((firstY + index * lineGap).toFixed(1))}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${Number(fontSize.toFixed(1))}" font-weight="850" fill="#fff"${fit}>${escapeXml(line)}</text>`
  )).join("");
  const stopBar = requested
    ? `<g filter="${bright ? "url(#stopBright)" : "url(#stopDim)"}">
      <rect x="16" y="105" width="112" height="27" rx="7" fill="${bright ? "#d8172b" : "#070304"}" stroke="${bright ? "#ff4656" : "#a52634"}" stroke-width="2"/>
      <text x="72" y="125" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" letter-spacing="1.5" fill="#fff">STOP</text>
    </g>`
    : "";

  return `<text x="72" y="24" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7" font-weight="800" letter-spacing=".4" fill="${palette.route}">${translateUi("next_stop", language)}</text>
  ${text}
  ${stopBar}`;
}

function keypadMetric(label, value, color, fontSize = 37) {
  return `<text x="72" y="34" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" font-weight="800" letter-spacing=".65" fill="currentColor">${label}</text>
  <text x="72" y="92" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}" filter="url(#valueGlow)">${escapeXml(value)}</text>`;
}

function keypadStopStatus(bright, language = "de") {
  return `<g filter="${bright ? "url(#stopBright)" : "url(#stopDim)"}">
    <path d="M15 42L29 29H115L129 42V103L115 116H29L15 103Z" fill="${bright ? "#d8172b" : "#070304"}" stroke="${bright ? "#ff4656" : "#a52634"}" stroke-width="2.4"/>
    <text x="72" y="57" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7" font-weight="800" letter-spacing=".45" fill="#ff7782">${translateUi("stop_request", language)}</text>
    <text x="72" y="98" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="900" fill="#fff">STOP</text>
  </g>`;
}

export function renderTimetableKeypad(view, kind, bright = false) {
  const language = view?.language ?? "de";
  const palette = timetablePalette(view);
  if (view?.runtimeState === "offline") {
    const content = `<path d="M38 57H106M38 72H106M38 87H106" stroke="#717985" stroke-width="5" stroke-linecap="round" opacity=".35"/>
    <text x="72" y="80" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" letter-spacing="1" fill="#d2d6dc">${translateUi("offline", language)}</text>`;
    return asDataUri(timetableKeypadFrame(content, palette));
  }
  const live = view?.runtimeState === "bus-ready" || view?.runtimeState === "mission-ready";
  let content;

  switch (kind) {
    case "stop":
      content = keypadStopPanel(view, palette, bright);
      break;
    case "arrival":
      content = keypadMetric(translateUi("arrival", language), live ? view?.arrival : "--:--", COLORS.white);
      break;
    case "departure":
      content = keypadMetric(translateUi("departure", language), live ? view?.departure : "--:--", COLORS.white);
      break;
    case "delta":
      content = keypadMetric(translateUi("deviation", language), live ? view?.deltaText : "--:--", palette.delta, 34);
      break;
    case "ingame":
      content = keypadMetric(translateUi("ingame_time", language), live ? view?.ingameTime : "--:--:--", COLORS.white, 27);
      break;
    case "status": {
      const value = live ? view?.status : view?.connectionLabel ?? translateUi("offline", language);
      const fontSize = Math.max(17, Math.min(29, 116 / Math.max(keypadTextUnits(value), 1)));
      content = view?.stopRequest
        ? keypadStopStatus(bright, language)
        : keypadMetric(translateUi("status", language), value, palette.accent, Number(fontSize.toFixed(1)));
      break;
    }
    case "stop-request":
      content = keypadStopStatus(view?.stopRequest ? bright : false, language);
      break;
    default:
      throw new Error(`Unbekannter Fahrplan-Button: ${kind}`);
  }

  return asDataUri(timetableKeypadFrame(`<g color="${palette.accent}">${content}</g>`, palette));
}
