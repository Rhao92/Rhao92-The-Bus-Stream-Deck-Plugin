from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "de.rhao92.thebus-telemetry-interface.sdPlugin" / "imgs" / "actions"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SIZE = 512
SILVER = (206, 214, 226, 255)
SILVER_DIM = (133, 145, 164, 255)
BG = (7, 17, 30, 255)
INNER_LINE = (29, 48, 78, 255)
RED = (255, 66, 72, 255)
RED_GLOW = (255, 45, 55, 160)


def add_glow(image: Image.Image, mask: Image.Image, color: tuple[int, int, int, int], radius: int) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    layer = Image.new("RGBA", image.size, color)
    glow.paste(layer, (0, 0), mask.filter(ImageFilter.GaussianBlur(radius)))
    image.alpha_composite(glow)


def centered_text_mask(letter: str, font_size: int) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    font = ImageFont.truetype(FONT, font_size)
    bbox = draw.textbbox((0, 0), letter, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    # optisch minimal nach oben, damit der Buchstabe die Taste vollständig nutzt
    x = (SIZE - width) / 2
    y = (SIZE - height) / 2 - bbox[1] - 8
    draw.text((x, y), letter, font=font, fill=255)
    return mask


def render(letter: str, state: str) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    outer = (24, 24, SIZE - 24, SIZE - 24)
    inner = (42, 42, SIZE - 42, SIZE - 42)
    radius_outer = 78
    radius_inner = 58

    is_active = state == "active"
    is_offline = state == "offline"

    accent = RED if is_active else SILVER_DIM
    border_mask = Image.new("L", image.size, 0)
    border_draw = ImageDraw.Draw(border_mask)
    border_draw.rounded_rectangle(outer, radius=radius_outer, outline=255, width=8)
    add_glow(image, border_mask, RED_GLOW if is_active else (95, 145, 210, 65), 22 if is_active else 14)

    draw.rounded_rectangle(outer, radius=radius_outer, outline=SILVER, width=10)
    draw.rounded_rectangle(inner, radius=radius_inner, fill=BG, outline=INNER_LINE, width=4)

    # Der Buchstabe ist bewusst das dominante Element und belegt nahezu die
    # komplette nutzbare Fläche. Kein Hebel und keine Nebenbeschriftung.
    text_mask = centered_text_mask(letter, 326)
    if is_active:
        add_glow(image, text_mask, RED_GLOW, 28)
        text_color = RED
    else:
        text_color = SILVER_DIM

    text_layer = Image.new("RGBA", image.size, text_color)
    image.paste(text_layer, (0, 0), text_mask)

    # Der Diagonalstrich kennzeichnet ausschließlich einen unbekannten bzw.
    # noch nicht erkannten Gang. Sobald Telemetrie vorliegt, werden active oder
    # inactive ohne Strich verwendet.
    if is_offline:
        slash_mask = Image.new("L", image.size, 0)
        slash_draw = ImageDraw.Draw(slash_mask)
        slash_draw.line((122, 390, 390, 122), fill=255, width=24)
        add_glow(image, slash_mask, (130, 145, 170, 100), 10)
        slash_layer = Image.new("RGBA", image.size, SILVER_DIM)
        image.paste(slash_layer, (0, 0), slash_mask)

    return image


for folder, letter in (("gear-drive", "D"), ("gear-neutral", "N"), ("gear-reverse", "R")):
    target = ASSETS / folder
    for state in ("action", "inactive", "active", "offline"):
        render(letter, state).save(target / f"{state}.png")

print("12 Gangwahl-Icons neu erzeugt.")
