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
