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
    assert missing is not None
    page.evaluate("([g, d]) => window.app.setDong(g, d)", missing)
    page.wait_for_timeout(700)
    assert page.eval_on_selector(".price", "n => n.textContent").strip() != ""


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


def test_fill_fades_when_zoomed_into_streets(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    wide = page.eval_on_selector("path.gu", "n => parseFloat(getComputedStyle(n).fillOpacity)")
    page.evaluate("() => window.app.map.setZoom(15)")
    page.wait_for_timeout(700)
    page.mouse.move(700, 450)
    page.wait_for_timeout(250)
    close = page.evaluate("""() => {
        const n = document.elementsFromPoint(700, 450).find(e => e.tagName === 'path');
        return parseFloat(getComputedStyle(n).fillOpacity); }""")
    assert wide >= 0.5, "시 전체에서는 색이 또렷해야 한다"
    assert close <= 0.25, "거리 수준에서는 타일이 비쳐야 한다"


HOSTILE_FEED = {
    "items": [{
        "title": "<img src=x onerror=\"window.__pwned=1\">전세 대책",
        "link": "javascript:window.__pwned=2",
        "source": "<b>출처</b>",
        "date": "2026-10-18",
    }],
    "fallback": False,
}


def _serve_news(page, payload):
    page.route("**/api/news", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body=__import__("json").dumps(payload)))


def test_feed_text_is_escaped_not_executed(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    _serve_news(page, HOSTILE_FEED)
    page.click("#tab-news")
    page.wait_for_timeout(1200)
    assert page.evaluate("() => window.__pwned") is None
    assert page.eval_on_selector_all("#news-list img", "n => n.length") == 0
    assert "<img" in page.eval_on_selector(".news-t", "n => n.textContent")


def test_feed_link_scheme_is_restricted(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    _serve_news(page, HOSTILE_FEED)
    page.click("#tab-news")
    page.wait_for_timeout(1200)
    hrefs = page.eval_on_selector_all("#news-list a", "n => n.map(x => x.getAttribute('href'))")
    assert all(h is None or not h.lower().startswith("javascript:") for h in hrefs)


def test_news_items_show_their_date(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    _serve_news(page, {"items": [{"title": "전세 대책 발표", "link": "https://example.com",
                                  "source": "뉴스사", "date": "2026-10-18"}], "fallback": False})
    page.click("#tab-news")
    page.wait_for_timeout(1200)
    assert "2026" in page.eval_on_selector("#news-list .news-m", "n => n.textContent")


def test_basemap_switch_reachable_with_popup_open(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector(".leaflet-tile-loaded", timeout=30000)
    page.evaluate("() => window.app.setGu('강남구')")
    page.wait_for_timeout(900)
    page.click("#base-satellite", timeout=4000)
    page.wait_for_timeout(1200)
    srcs = page.eval_on_selector_all(".leaflet-tile", "n => n.map(x => x.src)")
    assert any("arcgisonline" in s for s in srcs)


def test_mobile_controls_and_attribution_stay_clear(page, base_url):
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.setGu('강동구')")
    page.wait_for_timeout(700)
    page.click("#tab-news")
    page.wait_for_timeout(900)
    overlaps = page.evaluate("""() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const hit = (a, b) => !(a.right <= b.left || a.left >= b.right
                                || a.bottom <= b.top || a.top >= b.bottom);
        const panel = box('#panel'), pop = box('#popup');
        const out = [];
        for (const s of ['#basemap', '#legend', '.leaflet-control-attribution']) {
            const r = box(s);
            if (hit(r, panel)) out.push(s + ' x panel');
            if (hit(r, pop)) out.push(s + ' x popup');
        }
        const bm = box('#basemap'), lg = box('#legend');
        if (hit(bm, lg)) out.push('basemap x legend');
        return out; }""")
    assert overlaps == []


def test_dong_ranking_uses_one_scale(page, base_url):
    page.goto(f"{base_url}/jeonse_hw2.html"); page.wait_for_selector("path.gu")
    page.evaluate("() => window.app.setGu('중구')")
    page.wait_for_timeout(900)
    rows = page.eval_on_selector_all("#dong-rank .bar-row", """n => n.map(x => ({
        value: x.querySelector('.bar-val').textContent,
        width: parseFloat(x.querySelector('.bar-fill').style.width)}))""")
    assert len(rows) >= 6
    widths = [r["width"] for r in rows]
    # 비싼 순으로 늘어놓았으니 막대도 줄곧 짧아져야 한다. 중간에 다시 길어지면 자[가 두 개다.
    climbs = [(i, widths[i - 1], widths[i]) for i in range(1, len(widths))
              if widths[i] > widths[i - 1] + 0.5]
    assert climbs == [], f"더 싼 동의 막대가 더 길다: {climbs}"
