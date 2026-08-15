from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "plugin"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SCALE = 4


def centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    font: ImageFont.FreeTypeFont,
    fill: str,
) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    draw.text(((144 * SCALE - width) / 2, y * SCALE), text, font=font, fill=fill)


def render() -> Image.Image:
    size = 144 * SCALE
    image = Image.new("RGB", (size, size), "#070700")
    draw = ImageDraw.Draw(image)
    amber = "#ffca0a"

    draw.rounded_rectangle(
        (8 * SCALE, 8 * SCALE, 136 * SCALE, 136 * SCALE),
        radius=21 * SCALE,
        outline=amber,
        width=5 * SCALE,
    )

    bus_font = ImageFont.truetype(FONT, 28 * SCALE)
    tag_font = ImageFont.truetype(FONT, 14 * SCALE)
    centered_text(draw, "BUS", 44, bus_font, amber)
    centered_text(draw, "RHAO92", 96, tag_font, amber)

    return image.resize((144, 144), Image.Resampling.LANCZOS)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    icon = render()
    for filename in ("category.png", "marketplace.png"):
        icon.save(OUTPUT_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()
