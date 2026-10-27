// "Your Spotify" crate: Authorization Code + PKCE (no client secret, no
// backend), then pull the user's albums and pack their covers into an atlas
// canvas the same way build_web_assets.py does for the curated crate.
(function () {
  const AUTH_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const API = "https://api.spotify.com/v1";
  const SCOPES = "user-library-read user-top-read";
  const MAX_ALBUMS = 2500;
  const TILE = 48;

  const clientId = () => (window.ALBUM_FILTER_CONFIG || {}).spotifyClientId || "";
  const redirectUri = () => location.origin + location.pathname;

  function randomString(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => chars[b % chars.length]).join("");
  }

  async function challengeFor(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function beginLogin() {
    const verifier = randomString(64);
    const state = randomString(16);
    sessionStorage.setItem("sp_verifier", verifier);
    sessionStorage.setItem("sp_state", state);
    const params = new URLSearchParams({
      client_id: clientId(),
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: SCOPES,
      state,
      code_challenge_method: "S256",
      code_challenge: await challengeFor(verifier),
    });
    location.href = `${AUTH_URL}?${params}`;
  }

  // Returns an access token if we just came back from Spotify, else null.
  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return null;

    history.replaceState(null, "", redirectUri());
    if (error) throw new Error(`Spotify login cancelled (${error})`);
    if (params.get("state") !== sessionStorage.getItem("sp_state")) {
      throw new Error("Spotify login state mismatch, try again");
    }

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: sessionStorage.getItem("sp_verifier") || "",
      }),
    });
    sessionStorage.removeItem("sp_verifier");
    sessionStorage.removeItem("sp_state");
    if (!res.ok) throw new Error(`Spotify token exchange failed (${res.status})`);
    return (await res.json()).access_token;
  }

  async function api(token, url) {
    const res = await fetch(url.startsWith("http") ? url : API + url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") || 1);
      await new Promise(r => setTimeout(r, wait * 1000));
      return api(token, url);
    }
    if (!res.ok) throw new Error(`Spotify API ${res.status} on ${url}`);
    return res.json();
  }

  async function collectAlbums(token, onStatus) {
    const albums = new Map();
    const add = album => {
      if (!album || !album.id || albums.has(album.id) || !album.images || !album.images.length) return;
      albums.set(album.id, album);
    };

    let url = "/me/albums?limit=50";
    while (url && albums.size < MAX_ALBUMS) {
      const page = await api(token, url);
      page.items.forEach(i => add(i.album));
      onStatus(`found ${albums.size} albums…`);
      url = page.next;
    }

    url = "/me/tracks?limit=50";
    while (url && albums.size < MAX_ALBUMS) {
      const page = await api(token, url);
      page.items.forEach(i => add(i.track && i.track.album));
      onStatus(`found ${albums.size} albums…`);
      url = page.next;
    }

    for (const range of ["long_term", "medium_term", "short_term"]) {
      const page = await api(token, `/me/top/tracks?limit=50&time_range=${range}`);
      page.items.forEach(t => add(t.album));
    }

    return Array.from(albums.values()).slice(0, MAX_ALBUMS);
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // Covers come largest-first; take the smallest one that still fills a tile.
  function pickImage(images) {
    const ok = images.filter(i => !i.width || i.width >= TILE);
    return (ok.length ? ok[ok.length - 1] : images[0]).url;
  }

  async function buildPalette(token, onProgress) {
    onProgress(0, "reading your library…");
    const list = await collectAlbums(token, msg => onProgress(0, msg));
    if (!list.length) throw new Error("No albums found in your Spotify library");

    const cols = Math.ceil(Math.sqrt(list.length));
    const atlas = document.createElement("canvas");
    atlas.width = cols * TILE;
    atlas.height = Math.ceil(list.length / cols) * TILE;
    const ctx = atlas.getContext("2d", { willReadFrequently: true });

    const albums = [];
    const labs = [];
    let next = 0;
    let done = 0;

    async function worker() {
      while (next < list.length) {
        const album = list[next++];
        let img;
        try {
          img = await loadImage(pickImage(album.images));
        } catch {
          done++;
          continue;
        }
        const slot = albums.length;
        const x = (slot % cols) * TILE;
        const y = Math.floor(slot / cols) * TILE;
        ctx.drawImage(img, x, y, TILE, TILE);

        const px = ctx.getImageData(x, y, TILE, TILE).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
        const n = px.length / 4;

        albums.push({ id: album.id, name: album.name, artists: album.artists.map(a => a.name) });
        labs.push(...window.AlbumColor.rgbToLab(r / n, g / n, b / n));
        done++;
        onProgress(done / list.length, `loading covers ${done}/${list.length}`);
      }
    }

    await Promise.all(Array.from({ length: 16 }, worker));

    const blob = await new Promise(r => atlas.toBlob(r, "image/jpeg", 0.9));
    return {
      atlas,
      atlasUrl: URL.createObjectURL(blob),
      tile: TILE,
      cols,
      albums,
      lab: new Float32Array(labs),
    };
  }

  window.SpotifyCrate = {
    isConfigured: () => Boolean(clientId()),
    redirectUri,
    beginLogin,
    handleRedirect,
    buildPalette,
  };
})();
