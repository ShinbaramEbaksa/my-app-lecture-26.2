import functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
OUT = pathlib.Path("/tmp/claude-1000/shots3"); OUT.mkdir(exist_ok=True)
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
h.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/jeonse_hw2.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(url); pg.wait_for_selector(".leaflet-tile-loaded", timeout=40000)
    pg.evaluate("() => window.app.setDong('강남구', '역삼동')")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=str(OUT / "desktop.png"))
    pg.click("#tab-news"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "news.png"), clip={"x": 0, "y": 0, "width": 420, "height": 480})
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.click("#tab-search"); pg.wait_for_timeout(1800)
    pg.screenshot(path=str(OUT / "mobile.png"))
    b.close()
srv.shutdown()
print("콘솔 오류:", errs or "없음")
