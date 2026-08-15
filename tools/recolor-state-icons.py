from __future__ import annotations

from pathlib import Path
from PIL import Image
import colorsys
import math

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "actions"

COLORS = {
    "cyan": (86, 190, 255),
    "cyan_dim": (55, 118, 164),
    "green": (70, 246, 170),
    "amber": (255, 199, 61),
    "amber_dim": (140, 105, 32),
    "red": (255, 75, 75),
    "red_dim": (150, 53, 53),
    "purple": (176, 108, 255),
    "white": (241, 247, 255),
}

# (relative path, current symbol color, target symbol color, central-only)
JOBS = [
    *[(f"{folder}/open.png", "green", "cyan", False)
      for folder in ("all-doors", "door-1", "door-2", "door-3", "door-4")],
    *[(f"{folder}/moving.png", "cyan", "amber", False)
      for folder in ("all-doors", "door-1", "door-2", "door-3", "door-4")],
    *[(f"{folder}/moving-dim.png", "cyan_dim", "amber_dim", False)
      for folder in ("all-doors", "door-1", "door-2", "door-3", "door-4")],
    ("kneeling/active.png", "purple", "red", False),
    ("door-clearance/active.png", "green", "amber", False),
    ("indicator-left/active-dim.png", "red_dim", "amber_dim", False),
    ("indicator-right/active-dim.png", "red_dim", "amber_dim", False),
    # Das Rampen-Aktivbild war neutral/weiß. Hier wird nur das große
    # Zentralpiktogramm rot; der silberne Rahmen bleibt unverändert.
    ("ramp/active.png", "white", "red", True),
]


def hue_distance(first: float, second: float) -> float:
    delta = abs(first - second)
    return min(delta, 1.0 - delta)


def rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def recolor(
    path: Path,
    source: tuple[int, int, int],
    target: tuple[int, int, int],
    central_only: bool
) -> None:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    source_h, source_s, _ = colorsys.rgb_to_hsv(*(value / 255 for value in source))
    target_h, target_s, _ = colorsys.rgb_to_hsv(*(value / 255 for value in target))

    changed = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            if central_only and not (
                0.16 * width <= x <= 0.84 * width
                and 0.16 * height <= y <= 0.84 * height
            ):
                continue

            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)

            if central_only:
                # Weißes Rampensymbol: neutrale, helle Pixel nur im Zentrum.
                matches = v >= 0.32 and (
                    s <= 0.22 or rgb_distance((r, g, b), source) <= 115
                )
            else:
                # Farbsymbol inklusive weich ausgeblendeter Glow-Pixel. Neutrale
                # Rahmenpixel werden durch die Mindestsaettigung ausgeschlossen.
                matches = s >= 0.18 and hue_distance(h, source_h) <= 0.075

            if not matches:
                continue

            nr, ng, nb = colorsys.hsv_to_rgb(target_h, target_s, v)
            pixels[x, y] = (
                round(nr * 255),
                round(ng * 255),
                round(nb * 255),
                a
            )
            changed += 1

    if changed == 0:
        raise RuntimeError(f"Keine passenden Pixel in {path}")

    image.save(path)


for relative, source_name, target_name, central_only in JOBS:
    file_path = ASSETS / relative
    if not file_path.exists():
        raise FileNotFoundError(file_path)
    recolor(file_path, COLORS[source_name], COLORS[target_name], central_only)

print(f"{len(JOBS)} Zustandsicons farblich korrigiert.")
