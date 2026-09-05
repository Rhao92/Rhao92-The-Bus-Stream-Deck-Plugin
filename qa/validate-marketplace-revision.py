from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image


PUBLIC_NAME = "Rhao92's The Bus Stream Deck Plugin"
MARKETPLACE_NAME = "The Bus Control Center"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files(root: Path) -> set[str]:
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    }


def verify_white_icon(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = list(image.getdata())
    visible = [(red, green, blue, alpha) for red, green, blue, alpha in pixels if alpha > 0]
    check(bool(visible), f"Leeres Marketplace-Icon: {path}")
    check(
        all(red == 255 and green == 255 and blue == 255 for red, green, blue, _ in visible),
        f"Marketplace-Icon ist nicht rein weiß: {path}",
    )
    check(any(alpha < 255 for _, _, _, alpha in pixels), f"Transparenz fehlt: {path}")


if len(sys.argv) != 3:
    raise SystemExit(
        "Usage: validate-marketplace-revision.py <source.sdPlugin> <marketplace.sdPlugin>"
    )

source = Path(sys.argv[1]).resolve()
marketplace = Path(sys.argv[2]).resolve()
check(source.is_dir(), f"Quellplugin fehlt: {source}")
check(marketplace.is_dir(), f"Marketplace-Plugin fehlt: {marketplace}")

source_files = files(source)
marketplace_files = files(marketplace)
check(source_files == marketplace_files, "Marketplace-Kopie hat abweichende Dateien")

source_manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
marketplace_manifest = json.loads((marketplace / "manifest.json").read_text(encoding="utf-8"))
check(source_manifest["Name"] == PUBLIC_NAME, "Unerwarteter öffentlicher Quellname")
check(marketplace_manifest["Name"] == MARKETPLACE_NAME, "Marketplace-Name fehlt")
check(marketplace_manifest["Category"] == MARKETPLACE_NAME, "Marketplace-Kategorie fehlt")
check(source_manifest["UUID"] == marketplace_manifest["UUID"], "Plugin-UUID verändert")
check(source_manifest["Version"] == marketplace_manifest["Version"], "Version verändert")
check(source_manifest["Actions"] == marketplace_manifest["Actions"], "Action-Definitionen verändert")
check(source_manifest["CodePath"] == marketplace_manifest["CodePath"], "Runtime-Pfad verändert")

source_english = json.loads((source / "en.json").read_text(encoding="utf-8"))
marketplace_english = json.loads((marketplace / "en.json").read_text(encoding="utf-8"))
check(marketplace_english["Name"] == MARKETPLACE_NAME, "Englischer Marketplace-Name fehlt")
check(
    {key: value for key, value in source_english.items() if key not in {"Name", "Description"}}
    == {key: value for key, value in marketplace_english.items() if key not in {"Name", "Description"}},
    "Englische Action-Übersetzungen wurden verändert",
)

visible_icon_references = {
    action["Icon"]
    for action in marketplace_manifest["Actions"]
    if action.get("VisibleInActionsList", True)
}
neutral_icons = {
    f"{reference}{suffix}.png"
    for reference in visible_icon_references | {marketplace_manifest["CategoryIcon"]}
    for suffix in ("", "@2x")
}

branding_files = {"property-inspector.html"} | {
    relative
    for relative in source_files
    if relative.startswith("property-inspector/")
    and (relative.endswith(".html") or relative.endswith(".js"))
}

allowed_differences = {"manifest.json", "en.json"} | branding_files | neutral_icons
for relative in sorted(source_files - allowed_differences):
    check(
        digest(source / relative) == digest(marketplace / relative),
        f"Unzulässige Marketplace-Abweichung: {relative}",
    )

for relative in branding_files:
    source_text = (source / relative).read_text(encoding="utf-8")
    marketplace_text = (marketplace / relative).read_text(encoding="utf-8")
    check(
        marketplace_text == source_text.replace(PUBLIC_NAME, MARKETPLACE_NAME),
        f"Property Inspector wurde über das Branding hinaus verändert: {relative}",
    )

for relative in sorted(neutral_icons):
    verify_white_icon(marketplace / relative)

check(
    digest(source / "bin/plugin.js") == digest(marketplace / "bin/plugin.js"),
    "Runtime-Bundle ist nicht bytegleich",
)
check(
    all(
        digest(source / relative) == digest(marketplace / relative)
        for relative in source_files
        if relative.startswith("imgs/actions/")
    ),
    "Farbige Tasten- und Zustandsbilder wurden verändert",
)

print(
    "Marketplace-Revision geprüft: gleiche UUIDs, gleiche Runtime, gleiche farbige "
    "Tastenbilder; nur sichtbares Branding und weiße Listenicons weichen ab."
)
