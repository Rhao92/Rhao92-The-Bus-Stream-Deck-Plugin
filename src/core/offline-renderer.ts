const escapeXml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function asDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** Einheitlicher neutraler Offline-Layer fuer normale 144-Pixel-Tasten. */
export function renderOfflineKey(label = "OFFLINE"): string {
  const safeLabel = escapeXml(label);
  return asDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#05070a"/>
  <rect x="5" y="5" width="134" height="134" rx="19" fill="#0b0f14" stroke="#717985" stroke-width="3"/>
  <path d="M38 57H106M38 72H106M38 87H106" stroke="#717985" stroke-width="5" stroke-linecap="round" opacity=".38"/>
  <text x="72" y="79" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="900" letter-spacing="1" fill="#d2d6dc">${safeLabel}</text>
</svg>`);
}

/**
 * Neutraler Platzhalter bei erreichbarer Telemetrie ohne bestaetigten Bus.
 * Er darf optisch und semantisch niemals mit OFFLINE verwechselt werden.
 */
export function renderUnavailableKey(label = "---"): string {
  const safeLabel = escapeXml(label);
  return asDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#05070a"/>
  <rect x="5" y="5" width="134" height="134" rx="19" fill="#0b0f14" stroke="#8d96a3" stroke-width="3"/>
  <text x="72" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="900" letter-spacing="2" fill="#d2d6dc">${safeLabel}</text>
</svg>`);
}

/** Neutraler No-Bus-Farbton ohne die Bedeutung OFFLINE. */
export const NO_BUS_COLORS = Object.freeze({
  accent: "#8d96a3",
  glow: "#5b6470",
  tint: "#0b0f14",
  value: "#d2d6dc"
});
