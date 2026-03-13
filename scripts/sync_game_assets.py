from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from pathlib import Path


DEFAULT_GAME_DIR = Path(r"C:\Program Files (x86)\Steam\steamapps\common\AoE2DE")
REPO_ROOT = Path(__file__).resolve().parents[1]
TARGET_ICON_DIR = REPO_ROOT / "img" / "icons"
TARGET_EMBLEM_DIR = REPO_ROOT / "img" / "emblems"
TARGET_STRINGS_PATH = REPO_ROOT / "resource" / "strings.json"

ICON_RELATIVE_DIR = Path("widgetui") / "textures" / "menu" / "civs"
EMBLEM_RELATIVE_DIR = Path("widgetui") / "textures" / "ingame" / "emblems"
STRINGS_RELATIVE_PATH = (
    Path("resources") / "en" / "strings" / "key-value" / "key-value-strings-utf8.txt"
)

CIV_SECTION_MARKER = "// Different civilizations that can be played."
CIV_LIST_END_MARKER = '"Number of Players"'
SKIPPED_CIV_ENTRIES = {"Custom", "Full Random", "Mirror", "Random"}

COLOR_LOOKUP = [
    {"id": 1, "string": "#0000FF"},
    {"id": 2, "string": "#FF0000"},
    {"id": 3, "string": "#00FF00"},
    {"id": 4, "string": "#FFFF00"},
    {"id": 5, "string": "#00FFFF"},
    {"id": 6, "string": "#800080"},
    {"id": 7, "string": "#808080"},
    {"id": 8, "string": "#FFA500"},
]

IRREGULAR_ASSET_NAMES = {
    "hindustanis": ["indians"],
    "maya": ["mayans"],
}

ENTRY_PATTERN = re.compile(r'^(?:IDS_[^\s]+|\d+)\s+"([^"]+)"$')
SLUG_PATTERN = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    return SLUG_PATTERN.sub("", value.lower())


def build_candidates(name: str) -> list[str]:
    slug = slugify(name)
    candidates = list(IRREGULAR_ASSET_NAMES.get(slug, []))
    candidates.append(slug)

    if slug.endswith("s"):
        candidates.append(slug[:-1])
    else:
        candidates.append(f"{slug}s")

    if slug.endswith("a"):
        candidates.append(f"{slug}s")

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate and candidate not in seen:
            deduped.append(candidate)
            seen.add(candidate)
    return deduped


def parse_civilizations(strings_path: Path) -> list[dict[str, object]]:
    lines = strings_path.read_text(encoding="utf-8-sig").splitlines()
    inside_civ_section = False
    civilizations: list[dict[str, object]] = []

    for line in lines:
        if not inside_civ_section:
            if CIV_SECTION_MARKER in line:
                inside_civ_section = True
            continue

        if CIV_LIST_END_MARKER in line:
            break

        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue

        match = ENTRY_PATTERN.match(stripped)
        if not match:
            continue

        name = match.group(1)
        if name in SKIPPED_CIV_ENTRIES:
            continue

        civilizations.append(
            {
                "id": len(civilizations) + 1,
                "string": name,
                "slug": slugify(name),
            }
        )

    if not civilizations:
        raise RuntimeError(f"Unable to parse civilizations from {strings_path}")

    return civilizations


def build_asset_index(asset_dir: Path) -> dict[str, str]:
    return {path.stem.lower(): path.name for path in asset_dir.glob("*.png")}


def resolve_asset_filename(name: str, asset_index: dict[str, str]) -> str | None:
    for candidate in build_candidates(name):
        if candidate in asset_index:
            return asset_index[candidate]

    slug = slugify(name)
    for stem, filename in asset_index.items():
        if stem.startswith(slug) or slug.startswith(stem):
            return filename

    return None


def copy_pngs(source_dir: Path, target_dir: Path, dry_run: bool) -> int:
    target_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for source_file in sorted(source_dir.glob("*.png")):
        copied += 1
        if not dry_run:
            shutil.copy2(source_file, target_dir / source_file.name)
    return copied


def write_strings_json(civilizations: list[dict[str, object]], dry_run: bool) -> None:
    payload = {"color": COLOR_LOOKUP, "civ": civilizations}
    if dry_run:
        return

    TARGET_STRINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    TARGET_STRINGS_PATH.write_text(
        json.dumps(payload, indent=4, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def source_snapshot(paths: list[Path]) -> tuple[object, ...]:
    snapshot: list[object] = []
    for path in paths:
        if path.is_dir():
            files = []
            for child in sorted(path.glob("*.png")):
                stat = child.stat()
                files.append((child.name, stat.st_size, stat.st_mtime_ns))
            snapshot.append((str(path), tuple(files)))
            continue

        stat = path.stat()
        snapshot.append((str(path), stat.st_size, stat.st_mtime_ns))

    return tuple(snapshot)


def sync(game_dir: Path, dry_run: bool) -> dict[str, int]:
    icon_source_dir = game_dir / ICON_RELATIVE_DIR
    emblem_source_dir = game_dir / EMBLEM_RELATIVE_DIR
    strings_source_path = game_dir / STRINGS_RELATIVE_PATH

    required_paths = [icon_source_dir, emblem_source_dir, strings_source_path]
    missing_paths = [path for path in required_paths if not path.exists()]
    if missing_paths:
        missing = "\n".join(str(path) for path in missing_paths)
        raise FileNotFoundError(f"Required AoE2DE paths are missing:\n{missing}")

    icon_count = copy_pngs(icon_source_dir, TARGET_ICON_DIR, dry_run=dry_run)
    emblem_count = copy_pngs(emblem_source_dir, TARGET_EMBLEM_DIR, dry_run=dry_run)

    icon_index = build_asset_index(icon_source_dir)
    emblem_index = build_asset_index(emblem_source_dir)
    civilizations = parse_civilizations(strings_source_path)

    missing_assets: list[str] = []
    for civilization in civilizations:
        name = str(civilization["string"])
        icon_filename = resolve_asset_filename(name, icon_index)
        emblem_filename = resolve_asset_filename(name, emblem_index)

        if icon_filename:
            civilization["icon"] = icon_filename
        else:
            missing_assets.append(f"icon:{name}")

        if emblem_filename:
            civilization["emblem"] = emblem_filename
        else:
            missing_assets.append(f"emblem:{name}")

    write_strings_json(civilizations, dry_run=dry_run)

    if missing_assets:
        print(
            "Warning: missing civ assets for "
            + ", ".join(missing_assets),
            file=sys.stderr,
        )

    return {
        "icons": icon_count,
        "emblems": emblem_count,
        "civilizations": len(civilizations),
    }


def watch(game_dir: Path, interval_seconds: float, dry_run: bool) -> None:
    watched_paths = [
        game_dir / ICON_RELATIVE_DIR,
        game_dir / EMBLEM_RELATIVE_DIR,
        game_dir / STRINGS_RELATIVE_PATH,
    ]
    previous_snapshot: tuple[object, ...] | None = None

    while True:
        current_snapshot = source_snapshot(watched_paths)
        if current_snapshot != previous_snapshot:
            result = sync(game_dir, dry_run=dry_run)
            print(
                f"Synced {result['icons']} icons, {result['emblems']} emblems, "
                f"{result['civilizations']} civilizations."
            )
            previous_snapshot = current_snapshot
        time.sleep(interval_seconds)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync AoE2DE civ assets and metadata from a local game install."
    )
    parser.add_argument(
        "--game-dir",
        type=Path,
        default=DEFAULT_GAME_DIR,
        help=f"Path to the AoE2DE install. Defaults to {DEFAULT_GAME_DIR}",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Continuously resync when the source files change.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds when --watch is enabled.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be synced without writing files.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    game_dir = args.game_dir.expanduser().resolve()

    if args.watch:
        watch(game_dir, interval_seconds=args.interval, dry_run=args.dry_run)
        return 0

    result = sync(game_dir, dry_run=args.dry_run)
    print(
        f"Synced {result['icons']} icons, {result['emblems']} emblems, "
        f"{result['civilizations']} civilizations."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
