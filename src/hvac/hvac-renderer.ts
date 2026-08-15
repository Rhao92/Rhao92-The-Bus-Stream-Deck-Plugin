import type { HvacDialMode, HvacMode, HvacState } from "../core/hvac";

const COLORS = {
  active: "#38c9ff",
  inactive: "#8d96a3",
  unavailable: "#717985",
  value: "#f5fbff",
  warm: "#ff9f43"
} as const;

function escapeXml(value: unknown): string {
  return String(value ?? "--")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function temperature(value: number | undefined): string {
  return value === undefined
    ? "--.- °C"
    : `${value.toFixed(1).replace(".", ",")} °C`;
}

function frame(content: string, color: string, title = "KLIMA"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <title>${escapeXml(title)}</title>
  <defs>
    <filter id="hvacGlow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${color}" flood-opacity=".8"/></filter>
  </defs>
  <rect width="144" height="144" fill="#020407"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="#061018" stroke="${color}" stroke-width="3" filter="url(#hvacGlow)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#02070b" fill-opacity=".84" stroke="#fff" stroke-opacity=".07"/>
  ${content}
  <text x="135" y="136" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4" font-weight="700" fill="#fff" fill-opacity=".22">2.15 BETA</text>
  </svg>`;
}

function snowflake(color: string, x = 72, y = 61, radius = 29): string {
  const arms = [0, 60, 120]
    .map((rotation) => `<g transform="rotate(${rotation} ${x} ${y})"><path d="M${x - radius} ${y}H${x + radius}M${x - radius + 8} ${y - 8}L${x - radius + 16} ${y}L${x - radius + 8} ${y + 8}M${x + radius - 8} ${y - 8}L${x + radius - 16} ${y}L${x + radius - 8} ${y + 8}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`)
    .join("");
  return `<g filter="url(#hvacGlow)">${arms}</g><circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
}

function fan(color: string): string {
  const blade = `<path d="M68 61C51 59 44 48 50 37C57 25 70 43 72 59Z" fill="${color}" fill-opacity=".2" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>`;
  return `<g filter="url(#hvacGlow)">${blade}<g transform="rotate(120 72 67)">${blade}</g><g transform="rotate(240 72 67)">${blade}</g></g>
  <circle cx="72" cy="67" r="8" fill="#061018" stroke="${color}" stroke-width="5"/>`;
}

function powerBadge(color: string): string {
  return `<circle cx="108" cy="33" r="16" fill="#061018" stroke="${color}" stroke-width="4"/>
  <path d="M108 21V34M100 27A10 10 0 1 0 116 27" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
}

function letterBadge(letter: string, color: string): string {
  return `<circle cx="108" cy="33" r="16" fill="#061018" stroke="${color}" stroke-width="4"/>
  <text x="108" y="42" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="900" fill="${color}">${escapeXml(letter)}</text>`;
}

function circulation(color: string, front: boolean): string {
  return `<path d="M34 88Q31 51 58 43H88Q113 51 110 88L103 101H41Z" fill="#061018" stroke="${color}" stroke-width="5" stroke-linejoin="round" filter="url(#hvacGlow)"/>
  ${front ? `<path d="M42 79Q72 45 102 79" fill="none" stroke="${color}" stroke-width="4" stroke-opacity=".7"/>` : ""}
  <path d="M50 72Q58 54 78 57L89 61M83 50L91 62L78 68M94 80Q86 97 66 94L55 90M61 101L53 89L66 83" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function rearClimate(color: string): string {
  return `<path d="M34 37H110L104 103H40Z" fill="#061018" stroke="${color}" stroke-width="5" stroke-linejoin="round" filter="url(#hvacGlow)"/>
  <path d="M48 37V103M96 37V103" stroke="${color}" stroke-width="3" stroke-opacity=".5"/>
  ${snowflake(color, 72, 69, 20)}`;
}

function airflow(color: string): string {
  return `<path d="M35 43H83Q98 43 98 55Q98 67 83 67H53M35 83H93Q109 83 109 95Q109 107 93 107H67" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" filter="url(#hvacGlow)"/>
  <circle cx="35" cy="43" r="4" fill="${color}"/><circle cx="35" cy="83" r="4" fill="${color}"/>`;
}

function unavailable(label: string, icon: string): string {
  return dataUri(frame(`<g opacity=".7">${icon}</g>
  <path d="M31 111L113 29" stroke="${COLORS.unavailable}" stroke-width="7" stroke-linecap="round" filter="url(#hvacGlow)"/>
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" fill="${COLORS.value}">--</text>`, COLORS.unavailable, `${label}: NICHT VERFÜGBAR`));
}

function toggleKey(
  label: string,
  available: boolean,
  enabled: boolean | undefined,
  icon: (color: string) => string,
  onText = "EIN",
  offText = "AUS"
): string {
  if (!available) {
    return unavailable(label, icon(COLORS.unavailable));
  }

  const color = enabled === true
    ? COLORS.active
    : enabled === false
      ? COLORS.inactive
      : COLORS.unavailable;
  const status = enabled === true ? onText : enabled === false ? offText : "--";
  return dataUri(frame(`${icon(color)}${powerBadge(color)}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="900" fill="${COLORS.value}">${escapeXml(status)}</text>`, color, `${label}: ${status}`));
}

function fanKey(mode: "fan" | "fan-down", state: HvacState): string {
  if (!state.fanAvailable) {
    return unavailable("LÜFTER", fan(COLORS.unavailable));
  }

  const color = state.fanControlAvailable ? COLORS.active : COLORS.inactive;
  const value = state.fanStagePercent !== undefined
    ? `${Math.round(state.fanStagePercent)}%`
    : "--";
  const sign = mode === "fan" ? "+" : "−";
  const badge = state.fanControlAvailable
    ? `<circle cx="108" cy="35" r="16" fill="#061018" stroke="${color}" stroke-width="4"/><text x="108" y="44" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="900" fill="${color}">${sign}</text>`
    : `<path d="M100 31V26A9 9 0 0 1 118 26V31M97 31H121V50H97Z" fill="#061018" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><circle cx="109" cy="40" r="2.5" fill="${color}"/>`;
  return dataUri(frame(`${fan(color)}${badge}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="900" fill="${COLORS.value}">${value}</text>`, color, `LÜFTER ${mode === "fan" ? "HÖHER" : "NIEDRIGER"}; ${value}; ${state.fanControlAvailable ? "DREHREGLER" : "NUR ANZEIGE"}`));
}

function ventilationKey(state: HvacState): string {
  if (!state.ventilationAvailable) {
    return unavailable("AUTO-VENTILATION", fan(COLORS.unavailable));
  }

  const color = state.ventilationEnabled === true
    ? COLORS.active
    : state.ventilationEnabled === false
      ? COLORS.inactive
      : COLORS.unavailable;
  const status = state.ventilationEnabled === true ? "EIN" : state.ventilationEnabled === false ? "AUS" : "--";
  return dataUri(frame(`${fan(color)}
  <circle cx="108" cy="35" r="16" fill="#061018" stroke="${color}" stroke-width="4"/>
  <text x="108" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="21" font-weight="900" fill="${color}">A</text>
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.value}">${status}</text>`, color, `LÜFTER AUTOMATIK: ${status}`));
}

function airflowKey(mode: "airflow-left" | "airflow-right", state: HvacState): string {
  if (!state.airflowAvailable) {
    return unavailable("LUFTVERTEILUNG", airflow(COLORS.unavailable));
  }

  const stage = state.airflowStage !== undefined && state.airflowStageCount !== undefined
    ? `${state.airflowStage}/${state.airflowStageCount}`
    : "--";
  const direction = mode === "airflow-right" ? "right" : "left";
  const arrow = direction === "right"
    ? "M94 36H119M108 25L120 36L108 47"
    : "M119 36H94M105 25L93 36L105 47";
  return dataUri(frame(`${airflow(COLORS.active)}<path d="${arrow}" fill="none" stroke="${COLORS.active}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.value}">${stage}</text>`, COLORS.active, `LUFTVERTEILUNG ${direction === "right" ? "RECHTS" : "LINKS"}; STUFE ${stage}`));
}

export function renderHvacKey(mode: HvacMode, state: HvacState): string {
  if (mode === "climate") {
    if (!state.climateAvailable && !state.temperatureAvailable) {
      return unavailable("KLIMA", snowflake(COLORS.unavailable));
    }

    const color = state.climateEnabled === false
      ? COLORS.inactive
      : state.climateEnabled === true
        ? COLORS.active
        : COLORS.unavailable;
    const status = state.climateEnabled === true ? "EIN" : state.climateEnabled === false ? "AUS" : "--";
    return dataUri(frame(`${snowflake(color)}${powerBadge(color)}
    <text x="72" y="103" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" fill="${COLORS.value}">${escapeXml(temperature(state.temperatureC))}</text>
    <text x="72" y="126" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="${color}">${status}</text>`, color, `KLIMA ${status}; ${temperature(state.temperatureC)}`));
  }

  if (mode === "temperature-up" || mode === "temperature-down") {
    if (!state.temperatureAvailable) {
      return unavailable("TEMPERATUR", `<text x="72" y="84" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="900" fill="${COLORS.unavailable}">±1°</text>`);
    }

    const sign = mode === "temperature-up" ? "+1°" : "−1°";
    const color = state.temperatureControlAvailable ? COLORS.active : COLORS.inactive;
    return dataUri(frame(`<text x="72" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="900" fill="${COLORS.value}" filter="url(#hvacGlow)">${sign}</text>
    <text x="72" y="120" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="${color}">${escapeXml(temperature(state.temperatureC))}</text>`, color, `TEMPERATUR ${mode === "temperature-up" ? "HÖHER" : "TIEFER"}; ${temperature(state.temperatureC)}`));
  }

  if (mode === "fan" || mode === "fan-down") {
    return fanKey(mode, state);
  }
  if (mode === "ventilation") {
    return ventilationKey(state);
  }
  if (mode === "airflow-left" || mode === "airflow-right") {
    return airflowKey(mode, state);
  }
  if (mode === "ac-mode") {
    if (!state.acModeAvailable || state.coolingEnabled === undefined) {
      return unavailable("HEIZEN / KÜHLEN", snowflake(COLORS.unavailable));
    }
    const cooling = state.coolingEnabled;
    const color = cooling ? COLORS.active : COLORS.warm;
    const icon = cooling
      ? snowflake(color, 72, 62, 31)
      : `<path d="M46 96C35 83 54 75 44 61C34 47 53 39 48 28M72 101C58 86 81 76 68 60C57 46 78 38 72 25M98 96C87 83 106 75 96 61C86 47 105 39 100 28" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" filter="url(#hvacGlow)"/>`;
    const status = cooling ? "KÜHLEN" : "HEIZEN";
    return dataUri(frame(`${icon}
    <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="${COLORS.value}">${status}</text>`, color, `HEIZEN / KÜHLEN: ${status}`));
  }
  if (mode === "rear") {
    if (!state.rearAvailable) {
      return unavailable("KLIMA HINTEN", rearClimate(COLORS.unavailable));
    }
    const color = state.rearEnabled === true ? COLORS.active : state.rearEnabled === false ? COLORS.inactive : COLORS.unavailable;
    const status = state.rearEnabled === true ? "EIN" : state.rearEnabled === false ? "AUS" : "--";
    return dataUri(frame(`${rearClimate(color)}${letterBadge("R", color)}
    <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="900" fill="${COLORS.value}">${status}</text>`, color, `KLIMA HINTEN: ${status}`));
  }
  if (mode === "circulation-front") {
    if (!state.frontCirculationAvailable) {
      return unavailable("UMLUFT VORNE", circulation(COLORS.unavailable, true));
    }
    const color = state.frontCirculationEnabled === true ? COLORS.active : state.frontCirculationEnabled === false ? COLORS.inactive : COLORS.unavailable;
    const status = state.frontCirculationEnabled === true ? "EIN" : state.frontCirculationEnabled === false ? "AUS" : "--";
    return dataUri(frame(`${circulation(color, true)}${letterBadge("F", color)}
    <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="900" fill="${COLORS.value}">${status}</text>`, color, `UMLUFT VORNE: ${status}`));
  }

  return toggleKey("UMLUFT", state.circulationAvailable, state.circulationEnabled, (color) => circulation(color, false));
}

function dialFrame(label: string, value: string, detail: string, color: string): string {
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <title>${escapeXml(`${label}: ${value}; ${detail}`)}</title>
  <defs><filter id="g"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${color}" flood-opacity=".85"/></filter></defs>
  <rect width="200" height="100" fill="#020407"/>
  <rect x="3" y="3" width="194" height="94" rx="13" fill="#061018" stroke="${color}" stroke-width="3" filter="url(#g)"/>
  <text x="100" y="24" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="850" letter-spacing=".8" fill="${color}">${escapeXml(label)}</text>
  <text x="100" y="65" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="${COLORS.value}">${escapeXml(value)}</text>
  <text x="100" y="87" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="750" fill="${color}">${escapeXml(detail)}</text>
  </svg>`);
}

export function renderHvacDial(mode: HvacDialMode, state: HvacState): string {
  if (mode === "temperature") {
    const available = state.temperatureAvailable && state.temperatureControlAvailable;
    return dialFrame(
      "TEMPERATUR",
      temperature(state.temperatureC),
      available ? "DREHEN · ±1 °C" : "NICHT VERFÜGBAR",
      available ? COLORS.active : COLORS.unavailable
    );
  }

  if (mode === "fan-speed") {
    const readable = state.fanPercent !== undefined;
    const controllable = readable && state.fanControlAvailable;
    return dialFrame(
      "LÜFTERGESCHWINDIGKEIT",
      state.fanStagePercent === undefined ? "--" : `${Math.round(state.fanStagePercent)} %`,
      controllable
        ? "DREHEN · LANGSAMER / SCHNELLER"
        : readable
          ? "NUR ANZEIGE"
          : "NICHT VERFÜGBAR",
      controllable ? COLORS.active : readable ? COLORS.inactive : COLORS.unavailable
    );
  }

  const available = state.airflowAvailable;
  const stage = state.airflowStage !== undefined && state.airflowStageCount !== undefined
    ? `${state.airflowStage} / ${state.airflowStageCount}`
    : "--";
  return dialFrame(
    "LUFTVERTEILUNG",
    stage,
    available ? "DREHEN · LINKS / RECHTS" : "NICHT VERFÜGBAR",
    available ? COLORS.active : COLORS.unavailable
  );
}

export function renderHvacDialRuntime(status: "offline" | "no-bus"): string {
  return dialFrame(
    "KLIMA",
    status === "offline" ? "OFFLINE" : "---",
    status === "offline" ? "TELEMETRIE GETRENNT" : "NICHT IM BUS",
    COLORS.unavailable
  );
}
