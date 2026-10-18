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

function styleFor(feature) {
  return {
    className: "gu",
    fillColor: colorFor(data.gu[feature.properties.sggnm][0]),
    fillOpacity: 0.62,
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

// Task 4, 5 가 채운다. 지금은 호출만 받아 넘긴다.
function renderPopup() {}
function toggleTable() {}
function loadNews() {}
