import json
import math
from pathlib import Path
from PIL import Image

TILE = 48
OUT_DIR = Path("web/data")


def main():

    with open("album_colors.json", "r") as f:
        album_colors = json.load(f)

    with open("albums.json", "r", encoding="utf-8") as f:
        album_info = json.load(f)

    entries = []
    for album_id, d in album_colors.items():
        try:
            img = Image.open(d["file_path"]).convert("RGB")
        except Exception as e:
            print(f"Skipping {album_id}: {e}")
            continue
        entries.append((album_id, d, img))

    cols = math.ceil(math.sqrt(len(entries)))
    rows = math.ceil(len(entries) / cols)
    atlas = Image.new("RGB", (cols * TILE, rows * TILE))

    albums = []
    for i, (album_id, d, img) in enumerate(entries):
        x = (i % cols) * TILE
        y = (i // cols) * TILE
        atlas.paste(img.resize((TILE, TILE), Image.LANCZOS), (x, y))

        info = album_info.get(album_id, {})
        albums.append({
            "id": album_id,
            "name": info.get("album_name", ""),
            "artists": info.get("artists", []),
            "lab": [round(v, 2) for v in d["lab"]],
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_DIR / "atlas.jpg", quality=85, optimize=True)

    with open(OUT_DIR / "albums.json", "w", encoding="utf-8") as f:
        json.dump({"tile": TILE, "cols": cols, "albums": albums}, f, separators=(",", ":"))

    print(f"Packed {len(albums)} albums into {cols}x{rows} atlas")


if __name__ == "__main__":
    main()
