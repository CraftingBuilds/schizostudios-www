#!/usr/bin/env python3
"""
Schizo Studios Publications catalog generator

Creates: /var/www/schizo-studios/publications/publications.json

Rules:
- Paid formats (pdf/epub/mobi/azw3) are cataloged as visibility="paid"
  and MUST route to a shop URL (never direct download).
- Paid items get shop_url from shop_map.json (exact mapping).
- Public formats are cataloged as visibility="public" with local relative_path.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

ROOT = Path("/var/www/schizo-studios/publications").resolve()
OUT = ROOT / "publications.json"
SHOP_MAP_FILE = ROOT / "shop_map.json"

# These are considered paid/private: we list them but route to shop.
PAID_EXTS = {"pdf", "epub", "mobi", "azw3"}

# Skip generator + output + obvious junk
SKIP_NAMES = {
    "index.html",
    "publications.json",
    "generate_publications_catalog.py",
    "shop_map.json",
    ".DS_Store",
}

# Skip these directories anywhere
SKIP_DIRS = {".git", ".github", "__pycache__", "node_modules"}

# Safe fallback if no shop_map entry exists for a paid file
# Change this to a dedicated collection if you have one:
# e.g. "https://shop.schizostudios.org/collections/publications"
SHOP_FALLBACK_URL = "https://shop.schizostudios.org/"

def safe_rel(p: Path) -> str:
    return str(p.relative_to(ROOT)).replace("\\", "/")

def guess_title(filename: str) -> str:
    base = Path(filename).stem
    base = base.replace("_", " ").replace("-", " ").strip()
    base = re.sub(r"\s+", " ", base)
    # Optional: strip common suffixes like "final", "v2", etc. (commented out)
    # base = re.sub(r"\b(v\d+|final|draft)\b", "", base, flags=re.IGNORECASE).strip()
    return base

def utc_iso_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

def load_shop_map() -> Dict[str, str]:
    if not SHOP_MAP_FILE.exists():
        return {}
    try:
        data = json.loads(SHOP_MAP_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        # Normalize keys: no leading slashes
        out: Dict[str, str] = {}
        for k, v in data.items():
            if not isinstance(k, str) or not isinstance(v, str):
                continue
            out[k.lstrip("/")] = v.strip()
        return out
    except Exception:
        return {}

def is_in_skipped_dir(p: Path) -> bool:
    return any(part in SKIP_DIRS for part in p.parts)

def main() -> None:
    shop_map = load_shop_map()

    items: List[Dict[str, Any]] = []

    for p in ROOT.rglob("*"):
        if p.is_dir():
            # skip traversal into junk dirs
            if p.name in SKIP_DIRS:
                continue
            continue

        if p.name.startswith("."):
            continue
        if p.name in SKIP_NAMES:
            continue
        if is_in_skipped_dir(p):
            continue

        rel = safe_rel(p)               # e.g. "books/my-book.pdf"
        parts_rel = rel.split("/")
        category = parts_rel[0] if len(parts_rel) > 1 else "Unsorted"

        ext = p.suffix.lower().lstrip(".")
        stat = p.stat()

        # Folder tags beyond category
        tags: List[str] = []
        if len(parts_rel) > 2:
            tags.extend(parts_rel[1:-1])

        title = guess_title(p.name)

        base_item: Dict[str, Any] = {
            "title": title,
            "relative_path": rel,
            "category": category,
            "tags": tags,
            "ext": ext,
            "size_bytes": stat.st_size,
            "updated_utc": utc_iso_from_ts(stat.st_mtime),
        }

        if ext in PAID_EXTS:
            shop_url = shop_map.get(rel) or SHOP_FALLBACK_URL
            base_item.update({
                "visibility": "paid",
                "shop_url": shop_url,
            })
        else:
            base_item.update({
                "visibility": "public",
                "shop_url": None,
            })

        items.append(base_item)

    payload: Dict[str, Any] = {
        "generated_from": str(ROOT),
        "generated_utc": datetime.now(tz=timezone.utc).isoformat(),
        "count": len(items),
        "paid_exts": sorted(list(PAID_EXTS)),
        "shop_fallback_url": SHOP_FALLBACK_URL,
        "items": sorted(
            items,
            key=lambda x: (
                (x.get("category") or "").lower(),
                (x.get("visibility") or "").lower(),  # public before paid? (p comes after). If you want paid first, flip.
                (x.get("title") or "").lower(),
                (x.get("relative_path") or "").lower(),
            ),
        ),
    }

    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote: {OUT} ({len(items)} items)")

    # Optional: print unmapped paid items so you know what to add to shop_map.json
    unmapped = [it for it in items if it.get("visibility") == "paid" and it.get("shop_url") == SHOP_FALLBACK_URL]
    if unmapped:
        print("\nUnmapped paid items (add these to shop_map.json for exact product links):")
        for it in unmapped:
            print(" -", it["relative_path"])

if __name__ == "__main__":
    main()
