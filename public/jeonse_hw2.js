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
    },
  }).addTo(map);
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
  window.app = { data, map, state, colorFor, guLayer };
}

start();
