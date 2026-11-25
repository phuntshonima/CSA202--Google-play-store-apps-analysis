// State
let ALL = [];       // every app in the dataset
let CURRENT = [];   // apps left after the sidebar filters; all charts and KPIs read from this

// Settings chosen with the controls on individual charts
const chartOpts = {
  catTop: "15",          // 5, 10, 15 or "all" categories
  catSort: "count",      // "count" (most apps first) or "az"
  ratingMode: "count",   // "count" or "percent"
  scatterScale: "log",   // "log" or "linear"
};
const hiddenCategories = new Set();   // categories unticked in the category chart's picker

const CHART_IDS = ["chart-category", "chart-rating", "chart-type", "chart-scatter", "chart-size", "chart-heatmap"];

// Theme toggle
const root = document.documentElement;
const themeBtn = document.getElementById("theme-toggle");

function setTheme(t) {
  root.setAttribute("data-theme", t);
  themeBtn.textContent = t === "dark" ? "☀" : "☾";   // the icon shows the mode you will switch to
  try { localStorage.setItem("theme", t); } catch (e) {}
  if (ALL.length) renderCharts(CURRENT);              // redraw so the charts pick up the new colours
}

themeBtn.addEventListener("click", () => {
  setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

themeBtn.textContent = root.getAttribute("data-theme") === "dark" ? "☀" : "☾";

// Helpers
const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Converts the column-based JSON into one object per app
function toRows(data) {
  const cols = Object.keys(data).filter(k => k !== "_meta");
  const n = data[cols[0]].length;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const c of cols) row[c] = data[c][i];
    rows.push(row);
  }
  return rows;
}

// KPI cards
function updateKPIs(rows) {
  const set = (id, text) => { document.getElementById(id).textContent = text; };

  if (rows.length === 0) {
    ["kpi-apps", "kpi-rating", "kpi-free", "kpi-installs"].forEach(id => set(id, "–"));
    return;
  }

  const rated = rows.filter(r => r.Rating !== null);
  const avgRating = rated.length ? rated.reduce((sum, r) => sum + r.Rating, 0) / rated.length : null;
  const freePct = (rows.filter(r => r.Type === "Free").length / rows.length) * 100;

  set("kpi-apps", rows.length.toLocaleString());
  set("kpi-rating", avgRating === null ? "–" : avgRating.toFixed(2));
  set("kpi-free", freePct.toFixed(1) + "%");
  set("kpi-installs", fmt.format(median(rows.map(r => r.Installs))));
}

// Chart styling
// Reads the active theme's colours from the CSS variables so the charts match the page
function themeColors() {
  const css = getComputedStyle(root);
  const get = name => css.getPropertyValue(name).trim();
  return {
    text: get("--text"),
    muted: get("--muted"),
    border: get("--border"),
    accent: get("--accent"),
    surface: get("--surface"),
  };
}

// automargin leaves room for tick labels and axis titles
function axis(c, extra = {}) {
  return { gridcolor: c.border, linecolor: c.border, zeroline: false, automargin: true, ...extra };
}

function baseLayout(c, extra = {}) {
  const { xaxis, yaxis, ...rest } = extra;
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: '"Source Sans 3", system-ui, sans-serif', size: 13, color: c.muted },
    margin: { l: 10, r: 14, t: 10, b: 10 },
    xaxis: axis(c, xaxis),
    yaxis: axis(c, yaxis),
    ...rest,
  };
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true };

// Log-axis ticks written as 1, 1K, 1M, 1B
const INSTALL_TICKS = { tickvals: [1, 1e3, 1e6, 1e9], ticktext: ["1", "1K", "1M", "1B"] };
const REVIEW_TICKS  = { tickvals: [1, 1e2, 1e4, 1e6, 1e8], ticktext: ["1", "100", "10K", "1M", "100M"] };

// Charts
function chartCategory(rows, c) {
  const el = document.getElementById("chart-category");
  const counts = {};
  rows.forEach(r => {
    if (hiddenCategories.has(r.Category)) return;
    counts[r.Category] = (counts[r.Category] || 0) + 1;
  });

  // Most apps first, keep the top N, then optionally re-sort A to Z
  let list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (chartOpts.catTop !== "all") list = list.slice(0, Number(chartOpts.catTop));
  if (chartOpts.catSort === "az") list.sort((a, b) => a[0].localeCompare(b[0]));
  // Plotly draws horizontal bars from the bottom up, so reverse to put the first item on top
  list.reverse();

  if (list.length === 0) {
    Plotly.purge(el);
    el.innerHTML = '<p class="empty">No categories selected</p>';
    return;
  }

  Plotly.react("chart-category", [{
    type: "bar", orientation: "h",
    x: list.map(d => d[1]), y: list.map(d => d[0]),
    marker: { color: c.accent },
    hovertemplate: "%{y}: %{x} apps<extra></extra>",
  }], baseLayout(c, {
    height: Math.max(420, list.length * 24 + 70),
    xaxis: { title: { text: "Number of apps", standoff: 10 } },
    yaxis: { showgrid: false },
  }), PLOT_CONFIG);
}

function chartRating(rows, c) {
  const ratings = rows.filter(r => r.Rating !== null).map(r => r.Rating);
  const percent = chartOpts.ratingMode === "percent";

  Plotly.react("chart-rating", [{
    type: "histogram", x: ratings, nbinsx: 30,
    histnorm: percent ? "percent" : "",
    marker: { color: c.accent },
    hovertemplate: percent
      ? "Rating %{x}: %{y:.1f}% of rated apps<extra></extra>"
      : "Rating %{x}: %{y} apps<extra></extra>",
  }], baseLayout(c, {
    height: 300,
    bargap: 0.05,
    xaxis: { title: { text: "Rating", standoff: 10 } },
    yaxis: { title: { text: percent ? "% of rated apps" : "Apps", standoff: 10 } },
  }), PLOT_CONFIG);
}

function chartType(rows, c) {
  const free = rows.filter(r => r.Type === "Free").length;
  const paid = rows.length - free;

  Plotly.react("chart-type", [{
    type: "pie", hole: 0.65,
    labels: ["Free", "Paid"], values: [free, paid],
    marker: { colors: [c.accent, c.muted], line: { color: c.surface, width: 3 } },
    textinfo: "label+percent", textposition: "outside", automargin: true,
    textfont: { color: c.text },
    sort: false, direction: "clockwise",
    hovertemplate: "%{label}: %{value} apps<extra></extra>",
  }], baseLayout(c, { height: 300, showlegend: false, margin: { l: 20, r: 20, t: 20, b: 20 } }), PLOT_CONFIG);
}

function chartScatter(rows, c) {
  const log = chartOpts.scatterScale === "log";
  // Log axes cannot show zero, so only apps with installs and reviews above 0 are plotted
  const d = log ? rows.filter(r => r.Installs > 0 && r.Reviews > 0) : rows;

  const xaxis = log
    ? { type: "log", title: { text: "Installs", standoff: 10 }, ...INSTALL_TICKS }
    : { type: "linear", title: { text: "Installs", standoff: 10 }, tickformat: "~s" };
  const yaxis = log
    ? { type: "log", title: { text: "Reviews", standoff: 10 }, ...REVIEW_TICKS }
    : { type: "linear", title: { text: "Reviews", standoff: 10 }, tickformat: "~s" };

  Plotly.react("chart-scatter", [{
    type: "scattergl", mode: "markers",
    x: d.map(r => r.Installs), y: d.map(r => r.Reviews),
    text: d.map(r => r.App),
    marker: { color: c.accent, size: 4, opacity: 0.35 },
    hovertemplate: "<b>%{text}</b><br>Installs: %{x:,}<br>Reviews: %{y:,}<extra></extra>",
  }], baseLayout(c, { height: 300, xaxis, yaxis }), PLOT_CONFIG);
}

function chartSize(rows, c) {
  // Skips unrated apps and apps whose size varies with device
  const d = rows.filter(r => r.Rating !== null && r.Size_MB !== null);

  Plotly.react("chart-size", [{
    type: "scattergl", mode: "markers",
    x: d.map(r => r.Size_MB), y: d.map(r => r.Rating),
    text: d.map(r => r.App),
    marker: { color: c.accent, size: 4, opacity: 0.3 },
    hovertemplate: "<b>%{text}</b><br>Size: %{x} MB<br>Rating: %{y}<extra></extra>",
  }], baseLayout(c, {
    height: 300,
    xaxis: { title: { text: "Size (MB)", standoff: 10 } },
    yaxis: { title: { text: "Rating", standoff: 10 }, range: [0.8, 5.2] },
  }), PLOT_CONFIG);
}

// Correlation heatmap: Spearman correlation, recalculated for the filtered apps
const CORR_VARS = [
  { key: "Rating",            label: "Rating" },
  { key: "Reviews",           label: "Reviews" },
  { key: "Installs",          label: "Installs" },
  { key: "Price",             label: "Price" },
  { key: "Size_MB",           label: "Size (MB)" },
  { key: "Days_Since_Update", label: "Days since update" },
];

// Ranks values from 1 to n; tied values share the average of their ranks
function rankArray(values) {
  const n = values.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => values[a] - values[b]);

  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(x, y) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // A variable that never changes has no correlation
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Spearman is Pearson applied to the ranks; only apps with both values are used
function spearman(rows, a, b) {
  const xs = [], ys = [];
  for (const r of rows) {
    if (r[a] !== null && r[b] !== null) { xs.push(r[a]); ys.push(r[b]); }
  }
  if (xs.length < 3) return { rho: null, n: xs.length };
  const r = pearson(rankArray(xs), rankArray(ys));
  return { rho: r === null ? null : Math.max(-1, Math.min(1, r)), n: xs.length };
}

function correlationMatrix(rows) {
  const k = CORR_VARS.length;
  const rho = Array.from({ length: k }, () => new Array(k).fill(null));
  const n = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const res = spearman(rows, CORR_VARS[i].key, CORR_VARS[j].key);
      rho[i][j] = rho[j][i] = res.rho;
      n[i][j] = n[j][i] = res.n;
    }
  }
  return { rho, n };
}

// Colour helpers, used to choose a readable text colour for each cell
function hexToRgb(h) {
  const m = h.replace("#", "");
  return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return A.map((v, i) => Math.round(v + (B[i] - v) * t));
}
function luminance([r, g, b]) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

function chartHeatmap(rows, c) {
  const { rho, n } = correlationMatrix(rows);
  const labels = CORR_VARS.map(v => v.label);

  // Positive cells use the accent colour, negative cells the opposite hue, zero the card colour
  const dark = root.getAttribute("data-theme") === "dark";
  const neg = dark ? "#7f9fb8" : "#d98b7a";
  const pos = c.accent;

  const annotations = [];
  const hover = rho.map((row, i) => row.map((v, j) => {
    const pair = `<b>${labels[i]} × ${labels[j]}</b>`;
    if (v === null) return `${pair}<br>not enough variation or data`;
    return `${pair}<br>ρ = ${v.toFixed(2)}<br>${n[i][j].toLocaleString()} apps`;
  }));

  rho.forEach((row, i) => row.forEach((v, j) => {
    if (v === null) return;
    const cell = mixHex(c.surface, v >= 0 ? pos : neg, Math.abs(v));
    annotations.push({
      x: labels[j], y: labels[i], text: v.toFixed(2),
      showarrow: false,
      font: { size: 12, color: luminance(cell) > 0.6 ? "#161618" : "#f5f5f5" },
    });
  }));

  Plotly.react("chart-heatmap", [{
    type: "heatmap",
    z: rho, x: labels, y: labels,
    zmin: -1, zmax: 1,
    colorscale: [[0, neg], [0.5, c.surface], [1, pos]],
    xgap: 3, ygap: 3,
    showscale: false,
    hoverongaps: false,
    hovertemplate: "%{text}<extra></extra>",
    text: hover,
  }], baseLayout(c, {
    height: 400,
    annotations,
    xaxis: { showgrid: false, side: "bottom" },
    yaxis: { showgrid: false, autorange: "reversed" },
  }), PLOT_CONFIG);
}

// Draws every chart from a list of apps
function renderCharts(rows) {
  // If no apps match the filters, show a message instead of empty charts
  if (rows.length === 0) {
    CHART_IDS.forEach(id => {
      const el = document.getElementById(id);
      Plotly.purge(el);
      el.innerHTML = '<p class="empty">No apps match these filters</p>';
    });
    return;
  }

  // Remove an earlier message before drawing
  CHART_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el.querySelector(".empty")) el.innerHTML = "";
  });

  const c = themeColors();
  chartCategory(rows, c);
  chartRating(rows, c);
  chartType(rows, c);
  chartScatter(rows, c);
  chartSize(rows, c);
  chartHeatmap(rows, c);
}

// Redraws a single chart, used by the controls on individual charts
const DRAWERS = {
  "chart-category": chartCategory,
  "chart-rating": chartRating,
  "chart-scatter": chartScatter,
};

function redrawOne(id) {
  if (CURRENT.length === 0) return;
  const el = document.getElementById(id);
  if (el.querySelector(".empty")) el.innerHTML = "";
  DRAWERS[id](CURRENT, themeColors());
}

// Sidebar filters
const DEFAULT_FILTERS = () => ({
  categories: new Set(CATEGORY_LIST),   // every category ticked means no category filtering
  type: "All",
  content: "All",
  ratingMin: 1,
  ratingMax: 5,
  minInstalls: 0,
});

let CATEGORY_LIST = [];
let filters = null;

function ratingPasses(r) {
  // The full range (1 to 5) keeps every app, including unrated ones.
  // Once the range is narrowed, unrated apps drop out.
  if (filters.ratingMin <= 1 && filters.ratingMax >= 5) return true;
  return r.Rating !== null && r.Rating >= filters.ratingMin && r.Rating <= filters.ratingMax;
}

function applyFilters() {
  const f = filters;
  const allCats = f.categories.size === CATEGORY_LIST.length;

  CURRENT = ALL.filter(r =>
    (allCats || f.categories.has(r.Category)) &&
    (f.type === "All" || r.Type === f.type) &&
    (f.content === "All" || r.ContentRating === f.content) &&
    r.Installs >= f.minInstalls &&
    ratingPasses(r)
  );

  updateKPIs(CURRENT);
  buildCategoryPicker();
  renderCharts(CURRENT);
}

// Dragging a slider fires many events, so redraw at most once per animation frame
let updateQueued = false;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => { updateQueued = false; applyFilters(); });
}

// Category checklist
function updateCategorySummary() {
  const n = filters.categories.size;
  const total = CATEGORY_LIST.length;
  let text;
  if (n === total) text = "All categories";
  else if (n === 0) text = "None selected";
  else if (n === 1) text = [...filters.categories][0];
  else text = `${n} of ${total} selected`;
  document.getElementById("f-category-summary").textContent = text;
}

function buildCategoryList() {
  const box = document.getElementById("f-category-options");
  box.innerHTML = "";
  CATEGORY_LIST.forEach(cat => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = cat;
    cb.checked = filters.categories.has(cat);
    cb.addEventListener("change", () => {
      cb.checked ? filters.categories.add(cat) : filters.categories.delete(cat);
      updateCategorySummary();
      scheduleUpdate();
    });
    label.append(cb, document.createTextNode(cat));
    box.appendChild(label);
  });
}

function setAllCategories(on) {
  filters.categories = on ? new Set(CATEGORY_LIST) : new Set();
  document.querySelectorAll("#f-category-options input").forEach(cb => { cb.checked = on; });
  updateCategorySummary();
  scheduleUpdate();
}

// Rating range sliders
function updateRatingLabel() {
  document.getElementById("rating-label").textContent =
    `${filters.ratingMin.toFixed(1)} – ${filters.ratingMax.toFixed(1)}`;
}

function onRatingSlider(which) {
  const minEl = document.getElementById("f-rmin");
  const maxEl = document.getElementById("f-rmax");
  let lo = parseFloat(minEl.value);
  let hi = parseFloat(maxEl.value);

  // Keeps min at or below max: the slider that was just moved pushes the other one
  if (lo > hi) {
    if (which === "min") { hi = lo; maxEl.value = hi; }
    else { lo = hi; minEl.value = lo; }
  }
  filters.ratingMin = lo;
  filters.ratingMax = hi;
  updateRatingLabel();
  scheduleUpdate();
}

// Builds the controls and connects their events
function initFilters() {
  CATEGORY_LIST = [...new Set(ALL.map(r => r.Category))].sort();
  filters = DEFAULT_FILTERS();

  buildCategoryList();
  updateCategorySummary();
  document.getElementById("cat-all").addEventListener("click", () => setAllCategories(true));
  document.getElementById("cat-none").addEventListener("click", () => setAllCategories(false));

  document.querySelectorAll("#f-type button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#f-type button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filters.type = btn.dataset.value;
      scheduleUpdate();
    });
  });

  // The content rating options come from the data
  const contentSel = document.getElementById("f-content");
  [...new Set(ALL.map(r => r.ContentRating).filter(Boolean))].sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    contentSel.appendChild(opt);
  });
  contentSel.addEventListener("change", () => { filters.content = contentSel.value; scheduleUpdate(); });

  document.getElementById("f-rmin").addEventListener("input", () => onRatingSlider("min"));
  document.getElementById("f-rmax").addEventListener("input", () => onRatingSlider("max"));

  const instSel = document.getElementById("f-installs");
  instSel.addEventListener("change", () => { filters.minInstalls = Number(instSel.value); scheduleUpdate(); });

  document.getElementById("reset").addEventListener("click", resetFilters);

  initChartControls();
}

function resetFilters() {
  filters = DEFAULT_FILTERS();
  buildCategoryList();
  updateCategorySummary();

  document.querySelectorAll("#f-type button").forEach(b =>
    b.classList.toggle("active", b.dataset.value === "All"));
  document.getElementById("f-content").value = "All";
  document.getElementById("f-rmin").value = 1;
  document.getElementById("f-rmax").value = 5;
  document.getElementById("f-installs").value = "0";
  updateRatingLabel();
  applyFilters();
}

// Controls on individual charts
// The category picker lists only the categories that survive the sidebar filters
function availableCategories() {
  return [...new Set(CURRENT.map(r => r.Category))].sort();
}

function updatePickerSummary() {
  const available = availableCategories();
  const shown = available.filter(cat => !hiddenCategories.has(cat)).length;
  document.getElementById("cat-pop-summary").textContent =
    shown === available.length ? "Categories" : `Categories · ${shown}/${available.length}`;
}

function buildCategoryPicker() {
  const box = document.getElementById("cat-pick-options");
  box.innerHTML = "";
  availableCategories().forEach(cat => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !hiddenCategories.has(cat);
    cb.addEventListener("change", () => {
      cb.checked ? hiddenCategories.delete(cat) : hiddenCategories.add(cat);
      updatePickerSummary();
      redrawOne("chart-category");
    });
    label.append(cb, document.createTextNode(cat));
    box.appendChild(label);
  });
  updatePickerSummary();
}

function initChartControls() {
  // Every control with data-opt writes its value into chartOpts and redraws the chart named in data-redraw
  document.querySelectorAll("[data-opt]").forEach(ctrl => {
    const opt = ctrl.dataset.opt;
    const target = ctrl.dataset.redraw;

    if (ctrl.tagName === "SELECT") {
      ctrl.addEventListener("change", () => { chartOpts[opt] = ctrl.value; redrawOne(target); });
      return;
    }
    ctrl.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        ctrl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        chartOpts[opt] = btn.dataset.value;
        redrawOne(target);
      });
    });
  });

  document.getElementById("pick-all").addEventListener("click", () => {
    hiddenCategories.clear();
    buildCategoryPicker();
    redrawOne("chart-category");
  });
  document.getElementById("pick-none").addEventListener("click", () => {
    availableCategories().forEach(cat => hiddenCategories.add(cat));
    buildCategoryPicker();
    redrawOne("chart-category");
  });

  // Close the category picker when clicking anywhere else
  document.addEventListener("click", e => {
    const pop = document.getElementById("cat-pop");
    if (pop.open && !pop.contains(e.target)) pop.open = false;
  });
}

// Start
// Plotly measures label widths when it draws, so wait until the web fonts have loaded.
// Drawing earlier measures the fallback font and clips the labels.
const fontsReady = document.fonts
  ? Promise.all([document.fonts.load('13px "Source Sans 3"'), document.fonts.ready]).catch(() => {})
  : Promise.resolve();

Promise.all([fetch("data.json").then(res => res.json()), fontsReady])
  .then(([data]) => {
    ALL = toRows(data);
    initFilters();
    applyFilters();
  })
  .catch(err => {
    document.querySelector(".top h2").textContent = "Could not load data.json";
    console.error(err);
  });