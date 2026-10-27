// Browser port of mosaic.py: average each grid cell of the webcam frame,
// convert to LAB, and draw the album cover with the nearest average LAB color.
(function () {
  // ---------- color ----------

  // sRGB (0-255) -> CIELAB, D65, matching skimage.color.rgb2lab.
  function rgbToLab(r, g, b) {
    const lin = c => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const R = lin(r), G = lin(g), B = lin(b);
    const x = (0.412453 * R + 0.357580 * G + 0.180423 * B) / 0.95047;
    const y = (0.212671 * R + 0.715160 * G + 0.072169 * B);
    const z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  window.AlbumColor = { rgbToLab };

  // Nearest-album lookup, memoised over 6-bit-per-channel RGB (262k bins).
  // Replaces the KD-tree: each bin is solved once, then it's a table read.
  function makeMatcher(lab) {
    const n = lab.length / 3;
    const lut = new Int16Array(1 << 18).fill(-1);
    return function match(r, g, b) {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let idx = lut[key];
      if (idx >= 0) return idx;
      const [L, A, B] = rgbToLab((r & ~3) + 2, (g & ~3) + 2, (b & ~3) + 2);
      let best = Infinity;
      for (let i = 0, k = 0; i < n; i++, k += 3) {
        const dl = lab[k] - L, da = lab[k + 1] - A, db = lab[k + 2] - B;
        const d = dl * dl + da * da + db * db;
        if (d < best) { best = d; idx = i; }
      }
      lut[key] = idx;
      return idx;
    };
  }

  // ---------- dom ----------

  const $ = id => document.getElementById(id);
  const canvas = $("mosaic");
  const ctx = canvas.getContext("2d");
  const video = $("video");
  const stage = $("stage");
  const tooltip = $("tooltip");

  const SAMPLE = 3;            // sample pixels per cell edge, averaged
  const TARGET_WIDTH = 1600;   // output canvas width in px

  const sampler = document.createElement("canvas");
  const sctx = sampler.getContext("2d", { willReadFrequently: true });

  const state = {
    palette: null,
    curated: null,
    match: null,
    cols: Number($("grid").value),
    rows: 0,
    tilePx: 0,
    cells: new Int16Array(0),
    drawn: new Int16Array(0),
    mirror: true,
    paused: false,
    facing: "user",
    stream: null,
    hoverCell: -1,
  };

  // ---------- palette ----------

  function setPalette(palette) {
    state.palette = palette;
    state.match = makeMatcher(palette.lab);
    state.drawn.fill(-1);
    $("count-label").textContent = palette.albums.length.toLocaleString();
    setBrandMark([0, 1, 2, 3]);
  }

  async function loadCurated() {
    const [meta, img] = await Promise.all([
      fetch("data/albums.json").then(r => r.json()),
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Could not load data/atlas.jpg"));
        im.src = "data/atlas.jpg";
      }),
    ]);
    const lab = new Float32Array(meta.albums.length * 3);
    meta.albums.forEach((a, i) => lab.set(a.lab, i * 3));
    return {
      atlas: img,
      atlasUrl: "data/atlas.jpg",
      tile: meta.tile,
      cols: meta.cols,
      albums: meta.albums,
      lab,
    };
  }

  function coverStyle(el, idx, size) {
    const p = state.palette;
    const c = idx % p.cols, r = Math.floor(idx / p.cols);
    el.style.backgroundImage = `url("${p.atlasUrl}")`;
    el.style.backgroundSize = `${p.cols * size}px auto`;
    el.style.backgroundPosition = `${-c * size}px ${-r * size}px`;
  }

  // ---------- layout ----------

  function resize() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    state.rows = Math.max(1, Math.round(state.cols * vh / vw));
    state.tilePx = Math.max(4, Math.floor(TARGET_WIDTH / state.cols));
    canvas.width = state.cols * state.tilePx;
    canvas.height = state.rows * state.tilePx;
    sampler.width = state.cols * SAMPLE;
    sampler.height = state.rows * SAMPLE;
    const n = state.cols * state.rows;
    state.cells = new Int16Array(n);
    state.drawn = new Int16Array(n).fill(-1);
  }

  // ---------- render loop ----------

  function frame() {
    requestAnimationFrame(frame);
    if (state.paused || !state.palette || video.readyState < 2 || !state.rows) return;

    const { cols, rows, tilePx, cells, drawn, palette, match } = state;
    const sw = sampler.width, sh = sampler.height;

    sctx.save();
    if (state.mirror) { sctx.translate(sw, 0); sctx.scale(-1, 1); }
    sctx.drawImage(video, 0, 0, sw, sh);
    sctx.restore();
    const px = sctx.getImageData(0, 0, sw, sh).data;

    const area = SAMPLE * SAMPLE;
    const t = palette.tile;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < SAMPLE; dy++) {
          let o = ((row * SAMPLE + dy) * sw + col * SAMPLE) * 4;
          for (let dx = 0; dx < SAMPLE; dx++, o += 4) {
            r += px[o]; g += px[o + 1]; b += px[o + 2];
          }
        }
        const cell = row * cols + col;
        const idx = match((r / area) | 0, (g / area) | 0, (b / area) | 0);
        cells[cell] = idx;
        if (drawn[cell] === idx) continue;   // only repaint tiles that changed
        drawn[cell] = idx;
        ctx.drawImage(
          palette.atlas,
          (idx % palette.cols) * t, Math.floor(idx / palette.cols) * t, t, t,
          col * tilePx, row * tilePx, tilePx, tilePx
        );
      }
    }
  }

  // ---------- "mostly made of" ----------

  function updateTopAlbums() {
    if (!state.palette || !state.cells.length || state.paused) return;
    const counts = new Map();
    for (const idx of state.cells) counts.set(idx, (counts.get(idx) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = state.cells.length;

    const list = $("top-albums");
    list.replaceChildren(...top.map(([idx, n]) => {
      const album = state.palette.albums[idx];
      const li = document.createElement("li");
      li.innerHTML = `
        <a target="_blank" rel="noopener">
          <span class="ta-cover"></span>
          <span class="ta-text"><div class="ta-name"></div><div class="ta-artist"></div></span>
          <span class="ta-pct"></span>
        </a>`;
      li.querySelector("a").href = `https://open.spotify.com/album/${album.id}`;
      li.querySelector(".ta-name").textContent = album.name;
      li.querySelector(".ta-artist").textContent = album.artists.join(", ");
      li.querySelector(".ta-pct").textContent = `${Math.max(1, Math.round(100 * n / total))}%`;
      coverStyle(li.querySelector(".ta-cover"), idx, 28);
      return li;
    }));
    setAccent(top.map(([idx]) => idx));
    setBrandMark(top.slice(0, 4).map(([idx]) => idx));
  }
  setInterval(updateTopAlbums, 600);

  // ---------- accent from the albums you're made of ----------

  // CIELAB (D65) -> sRGB 0-255, the inverse of rgbToLab.
  function labToRgb(L, A, B) {
    const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
    const inv = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const x = 0.95047 * inv(fx), y = inv(fy), z = 1.08883 * inv(fz);
    const gamma = c => 255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
    return [
      gamma(3.240479 * x - 1.537150 * y - 0.498535 * z),
      gamma(-0.969256 * x + 1.875992 * y + 0.041556 * z),
      gamma(0.055648 * x - 0.204043 * y + 1.057311 * z),
    ].map(Math.round);
  }

  // The interface takes its color from the most-used album in the frame that
  // has any color, lifted and saturated so black text still reads on it.
  function setAccent(indices) {
    const lab = state.palette.lab;
    const idx = indices.find(i => Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]) >= 12);
    const root = document.documentElement.style;
    if (idx === undefined) {
      root.removeProperty("--accent");
      return;
    }
    const L = Math.min(80, Math.max(62, lab[idx * 3]));
    const [r, g, b] = labToRgb(L, lab[idx * 3 + 1] * 1.6, lab[idx * 3 + 2] * 1.6);
    root.setProperty("--accent", `rgb(${r}, ${g}, ${b})`);
  }

  // The Compass mark's four squares, filled with the albums you're most made of.
  function setBrandMark(indices) {
    if (!indices.length) return;
    document.querySelectorAll("#brand-mark i").forEach((el, k) => {
      coverStyle(el, indices[k % indices.length], el.clientWidth);
    });
  }

  // ---------- hover / click ----------

  function cellAt(e) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / rect.width * state.cols);
    const row = Math.floor((e.clientY - rect.top) / rect.height * state.rows);
    if (col < 0 || row < 0 || col >= state.cols || row >= state.rows) return -1;
    return row * state.cols + col;
  }

  canvas.addEventListener("mousemove", e => {
    const cell = cellAt(e);
    if (cell < 0 || !state.palette) { tooltip.hidden = true; return; }
    const idx = state.cells[cell];
    const album = state.palette.albums[idx];
    if (!album) return;

    if (cell !== state.hoverCell || tooltip.dataset.idx !== String(idx)) {
      state.hoverCell = cell;
      tooltip.dataset.idx = idx;
      $("tip-name").textContent = album.name;
      $("tip-artist").textContent = album.artists.join(", ");
      coverStyle($("tip-cover"), idx, 72);
    }
    tooltip.hidden = false;

    const s = stage.getBoundingClientRect();
    let x = e.clientX - s.left + 16, y = e.clientY - s.top + 16;
    if (x + tooltip.offsetWidth > s.width - 8) x = e.clientX - s.left - tooltip.offsetWidth - 16;
    if (y + tooltip.offsetHeight > s.height - 8) y = e.clientY - s.top - tooltip.offsetHeight - 16;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  });
  canvas.addEventListener("mouseleave", () => { tooltip.hidden = true; state.hoverCell = -1; });
  canvas.addEventListener("click", e => {
    const cell = cellAt(e);
    if (cell < 0 || !state.palette) return;
    const album = state.palette.albums[state.cells[cell]];
    if (album) window.open(`https://open.spotify.com/album/${album.id}`, "_blank", "noopener");
  });

  // ---------- camera ----------

  async function startCamera() {
    $("cam-error").hidden = true;
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      $("cam-error").textContent = err.name === "NotAllowedError"
        ? "Camera permission was blocked. Allow it in your browser's site settings and try again."
        : `Couldn't open a camera (${err.message || err.name}).`;
      $("cam-error").hidden = false;
      return;
    }
    video.srcObject = state.stream;
    await video.play();
    resize();
    $("splash").hidden = true;
    ["pause", "snap", "booth"].forEach(id => ($(id).disabled = false));

    const devices = await navigator.mediaDevices.enumerateDevices();
    $("flip").disabled = devices.filter(d => d.kind === "videoinput").length < 2;
  }

  video.addEventListener("loadedmetadata", resize);
  video.addEventListener("resize", resize);

  // ---------- controls ----------

  $("start").addEventListener("click", startCamera);

  $("grid").addEventListener("input", e => {
    state.cols = Number(e.target.value);
    $("grid-out").textContent = state.cols;
    resize();
  });
  $("grid-out").textContent = state.cols;

  $("mirror").addEventListener("change", e => {
    state.mirror = e.target.checked;
    video.classList.toggle("unmirrored", !state.mirror);
  });
  $("pip").addEventListener("change", e => video.classList.toggle("hidden", !e.target.checked));

  function togglePause() {
    state.paused = !state.paused;
    $("pause").textContent = state.paused ? "Resume" : "Pause";
    $("paused").hidden = !state.paused;
  }
  $("pause").addEventListener("click", togglePause);
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && state.stream && !shooting && e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      togglePause();
    }
  });

  $("snap").addEventListener("click", () => {
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `musical-mosaic-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  });

  // ---------- photobooth ----------

  const SHOTS = 4;
  const FRAME_W = 480, FRAME_H = 360, PAD = 32, GAP = 20, FOOT = 150;
  const PAPER = "#ffffff", PAPER_INK = "#000000", PAPER_MUTED = "#4d4d4d";
  const STRIP_FONT = '"Arimo", Arial, Helvetica, sans-serif';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let stripUrl = null;
  let shooting = false;

  // Grab the centre 4:3 of the current mosaic.
  function grabFrame() {
    const shot = document.createElement("canvas");
    shot.width = FRAME_W;
    shot.height = FRAME_H;
    const ch = canvas.height, cw = Math.min(canvas.width, ch * FRAME_W / FRAME_H);
    shot.getContext("2d").drawImage(canvas, (canvas.width - cw) / 2, 0, cw, ch, 0, 0, FRAME_W, FRAME_H);
    return shot;
  }

  function fitText(c, text, maxWidth) {
    if (c.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && c.measureText(text + "…").width > maxWidth) text = text.slice(0, -1);
    return text.trimEnd() + "…";
  }

  async function composeStrip(shots, counts) {
    const strip = document.createElement("canvas");
    strip.width = FRAME_W + PAD * 2;
    strip.height = PAD + SHOTS * FRAME_H + (SHOTS - 1) * GAP + FOOT;
    const c = strip.getContext("2d");
    c.fillStyle = PAPER;
    c.fillRect(0, 0, strip.width, strip.height);
    c.strokeStyle = PAPER_INK;
    c.lineWidth = 2;
    shots.forEach((shot, i) => {
      c.drawImage(shot, PAD, PAD + i * (FRAME_H + GAP));
      c.strokeRect(PAD - 1, PAD + i * (FRAME_H + GAP) - 1, FRAME_W + 2, FRAME_H + 2);
    });

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([idx]) => idx);
    let y = PAD + SHOTS * FRAME_H + (SHOTS - 1) * GAP + 50;

    // The mark: four covers in a black-framed 2x2, as on the page.
    const MARK = 32, cell = (MARK - 6) / 2, t = state.palette.tile, ac = state.palette.cols;
    const mx = PAD, my = y - 26;
    c.fillStyle = PAPER_INK;
    c.fillRect(mx, my, MARK, MARK);
    [0, 1, 2, 3].forEach(k => {
      const idx = ranked[k % ranked.length];
      c.drawImage(state.palette.atlas, (idx % ac) * t, Math.floor(idx / ac) * t, t, t,
        mx + 2 + (k % 2) * (cell + 2), my + 2 + Math.floor(k / 2) * (cell + 2), cell, cell);
    });

    await document.fonts.load('700 24px "Arimo"').catch(() => {});
    c.font = `700 24px ${STRIP_FONT}`;
    c.fillStyle = PAPER_INK;
    c.fillText("The Musical Mosaic", PAD + MARK + 12, y);

    c.font = `400 15px ${STRIP_FONT}`;
    c.fillStyle = PAPER_MUTED;
    const now = new Date();
    c.textAlign = "right";
    c.fillText(now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), strip.width - PAD, y);
    c.textAlign = "left";
    y += 10;

    const madeOf = ranked.slice(0, 3)
      .map(idx => state.palette.albums[idx].name);
    c.fillStyle = PAPER_INK;
    const words = `Made of ${madeOf.join(", ")}`.split(" ");
    let line = "";
    const lines = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > FRAME_W && line) { lines.push(line); line = word; }
      else line = test;
    }
    lines.push(line);
    if (lines.length > 2) lines.splice(1, lines.length, lines.slice(1).join(" "));
    lines.forEach((text, i) => c.fillText(fitText(c, text, FRAME_W), PAD, y + 20 + i * 22));

    return new Promise(r => strip.toBlob(r, "image/png"));
  }

  async function takeStrip() {
    if (shooting || !state.stream) return;
    shooting = true;
    if (state.paused) togglePause();
    setPanel(true);
    const locked = ["booth", "pause", "snap", "flip"];
    const wasDisabled = locked.map(id => $(id).disabled);
    locked.forEach(id => ($(id).disabled = true));
    $("booth").textContent = "Smile…";

    const shots = [];
    const counts = new Map();
    const overlay = $("booth-count"), flash = $("flash");
    overlay.hidden = false;
    for (let i = 0; i < SHOTS; i++) {
      $("booth-shot").textContent = `shot ${i + 1} of ${SHOTS}`;
      for (let n = 3; n > 0; n--) {
        $("booth-num").textContent = n;
        await sleep(i === 0 ? 800 : 550);
      }
      $("booth-num").textContent = "";
      shots.push(grabFrame());
      for (const idx of state.cells) counts.set(idx, (counts.get(idx) || 0) + 1);
      flash.classList.remove("pop");
      void flash.offsetWidth;   // restart the animation
      flash.classList.add("pop");
      await sleep(350);
    }
    overlay.hidden = true;

    const blob = await composeStrip(shots, counts);
    if (stripUrl) URL.revokeObjectURL(stripUrl);
    stripUrl = URL.createObjectURL(blob);
    const wrap = $("strip-wrap");
    let img = $("strip-img");
    if (!img) {
      img = document.createElement("img");
      img.className = "strip";
      img.id = "strip-img";
      img.alt = "Photo strip of four album-cover mosaic frames";
      wrap.append(img);
    }
    img.src = stripUrl;
    $("slot").hidden = false;
    wrap.classList.remove("printing");
    void wrap.offsetWidth;
    wrap.classList.add("printing");

    locked.forEach((id, i) => ($(id).disabled = wasDisabled[i]));
    $("booth").textContent = "Take another strip";
    shooting = false;
  }

  $("booth").addEventListener("click", takeStrip);
  $("strip-wrap").addEventListener("animationend", e => e.currentTarget.classList.remove("printing"));

  $("strip-save").addEventListener("click", () => {
    if (!stripUrl) return;
    const a = document.createElement("a");
    a.href = stripUrl;
    a.download = `musical-mosaic-strip-${Date.now()}.png`;
    a.click();
  });

  $("strip-discard").addEventListener("click", () => {
    $("slot").hidden = true;
    if (stripUrl) URL.revokeObjectURL(stripUrl);
    stripUrl = null;
    $("booth").textContent = "Take photo strip";
  });

  // ---------- panel ----------

  function setPanel(open) {
    document.body.classList.toggle("panel-closed", !open);
    $("panel-toggle").textContent = open ? "Hide controls" : "Show controls";
    $("panel-toggle").setAttribute("aria-expanded", String(open));
    try { localStorage.setItem("af-panel", open ? "open" : "closed"); } catch {}
  }
  $("panel-toggle").addEventListener("click", () => {
    setPanel(document.body.classList.contains("panel-closed"));
  });
  try { if (localStorage.getItem("af-panel") === "closed") setPanel(false); } catch {}

  $("flip").addEventListener("click", () => {
    state.facing = state.facing === "user" ? "environment" : "user";
    $("mirror").checked = state.mirror = state.facing === "user";
    video.classList.toggle("unmirrored", !state.mirror);
    startCamera();
  });

  // ---------- crates ----------

  function setActiveCrate(which) {
    $("src-curated").classList.toggle("active", which === "curated");
    $("src-spotify").classList.toggle("active", which === "spotify");
  }

  $("src-curated").addEventListener("click", () => {
    if (!state.curated) return;
    setPalette(state.curated);
    setActiveCrate("curated");
  });

  let spotifyPalette = null;
  $("src-spotify").addEventListener("click", () => {
    if (spotifyPalette) {
      setPalette(spotifyPalette);
      setActiveCrate("spotify");
      return;
    }
    if (!SpotifyCrate.isConfigured()) {
      $("spotify-status").textContent = "set spotifyClientId in config.js";
      return;
    }
    SpotifyCrate.beginLogin();
  });

  async function buildSpotifyCrate(token) {
    const btn = $("src-spotify");
    btn.disabled = true;
    $("progress").hidden = false;
    try {
      spotifyPalette = await SpotifyCrate.buildPalette(token, (frac, msg) => {
        $("progress-bar").style.width = `${Math.round(frac * 100)}%`;
        $("spotify-status").textContent = msg;
      });
      $("spotify-status").textContent = `${spotifyPalette.albums.length.toLocaleString()} albums`;
      setPalette(spotifyPalette);
      setActiveCrate("spotify");
    } catch (err) {
      $("spotify-status").textContent = err.message;
    } finally {
      btn.disabled = false;
      $("progress").hidden = true;
    }
  }

  // ---------- boot ----------

  (async function boot() {
    try {
      state.curated = await loadCurated();
      $("curated-count").textContent = `${state.curated.albums.length.toLocaleString()} albums`;
      setPalette(state.curated);
    } catch (err) {
      $("cam-error").textContent = `${err.message}. Run build_web_assets.py and serve the web/ folder over http.`;
      $("cam-error").hidden = false;
    }

    try {
      const token = await SpotifyCrate.handleRedirect();
      if (token) buildSpotifyCrate(token);
    } catch (err) {
      $("spotify-status").textContent = err.message;
    }

    requestAnimationFrame(frame);
  })();
})();
