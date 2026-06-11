#!/usr/bin/env python3
"""Generate the Schizo Studios publications catalog."""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

DEFAULT_ROOT = Path(__file__).resolve().parent

# These are considered paid/private: we list them but route to shop.
PAID_EXTS = {"pdf", "epub", "mobi", "azw3"}

# Skip generator + output + obvious junk.
SKIP_NAMES = {
    "index.html",
    "publications.json",
    "publications.json.tmp",
    "generate_publications_catalog.py",
    "shop-map.json",
    "shop_map.json",
    ".DS_Store",
}

# Skip these directories anywhere.
SKIP_DIRS = {".git", ".github", "__pycache__", "node_modules"}

# Safe fallback if no shop-map entry exists for a paid file.
SHOP_FALLBACK_URL = "https://shop.schizostudios.org/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_ROOT,
        help="Publications directory to scan (default: this script's directory).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Catalog output path (default: <root>/publications.json).",
    )
    return parser.parse_args()


def safe_rel(path: Path, root: Path) -> str:
    return str(path.relative_to(root)).replace("\\", "/")


def guess_title(filename: str) -> str:
    base = Path(filename).stem
    base = base.replace("_", " ").replace("-", " ").strip()
    return re.sub(r"\s+", " ", base)


def utc_iso_from_ts(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def load_shop_map(shop_map_file: Path) -> Dict[str, str]:
    if not shop_map_file.exists():
        return {}

    try:
        data = json.loads(shop_map_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read shop map {shop_map_file}: {error}") from error

    if not isinstance(data, dict):
        raise ValueError(f"Shop map {shop_map_file} must contain a JSON object")

    shop_map: Dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise ValueError(f"Shop map entries must be string-to-string mappings: {key!r}")
        shop_map[key.lstrip("/")] = value.strip()
    return shop_map


def is_in_skipped_dir(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def build_catalog(root: Path) -> Dict[str, Any]:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"Publications root is not a directory: {root}")

    shop_map = load_shop_map(root / "shop_map.json")
    items: List[Dict[str, Any]] = []

    for path in root.rglob("*"):
        if (
            path.is_dir()
            or path.name.startswith(".")
            or path.name in SKIP_NAMES
            or ".bak." in path.name
            or path.name.endswith("~")
        ):
            continue
        if is_in_skipped_dir(path.relative_to(root)):
            continue

        relative_path = safe_rel(path, root)
        path_parts = relative_path.split("/")
        category = path_parts[0] if len(path_parts) > 1 else "Unsorted"
        extension = path.suffix.lower().lstrip(".")
        stat = path.stat()

        item: Dict[str, Any] = {
            "title": guess_title(path.name),
            "relative_path": relative_path,
            "category": category,
            "tags": path_parts[1:-1] if len(path_parts) > 2 else [],
            "ext": extension,
            "size_bytes": stat.st_size,
            "updated_utc": utc_iso_from_ts(stat.st_mtime),
        }

        if extension in PAID_EXTS:
            item.update(
                visibility="paid",
                shop_url=shop_map.get(relative_path, SHOP_FALLBACK_URL),
            )
        else:
            item.update(visibility="public", shop_url=None)

        items.append(item)

    sorted_items = sorted(
        items,
        key=lambda item: (
            (item.get("category") or "").lower(),
            (item.get("visibility") or "").lower(),
            (item.get("title") or "").lower(),
            (item.get("relative_path") or "").lower(),
        ),
    )
    return {
        "generated_from": str(root),
        "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
        "count": len(sorted_items),
        "paid_exts": sorted(PAID_EXTS),
        "shop_fallback_url": SHOP_FALLBACK_URL,
        "items": sorted_items,
    }


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    output = args.output.resolve() if args.output else root / "publications.json"
    payload = build_catalog(root)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote: {output} ({payload['count']} items)")

    unmapped = [
        item
        for item in payload["items"]
        if item.get("visibility") == "paid"
        and item.get("shop_url") == SHOP_FALLBACK_URL
    ]
    if unmapped:
        print("\nUnmapped paid items (add these to shop_map.json):")
        for item in unmapped:
            print(" -", item["relative_path"])


if __name__ == "__main__":
    main()
