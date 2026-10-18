// 서울 전세가 지도. 집계는 tools/build_jeonse.py 가 미리 끝내 둔다.

const RAMP = ["#1F6FB2", "#86B9DC", "#E8E6E3", "#E8896B", "#B5321F"];

const state = { gu: "", dong: "", usg: "" };
let data = null;
let map = null;
let guLayer = null;

function colorFor(mean) {
  let step = 0;
  for (const cut of data.cuts) if (mean > cut) step += 1;
  return RAMP[step];
}

// 시 전체를 볼 때는 색이 주인공이지만, 거리까지 당기면 배경지도가 주인공이다.
function fillOpacityFor(zoom) {
  if (zoom <= 12) return 0.62;
  if (zoom >= 15) return 0.12;
  return 0.62 - (zoom - 12) * (0.5 / 3);
}

function styleFor(feature) {
  return {
    className: "gu",
    fillColor: colorFor(data.gu[feature.properties.sggnm][0]),
    fillOpacity: fillOpacityFor(map.getZoom()),
    color: "#ffffff",
    weight: 1.5,
  };
}

function drawLegend() {
  document.querySelector("#legend-steps").innerHTML =
    RAMP.map((c) => `<span style="background:${c}"></span>`).join("");
}

function buildMap() {
  map = L.map("map", { zoomControl: false, attributionControl: true })
    .setView([37.5665, 126.978], 11);

  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 18, attribution: "Tiles © Esri" }
  );
  osm.addTo(map);

  const pick = (chosen, other, onId, offId) => {
    map.removeLayer(other);
    chosen.addTo(map);
    if (guLayer) guLayer.bringToFront();
    document.querySelector(onId).classList.add("on");
    document.querySelector(offId).classList.remove("on");
  };
  document.querySelector("#base-osm")
    .addEventListener("click", () => pick(osm, satellite, "#base-osm", "#base-satellite"));
  document.querySelector("#base-satellite")
    .addEventListener("click", () => pick(satellite, osm, "#base-satellite", "#base-osm"));
}

function drawDistricts(geo) {
  guLayer = L.geoJSON(geo, {
    style: styleFor,
    onEachFeature: (feature, layer) => {
      const name = feature.properties.sggnm;
      layer.bindTooltip(name, { permanent: false, direction: "center" });
      layer.on("click", () => setGu(name));
    },
  }).addTo(map);

  map.on("zoomend", () => {
    const opacity = fillOpacityFor(map.getZoom());
    guLayer.setStyle({ fillOpacity: opacity });
    highlight();
  });
}

const USG_ORDER = ["아파트", "오피스텔", "연립다세대", "단독다가구"];

function orderUsg(keys) {
  const known = USG_ORDER.filter((u) => keys.includes(u));
  return known.concat(keys.filter((u) => !known.includes(u)).sort());
}

function boundsOf(gu) {
  let found = null;
  guLayer.eachLayer((layer) => {
    if (layer.feature.properties.sggnm === gu) found = layer;
  });
  return found ? found.getBounds() : null;
}

// 동 좌표가 없으면 자치구 경계로 물러난다. 좌표 파일이 아파트 거래만 담아 81개 동이 빠진다.
function focusOn(gu, dong) {
  const point = dong ? data.dongPoints[`${gu}|${dong}`] : null;
  if (point) {
    map.setView(point, 15);
    return;
  }
  const bounds = boundsOf(gu);
  if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
}

function highlight() {
  guLayer.eachLayer((layer) => {
    const on = layer.feature.properties.sggnm === state.gu;
    layer.getElement()?.classList.toggle("sel", on);
    if (on) layer.bringToFront();
  });
}

function fillSelect(id, items, placeholder) {
  const box = document.querySelector(`#${id}`);
  box.innerHTML = [`<option value="">${placeholder}</option>`]
    .concat(items.map((v) => `<option value="${v}">${v}</option>`)).join("");
  box.disabled = items.length === 0;
}

function setGu(gu) {
  state.gu = gu;
  state.dong = "";
  state.usg = "";
  document.querySelector("#gu").value = gu;
  fillSelect("dong", gu ? Object.keys(data.cells[gu]).sort() : [], gu ? "선택" : "자치구 먼저");
  fillSelect("usg", [], "법정동 먼저");
  highlight();
  if (gu) focusOn(gu, "");
  renderPopup();
}

function setDong(gu, dong) {
  state.gu = gu;
  state.dong = dong;
  document.querySelector("#gu").value = gu;
  fillSelect("dong", Object.keys(data.cells[gu]).sort(), "선택");
  document.querySelector("#dong").value = dong;
  const types = orderUsg(Object.keys(data.cells[gu][dong]));
  fillSelect("usg", types, "선택");
  state.usg = types.includes("아파트") ? "아파트" : types[0];
  document.querySelector("#usg").value = state.usg;
  highlight();
  focusOn(gu, dong);
  renderPopup();
}

function setUsg(usg) {
  state.usg = usg;
  renderPopup();
}

function searchPlaces(text) {
  const hits = [];
  for (const gu of Object.keys(data.cells).sort()) {
    for (const dong of Object.keys(data.cells[gu]).sort()) {
      if (dong.includes(text)) hits.push({ gu, dong, at: dong.indexOf(text) });
      else if (gu.includes(text)) hits.push({ gu, dong, at: -1 });
    }
  }
  hits.sort((a, b) => (a.at !== 0) - (b.at !== 0) || a.dong.length - b.dong.length
    || a.dong.localeCompare(b.dong));
  return hits;
}

function renderResults() {
  const text = document.querySelector("#q").value.trim();
  const box = document.querySelector("#results");
  if (!text) {
    box.innerHTML = "<div class='empty'>동 이름을 입력하거나 지도를 누르세요</div>";
    return;
  }
  const hits = searchPlaces(text);
  if (!hits.length) {
    box.innerHTML = `<div class='empty'>'${text}' 에 맞는 동이 없습니다</div>`;
    return;
  }
  const shown = hits.slice(0, 40);
  box.innerHTML = shown.map(({ gu, dong, at }) => {
    const label = at >= 0
      ? `${dong.slice(0, at)}<em>${dong.substr(at, text.length)}</em>${dong.slice(at + text.length)}`
      : dong;
    return `<div class="result" data-gu="${gu}" data-dong="${dong}">`
      + `<span>${label}</span><span class="r-sub">${gu}</span></div>`;
  }).join("")
    + (hits.length > shown.length
      ? `<div class='empty'>그 밖에 ${hits.length - shown.length}곳 더 있습니다</div>` : "");
}

function showTab(name) {
  for (const key of ["search", "pick", "news"]) {
    document.querySelector(`#pane-${key}`).hidden = key !== name;
    document.querySelector(`#tab-${key}`).classList.toggle("on", key === name);
  }
  if (name === "news") loadNews();
}

function wireControls() {
  document.querySelector("#q").addEventListener("input", renderResults);
  document.querySelector("#gu").addEventListener("change", (e) => setGu(e.target.value));
  document.querySelector("#dong").addEventListener("change", (e) => {
    if (e.target.value) setDong(state.gu, e.target.value);
  });
  document.querySelector("#usg").addEventListener("change", (e) => setUsg(e.target.value));
  document.querySelector("#pop-close")
    .addEventListener("click", () => { document.querySelector("#popup").hidden = true; });

  document.body.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) { showTab(tab.dataset.tab); return; }
    const hit = event.target.closest(".result");
    if (hit) { setDong(hit.dataset.gu, hit.dataset.dong); return; }
    const toggle = event.target.closest("#tbtn");
    if (toggle) toggleTable();
  });
}

async function start() {
  const [payload, geo] = await Promise.all([
    fetch("data/jeonse.json").then((r) => r.json()),
    fetch("data/seoul-gu.geojson").then((r) => r.json()),
  ]);
  data = payload;
  buildMap();
  drawDistricts(geo);
  drawLegend();
  fillSelect("gu", Object.keys(data.cells).sort(), "선택");
  fillSelect("dong", [], "자치구 먼저");
  fillSelect("usg", [], "법정동 먼저");
  wireControls();
  renderResults();
  window.app = { data, map, state, setGu, setDong, setUsg, focusOn, colorFor, guLayer };
}

start();

// ── 표기 ──────────────────────────────────────────────────

function formatWon(value) {
  const total = Math.round(value);
  const eok = Math.floor(total / 10000);
  const man = total % 10000;
  if (eok && man) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok) return `${eok}억원`;
  return `${man.toLocaleString()}만원`;
}

function shortWon(value) {
  const eok = value / 10000;
  if (eok >= 10) return `${eok.toFixed(0)}억`;
  if (eok >= 1) return `${eok.toFixed(1)}억`;
  return `${Math.round(value).toLocaleString()}만`;
}

// ── 조각 ──────────────────────────────────────────────────

function barList(rows, selected, scroll) {
  const top = Math.max(...rows.map((r) => r.value));
  const body = rows.map((r) => {
    const width = 2 + 98 * r.value / top;
    const cls = ["bar-row", r.name === selected ? "sel" : "", r.thin ? "thin" : ""]
      .filter(Boolean).join(" ");
    const count = r.count === undefined ? ""
      : `<span class="bar-count">${r.count.toLocaleString()}건</span>`;
    return `<div class="${cls}"><span class="bar-name" title="${r.name}">${r.name}</span>`
      + `<span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(1)}%"></span></span>`
      + `<span class="bar-val">${shortWon(r.value)}</span>${count}</div>`;
  }).join("");
  return `<div class="bars${scroll ? " scroll" : ""}">${body}</div>`;
}

function lineChart(values, labels) {
  const w = 360, h = 132, padL = 10, padR = 10, padT = 22, padB = 10;
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low || 1;
  const n = values.length;
  const xs = values.map((_, i) => padL + (w - padL - padR) * i / (n - 1));
  const ys = values.map((v) => padT + (h - padT - padB) * (1 - (v - low) / span));

  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h + 16}" role="img" aria-label="월별 평균 전세가">`
    + `<line class="grid-line" x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}"/>`
    + `<line class="grid-line" x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}"/>`
    + `<polyline points="${xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")}"`
    + ` fill="none" stroke="#B5321F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  values.forEach((v, i) => {
    const anchor = i === 0 ? "start" : (i === n - 1 ? "end" : "middle");
    svg += `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="4" fill="#B5321F"`
      + ` stroke="#fff" stroke-width="2"><title>${labels[i]} · ${formatWon(v)}</title></circle>`;
    if (i === 0 || i === n - 1 || v === high || v === low) {
      svg += `<text class="pt-label" x="${xs[i].toFixed(1)}" y="${(ys[i] - 10).toFixed(1)}"`
        + ` text-anchor="${anchor}">${shortWon(v)}</text>`;
    }
    if (i % 2 === 0 || i === n - 1) {
      svg += `<text class="axis-text" x="${xs[i].toFixed(1)}" y="${h + 8}"`
        + ` text-anchor="${anchor}">${labels[i]}</text>`;
    }
  });
  return `${svg}</svg>`;
}

// ── 보드 ──────────────────────────────────────────────────

function secSummary(gu, dong, usg) {
  const [mean, count, trim] = data.cells[gu][dong][usg];
  const ratio = (mean / data.seoul[0] * 100).toFixed(0);
  const countChip = count < 5
    ? `<span class="chip warn">거래 ${count}건 · 참고용</span>`
    : `<span class="chip neutral">거래 ${count.toLocaleString()}건</span>`;
  return `<div class="sec"><div class="price">${formatWon(mean)}</div>`
    + `<span class="price-cap">평균 전세 보증금</span>`
    + `<div class="chips"><span class="chip">서울 평균의 ${ratio}%</span>${countChip}</div>`
    + `<div class="trim">`
    + `<div><div class="k">평균</div><div class="v">${shortWon(mean)}</div></div>`
    + `<div><div class="k">절사평균 10%</div><div class="v${trim === null ? " off" : ""}">`
    + `${trim === null ? "거래 부족" : shortWon(trim)}</div></div>`
    + `<div><div class="k">서울 평균</div><div class="v">${shortWon(data.seoul[0])}</div></div>`
    + `</div></div>`;
}

function secUsg(gu, dong, usg) {
  const rows = orderUsg(Object.keys(data.cells[gu][dong]))
    .map((name) => ({ name, value: data.cells[gu][dong][name][0] }));
  return `<div class="sec"><div class="sec-t">${dong} 주택 유형별 평균`
    + `<span>같은 동 안에서 유형끼리 견줘 봅니다</span></div>${barList(rows, usg, false)}</div>`;
}

// 구 안에서 어느 동이 비싸고 어느 동이 싼지. 거래가 한두 건인 동이 꼭대기에 앉는 일이 흔해
// 건수를 함께 보이고 5건 미만에는 표식을 단다.
function secDongRank(gu, usg, dong) {
  const rows = Object.keys(data.cells[gu])
    .filter((name) => usg in data.cells[gu][name])
    .map((name) => ({
      name,
      value: data.cells[gu][name][usg][0],
      count: data.cells[gu][name][usg][1],
      thin: data.cells[gu][name][usg][1] < 5,
    }))
    .sort((a, b) => b.value - a.value);

  let shown = rows;
  let folded = "";
  if (rows.length > 10) {
    shown = rows.slice(0, 5).concat(rows.slice(-5));
    folded = `<div class="fold">⋯ 가운데 ${rows.length - 10}곳 생략 ⋯</div>`;
  }
  const head = shown.slice(0, Math.min(5, shown.length));
  const tail = shown.slice(head.length);
  return `<div class="sec" id="dong-rank" data-usg="${usg}">`
    + `<div class="sec-t">${gu} 동별 ${usg} 평균`
    + `<span>비싼 곳부터 ${rows.length}곳. 거래가 적은 동은 평균이 흔들립니다</span></div>`
    + barList(head, dong, false) + folded + (tail.length ? barList(tail, dong, false) : "")
    + `</div>`;
}

function secGuRank(gu) {
  const names = Object.keys(data.gu).sort((a, b) => data.gu[b][0] - data.gu[a][0]);
  const rank = names.indexOf(gu) + 1;
  const rows = names.map((name) => ({ name, value: data.gu[name][0] }));
  return {
    html: `<div class="sec"><div class="sec-t">자치구 평균 전세가 순위`
      + `<span>${gu}는 25개 자치구 가운데 ${rank}위입니다</span></div>`
      + barList(rows, gu, true) + `</div>`,
    rank,
  };
}

function secMonthly(gu) {
  const values = data.monthly[gu];
  const change = (values[values.length - 1] - values[0]) / values[0] * 100;
  const move = change >= 0
    ? `처음 달보다 ${change.toFixed(1)}% 높습니다`
    : `처음 달보다 ${(-change).toFixed(1)}% 낮습니다`;
  return `<div class="sec"><div class="sec-t">${gu} 월별 평균 전세가`
    + `<span>${move} · 집계가 온전한 ${values.length}개월만</span></div>`
    + lineChart(values, data.months)
    + `<div class="tablelink"><button id="tbtn">표로 보기</button></div>`
    + `<div id="mtable" hidden><table><thead><tr><th>월</th><th>평균 전세가</th></tr></thead><tbody>`
    + data.months.map((m, i) => `<tr><td>${m}</td><td>${formatWon(values[i])}</td></tr>`).join("")
    + `</tbody></table></div></div>`;
}

function renderPopup() {
  const popup = document.querySelector("#popup");
  if (!state.gu) { popup.hidden = true; return; }

  const { gu, dong, usg } = state;
  const usgForRank = usg || "아파트";
  let body = "";
  if (dong && usg) {
    document.querySelector("#pop-name").textContent = `${dong} · ${usg}`;
    document.querySelector("#pop-sub").textContent = `서울특별시 ${gu}`;
    body += secSummary(gu, dong, usg) + secUsg(gu, dong, usg);
  } else {
    document.querySelector("#pop-name").textContent = gu;
    document.querySelector("#pop-sub").textContent = "법정동과 주택 유형을 고르면 더 자세히 나옵니다";
  }
  body += secDongRank(gu, usgForRank, dong);
  const { html, rank } = secGuRank(gu);
  body += html + secMonthly(gu);
  body += `<div class="foot">출처: 서울 열린데이터 광장 · 서울시 부동산 전월세가 정보<br>`
    + `${data.period} 확정신고 전세 계약 ${data.total}건 기준</div>`;

  const target = document.querySelector("#pop-body");
  target.innerHTML = body;
  popup.hidden = false;
  target.scrollTop = 0;
  const scroller = target.querySelector(".bars.scroll");
  const chosen = scroller?.querySelector(".bar-row.sel");
  if (scroller && chosen) {
    scroller.scrollTop = chosen.offsetTop - scroller.clientHeight / 2 + chosen.offsetHeight / 2;
  }
}

function toggleTable() {
  const table = document.querySelector("#mtable");
  table.hidden = !table.hidden;
  document.querySelector("#tbtn").textContent = table.hidden ? "표로 보기" : "표 접기";
}

const SOURCES = [
  ["국토교통부 보도자료", "https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp"],
  ["서울시 주택정책", "https://news.seoul.go.kr/citybuild/"],
  ["한국부동산원 부동산통계", "https://www.reb.or.kr/r-one/"],
  ["국가법령정보센터 주택임대차보호법", "https://www.law.go.kr/법령/주택임대차보호법"],
];

let newsLoaded = false;

function renderSources() {
  document.querySelector("#news-sources").innerHTML =
    `<div class="src-t">공식 자료</div>` + SOURCES.map(([name, href]) =>
      `<a href="${href}" target="_blank" rel="noopener">${name}</a>`).join("");
}

async function loadNews() {
  renderSources();
  if (newsLoaded) return;
  newsLoaded = true;
  const list = document.querySelector("#news-list");
  list.innerHTML = `<div class="empty">불러오는 중입니다</div>`;
  try {
    const res = await fetch("/api/news");
    if (!res.ok) throw new Error(res.status);
    const { items } = await res.json();
    list.innerHTML = items.length
      ? items.map((it) => `<a class="news" href="${it.link}" target="_blank" rel="noopener">`
          + `<span class="news-t">${it.title}</span>`
          + `<span class="news-m">${it.source || ""}</span></a>`).join("")
      : `<div class="empty">가져온 기사가 없습니다. 아래 공식 자료를 보세요</div>`;
  } catch {
    newsLoaded = false;
    list.innerHTML = `<div class="empty">기사를 불러오지 못했습니다. 아래 공식 자료를 보세요</div>`;
  }
}
