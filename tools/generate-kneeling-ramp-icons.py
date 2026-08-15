from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "actions"
SIZE = 512

COLORS = {
    "neutral": (96, 188, 255, 255),
    "offline": (136, 148, 168, 255),
    "inactive": (147, 158, 176, 255),
    "ready": (255, 198, 57, 255),
    "active": (255, 72, 77, 255),
}

BG = (4, 13, 25, 255)
BORDER = (215, 223, 235, 255)
INNER_BORDER = (56, 83, 121, 255)


def glow_layer(size: tuple[int, int], mask: Image.Image, color: tuple[int, int, int, int], radius: int, strength: float = 0.3) -> Image.Image:
    alpha = mask.filter(ImageFilter.GaussianBlur(radius))
    alpha = alpha.point(lambda value: int(value * strength))
    layer = Image.new("RGBA", size, color)
    layer.putalpha(alpha)
    return layer


def draw_frame(accent: tuple[int, int, int, int]) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 255))
    outer_mask = Image.new("L", (SIZE, SIZE), 0)
    om = ImageDraw.Draw(outer_mask)
    om.rounded_rectangle((26, 26, 486, 486), radius=74, outline=160, width=14)
    img = Image.alpha_composite(img, glow_layer(img.size, outer_mask, (*accent[:3], 255), 18, 0.22))

    d = ImageDraw.Draw(img)
    d.rounded_rectangle((28, 28, 484, 484), radius=72, fill=BG, outline=BORDER, width=14)
    d.rounded_rectangle((48, 48, 464, 464), radius=55, outline=INNER_BORDER, width=5)
    d.rounded_rectangle((56, 56, 456, 456), radius=48, outline=(120, 157, 204, 55), width=2)
    return img


def stroke_glow(img: Image.Image, draw_fn, accent: tuple[int, int, int, int], blur: int = 15) -> None:
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    draw_fn(md, 255)
    img.alpha_composite(glow_layer(img.size, mask, (*accent[:3], 255), blur, 0.28))
    d = ImageDraw.Draw(img)
    draw_fn(d, accent)


def draw_bus_kneeling(img: Image.Image, accent: tuple[int, int, int, int], automatic: bool = False) -> None:
    def symbol(d: ImageDraw.ImageDraw, color) -> None:
        width = 15
        # Realistische Stadtbus-Seitenkontur, mit Front rechts.
        body = [
            (90, 188), (350, 188), (407, 205), (433, 245),
            (433, 318), (414, 342), (99, 342), (82, 321), (82, 220)
        ]
        d.line(body + [body[0]], fill=color, width=width, joint="curve")
        # Fensterband und Fahrerfront.
        d.line((108, 214, 337, 214), fill=color, width=10)
        d.line((351, 214, 399, 229, 414, 252), fill=color, width=10)
        # Einstiegs-Doppeltür an der rechten Fahrzeugseite.
        d.rounded_rectangle((344, 226, 414, 319), radius=9, outline=color, width=11)
        d.line((379, 231, 379, 314), fill=color, width=8)
        # Räder.
        for cx in (160, 302):
            d.ellipse((cx - 38, 304, cx + 38, 380), outline=color, width=14)
            d.ellipse((cx - 12, 330, cx + 12, 354), outline=color, width=8)
        # Bodenlinie: an der Türseite sichtbar abgesenkt.
        d.line((80, 378, 310, 378, 428, 394), fill=color, width=13)
        # Zwei klare Absenkpfeile direkt unter der Einstiegstür.
        for x in (370, 414):
            d.line((x, 344, x, 407), fill=color, width=13)
            d.polygon([(x, 432), (x - 22, 397), (x + 22, 397)], fill=color)

        if automatic:
            # Großer Kreis-/Automatikpfeil, eindeutig zusätzlich zur Absenkung.
            box = (74, 82, 222, 230)
            d.arc(box, start=35, end=322, fill=color, width=14)
            d.polygon([(195, 93), (222, 122), (184, 128)], fill=color)

    stroke_glow(img, symbol, accent, 17)


def draw_ramp(img: Image.Image, accent: tuple[int, int, int, int]) -> None:
    def symbol(d: ImageDraw.ImageDraw, color) -> None:
        width = 15
        # Ausschnitt eines echten Bustüreinstiegs.
        d.rounded_rectangle((82, 152, 258, 342), radius=18, outline=color, width=width)
        d.line((170, 163, 170, 324), fill=color, width=10)
        d.line((82, 342, 250, 342), fill=color, width=width)
        # Deutlich erkennbare ausklappbare Rampenplatte.
        ramp = [(238, 333), (432, 405), (414, 438), (220, 365)]
        d.line(ramp + [ramp[0]], fill=color, width=13, joint="curve")
        d.line((250, 354, 420, 417), fill=color, width=7)

        # Großes, vereinfachtes Rollstuhlsymbol unmittelbar über der Rampe.
        d.ellipse((272, 164, 322, 214), outline=color, width=12)  # Kopf
        d.line((298, 216, 313, 277), fill=color, width=14)       # Rücken
        d.line((312, 253, 360, 278), fill=color, width=14)       # Arm
        d.line((313, 278, 364, 331), fill=color, width=14)       # Bein
        d.line((306, 274, 267, 274), fill=color, width=14)       # Sitz
        d.ellipse((245, 255, 337, 347), outline=color, width=14)  # Rad
        d.line((364, 331, 397, 331), fill=color, width=14)

    stroke_glow(img, symbol, accent, 17)


def add_offline_slash(img: Image.Image, accent: tuple[int, int, int, int]) -> None:
    def slash(d: ImageDraw.ImageDraw, color) -> None:
        d.line((106, 405, 409, 106), fill=color, width=18)
    stroke_glow(img, slash, accent, 11)


def save_set(folder: str, kind: str, states: dict[str, str]) -> None:
    target = BASE / folder
    target.mkdir(parents=True, exist_ok=True)
    for filename, state in states.items():
        accent = COLORS[state]
        img = draw_frame(accent)
        if kind == "kneeling":
            draw_bus_kneeling(img, accent, automatic=False)
        elif kind == "automatic":
            draw_bus_kneeling(img, accent, automatic=True)
        elif kind == "ramp":
            draw_ramp(img, accent)
        else:
            raise ValueError(kind)
        if filename == "offline":
            add_offline_slash(img, accent)
        img.save(target / f"{filename}.png")


save_set("kneeling", "kneeling", {
    "action": "neutral",
    "offline": "offline",
    "inactive": "inactive",
    "ready": "ready",
    "active": "active",
})
save_set("automatic-kneeling", "automatic", {
    "action": "neutral",
    "offline": "offline",
    "inactive": "inactive",
    "active": "active",
})
save_set("ramp", "ramp", {
    "action": "neutral",
    "offline": "offline",
    "inactive": "inactive",
    "ready": "ready",
    "active": "active",
})

print("Kneeling-, Auto-Kneeling- und Rampenicons erzeugt.")
