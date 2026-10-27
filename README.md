# The Musical Mosaic

Turns a live webcam feed into a mosaic of album covers: each tile is matched to the cover whose average LAB colour is closest.

## Pipeline

1. `gather_album_art.py` – pull album info from a Spotify playlist into `albums.json`
2. `image_downloader.py` – download covers into `album-art/`
3. `avg_rgb_to_lab.py` – compute each cover's average colour → `album_colors.json`
4. `mosaic.py` – desktop OpenCV version
5. `build_web_assets.py` – pack covers into `web/data/atlas.jpg` + `web/data/albums.json` for the site

## Website (The Musical Mosaic)

```
python build_web_assets.py
cd web
python -m http.server 8000
```

Open http://127.0.0.1:8000/ (camera access needs `localhost`/`127.0.0.1` or HTTPS). `web/` is fully static, so it can be hosted on GitHub Pages, Netlify, etc. All video processing happens in the visitor's browser.

### "Your Spotify" crate

Visitors can swap the curated covers for their own saved albums, liked songs and top tracks. Set `spotifyClientId` in `web/config.js` and add the page URL (e.g. `http://127.0.0.1:8000/`) as a Redirect URI in the Spotify developer dashboard. It uses PKCE, so no client secret is shipped. Apps in Spotify's development mode only allow users you add to the app's allowlist.
