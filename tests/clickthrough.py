"""실제 클릭만으로 전 흐름을 돌려 본다. evaluate 로 상태를 밀어 넣지 않는다."""
import functools, http.server, pathlib, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
OUT = pathlib.Path("/tmp/claude-1000/click"); OUT.mkdir(exist_ok=True)
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
h.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 0), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/jeonse_hw2.html"

problems, errors = [], []


def check(label, ok, detail=""):
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        problems.append(label)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    print("[데스크톱 1440x900]")
    pg.goto(URL)
    pg.wait_for_selector(".leaflet-tile-loaded", timeout=40000)
    check("지도와 타일 표시", pg.eval_on_selector_all("path.gu", "n=>n.length") == 25)
    check("팝업은 처음에 닫혀 있음", pg.eval_on_selector("#popup", "n=>n.hidden"))

    # 지도에서 구 클릭
    pg.click("path.gu >> nth=0", force=True)
    pg.wait_for_timeout(1200)
    first = pg.eval_on_selector("#pop-name", "n=>n.textContent")
    check("지도 클릭으로 팝업 열림", not pg.eval_on_selector("#popup", "n=>n.hidden"), first)
    check("동별 순위 표시", pg.eval_on_selector_all("#dong-rank .bar-row", "n=>n.length") > 0)

    # 위성 전환
    pg.click("#base-satellite")
    pg.wait_for_timeout(2000)
    check("위성지도 전환", any("arcgisonline" in s for s in
          pg.eval_on_selector_all(".leaflet-tile", "n=>n.map(x=>x.src)")))
    pg.click("#base-osm"); pg.wait_for_timeout(1500)
    check("일반지도 복귀", any("openstreetmap" in s for s in
          pg.eval_on_selector_all(".leaflet-tile", "n=>n.map(x=>x.src)")))
    check("저작자 표시 보임", pg.eval_on_selector(".leaflet-control-attribution",
          "n=>{const r=n.getBoundingClientRect();return r.width>0&&r.right<=innerWidth;}"))

    # 검색으로 이동
    pg.fill("#q", "가락"); pg.wait_for_timeout(600)
    check("검색 결과 나옴", pg.eval_on_selector_all(".result", "n=>n.length") > 0)
    pg.click(".result >> nth=0"); pg.wait_for_timeout(1500)
    check("검색 결과 클릭 반영", "가락동" in pg.eval_on_selector("#pop-name", "n=>n.textContent"),
          pg.eval_on_selector(".price", "n=>n.textContent"))
    check("지도가 그쪽으로 확대", pg.evaluate("()=>window.app.map.getZoom()") >= 14)

    # 지명검색 탭
    pg.click("#tab-pick"); pg.wait_for_timeout(400)
    check("지명검색 탭 열림", not pg.eval_on_selector("#pane-pick", "n=>n.hidden"))
    pg.select_option("#gu", "종로구"); pg.wait_for_timeout(1200)
    check("자치구 선택 반영", pg.eval_on_selector("#pop-name", "n=>n.textContent") == "종로구")
    dong = pg.eval_on_selector("#dong option:nth-child(2)", "n=>n.value")
    pg.select_option("#dong", dong); pg.wait_for_timeout(1000)
    usg = pg.eval_on_selector("#usg", "n=>n.value")
    check("법정동 선택 반영", dong in pg.eval_on_selector("#pop-name", "n=>n.textContent"),
          f"{dong} / {usg}")
    opts = pg.eval_on_selector_all("#usg option", "n=>n.slice(1).map(x=>x.value)")
    if len(opts) > 1:
        pg.select_option("#usg", opts[1]); pg.wait_for_timeout(900)
        check("주택 유형 바꾸기", opts[1] in pg.eval_on_selector("#pop-name", "n=>n.textContent"))

    # 표 토글
    pg.click("#tbtn"); pg.wait_for_timeout(500)
    check("월별 표 펼치기", pg.eval_on_selector_all("#mtable tbody tr", "n=>n.length") == 7)
    pg.click("#tbtn"); pg.wait_for_timeout(300)
    check("월별 표 접기", pg.eval_on_selector("#mtable", "n=>n.hidden"))

    # 뉴스 탭 (로컬에는 /api/news 가 없으므로 물러남 경로)
    pg.click("#tab-news"); pg.wait_for_timeout(2000)
    check("공식 출처 링크 표시", pg.eval_on_selector_all("#news-sources a", "n=>n.length") >= 4)
    check("뉴스 실패 시 안내 문구", "공식 자료" in pg.eval_on_selector("#news-list", "n=>n.textContent"))
    pg.screenshot(path=str(OUT / "desktop.png"))

    # 팝업 닫기
    pg.click("#pop-close"); pg.wait_for_timeout(400)
    check("팝업 닫힘", pg.eval_on_selector("#popup", "n=>n.hidden"))
    check("닫은 뒤 위성 버튼 원위치", pg.eval_on_selector("#basemap",
          "n=>n.getBoundingClientRect().right > innerWidth - 200"))

    print("\n[모바일 390x844]")
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.goto(URL); pg.wait_for_selector("path.gu", timeout=30000)
    pg.click("#tab-pick"); pg.wait_for_timeout(300)
    pg.select_option("#gu", "강동구"); pg.wait_for_timeout(1500)
    check("모바일 시트 열림", not pg.eval_on_selector("#popup", "n=>n.hidden"))
    pg.click("#base-satellite", timeout=4000); pg.wait_for_timeout(1800)
    check("모바일 위성 전환 가능", any("arcgisonline" in s for s in
          pg.eval_on_selector_all(".leaflet-tile", "n=>n.map(x=>x.src)")))
    check("가로 스크롤 없음", not pg.evaluate("()=>document.documentElement.scrollWidth>innerWidth"))
    pg.screenshot(path=str(OUT / "mobile.png"))
    b.close()

srv.shutdown()
# 로컬 정적 서버에는 Worker 가 없어 /api/news 404 는 의도한 물러남 경로다.
expected = [e for e in errors if "404" in e]
unexpected = [e for e in errors if "404" not in e]
print("\n예상된 오류(로컬 Worker 없음):", len(expected))
print("예상 밖 오류:", unexpected or "없음")
errors = unexpected
print("실패 항목:", problems or "없음")
print("판정:", "통과" if not problems and not errors else "문제 있음")
