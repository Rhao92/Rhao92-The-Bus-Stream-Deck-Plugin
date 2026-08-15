from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "actions"
CYAN = "#38c9ff"
WHITE = "#f5fbff"


def scaled_points(points: list[tuple[float, float]], scale: float) -> list[tuple[float, float]]:
    return [(x * scale, y * scale) for x, y in points]


def draw_frame(size: int) -> tuple[Image.Image, ImageDraw.ImageDraw, float]:
    scale = size / 144 * 4
    canvas_size = size * 4
    canvas = Image.new("RGBA", (canvas_size, canvas_size), "#020407")

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(
        (5 * scale, 5 * scale, 139 * scale, 139 * scale),
        radius=19 * scale,
        outline=CYAN,
        width=max(1, round(4 * scale)),
    )
    canvas.alpha_composite(
        glow.filter(ImageFilter.GaussianBlur(max(1, round(5 * scale))))
    )

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (5 * scale, 5 * scale, 139 * scale, 139 * scale),
        radius=19 * scale,
        fill="#061018",
        outline=CYAN,
        width=max(1, round(3 * scale)),
    )
    return canvas, draw, scale


def retarder(draw: ImageDraw.ImageDraw, scale: float) -> None:
    width = max(1, round(5 * scale))
    for y in (45, 67, 89):
        draw.line(
            scaled_points([(44, y), (72, y + 13), (100, y)], scale),
            fill=CYAN,
            width=width,
            joint="curve",
        )
    draw.line((44 * scale, 112 * scale, 100 * scale, 112 * scale), fill=WHITE, width=width)


def sun_blind(draw: ImageDraw.ImageDraw, scale: float) -> None:
    width = max(1, round(5 * scale))
    draw.rounded_rectangle(
        (35 * scale, 36 * scale, 109 * scale, 111 * scale),
        radius=10 * scale,
        outline=WHITE,
        width=width,
    )
    draw.rectangle((40 * scale, 41 * scale, 104 * scale, 69 * scale), fill=CYAN)
    for x in (52, 68, 84):
        draw.line((x * scale, 76 * scale, x * scale, 101 * scale), fill=CYAN, width=max(1, round(3 * scale)))
    draw.polygon(scaled_points([(95, 94), (105, 104), (85, 104)], scale), fill=CYAN)


def wiper(draw: ImageDraw.ImageDraw, scale: float) -> None:
    width = max(1, round(5 * scale))
    draw.arc(
        (28 * scale, 37 * scale, 116 * scale, 122 * scale),
        start=205,
        end=335,
        fill=WHITE,
        width=width,
    )
    draw.line((46 * scale, 100 * scale, 96 * scale, 50 * scale), fill=CYAN, width=max(1, round(7 * scale)))
    draw.ellipse((42 * scale, 96 * scale, 52 * scale, 106 * scale), fill=CYAN)
    for x in (45, 72, 99):
        draw.line((x * scale, 31 * scale, (x - 7) * scale, 43 * scale), fill=CYAN, width=max(1, round(3 * scale)))


def exterior_lights(draw: ImageDraw.ImageDraw, scale: float) -> None:
    width = max(1, round(5 * scale))
    draw.arc(
        (35 * scale, 38 * scale, 91 * scale, 107 * scale),
        start=90,
        end=270,
        fill=WHITE,
        width=width,
    )
    draw.line((64 * scale, 39 * scale, 64 * scale, 106 * scale), fill=WHITE, width=width)
    for y in (49, 70, 91):
        draw.line((75 * scale, y * scale, 112 * scale, (y - 9) * scale), fill=CYAN, width=max(1, round(4 * scale)))


def ticket(draw: ImageDraw.ImageDraw, scale: float) -> None:
    width = max(1, round(5 * scale))
    outline = scaled_points(
        [(31, 48), (45, 48), (49, 40), (95, 40), (99, 48), (113, 48), (113, 94), (99, 94), (95, 102), (49, 102), (45, 94), (31, 94)],
        scale,
    )
    draw.polygon(outline, outline=WHITE, width=width)
    draw.line((70 * scale, 46 * scale, 70 * scale, 96 * scale), fill=CYAN, width=max(1, round(3 * scale)))
    draw.ellipse((80 * scale, 57 * scale, 101 * scale, 78 * scale), outline=CYAN, width=max(1, round(4 * scale)))


DRAWERS = {
    "retarder": retarder,
    "sun-blind": sun_blind,
    "wiper": wiper,
    "exterior-lights": exterior_lights,
    "ticket-control": ticket,
}


def render(kind: str, size: int) -> Image.Image:
    canvas, draw, scale = draw_frame(size)
    DRAWERS[kind](draw, scale)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    for kind in DRAWERS:
        directory = OUTPUT / kind
        directory.mkdir(parents=True, exist_ok=True)
        render(kind, 72).save(directory / "action.png", optimize=True)
        render(kind, 144).save(directory / "action@2x.png", optimize=True)


if __name__ == "__main__":
    main()
