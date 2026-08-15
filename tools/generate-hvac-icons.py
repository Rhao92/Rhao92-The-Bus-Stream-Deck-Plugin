from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "actions" / "hvac"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def render(size: int) -> Image.Image:
    scale = size / 144
    canvas_size = size * 4
    s = scale * 4
    cyan = "#38c9ff"
    background = Image.new("RGBA", (canvas_size, canvas_size), "#020407")

    glow = Image.new("RGBA", background.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(
        (5 * s, 5 * s, 139 * s, 139 * s),
        radius=19 * s,
        outline=cyan,
        width=max(1, round(4 * s)),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(max(1, round(5 * s))))
    background.alpha_composite(glow)

    draw = ImageDraw.Draw(background)
    draw.rounded_rectangle(
        (5 * s, 5 * s, 139 * s, 139 * s),
        radius=19 * s,
        fill="#061018",
        outline=cyan,
        width=max(1, round(3 * s)),
    )
    draw.ellipse((51 * s, 43 * s, 93 * s, 85 * s), outline=cyan, width=max(1, round(5 * s)))
    draw.line((72 * s, 50 * s, 72 * s, 78 * s), fill=cyan, width=max(1, round(5 * s)))
    draw.line((58 * s, 64 * s, 86 * s, 64 * s), fill=cyan, width=max(1, round(5 * s)))

    font = ImageFont.truetype(FONT, max(8, round(21 * s)))
    text = "HVAC"
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(
        ((canvas_size - (box[2] - box[0])) / 2, 94 * s),
        text,
        font=font,
        fill="#f5fbff",
    )

    return background.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    render(72).save(OUTPUT / "action.png", optimize=True)
    render(144).save(OUTPUT / "action@2x.png", optimize=True)


if __name__ == "__main__":
    main()
