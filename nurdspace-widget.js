// name: nurdspace-iOS-widget.js
// description: Nurdspace Space Status + Power usage + sparkline + Random/Latest project with Retro CRT terminal aesthetic

const WIKI_BASE = "https://nurdspace.nl";
const PROJECTS_URL = "https://nurdspace.nl/Projects";
const MAIN_PAGE_URL = "https://nurdspace.nl/Main_Page";

const SPACEAPI_STATUS_URL = "https://space.nurdspace.nl/spaceapi/status.json";
const STATUS_TAP_URL = MAIN_PAGE_URL;

// =====================================================
// Project selection mode: "random" | "latest"
// =====================================================
const PROJECT_MODE = "latest";

// =====================================================
// Theme: "light-crt" | "cga"
// =====================================================
const THEME = "cga";

// =====================================================
// CRT intensity (only affects light-crt)
// 0.6 = subtle, 1.0 = default, 1.4 = strong
// =====================================================
const CRT_INTENSITY = 1.15;

// Power history cache
const POWER_HISTORY_FILE = "nurdspace_power_history.json";
const POWER_HISTORY_MAX = 48;

// Theme colors (overridden per theme)
let TEXT = new Color("#000000");
let SUBTEXT = new Color("#333333");
let ACCENT = new Color("#00aa00");
let RED = new Color("#b00020");

applyTheme();

const widget = await createWidget();
if (!config.runsInWidget) await widget.presentMedium();
else Script.setWidget(widget);
Script.complete();

function applyTheme() {
  if (THEME === "cga") {
    TEXT = new Color("#00ff66");
    SUBTEXT = new Color("#00cc55");
    ACCENT = new Color("#00ff66");
    RED = new Color("#ff3366");
  } else {
    TEXT = new Color("#000000");
    SUBTEXT = new Color("#333333");
    ACCENT = new Color("#00aa00");
    RED = new Color("#b00020");
  }
}

async function createWidget() {
  const w = new ListWidget();
  w.setPadding(16, 16, 16, 16);

  // Retro CRT background
  if (THEME === "cga") w.backgroundImage = drawTerminalBackgroundCGA(900, 420);
  else w.backgroundImage = drawTerminalBackgroundLightCRT(900, 420);

  // Header
  const header = w.addStack();
  header.centerAlignContent();

  const term = SFSymbol.named("terminal");
  const termIcon = header.addImage(term.image);
  termIcon.tintColor = ACCENT;
  termIcon.imageSize = new Size(26, 26);

  header.addSpacer(8);

  const title = header.addText("nurdspace");
  title.font = Font.boldMonospacedSystemFont(15);
  title.textColor = TEXT;

  header.addSpacer(8);

  const sub = header.addText(`${PROJECT_MODE} project`);
  sub.font = Font.mediumMonospacedSystemFont(12);
  sub.textColor = SUBTEXT;

  w.addSpacer(10);

  // Space status + power
  const space = await getSpaceStatusAndPower();
  const isOpen = space?.open === true;

  // Status row
  const statusRow = w.addStack();
  statusRow.centerAlignContent();

  const pill = statusRow.addStack();
  pill.setPadding(4, 10, 4, 10);
  pill.cornerRadius = 10;
  pill.url = STATUS_TAP_URL;

  if (space) {
    if (isOpen) {
      pill.backgroundImage = drawScanlinePillBackground(520, 48, THEME);
    } else {
      pill.backgroundColor = THEME === "cga" ? new Color("#101010") : new Color("#ffe8e8");
    }

    const inner = pill.addStack();
    inner.centerAlignContent();

    if (isOpen) {
      const wave = SFSymbol.named("dot.radiowaves.left.and.right");
      const waveImg = inner.addImage(wave.image);
      waveImg.tintColor = ACCENT;
      waveImg.imageSize = new Size(14, 14);
      inner.addSpacer(6);
    } else {
      const lock = SFSymbol.named("lock.fill");
      const lockImg = inner.addImage(lock.image);
      lockImg.tintColor = RED;
      lockImg.imageSize = new Size(14, 14);
      inner.addSpacer(6);
    }

    const label = `${isOpen ? "OPEN" : "CLOSED"}${space.message ? ` · ${space.message}` : ""}`;
    const pillText = inner.addText(label);
    pillText.font = Font.boldMonospacedSystemFont(12);
    pillText.textColor = isOpen ? (THEME === "cga" ? TEXT : new Color("#063b06")) : RED;
    pillText.lineLimit = 1;
  } else {
    pill.backgroundColor = THEME === "cga" ? new Color("#111111") : new Color("#efefef");
    const pillText = pill.addText("STATUS UNKNOWN");
    pillText.font = Font.boldMonospacedSystemFont(12);
    pillText.textColor = SUBTEXT;
  }

  if (space?.lastchange) {
    statusRow.addSpacer(10);
    const lc = statusRow.addText(formatAgo(space.lastchange));
    lc.font = Font.mediumMonospacedSystemFont(11);
    lc.textColor = SUBTEXT;
    lc.textOpacity = 0.9;
  }

  // Power row
  w.addSpacer(10);

  const powerRow = w.addStack();
  powerRow.centerAlignContent();

  const pLabel = powerRow.addText("Power usage: ");
  pLabel.font = Font.mediumMonospacedSystemFont(12);
  pLabel.textColor = SUBTEXT;

  let wattsText = "n/a";
  if (typeof space?.watts === "number" && isFinite(space.watts)) {
    wattsText = `${space.watts.toFixed(0)} W`;
  }
  const pValue = powerRow.addText(wattsText);
  pValue.font = Font.boldMonospacedSystemFont(12);
  pValue.textColor = (typeof space?.watts === "number") ? ACCENT : SUBTEXT;

  // History + sparkline
  const history = readPowerHistory();
  if (typeof space?.watts === "number" && isFinite(space.watts)) {
    appendPowerHistory(history, space.watts);
    writePowerHistory(history);
  }

  powerRow.addSpacer(10);
  const spark = powerRow.addImage(drawSparkline(history.values, 120, 22));
  spark.imageSize = new Size(120, 22);

  w.addSpacer(12);

  // Project selection
  let picked;
  if (PROJECT_MODE === "latest") picked = await getLatestProject();
  else {
    const projects = await getProjects();
    if (!projects.length) {
      const t = w.addText("No projects found");
      t.textColor = TEXT;
      t.font = Font.boldMonospacedSystemFont(14);
      return w;
    }
    picked = projects[Math.floor(Math.random() * projects.length)];
  }

  const projectUrl = absolutize(picked.url);
  const page = await fetchText(projectUrl);

  const projectTitle = extractTitle(page) || picked.title || "Untitled";
  const imageUrl = extractImage(page);

  // Tap opens project
  w.url = projectUrl;

  const row = w.addStack();
  row.centerAlignContent();

  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl, WIKI_BASE + "/");
      const iv = row.addImage(img);
      iv.imageSize = new Size(95, 70);
      iv.cornerRadius = 10;
      iv.applyFillingContentMode();
    } catch {
      addPlaceholder(row);
    }
  } else {
    addPlaceholder(row);
  }

  row.addSpacer(12);

  const info = row.addStack();
  info.layoutVertically();

  const t = info.addText(projectTitle);
  t.font = Font.boldMonospacedSystemFont(16);
  t.textColor = TEXT;
  t.lineLimit = 2;

  info.addSpacer(4);

  const hint = info.addText("tap to open");
  hint.font = Font.mediumMonospacedSystemFont(12);
  hint.textColor = SUBTEXT;

  return w;
}

// -------- SpaceAPI + fallback scrape --------

async function getSpaceStatusAndPower() {
  let open = null, message = "", lastchange = null, watts = null;

  try {
    const r = new Request(SPACEAPI_STATUS_URL);
    r.headers = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
    const j = await r.loadJSON();

    open = j?.state?.open;
    message = (j?.state?.message || "").toString();
    lastchange = typeof j?.state?.lastchange === "number" ? j.state.lastchange : null;

    watts = extractWattsFromSpaceApi(j);
  } catch (_) {}

  if (watts === null) {
    const scraped = await scrapeWattsFromMainPage();
    if (typeof scraped === "number" && isFinite(scraped)) watts = scraped;
  }

  if (open === null && watts === null && !message) return null;

  return { open: open === true, message, lastchange, watts };
}

function extractWattsFromSpaceApi(j) {
  const candidates = [];
  const pc1 = j?.power_consumption;
  const pc2 = j?.sensors?.power_consumption;
  const pc3 = j?.sensors?.power;

  [pc1, pc2, pc3].forEach(arr => {
    if (!Array.isArray(arr)) return;
    for (const it of arr) {
      const unit = (it?.unit || "").toString().trim();
      const val = it?.value;
      if ((unit === "W" || unit.toLowerCase() === "w") && typeof val === "number") candidates.push(val);
    }
  });

  if (!candidates.length) return null;
  return candidates.reduce((a, b) => a + b, 0);
}

async function scrapeWattsFromMainPage() {
  try {
    const html = await fetchText(MAIN_PAGE_URL);
    const m = /Power usage:\s*([0-9]+(?:\.[0-9]+)?)\s*W/i.exec(html);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// -------- Latest project (MediaWiki API) --------

async function getLatestProject() {
  try {
    const url =
      "https://nurdspace.nl/api.php?action=query&list=recentchanges" +
      "&rcnamespace=0" +
      "&rclimit=50" +
      "&rcprop=title|timestamp" +
      "&format=json";

    const r = new Request(url);
    r.headers = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };
    const json = await r.loadJSON();

    const changes = json?.query?.recentchanges || [];
    for (const c of changes) {
      const title = (c?.title || "").trim();
      if (!title) continue;

      // Hard filters (defensive)
      if (title.includes(":")) continue; // User:, Template:, File:, Category:, etc.
      if (title === "Main Page" || title === "Main_Page") continue;

      return { title, url: "/" + title.replace(/ /g, "_") };
    }
  } catch (_) {}

  // Fallback to random
  const projects = await getProjects();
  return projects[Math.floor(Math.random() * projects.length)];
}

// -------- Power history + sparkline --------

function readPowerHistory() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), POWER_HISTORY_FILE);
  try {
    if (!fm.fileExists(path)) return { values: [] };
    const obj = JSON.parse(fm.readString(path));
    if (!Array.isArray(obj?.values)) return { values: [] };
    return { values: obj.values.filter(v => typeof v === "number" && isFinite(v)) };
  } catch {
    return { values: [] };
  }
}

function writePowerHistory(history) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), POWER_HISTORY_FILE);
  try {
    fm.writeString(path, JSON.stringify({ values: history.values.slice(-POWER_HISTORY_MAX) }));
  } catch {}
}

function appendPowerHistory(history, watts) {
  history.values.push(watts);
  if (history.values.length > POWER_HISTORY_MAX) history.values = history.values.slice(-POWER_HISTORY_MAX);
}

function drawSparkline(values, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  if (!values || values.length < 2) {
    ctx.setStrokeColor(new Color(ACCENT.hex, 0.25));
    ctx.setLineWidth(2);
    const p = new Path();
    p.move(new Point(0, height - 3));
    p.addLine(new Point(width, height - 3));
    ctx.addPath(p);
    ctx.strokePath();
    return ctx.getImage();
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const stepX = width / (values.length - 1);

  const path = new Path();
  for (let i = 0; i < values.length; i++) {
    const x = i * stepX;
    const norm = (values[i] - min) / span;
    const y = (height - 2) - norm * (height - 4);
    if (i === 0) path.move(new Point(x, y));
    else path.addLine(new Point(x, y));
  }

  ctx.setStrokeColor(new Color(ACCENT.hex, 0.9));
  ctx.setLineWidth(2);
  ctx.addPath(path);
  ctx.strokePath();

  ctx.setFillColor(new Color(ACCENT.hex, 0.9));
  const lastNorm = (values[values.length - 1] - min) / span;
  const lastY = (height - 2) - lastNorm * (height - 4);
  ctx.fillEllipse(new Rect(width - 3, lastY - 3, 6, 6));

  return ctx.getImage();
}

// -------- Retro CRT backgrounds --------

function drawTerminalBackgroundLightCRT(width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = true;

  // Slightly darker base so scanlines/noise are visible
  ctx.setFillColor(new Color("#f2fff2"));
  ctx.fillRect(new Rect(0, 0, width, height));

  // Terminal noise text (stronger than before)
  ctx.setFont(Font.mediumMonospacedSystemFont(12));
  ctx.setTextColor(new Color("#00aa00", clamp01(0.06 * CRT_INTENSITY)));

  const lines = Math.floor(height / 24);
  for (let i = 0; i < lines; i++) {
    const y = 8 + i * 24;
    const txt = `$ ssh nurd@space | git pull | make all | pwr=${randInt(200, 1800)}W | 0x${randHex(6)}`;
    ctx.drawText(txt, new Point(12, y));
  }

  // CRT scanlines (stronger)
  const scanAlpha = clamp01(0.055 * CRT_INTENSITY);
  for (let y = 0; y < height; y += 3) {
    ctx.setFillColor(new Color("#000000", scanAlpha));
    ctx.fillRect(new Rect(0, y, width, 1));
  }

  // Phosphor glow band
  ctx.setFillColor(new Color("#00aa00", clamp01(0.06 * CRT_INTENSITY)));
  ctx.fillRect(new Rect(0, Math.floor(height * 0.28), width, Math.floor(height * 0.22)));

  // Random “fuzz” pixels (very subtle)
  const fuzzAlpha = clamp01(0.06 * (CRT_INTENSITY - 0.2));
  ctx.setFillColor(new Color("#00aa00", fuzzAlpha));
  for (let i = 0; i < 220; i++) {
    const x = randInt(0, width - 2);
    const y = randInt(0, height - 2);
    if (Math.random() < 0.6) ctx.fillRect(new Rect(x, y, 1, 1));
  }

  // Vignette edges (no gradients; layered rectangles)
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const inset = i * 8;
    const a = (i + 1) / steps;
    ctx.setStrokeColor(new Color("#000000", 0.015 * a));
    ctx.setLineWidth(10);
    ctx.strokeRect(new Rect(inset, inset, width - inset * 2, height - inset * 2));
  }

  return ctx.getImage();
}

function drawTerminalBackgroundCGA(width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = true;

  ctx.setFillColor(new Color("#040704"));
  ctx.fillRect(new Rect(0, 0, width, height));

  ctx.setFont(Font.mediumMonospacedSystemFont(12));
  ctx.setTextColor(new Color("#00ff66", 0.20));

  const lines = Math.floor(height / 22);
  for (let i = 0; i < lines; i++) {
    const y = 8 + i * 22;
    const txt = `nurdspace@space:~$ pwr=${randInt(200, 1800)}W  0x${randHex(10)}`;
    ctx.drawText(txt, new Point(12, y));
  }

  for (let y = 0; y < height; y += 3) {
    ctx.setFillColor(new Color("#000000", 0.16));
    ctx.fillRect(new Rect(0, y, width, 1));
  }

  // Glow band
  ctx.setFillColor(new Color("#00ff66", 0.08));
  ctx.fillRect(new Rect(0, Math.floor(height * 0.25), width, Math.floor(height * 0.25)));

  return ctx.getImage();
}

function drawScanlinePillBackground(width, height, theme) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  ctx.setFillColor(theme === "cga" ? new Color("#071007") : new Color("#e8ffe8"));
  ctx.fillRect(new Rect(0, 0, width, height));

  for (let y = 0; y < height; y += 3) {
    ctx.setFillColor(theme === "cga" ? new Color("#00ff66", 0.10) : new Color("#00aa00", 0.10));
    ctx.fillRect(new Rect(0, y, width, 1));
  }

  ctx.setFillColor(theme === "cga" ? new Color("#00ff66", 0.06) : new Color("#00aa00", 0.06));
  ctx.fillRect(new Rect(0, Math.floor(height * 0.35), width, Math.floor(height * 0.3)));

  return ctx.getImage();
}

// -------- Misc helpers --------

function formatAgo(unixSeconds) {
  const now = Date.now();
  const then = unixSeconds * 1000;
  let diff = Math.max(0, Math.floor((now - then) / 1000));
  const m = Math.floor(diff / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${diff}s ago`;
}

function addPlaceholder(row) {
  const ph = row.addStack();
  ph.size = new Size(95, 70);
  ph.backgroundColor = THEME === "cga" ? new Color("#071007") : new Color("#e8ffe8");
  ph.cornerRadius = 10;

  const sym = SFSymbol.named("hammer");
  const icon = ph.addImage(sym.image);
  icon.tintColor = ACCENT;
  icon.imageSize = new Size(24, 24);
  ph.centerAlignContent();
}

async function getProjects() {
  const html = await fetchText(PROJECTS_URL);
  const re = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;

  let links = [], m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = strip(m[2]);
    if (!href || !href.startsWith("/")) continue;
    if (href.includes("Special:") || href.includes("Help:") || href.includes("Category:") || href.includes("File:") || href.includes("Talk:")) continue;
    if (href === "/Projects") continue;
    links.push({ title: text, url: href });
  }

  const seen = new Set();
  return links.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true)));
}

async function fetchText(url) {
  const r = new Request(url);
  r.headers = { "User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml" };
  return await r.loadString();
}

async function loadImage(url, referer) {
  const r = new Request(url);
  r.headers = { "User-Agent": "Mozilla/5.0", "Accept": "image/*,*/*", "Referer": referer };
  return await r.loadImage();
}

function extractTitle(html) {
  return strip((/<h1[^>]*id="firstHeading"[^>]*>(.*?)<\/h1>/i.exec(html) || /<h1[^>]*>(.*?)<\/h1>/i.exec(html) || [])[1]);
}

function extractImage(html) {
  const m = /<img[^>]*src="([^"]+)"/i.exec(html);
  if (!m) return null;
  let u = m[1];
  if (u.startsWith("//")) u = "https:" + u;
  return absolutize(u);
}

function strip(s) {
  return (s || "").replace(/<[^>]*>/g, "").trim();
}

function absolutize(u) {
  if (!u) return u;
  if (u.startsWith("http")) return u;
  return WIKI_BASE + u;
}

function randHex(n) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}