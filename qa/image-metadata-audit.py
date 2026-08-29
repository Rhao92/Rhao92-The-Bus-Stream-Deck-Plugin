from __future__ import annotations

from pathlib import Path
import re
import sys

from PIL import Image


SENSITIVE_KEYS = {
    "artist",
    "author",
    "comment",
    "copyright",
    "description",
    "exif",
    "parameters",
    "software",
    "title",
}
PRIVATE_VALUE = re.compile(
    r"(?:[A-Za-z]:\\Users\\|/Users/|AppData|\.codex|"
    r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})",
    re.IGNORECASE,
)
SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def iter_images(arguments: list[str]):
    for argument in arguments:
        path = Path(argument)
        if path.is_dir():
            yield from (
                candidate
                for candidate in path.rglob("*")
                if candidate.is_file() and candidate.suffix.lower() in SUPPORTED_SUFFIXES
            )
        elif path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES:
            yield path


def main() -> int:
    images = sorted(set(iter_images(sys.argv[1:])))
    if not images:
        raise SystemExit("No supported images supplied for metadata audit.")

    findings: list[tuple[Path, str]] = []
    for image_path in images:
        with Image.open(image_path) as image:
            for key, value in image.info.items():
                if key.lower() in SENSITIVE_KEYS or PRIVATE_VALUE.search(str(value)):
                    findings.append((image_path, key))
            if image.getexif():
                findings.append((image_path, "EXIF"))

    print(f"Images inspected: {len(images)}")
    print(f"Suspicious metadata entries: {len(findings)}")
    for image_path, category in findings:
        print(f"{image_path} [{category}]")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
