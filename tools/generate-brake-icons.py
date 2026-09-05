from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TARGET = (
    ROOT
    / "de.rhao92.thebus-telemetry-interface.sdPlugin"
    / "imgs"
    / "actions"
    / "stop-brake"
)
SIZE = 512
SILVER = (206, 214, 226, 255)
SILVER_DIM = (164, 172, 184, 255)
OFFLINE = (112, 121, 133, 255)
BG = (5, 14, 25, 255)
INNER_LINE = (30, 54, 92, 255)
RED = (255, 64, 64, 255)
RED_GLOW = (255, 48, 55, 155)


def font_path() -> str:
    candidates = (
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("No supported bold system font found")


def add_glow(
    image: Image.Image,
    mask: Image.Image,
    color: tuple[int, int, int, int],
    radius: int,
) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    layer = Image.new("RGBA", image.size, color)
    glow.paste(layer, (0, 0), mask.filter(ImageFilter.GaussianBlur(radius)))
    image.alpha_composite(glow)


def symbol_mask(letter: str) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(font_path(), 164)
    bbox = draw.textbbox((0, 0), letter, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (SIZE - width) / 2 - bbox[0]
    y = (SIZE - height) / 2 - bbox[1] - 4
    draw.text((x, y), letter, font=font, fill=255)
    return mask


def render(state: str) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    active = state in {"action", "active"}
    color = RED if active else OFFLINE if state == "offline" else SILVER_DIM

    outer = (24, 24, SIZE - 24, SIZE - 24)
    inner = (44, 44, SIZE - 44, SIZE - 44)
    border_mask = Image.new("L", image.size, 0)
    border_draw = ImageDraw.Draw(border_mask)
    border_draw.rounded_rectangle(outer, radius=76, outline=255, width=9)
    add_glow(
        image,
        border_mask,
        RED_GLOW if active else (95, 145, 210, 55),
        22 if active else 12,
    )

    draw.rounded_rectangle(outer, radius=76, outline=SILVER, width=10)
    draw.rounded_rectangle(inner, radius=57, fill=BG, outline=INNER_LINE, width=4)

    circle_mask = Image.new("L", image.size, 0)
    circle_draw = ImageDraw.Draw(circle_mask)
    circle_draw.ellipse((118, 118, 394, 394), outline=255, width=18)
    letter_mask = symbol_mask("H")
    symbol = ImageChops.lighter(circle_mask, letter_mask)

    if active:
        add_glow(image, symbol, RED_GLOW, 24)
    image.paste(Image.new("RGBA", image.size, color), (0, 0), symbol)

    if state == "offline":
        slash_mask = Image.new("L", image.size, 0)
        slash_draw = ImageDraw.Draw(slash_mask)
        slash_draw.line((108, 404, 404, 108), fill=255, width=22)
        image.paste(Image.new("RGBA", image.size, OFFLINE), (0, 0), slash_mask)

    return image


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for state in ("action", "inactive", "active", "offline"):
        render(state).save(TARGET / f"{state}.png", optimize=True)


if __name__ == "__main__":
    main()
