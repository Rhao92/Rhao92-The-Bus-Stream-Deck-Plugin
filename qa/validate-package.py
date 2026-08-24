from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageChops
import colorsys
import json
import re

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin"
MANIFEST = json.loads((PLUGIN / "manifest.json").read_text(encoding="utf-8"))
PACKAGE = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
LOCK = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


check(MANIFEST["Name"] == "Rhao92's The Bus Stream Deck Plugin", "Plugin-Name")
check(MANIFEST["Category"] == MANIFEST["Name"], "Einheitliche Kategorie")
check(MANIFEST["Author"] == "Rhao92", "Plugin-Autor")
check(MANIFEST["Version"] == "2.15.0.18", "Manifest-Version")
check(PACKAGE["name"] == "rhao92-the-bus-telemetry-interface", "package.json-Name")
check(PACKAGE["version"] == "2.15.0-beta.18", "package.json-Version")
check(LOCK["version"] == PACKAGE["version"], "package-lock Hauptversion")
check(LOCK["packages"][""]["version"] == PACKAGE["version"], "package-lock Rootversion")

actions = MANIFEST["Actions"]
uuids = [entry["UUID"] for entry in actions]
check(len(actions) == 50, "Erwartet 50 Manifest-Actions")
check(len(uuids) == len(set(uuids)), "Doppelte Manifest-UUID")

category_icon = Image.open(PLUGIN / "imgs" / "plugin" / "category.png").convert("RGB")
marketplace_icon = Image.open(PLUGIN / "imgs" / "plugin" / "marketplace.png").convert("RGB")
check(category_icon.size == (144, 144), "Kategorieicon-Größe")
check(marketplace_icon.size == (144, 144), "Marketplaceicon-Größe")
check(
    ImageChops.difference(category_icon, marketplace_icon).getbbox() is None,
    "Pluginicons weichen voneinander ab",
)

source_uuids: set[str] = set()
for source in (ROOT / "src").rglob("*.ts"):
    source_uuids.update(re.findall(r'@action\(\{ UUID: "([^"]+)" \}\)', source.read_text(encoding="utf-8")))
check(set(uuids) == source_uuids, f"Manifest/Source UUID-Abweichung: {set(uuids) ^ source_uuids}")

# Manifest-Bild- und PI-Verweise.
def check_reference(reference: str, extension: str | None = None) -> None:
    candidate = PLUGIN / reference
    if candidate.exists():
        return
    if extension and candidate.with_suffix(extension).exists():
        return
    raise AssertionError(f"Fehlender Verweis: {reference}")

for entry in actions:
    if entry.get("Icon"):
        check_reference(entry["Icon"], ".png")
    if entry.get("PropertyInspectorPath"):
        check_reference(entry["PropertyInspectorPath"])
    for state in entry.get("States", []):
        if state.get("Image"):
            check_reference(state["Image"], ".png")
    controllers = entry.get("Controllers", [])
    if isinstance(controllers, dict):
        controller_values = controllers.values()
    else:
        controller_values = [item for item in controllers if isinstance(item, dict)]
    for controller in controller_values:
        if controller.get("Icon"):
            check_reference(controller["Icon"], ".png")
        if controller.get("Feedback", {}).get("Layout"):
            check_reference(controller["Feedback"]["Layout"])

png_files = sorted((PLUGIN / "imgs" / "actions").rglob("*.png"))
check(len(png_files) == 157, f"Erwartet 157 Action-PNGs, gefunden {len(png_files)}")
sizes: dict[tuple[int, int], int] = {}
for path in png_files:
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        sizes[image.size] = sizes.get(image.size, 0) + 1
        check(image.mode in {"RGBA", "RGB", "P"}, f"Unerwarteter Bildmodus: {path}")

# Farbe des großen Zentralpiktogramms anhand ausreichend gesättigter Pixel.
def hue_count(relative: str, expected_hue: float, tolerance: float = 0.08) -> int:
    image = Image.open(PLUGIN / "imgs" / "actions" / relative).convert("RGBA")
    count = 0
    for r, g, b, a in image.getdata():
        if a < 80:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        delta = min(abs(h - expected_hue), 1 - abs(h - expected_hue))
        if s >= 0.45 and v >= 0.35 and delta <= tolerance:
            count += 1
    return count

hues = {
    "cyan": colorsys.rgb_to_hsv(86/255, 190/255, 1)[0],
    "amber": colorsys.rgb_to_hsv(1, 199/255, 61/255)[0],
    "red": colorsys.rgb_to_hsv(1, 75/255, 75/255)[0],
}
color_checks = [
    ("door-2/open.png", "cyan"),
    ("door-2/moving.png", "amber"),
    ("all-doors/mixed.png", "amber"),
    ("kneeling/ready.png", "amber"),
    ("kneeling/active.png", "red"),
    ("ramp/ready.png", "amber"),
    ("ramp/active.png", "red"),
    ("door-clearance/active.png", "amber"),
    ("indicator-left/active.png", "amber"),
    ("warning-lights/active.png", "red"),
    ("gear-drive/active.png", "red"),
    ("gear-neutral/active.png", "red"),
    ("gear-reverse/active.png", "red"),
]
for relative, color in color_checks:
    check(hue_count(relative, hues[color]) > 150, f"Zustandsfarbe {color} fehlt in {relative}")

# Gangwahl: Action und Inactive sind ohne Diagonalstrich identisch aufgebaut;
# ausschließlich Offline enthält die zusätzliche Unbekannt-Markierung.
for folder in ("gear-drive", "gear-neutral", "gear-reverse"):
    action_image = Image.open(PLUGIN / "imgs" / "actions" / folder / "action.png").convert("RGB")
    inactive_image = Image.open(PLUGIN / "imgs" / "actions" / folder / "inactive.png").convert("RGB")
    offline_image = Image.open(PLUGIN / "imgs" / "actions" / folder / "offline.png").convert("RGB")
    check(ImageChops.difference(action_image, inactive_image).getbbox() is None,
          f"Action/Inactive weichen unerwartet ab: {folder}")
    check(ImageChops.difference(offline_image, inactive_image).getbbox() is not None,
          f"Offline-Strich fehlt: {folder}")

# Neue Kneeling-/Rampenassets und Offline-Markierung.
for relative in [
    "kneeling/inactive.png",
    "automatic-kneeling/inactive.png",
    "ramp/inactive.png",
]:
    check((PLUGIN / "imgs" / "actions" / relative).exists(), f"Asset fehlt: {relative}")

bundle = (PLUGIN / "bin" / "plugin.js").read_text(encoding="utf-8")
for marker in [
    "de.rhao92.thebus-telemetry-interface.fullpanel",
    "de.rhao92.thebus-telemetry-interface.timetable-panel",
    "de.rhao92.thebus-telemetry-interface.timetable-button",
    "de.rhao92.thebus-telemetry-interface.vehicle-speed",
    "de.rhao92.thebus-telemetry-interface.vehicle-speed-limit",
    "de.rhao92.thebus-telemetry-interface.vehicle-power",
    "de.rhao92.thebus-telemetry-interface.vehicle-battery",
    "de.rhao92.thebus-telemetry-interface.navigation-maneuver",
    "de.rhao92.thebus-telemetry-interface.navigation-confidence",
    "de.rhao92.thebus-telemetry-interface.navigation-debug-capture",
    "de.rhao92.thebus-telemetry-interface.hvac-control",
    "de.rhao92.thebus-telemetry-interface.hvac-dial",
    "de.rhao92.thebus-telemetry-interface.retarder-control",
    "de.rhao92.thebus-telemetry-interface.sun-blind",
    "de.rhao92.thebus-telemetry-interface.wiper-control",
    "de.rhao92.thebus-telemetry-interface.exterior-light-control",
    "de.rhao92.thebus-telemetry-interface.ticket-control",
    "Light Indicator Left",
    "Light Indicator Right",
    "LED Warning",
    "Powermeter",
    "DisplayFuel",
    "SENKT AB",
    "HEBT AN",
    "GeoJsonRoadmap",
    "vehicleReadyForAutoKneeling",
    'data-battery-fill="continuous"',
    "RetarderUp",
    "RetarderDown",
    "RetarderOff",
    "RetarderLevel5",
    "WindowShadeDown",
    "WindowShadeUp",
    "WiperDown",
    "WiperUp",
    "LightSwitchDown",
    "LightSwitchUp",
    "ToggleTravellerLights",
    "Select Boardcomputer",
    "Coins5",
    "Coins800",
    "Take Cash Money",
    "NUR ANZEIGE",
    "2.15 BETA",
    "Navigation Blackbox",
]:
    check(marker in bundle, f"Runtime-Bundle-Marker fehlt: {marker}")

for retired_marker in [
    "de.rhao92.thebus-telemetry-interface.touch-display",
    "de.rhao92.thebus-telemetry-interface.key-display",
    "imageBase64",
    "AtronDisplayClient",
    "FanSpeedFake",
    "setbutton",
]:
    check(retired_marker not in bundle, f"Entfernter Bildpfad noch im Bundle: {retired_marker}")

print(f"Manifest: {len(actions)} Actions / {len(set(uuids))} eindeutige UUIDs")
print(f"Action-PNGs: {len(png_files)} valide Dateien; Größen: {sizes}")
print("Zustandsfarben: alle Stichproben bestanden")
print("Runtime-Bundle: zentrale Anzeigen und echte Lampenphasen vorhanden")
