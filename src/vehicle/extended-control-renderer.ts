import type {
  ExteriorLightMode,
  ExteriorLightState,
  RetarderMode,
  RetarderState,
  SunBlindState,
  TicketControlMode,
  WiperMode,
  WiperState
} from "../core/extended-controls";
import { TICKET_CONTROL_DEFINITIONS } from "../core/extended-controls";
import { translateUi } from "../core/localization";

const COLORS = {
  active: "#38c9ff",
  inactive: "#8d96a3",
  available: "#78d83a",
  unavailable: "#717985",
  value: "#f5fbff"
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

function frame(content: string, color: string, title = translateUi("vehicle_function")): string {
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <title>${escapeXml(title)}</title>
  <defs><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${color}" flood-opacity=".82"/></filter></defs>
  <rect width="144" height="144" fill="#020407"/>
  <rect x="4" y="4" width="136" height="136" rx="19" fill="#061018" stroke="${color}" stroke-width="3" filter="url(#g)"/>
  <rect x="8" y="8" width="128" height="128" rx="16" fill="#02070b" fill-opacity=".84" stroke="#fff" stroke-opacity=".07"/>
  ${content}
  <text x="135" y="136" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="4" font-weight="700" fill="#fff" fill-opacity=".22">2.16</text>
  </svg>`);
}

function unavailable(label: string, icon: string): string {
  return frame(`<g opacity=".72">${icon}</g>
  <path d="M31 111L113 29" stroke="${COLORS.unavailable}" stroke-width="7" stroke-linecap="round" filter="url(#g)"/>
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" fill="${COLORS.value}">--</text>`, COLORS.unavailable, `${label}: ${translateUi("not_available")}`);
}

function arrow(direction: "up" | "down", color: string, x = 105, y = 35): string {
  const points = direction === "up"
    ? `${x - 11},${y + 7} ${x},${y - 5} ${x + 11},${y + 7}`
    : `${x - 11},${y - 7} ${x},${y + 5} ${x + 11},${y - 7}`;
  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" filter="url(#g)"/>`;
}

function retarderIcon(level: number | undefined, color: string): string {
  return `<circle cx="67" cy="67" r="36" fill="#061018" stroke="${color}" stroke-width="6" filter="url(#g)"/>
  <text x="67" y="79" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="${COLORS.value}">R${level ?? "–"}</text>`;
}

function sunBlindIcon(state: SunBlindState | undefined, color: string): string {
  const shade = 28 + (state === "down" ? 48 : 13);
  const direction = state === "up"
    ? `<path d="M72 48V87M57 73L72 89L87 73" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M72 88V49M57 63L72 47L87 63" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<path d="M31 28H113L104 101H40Z" fill="#061018" stroke="${color}" stroke-width="5" stroke-linejoin="round" filter="url(#g)"/>
  <path d="M34 28H110L104 ${shade}H40Z" fill="${color}" fill-opacity=".28"/>
  ${direction}`;
}

function wiperIcon(color: string): string {
  return `<path d="M29 91Q72 31 115 91L107 103H37Z" fill="#061018" stroke="${color}" stroke-width="5" stroke-linejoin="round" filter="url(#g)"/>
  <path d="M47 88L92 55" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="47" cy="88" r="5" fill="${color}"/>`;
}

function lightIcon(color: string, kind: "beam" | "parking" | "fog" = "beam"): string {
  if (kind === "parking") {
    return `<path d="M52 48Q35 51 35 72Q35 93 52 96ZM92 48Q109 51 109 72Q109 93 92 96Z" fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round" filter="url(#g)"/>
    <path d="M61 52V92M72 52V92M83 52V92" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
  }
  const beam = kind === "fog"
    ? `<path d="M64 52H111M64 69H102Q112 69 108 79Q104 89 94 89H66" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`
    : `<path d="M64 50H112M64 69H112M64 88H112" stroke="${color}" stroke-width="6" stroke-linecap="round"/>`;
  return `<path d="M56 43Q32 47 32 70Q32 94 56 99Z" fill="#061018" stroke="${color}" stroke-width="6" stroke-linejoin="round" filter="url(#g)"/>${beam}`;
}

function displayIcon(color: string): string {
  return `<rect x="31" y="27" width="82" height="70" rx="9" fill="#061018" stroke="${color}" stroke-width="6" filter="url(#g)"/>
  <rect x="42" y="38" width="60" height="40" rx="4" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="3"/>
  <text x="72" y="69" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="900" fill="${COLORS.value}">A</text>
  <path d="M53 88H91" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
}

function cashIcon(color: string): string {
  return `<rect x="29" y="40" width="86" height="52" rx="8" fill="#061018" stroke="${color}" stroke-width="6" filter="url(#g)"/>
  <circle cx="72" cy="66" r="17" fill="none" stroke="${color}" stroke-width="5"/>
  <text x="72" y="75" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="900" fill="${COLORS.value}">€</text>
  <path d="M49 106H95M58 97L49 106L58 115" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function valueKey(
  label: string,
  value: string,
  detail: string,
  color: string,
  valueSize = 35
): string {
  return frame(`<text x="72" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="850" letter-spacing=".55" fill="${color}">${escapeXml(label)}</text>
  <text x="72" y="86" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${valueSize}" font-weight="900" fill="${COLORS.value}" filter="url(#g)">${escapeXml(value)}</text>
  <text x="72" y="116" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" font-weight="800" fill="${color}">${escapeXml(detail)}</text>`, color);
}

export function renderRetarderKey(
  mode: RetarderMode,
  state: RetarderState
): string {
  if (!state.available || state.level === undefined) {
    return unavailable("RETARDER", retarderIcon(undefined, COLORS.unavailable));
  }
  const detail = mode === "increase"
    ? translateUi("stage_higher")
    : mode === "decrease"
      ? translateUi("stage_lower")
      : mode === "off"
        ? translateUi("retarder_off")
        : `${translateUi("target")} ${mode.slice(-1)}`;
  const control = mode === "increase"
    ? arrow("up", COLORS.active)
    : mode === "decrease"
      ? arrow("down", COLORS.active)
      : mode === "off"
        ? `<path d="M92 45L116 21" stroke="${COLORS.active}" stroke-width="7" stroke-linecap="round"/>`
        : `<circle cx="106" cy="34" r="16" fill="#061018" stroke="${COLORS.active}" stroke-width="4"/><text x="106" y="42" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.value}">${mode.slice(-1)}</text>`;
  const value = mode === "off"
    ? translateUi("off")
    : mode.startsWith("level-")
      ? `→ R${mode.slice(-1)}`
      : mode === "increase" ? "▲" : "▼";
  return frame(`${retarderIcon(state.level, COLORS.active)}${control}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.active}">${value}</text>`, COLORS.active, `RETARDER R${state.level}: ${detail}`);
}

export function renderSunBlindKey(state: SunBlindState | undefined): string {
  if (!state) {
    return unavailable(
      translateUi("sun_blind"),
      sunBlindIcon(undefined, COLORS.unavailable)
    );
  }
  return frame(`${sunBlindIcon(state, COLORS.active)}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="900" letter-spacing=".7" fill="${COLORS.value}">${translateUi("hold")}</text>`, COLORS.active, `${translateUi("sun_blind")} ${state === "up" ? translateUi("top") : translateUi("bottom")}: ${translateUi("hold")} – ${state === "up" ? translateUi("move_down") : translateUi("move_up")}`);
}

export function renderWiperKey(
  mode: WiperMode,
  state: WiperState | undefined
): string {
  if (!state) {
    return unavailable(
      translateUi("windshield_wiper"),
      wiperIcon(COLORS.unavailable)
    );
  }
  const labels: Record<WiperState, string> = {
    Off: translateUi("off"),
    Interval: "INT",
    On: "1",
    Fast: "2"
  };
  const color = state === "Off" ? COLORS.inactive : COLORS.active;
  return frame(`${wiperIcon(color)}${arrow(mode === "increase" ? "up" : "down", color)}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.value}">${labels[state]}</text>`, color, `${translateUi("windshield_wiper")} ${state}; ${mode === "increase" ? translateUi("stage_higher") : translateUi("stage_lower")}`);
}

function lightSwitchLabel(state: ExteriorLightState["switchState"]): string {
  switch (state) {
    case "Off": return translateUi("off");
    case "Parking Lights": return translateUi("parking_short");
    case "Headlights": return translateUi("headlights_short");
    case "Front Fog Light": return translateUi("front_fog_short");
    case "Rear Fog Light": return translateUi("rear_fog_short");
    default: return "--";
  }
}

export function renderExteriorLightKey(
  mode: ExteriorLightMode,
  state: ExteriorLightState
): string {
  if (mode === "switch-up" || mode === "switch-down") {
    if (!state.switchState) {
      return unavailable(translateUi("light_switch"), lightIcon(COLORS.unavailable));
    }
    const color = state.switchState === "Off" ? COLORS.inactive : COLORS.active;
    return frame(`${lightIcon(color)}${arrow(mode === "switch-up" ? "up" : "down", color)}
    <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="900" fill="${COLORS.value}">${lightSwitchLabel(state.switchState)}</text>`, color, `${translateUi("light_switch")} ${state.switchState}; ${mode === "switch-up" ? translateUi("position_higher") : translateUi("position_lower")}`);
  }

  const source: Record<Exclude<ExteriorLightMode, "switch-up" | "switch-down">, boolean | undefined> = {
    daytime: state.daytime,
    parking: state.parking,
    headlights: state.headlights,
    "high-beam": state.highBeam,
    "front-fog": state.frontFog,
    "rear-fog": state.rearFog
  };
  const labels: Record<Exclude<ExteriorLightMode, "switch-up" | "switch-down">, string> = {
    daytime: translateUi("daytime_lights"),
    parking: translateUi("parking_lights"),
    headlights: translateUi("headlights"),
    "high-beam": translateUi("high_beam"),
    "front-fog": translateUi("front_fog"),
    "rear-fog": translateUi("rear_fog")
  };
  const active = source[mode];
  const iconKind = mode === "parking"
    ? "parking"
    : mode === "front-fog" || mode === "rear-fog" ? "fog" : "beam";
  if (active === undefined) {
    return unavailable(
      labels[mode],
      lightIcon(COLORS.unavailable, iconKind)
    );
  }
  const color = active ? COLORS.active : COLORS.inactive;
  const displayOnly = mode !== "high-beam";
  const lock = displayOnly
    ? `<path d="M103 30V25A9 9 0 0 1 121 25V30M100 30H124V49H100Z" fill="#061018" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><circle cx="112" cy="39" r="2.5" fill="${color}"/>`
    : "";
  return frame(`${lightIcon(color, iconKind)}${lock}
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" fill="${COLORS.value}">${active ? translateUi("enabled") : translateUi("off")}</text>`, color, `${labels[mode]} ${active ? translateUi("enabled") : translateUi("off")}; ${displayOnly ? translateUi("display_only") : translateUi("toggle")}`);
}

export function renderTicketControlKey(
  mode: TicketControlMode,
  available: boolean
): string {
  const definition = TICKET_CONTROL_DEFINITIONS[mode];
  const isCoin = mode.startsWith("coin-");
  const unavailableIcon = mode === "atron"
    ? displayIcon(COLORS.unavailable)
    : mode === "take-cash"
      ? cashIcon(COLORS.unavailable)
      : `<circle cx="72" cy="65" r="38" fill="#061018" stroke="${COLORS.unavailable}" stroke-width="6"/>`;
  if (!available) {
    return unavailable(
      mode === "take-cash"
        ? "TAKE CASH"
        : isCoin ? translateUi("atron_coin") : "ATRON",
      unavailableIcon
    );
  }
  if (mode === "atron") {
    return frame(`${displayIcon(COLORS.available)}
    <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="${COLORS.value}">ATRON</text>`, COLORS.available, `${translateUi("onboard_computer_select")}; ${translateUi("real_event")}`);
  }
  if (mode === "take-cash") {
    return frame(`${cashIcon(COLORS.available)}
    <text x="72" y="126" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="900" fill="${COLORS.value}">${translateUi("accept")}</text>`, COLORS.available, `${translateUi("cash")} TAKE CASH; ${translateUi("real_event")}`);
  }
  return frame(`<circle cx="72" cy="65" r="38" fill="#061018" stroke="${COLORS.available}" stroke-width="6" filter="url(#g)"/>
  <text x="72" y="75" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="900" fill="${COLORS.value}">${escapeXml(definition.value.replace(" €", ""))}</text>
  <text x="72" y="124" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="900" fill="${COLORS.available}">€</text>`, COLORS.available, `${translateUi("atron_coin")} ${definition.value}; ${translateUi("real_event")}`);
}
