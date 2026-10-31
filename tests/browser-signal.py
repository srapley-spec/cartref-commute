"""Optional production-browser check: npm run build && python3 tests/browser-signal.py.

Requires Python Playwright and Chromium (/usr/bin/chromium, or CHROMIUM_PATH).
Uses the real built app with Example data and a frozen test clock; no API keys or live feeds.
Writes light/dark screenshots to SIGNAL_ARTIFACT_DIR (default /workspace/scratch).
This is Chromium coverage, not a substitute for Safari/iPhone/VoiceOver acceptance.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("SIGNAL_ARTIFACT_DIR", "/workspace/scratch"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = http.server.ThreadingHTTPServer(
    ("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()


def settings(page, update):
    page.locator("#settingsBtn").click()
    update(page)
    page.locator("#saveBtn").click()
    page.wait_for_function("!document.querySelector('#settings').open")


def ranked(page):
    return page.evaluate("""() => __commute.ranked(Date.now()).map(j => ({
      train: j.train.std, service: j.train.serviceId || null, from: j.train.from,
      to: j.train.to, leave: j.leave, arrive: j.arrive,
      flags: j.flags, alternatives: (j.alts || []).map(a => ({hub:a.hub,leave:a.leave,arrive:a.arrive})),
      recommended: j.recommended || 0
    }))""")


def layout(page):
    return page.evaluate("""() => {
      const shown=e=>!!e.getClientRects().length;
      const controls=[...document.querySelectorAll('button,input:not([type="checkbox"]),select,summary')].filter(shown);
      const luminance=c=>{const a=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{
        v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
      });return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
      const contrast=(a,b)=>{a=luminance(a);b=luminance(b);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
      const sample=document.querySelector('#signalStatus');
      const colors=['ok','warn','bad','note'].map(level=>{
        const e=document.createElement('span');e.className='pill '+level;e.textContent='Status';document.body.append(e);
        const style=getComputedStyle(e),ratio=contrast(style.color,style.backgroundColor);e.remove();return{level,ratio};
      });
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        controls:controls.map(e=>({id:e.id||e.textContent.trim(),height:e.getBoundingClientRect().height,tabIndex:e.tabIndex})),
        colors,canvas:getComputedStyle(document.body).backgroundColor,ink:getComputedStyle(document.body).color};
    }""")


def assert_layout(page, label):
    check = layout(page)
    assert check["scrollWidth"] <= check["width"] + 1, (label, check)
    assert all(c["height"] >= 43.9 for c in check["controls"]), (label, check["controls"])
    assert all(c["tabIndex"] >= 0 for c in check["controls"]), (label, check["controls"])
    assert all(c["ratio"] >= 4.5 for c in check["colors"]), (label, check["colors"])
    return check


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
            args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 393, "height": 852},
            geolocation={"latitude": 51.975, "longitude": -.23, "accuracy": 12},
            permissions=["geolocation"], color_scheme="light")
        context.add_init_script("""(() => {
          const NativeDate=Date,epoch=Date.parse('2026-11-03T07:00:00Z');
          class TestDate extends NativeDate { constructor(...args){super(...(args.length?args:[epoch]));} static now(){return epoch;} }
          window.Date=TestDate;
        })();""")
        page = context.new_page()
        errors, traffic, results = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def network(route):
            if route.request.url.startswith("http://127.0.0.1:"):
                route.continue_()
            else:
                traffic.append(route.request.url)
                # A status endpoint returns an array. An empty result means unknown, never fake good service.
                body = "[]" if "/Line/" in route.request.url and "/Status" in route.request.url else "{}"
                route.fulfill(status=200, content_type="application/json", body=body)

        page.route("**/*", network)
        page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
        page.wait_for_function("!!window.__commute")
        assert page.evaluate("document.documentElement.dataset.design !== 'signal'")
        assert not page.locator("#journeyViewControl").is_visible()
        page.wait_for_function("__commute.state.here && __commute.state.locAcc <= 100")
        def example_at_home(page):
            page.select_option("#s_provider", "demo")
            page.locator("#setHomeBtn").click()
        settings(page, example_at_home)
        page.wait_for_function("__commute.state.boards && __commute.ranked(Date.now()).length > 0")
        baseline = ranked(page)

        def enable(page):
            page.locator("#s_signal").check()
            assert page.locator("#s_followRoute").is_checked(), "Signal offers route following automatically"

        settings(page, enable)
        page.wait_for_function("document.documentElement.dataset.design === 'signal'")
        assert page.locator("#journeyViewControl").is_visible()
        assert ranked(page) == baseline, "Signal must preserve engine journeys, flags, times and ranking"
        saved = page.evaluate("localStorage.getItem('cartrefCommute.v1')")
        page.reload()
        page.wait_for_function("!!window.__commute && document.documentElement.dataset.design === 'signal'")
        assert page.evaluate("__commute.S().signal && __commute.S().followRoute")
        assert json.loads(saved)["settings"]["signal"]
        page.wait_for_function("__commute.state.boards && __commute.ranked(Date.now()).length > 0")

        page.locator("#settingsBtn").focus()
        page.keyboard.press("Enter")
        assert page.locator("#settings").is_visible()
        page.keyboard.press("Escape")
        assert not page.locator("#settings").is_visible()
        assert page.locator("#settingsBtn").evaluate("element=>element===document.activeElement")

        # The same controls are reachable with keyboard and their actions retain the selected direction.
        direction = page.evaluate("__commute.direction()")
        for mode in ["plan", "live", "auto"]:
            selector = f'[data-journey-view="{mode}"]'
            page.locator(selector).focus()
            page.keyboard.press("Enter")
            assert page.locator(selector).get_attribute("aria-pressed") == "true", mode
            assert page.evaluate("__commute.direction()") == direction
            if mode == "live":
                assert "No active journey" in page.locator("#hero").inner_text(), page.locator("#hero").inner_text()

        page.locator("[data-follow]:not([disabled])").first.click()
        assert page.locator("#followPanel").is_visible()
        chosen = page.evaluate("__commute.state.saved.followRoute.id")
        arrival = page.evaluate("__commute.state.saved.followRoute.expectedArrival")
        page.locator('[data-journey-view="plan"]').focus()
        page.keyboard.press("Enter")
        assert page.locator("#followPanel").is_visible(), "Planning must retain tracked route and alerts"
        page.reload()
        page.wait_for_function("!!window.__commute && !!__commute.state.saved.followRoute")
        assert page.evaluate("__commute.state.saved.followRoute.id") == chosen
        assert page.evaluate("__commute.state.saved.followRoute.expectedArrival") == arrival

        appearances = ["system", "light", "dark"]
        for system in ["light", "dark"]:
            page.emulate_media(color_scheme=system)
            for appearance in appearances:
                settings(page, lambda page: page.select_option("#s_appearance", appearance))
                expected = system if appearance == "system" else appearance
                for width in [320, 393]:
                    page.set_viewport_size({"width": width, "height": 852})
                    check = assert_layout(page, (system, appearance, width))
                    assert check["canvas"] == ("rgb(11, 16, 23)" if expected == "dark" else "rgb(241, 244, 247)")
                    results.append({"system": system, "appearance": appearance, "width": width})
                if system == appearance:
                    page.screenshot(path=str(ARTIFACTS / f"signal-{appearance}.png"), full_page=True)

        # Enlarge the rendered text as a stress case. Actual iOS Dynamic Type still needs device acceptance.
        page.set_viewport_size({"width": 320, "height": 852})
        text_stress = page.add_style_tag(content="""
          html[data-design="signal"] body{font-size:24px}
          html[data-design="signal"] :is(button,.note,.meta,.route,.lbl,.dirnote,.sub,summary){font-size:20px!important}
        """)
        assert_layout(page, "320px enlarged text")
        text_stress.evaluate("element=>element.remove()")

        # Existing simulation remains available through the normal Settings entry points.
        settings(page, lambda page: (page.locator("#s_simulator").check(), page.locator("#s_simulatedFeeds").check()))
        assert page.locator("#simBar").is_visible()
        if not page.locator("#simPanel").is_visible():
            page.locator("#simToggle").click()
        assert page.locator("#simPanel").is_visible()
        assert_layout(page, "Signal simulator controls")
        page.locator("#simToggle").click()
        page.locator("#simExit").click()
        assert not page.locator("#simBar").is_visible()

        # Off restores Panda; the route-following option can remain independently enabled.
        settings(page, lambda page: page.locator("#s_signal").uncheck())
        assert page.evaluate("document.documentElement.dataset.design !== 'signal'")
        assert page.evaluate("__commute.S().followRoute")
        assert page.evaluate("__commute.state.saved.followRoute.id") == chosen
        page.reload()
        page.wait_for_function("!!window.__commute")
        assert page.evaluate("!__commute.S().signal && __commute.S().followRoute")
        assert page.locator("#followPanel").is_visible()
        assert page.evaluate("__commute.state.saved.followRoute.id") == chosen
        page.locator('[data-follow-action="stop"]').click()
        assert not page.locator("#followPanel").is_visible()
        assert not errors, errors
        browser.close()
        print(json.dumps({"browser": "Chromium", "layouts": results,
                          "largeText": True, "persistence": True, "engineParity": True,
                          "manualViews": True, "simulatorEntry": True, "pageErrors": errors,
                          "screenshots": [str(ARTIFACTS / "signal-light.png"), str(ARTIFACTS / "signal-dark.png")]}, indent=2))
finally:
    server.shutdown()
