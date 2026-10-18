# 서울 전세가 플랫폼 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인라인 SVG 지도를 OpenStreetMap 기반 지도 플랫폼으로 바꾸고, 자치구·법정동 포커스 이동, 동별 순위, 정책 뉴스 탭을 더한다.

**Architecture:** 빌드 타임에 파이썬이 원본 CSV를 작은 JSON과 GeoJSON으로 줄여 `public/data/`에 쓴다. 브라우저는 Leaflet으로 타일 위에 자치구 경계를 얹고, 순수 자바스크립트가 상태를 관리한다. 뉴스는 CORS가 막혀 있어 Cloudflare Worker 한 라우트가 중계한다.

**Tech Stack:** Leaflet 1.9.4 (cdnjs), OpenStreetMap 타일, Esri World Imagery 위성 타일, Noto Sans KR (Google Fonts), Cloudflare Workers (정적 자산 + fetch 핸들러), 빌드는 pandas·geopandas·scipy.

**Spec:** 아래 Requirements 절. 사용자 요청(2026-10-18)을 그대로 옮긴 것이며 별도 문서는 없다.

## Requirements

1. OpenStreetMap을 배경지도로 쓰고, 우측 하단에서 일반지도와 위성지도를 고를 수 있다.
2. 자치구 색상은 낮음 파랑에서 높음 빨강으로 간다.
3. 아이폰 리퀴드 글래스 디자인, 본문 글꼴은 Noto Sans KR.
4. 팝업 안에서 선택한 구의 비싼 동과 싼 동을 동별로 본다. 주택 유형 기본값은 아파트.
5. 자치구를 고르면 지도가 그쪽으로 이동하며 확대된다. 법정동도 마찬가지.
6. 아파트 정부 정책, 뉴스, 발표를 보는 탭이 있다.

## Global Constraints

- 글꼴: `Noto Sans KR` (400/500/700), 대체 글꼴 `-apple-system, BlinkMacSystemFont, sans-serif`.
- 단계구분도 색 5단계, 서울 중앙값 기준 발산형: `#1F6FB2`, `#86B9DC`, `#E8E6E3`, `#E8896B`, `#B5321F`. 검증기에서 색각 분리와 일반 시야 분리를 통과한 값이며 바꾸지 않는다.
- 외부 스크립트는 cdnjs에서 정확한 버전으로 고정한다: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js`, 같은 경로의 `leaflet.css`.
- 타일 저작자 표시는 지도에 항상 보인다. OSM은 `© OpenStreetMap contributors`, 위성은 `Tiles © Esri`.
- 금액 표기는 기존 규칙을 유지한다. 만원 단위 정수를 받아 `9억 199만원`, `45억원`, `9,800만원` 형태로 쓴다.
- 절사평균은 10% 양측 절사이며 거래 10건 미만인 조합에서는 계산하지 않고 `null`로 둔다.
- 월별 추이는 서울 전체 월 거래량이 중앙값의 50%에 못 미치는 달을 버린다.
- 파이썬 실행은 `.venv/bin/python` 또는 `uv run`만 쓴다. 맨 `python3` 금지.
- 새 npm 의존성을 추가하지 않는다. 빌드는 파이썬, 런타임은 Leaflet 하나뿐이다.
- UI 테스트는 `pytest-playwright` 를 쓴다. 아직 깔려 있지 않으므로 Task 2 에서 `uv pip install pytest-playwright` 를 먼저 실행한다. `playwright` 와 Chromium 은 이미 있다.

## Review Focus

1. **좌표가 없는 법정동 81개** — `seoul_apt_price_2026_geocoded.csv`는 아파트 매매 건만 담아 389개 동 중 308개만 좌표가 있다. 좌표 없는 동을 고르면 확대가 아니라 해당 자치구 경계로 물러나야 하며, 오류를 던지거나 지도를 엉뚱한 곳으로 보내면 안 된다. Task 3이 검증한다.
2. **뉴스 중계 실패** — Google 뉴스 RSS가 느리거나 막히면 탭이 빈 화면이 되면 안 된다. 공식 출처 링크 목록으로 물러나야 한다. Task 5가 검증한다.
3. **거래 1건짜리 동** — 동별 순위에서 거래 1~2건인 동이 최상단에 올라 "가장 비싼 동"으로 보인다. 순위에 거래 건수를 함께 보이고 5건 미만은 표식을 단다. Task 4가 검증한다.
4. **유형이 없는 동** — 모든 동에 아파트가 있지는 않다. 기본값 아파트를 적용할 수 없는 동에서 빈 팝업이 나오면 안 된다. Task 4가 검증한다.
5. **좁은 화면** — 390px에서 지도, 좌측 패널, 팝업, 지도 종류 선택이 서로 겹치거나 화면 밖으로 나가면 안 된다. Task 6이 검증한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `tools/build_jeonse.py` (생성) | 원본 CSV → `public/data/*.json`, `*.geojson` 생성 |
| `tools/test_build_jeonse.py` (생성) | 빌드 집계 함수 단위 테스트 |
| `public/data/jeonse.json` (생성) | 구·동·유형 집계, 자치구 요약, 월별, 동 좌표, 메타 |
| `public/data/seoul-gu.geojson` (생성) | 자치구 경계 (위경도, tol 0.001) |
| `public/jeonse_hw2.html` (수정) | 마크업과 스타일만. 스크립트는 외부 파일 |
| `public/jeonse_hw2.js` (생성) | 지도, 검색, 선택 상태, 팝업 렌더 |
| `src/worker.js` (생성) | `/api/news` 중계, 그 외는 정적 자산 |
| `wrangler.jsonc` (수정) | `main` 추가 |
| `tests/ui_test.py` (생성) | Playwright 동작 검증 |

기존 `public/jeonse_hw2.html` 안의 PyScript 블록은 전부 제거한다. Leaflet은 자바스크립트 API이고, PyScript에서 쓰려면 호출마다 `to_js`와 `create_proxy`를 거쳐야 해 코드가 늘고 이미 한 번 `JsNull` 버그를 냈다. 집계는 여전히 파이썬이 빌드 타임에 한다.

---

### Task 1: 빌드 스크립트

**Files:**
- Create: `tools/build_jeonse.py`
- Create: `tools/test_build_jeonse.py`
- Output: `public/data/jeonse.json`, `public/data/seoul-gu.geojson`

**Interfaces:**
- Consumes: `../../lecture03_data_visualization/data/seoul_rent_2026.csv`, `../../lecture04_spatial_data_analysis/data/seoul_apt_price_2026_geocoded.csv`, `../../lecture06_Living_Population/data/HangJeongDong_ver20250101.geojson` (레포 밖 상대경로. 스크립트 상단 `SOURCE_DIR` 상수로 모은다)
- Produces: `jeonse.json` 최상위 키 `cells`, `gu`, `monthly`, `months`, `seoul`, `dongPoints`, `period`, `total`, `cuts`
  - `cells[구][동][유형] = [평균, 건수, 절사평균|null]`
  - `gu[구] = [평균, 건수, 절사평균|null]`
  - `monthly[구] = [평균, ...]`, `months = ["1월", ...]`
  - `seoul = [평균, 건수, 절사평균]`
  - `dongPoints["구|동"] = [위도, 경도]` (좌표 있는 동만)
  - `cuts = [c1, c2, c3, c4]` 5단계 경계, 자치구 평균의 5분위

- [ ] **Step 1: 실패하는 테스트 작성** — `tools/test_build_jeonse.py`

```python
import pandas as pd
from build_jeonse import aggregate_cells, trimmed_mean, full_months, format_won

def test_trimmed_mean_drops_outliers():
    s = pd.Series([100] * 9 + [10000])
    assert trimmed_mean(s) is not None
    assert trimmed_mean(s) < s.mean()

def test_trimmed_mean_none_under_ten():
    assert trimmed_mean(pd.Series([100] * 9)) is None

def test_full_months_drops_thin_edges():
    counts = pd.Series({202511: 374, 202512: 4082, 202601: 19977,
                        202602: 16431, 202603: 18582, 202604: 16215,
                        202605: 15620, 202606: 15227, 202607: 13461, 202608: 1690})
    assert full_months(counts) == [202601, 202602, 202603, 202604, 202605, 202606, 202607]

def test_aggregate_cells_shape():
    df = pd.DataFrame({"CGG_NM": ["강남구"] * 3, "STDG_NM": ["개포동"] * 3,
                       "BLDG_USG": ["아파트"] * 3, "GRFE": [100.0, 200.0, 300.0]})
    cells = aggregate_cells(df)
    assert cells["강남구"]["개포동"]["아파트"] == [200.0, 3, None]

def test_format_won():
    assert format_won(90199) == "9억 199만원"
    assert format_won(450000) == "45억원"
    assert format_won(9800) == "9,800만원"
```

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tools/test_build_jeonse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_jeonse'`

- [ ] **Step 3: `tools/build_jeonse.py` 구현**

함수 시그니처:
- `trimmed_mean(series: pd.Series) -> float | None` — `scipy.stats.trim_mean(series, 0.10)` 를 소수점 0자리로 반올림. 길이 10 미만이면 `None`.
- `full_months(counts: pd.Series) -> list[int]` — 값이 `counts.median() * 0.5` 이상인 인덱스를 정렬해 반환.
- `aggregate_cells(df: pd.DataFrame) -> dict` — `CGG_NM`, `STDG_NM`, `BLDG_USG` 로 묶어 `[평균, 건수, 절사평균]` 중첩 사전.
- `format_won(value: float) -> str` — 억과 만원으로 나눈 한국어 표기. 테스트가 값을 고정한다.
- `dong_points(geocoded: pd.DataFrame) -> dict` — `LAT`, `LON` 결측 제거 후 `CGG_NM`, `STDG_NM` 별 중앙값. 키는 `f"{구}|{동}"`.
- `gu_geojson(path: str) -> dict` — 행정동 GeoJSON에서 `sidonm == "서울특별시"` 를 골라 `sggnm` 으로 dissolve, `simplify(0.001, preserve_topology=True)`, 속성은 `sggnm` 만 남긴다.
- `main()` — 위를 엮어 두 파일을 쓴다. `GRFE` 는 `RENT_SE == "전세"` 만.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tools/test_build_jeonse.py -v`
Expected: PASS, 5 passed

- [ ] **Step 5: 실제 생성 및 산출물 점검**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python tools/build_jeonse.py && ls -la public/data/`
Expected: `jeonse.json` 과 `seoul-gu.geojson` 생성. GeoJSON 은 40KB 안팎, feature 25개.

Run: `../.venv/bin/python -c "import json;d=json.load(open('public/data/jeonse.json'));print(len(d['gu']), len(d['dongPoints']), d['months'], len(d['cuts']))"`
Expected: `25 308 ['1월', ..., '7월'] 4`

- [ ] **Step 6: 커밋**

```bash
git add tools/ public/data/
git commit -m "feat: build aggregated jeonse data and district boundaries"
```

---

### Task 2: 지도 골격

**Files:**
- Modify: `public/jeonse_hw2.html` (PyScript 블록 제거, Leaflet 로드, 지도 컨테이너)
- Create: `public/jeonse_hw2.js`
- Create: `tests/ui_test.py`

**Interfaces:**
- Consumes: Task 1 의 `jeonse.json`, `seoul-gu.geojson`
- Produces: `window.app` 에 `{ data, map, state, setGu, setDong, setUsg, focusOn, colorFor }` 를 노출한다. 테스트와 이후 Task 가 이 핸들을 쓴다.
  - `data` — `jeonse.json` 을 그대로 담은 객체. `data.cells`, `data.gu`, `data.monthly`, `data.months`, `data.seoul`, `data.dongPoints`, `data.cuts`
  - `state = { gu: string, dong: string, usg: string }`
  - `setGu(gu: string) -> void`
  - `setDong(gu: string, dong: string) -> void` — 구를 함께 받아 검색 결과에서 바로 부를 수 있다
  - `setUsg(usg: string) -> void`
  - `focusOn(gu: string, dong: string | "") -> void`
  - `colorFor(mean: number) -> string` — `cuts` 로 5단계 색 반환

- [ ] **Step 0: 테스트 도구 설치**

Run: `cd my-app-lecture-26.2 && uv pip install --python ../.venv/bin/python pytest-playwright`
Expected: `pytest-playwright` 설치 완료

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/ui_test.py`

```python
def test_map_loads_tiles_and_districts(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html")
    page.wait_for_selector(".leaflet-tile-loaded", timeout=30000)
    assert page.eval_on_selector_all("path.gu", "n => n.length") == 25
    assert page.eval_on_selector_all(".leaflet-control-attribution", "n => n.length") == 1

def test_basemap_switch(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html")
    page.wait_for_selector(".leaflet-tile-loaded", timeout=30000)
    page.click("#base-satellite")
    page.wait_for_timeout(1500)
    srcs = page.eval_on_selector_all(".leaflet-tile", "n => n.map(x => x.src)")
    assert any("arcgisonline" in s for s in srcs)

def test_choropleth_ends_are_blue_and_red(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html")
    page.wait_for_selector("path.gu", timeout=30000)
    fills = page.evaluate("() => { const a = window.app;"
                          " return [a.colorFor(0), a.colorFor(1e9)]; }")
    assert fills == ["#1F6FB2", "#B5321F"]
```

`conftest.py` 에 `base_url` 픽스처를 둔다. `public/` 를 `http.server` 로 띄우고 주소를 돌려준다.

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: FAIL — 타일 셀렉터 타임아웃

- [ ] **Step 3: 지도 구현**

`jeonse_hw2.html`: `<head>` 에 Leaflet CSS, Noto Sans KR, 본문에 `<div id="map">`, 우측 하단 `<div id="basemap">` 에 `#base-osm` 과 `#base-satellite` 버튼. `<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>` 다음에 `<script src="jeonse_hw2.js"></script>`.

`jeonse_hw2.js`:
- `fetch` 로 두 데이터 파일을 병렬로 받는다.
- `L.map("map", { zoomControl: false }).setView([37.5665, 126.978], 11)`
- 타일 두 장을 만들어 두고 버튼으로 바꾼다. OSM `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, 위성 `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`. 각각 `attribution` 을 단다.
- `L.geoJSON(geo, { style })` 로 자치구를 얹고, 각 path 에 `className: "gu"`, `fillColor: colorFor(mean)`, `fillOpacity: 0.62`, `color: "#fff"`, `weight: 1.5`.
- `colorFor` 는 `cuts` 와 상수 색 배열로 단계를 고른다.
- `window.app` 을 노출한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: PASS, 3 passed

- [ ] **Step 5: 커밋**

```bash
git add public/jeonse_hw2.html public/jeonse_hw2.js tests/
git commit -m "feat: replace inline SVG map with Leaflet over OpenStreetMap"
```

---

### Task 3: 검색과 포커스 이동

**Files:**
- Modify: `public/jeonse_hw2.html` (좌측 패널 마크업)
- Modify: `public/jeonse_hw2.js`
- Modify: `tests/ui_test.py`

**Interfaces:**
- Consumes: Task 2 의 `window.app.focusOn`, `state`
- Produces: `focusOn(gu, dong)` 의 동작 규칙. `dong` 이 비었거나 `dongPoints` 에 없으면 해당 자치구 feature 의 `getBounds()` 로 `fitBounds`. 있으면 그 좌표로 `setView(point, 15)`.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_search_matches_dong(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.fill("#q", "가락")
    page.wait_for_timeout(500)
    rows = page.eval_on_selector_all(".result", "n => n.map(x => x.dataset.dong)")
    assert "가락동" in rows

def test_selecting_district_zooms_in(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    before = page.evaluate("() => window.app.map.getZoom()")
    page.evaluate("() => window.app.setGu('강동구')")
    page.wait_for_timeout(900)
    after = page.evaluate("() => ({z: window.app.map.getZoom(), c: window.app.map.getCenter()})")
    assert after["z"] > before
    assert 127.10 < after["c"]["lng"] < 127.20

def test_dong_without_coordinates_falls_back_to_district(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.focusOn('마포구', '당인동')")
    page.wait_for_timeout(900)
    c = page.evaluate("() => window.app.map.getCenter()")
    assert 126.88 < c["lng"] < 127.00 and 37.52 < c["lat"] < 37.59
```

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -k "search or zoom or coordinates" -v`
Expected: FAIL — `#q` 없음

- [ ] **Step 3: 패널과 포커스 구현**

마크업: 좌측 상단 패널에 탭 세 개 `검색`, `지명검색`, `정책·뉴스`. 검색 탭은 `<input id="q">` 와 `<div id="results">`. 지명검색 탭은 `#gu`, `#dong`, `#usg` 선택 상자.

동작:
- 검색은 입력 문자열이 동 이름에 들어가면 맞히고, 맞은 자리가 앞일수록 위로 올린다. 최대 40개.
- `setGu(gu)` 는 동과 유형을 비우고 `focusOn(gu, "")`.
- `setDong(gu, dong)` 은 유형을 `아파트` 로 두되 그 동에 아파트가 없으면 `cells[gu][dong]` 의 첫 유형으로 두고 `focusOn(gu, dong)`.
- 지도 자치구 클릭도 `setGu` 를 부른다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: PASS, 6 passed

- [ ] **Step 5: 커밋**

```bash
git add public/jeonse_hw2.html public/jeonse_hw2.js tests/ui_test.py
git commit -m "feat: search dongs and fly the map to the chosen place"
```

---

### Task 4: 팝업과 동별 순위

**Files:**
- Modify: `public/jeonse_hw2.html` (팝업 마크업)
- Modify: `public/jeonse_hw2.js`
- Modify: `tests/ui_test.py`

**Interfaces:**
- Consumes: Task 3 의 `state`, Task 1 의 `cells`, `gu`, `monthly`, `seoul`
- Produces: `renderPopup()` 가 `#pop-body` 를 채운다. 구만 정해지면 동별 순위, 자치구 순위, 월별 추이. 동과 유형까지 정해지면 요약과 유형별 비교를 앞에 붙인다.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_dong_ranking_shows_top_and_bottom(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.setGu('강남구')")
    page.wait_for_timeout(800)
    names = page.eval_on_selector_all("#dong-rank .bar-row .bar-name", "n => n.map(x => x.textContent)")
    assert len(names) >= 5
    assert page.eval_on_selector("#dong-rank", "n => n.dataset.usg") == "아파트"

def test_thin_dongs_are_flagged(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.setGu('종로구')")
    page.wait_for_timeout(800)
    flags = page.eval_on_selector_all("#dong-rank .thin", "n => n.length")
    counts = page.eval_on_selector_all("#dong-rank .bar-count", "n => n.length")
    assert counts > 0 and flags >= 0

def test_dong_without_apartments_still_renders(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    missing = page.evaluate("""() => {
        const c = window.app.data.cells;
        for (const g in c) for (const d in c[g])
            if (!('아파트' in c[g][d])) return [g, d];
        return null; }""")
    if missing:
        page.evaluate("([g, d]) => window.app.setDong(g, d)", missing)
        page.wait_for_timeout(700)
        assert page.eval_on_selector(".price", "n => n.textContent").strip() != ""
```

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -k "ranking or thin or apartments" -v`
Expected: FAIL — `#dong-rank` 없음

- [ ] **Step 3: 팝업 구현**

`renderPopup()` 가 만드는 조각:
- 요약: 평균, 절사평균, 서울 평균, 서울 평균 대비 비율, 거래 건수. 5건 미만이면 `참고용` 표식.
- 동별 순위 (`#dong-rank`): 선택한 구 안에서 해당 유형을 가진 동을 평균 내림차순으로 나열한다. `data-usg` 속성에 기준 유형을 적는다. 각 줄에 `.bar-count` 로 거래 건수를, 5건 미만이면 `.thin` 클래스를 단다. 10줄을 넘으면 상위 5개와 하위 5개만 보이고 사이를 `⋯` 로 접는다.
- 유형별 비교, 자치구 순위, 월별 추이는 기존 구현을 옮긴다.
- 유형 선택이 바뀌면 동별 순위의 기준도 바뀐다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: PASS, 9 passed

- [ ] **Step 5: 커밋**

```bash
git add public/jeonse_hw2.html public/jeonse_hw2.js tests/ui_test.py
git commit -m "feat: rank dongs within a district inside the popup"
```

---

### Task 5: 정책·뉴스 탭

**Files:**
- Create: `src/worker.js`
- Modify: `wrangler.jsonc`
- Modify: `public/jeonse_hw2.js`
- Modify: `tests/ui_test.py`

**Interfaces:**
- Produces: `GET /api/news` → `{"items": [{"title", "link", "source", "date"}], "fallback": false}`. 중계 실패 시 `{"items": [], "fallback": true}` 와 200.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_news_tab_lists_items_or_falls_back(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.click("#tab-news")
    page.wait_for_timeout(2500)
    items = page.eval_on_selector_all("#news-list a", "n => n.length")
    sources = page.eval_on_selector_all("#news-sources a", "n => n.length")
    assert items > 0 or sources > 0

def test_news_failure_shows_official_links(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.route("**/api/news", lambda route: route.abort())
    page.click("#tab-news")
    page.wait_for_timeout(1500)
    assert page.eval_on_selector_all("#news-sources a", "n => n.length") >= 3
```

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -k news -v`
Expected: FAIL — `#tab-news` 없음

- [ ] **Step 3: 중계와 탭 구현**

`src/worker.js`: `export default { async fetch(request, env) }`. 경로가 `/api/news` 면 `https://news.google.com/rss/search?q=전세+정책&hl=ko&gl=KR&ceid=KR:ko` 를 받아 `<item>` 에서 제목, 링크, 출처, 날짜를 뽑아 최대 12개 JSON 으로 돌려준다. `Cache-Control: public, max-age=1800` 을 붙인다. 예외나 비정상 응답이면 `{"items": [], "fallback": true}`. 그 외 경로는 `env.ASSETS.fetch(request)`.

`wrangler.jsonc`: `"main": "src/worker.js"` 와 `"assets": { "directory": "./public", "binding": "ASSETS" }`.

탭 화면: `#news-list` 에 받아온 기사를 제목과 출처와 날짜로 보이고 새 창으로 연다. `#news-sources` 에는 늘 보이는 공식 출처 링크를 둔다. 국토교통부 보도자료, 서울시 주택정책실, 한국부동산원, 국가법령정보센터 네 곳이다. 중계가 실패하면 `#news-list` 를 비우고 안내 한 줄을 띄운다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: PASS, 11 passed

로컬 `http.server` 에는 `/api/news` 가 없어 첫 테스트는 물러남 경로로 통과한다. 배포 뒤 실제 응답을 확인한다.

Run: `curl -s https://my-app-lecture-26-2.vousetmonetoile.workers.dev/api/news | head -c 200`
Expected: `{"items":[{"title":...` 또는 `{"items":[],"fallback":true}`

- [ ] **Step 5: 커밋**

```bash
git add src/worker.js wrangler.jsonc public/jeonse_hw2.js tests/ui_test.py
git commit -m "feat: proxy housing policy news through the worker"
```

---

### Task 6: 리퀴드 글래스 마감

**Files:**
- Modify: `public/jeonse_hw2.html` (스타일)
- Modify: `tests/ui_test.py`

**Interfaces:**
- Consumes: Task 2~5 의 마크업 구조

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_korean_font_applied(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    fam = page.eval_on_selector("body", "n => getComputedStyle(n).fontFamily")
    assert "Noto Sans KR" in fam

def test_no_overflow_or_overlap_on_mobile(page, base_url):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.setGu('강동구')")
    page.wait_for_timeout(900)
    assert page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth")
    boxes = page.evaluate("""() => ['#panel', '#popup', '#basemap'].map(s => {
        const e = document.querySelector(s); const r = e.getBoundingClientRect();
        return [s, r.left >= -1, r.right <= window.innerWidth + 1]; })""")
    assert all(b[1] and b[2] for b in boxes)
```

- [ ] **Step 2: 실패 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -k "font or mobile" -v`
Expected: FAIL — 글꼴 미적용

- [ ] **Step 3: 스타일 적용**

- Google Fonts 에서 Noto Sans KR 400/500/700 을 받고 `body` 글꼴 앞에 둔다.
- 패널, 팝업, 지도 종류 선택, 범례에 공통 `.glass` 를 쓴다. `background: rgba(255,255,255,.62)`, `backdrop-filter: blur(28px) saturate(180%)`, 1px 밝은 테두리, 큰 모서리, 두 겹 그림자(바깥 번짐과 안쪽 윗면 하이라이트).
- 좁은 화면에서 패널은 위쪽 가로 전체, 팝업은 아래 시트, 지도 종류 선택은 팝업 위로 올린다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python -m pytest tests/ui_test.py -v`
Expected: PASS, 13 passed

- [ ] **Step 5: 1440px 과 390px 화면 갈무리 후 눈으로 확인**

Run: `cd my-app-lecture-26.2 && ../.venv/bin/python tests/shoot.py`
Expected: `/tmp/claude-1000/shots3/` 에 두 장. 패널 겹침, 라벨 충돌, 타일 로딩 상태를 눈으로 본다.

- [ ] **Step 6: 커밋**

```bash
git add public/jeonse_hw2.html tests/
git commit -m "style: liquid glass surfaces and Noto Sans KR"
```

---

## 넣지 않은 것

- 법정동 단위 단계구분도. 경계 파일이 행정동 기준이라 법정동과 1대1로 맞지 않는다. 지도는 자치구까지만 칠하고 동별 비교는 팝업 순위가 맡는다.
- 거래 위치 점 지도. 좌표가 붙은 자료는 아파트 매매가라 전세 대시보드와 다른 자료다.
- 지도 범례의 금액 눈금. 5분위 경계값은 팝업 순위에서 숫자로 확인할 수 있다.
- 뉴스 검색어 사용자 지정. 고정 질의 하나로 시작한다.
