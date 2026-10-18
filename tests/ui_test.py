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
