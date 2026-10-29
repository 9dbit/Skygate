"""CI smoke for public virtual-credit game and Studio using real Chromium.

This never accesses a live production account or changes any published snapshot.
"""
from pathlib import Path
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "qa-ci"
OUT.mkdir(exist_ok=True)
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
base = f"http://127.0.0.1:{port}"
temp = tempfile.TemporaryDirectory(prefix="skygate-ci-")
env = dict(os.environ, PORT=str(port), NODE_ENV="development", SKYGATE_RELEASE_DIR=temp.name)
server = subprocess.Popen(["node", "server.mjs"], cwd=ROOT, env=env,
                          stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
try:
    for attempt in range(80):
        try:
            with urllib.request.urlopen(base + "/health", timeout=2) as res:
                health = json.load(res)
                assert health["ok"] and health["version"] == json.loads((ROOT / "package.json").read_text())["version"], health
                break
        except (OSError, ValueError):
            if server.poll() is not None:
                raise RuntimeError("Skygate test server exited early")
            time.sleep(0.25)
    else:
        raise RuntimeError("Skygate local test server never became healthy")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        for width, height in [(320, 720), (390, 844), (430, 932)]:
            context = browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
                is_mobile=True,
                has_touch=True,
                reduced_motion="reduce"
            )
            page = context.new_page()
            errors = []
            failed_requests = []
            failed_responses = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("requestfailed", lambda req: failed_requests.append(req.url))
            page.on("response", lambda res: failed_responses.append([res.status, res.url]) if res.status >= 400 else None)
            page.goto(base + "/play/", wait_until="domcontentloaded", timeout=30000)
            initial_boot = page.locator("html").get_attribute("data-boot")
            if initial_boot not in ("loading", "ready"):
                snapshot = page.evaluate("""() => ({
                    boot: document.documentElement.dataset.boot,
                    status: document.getElementById('bootStatus')?.textContent,
                    appStatus: document.getElementById('status')?.textContent,
                    broken: [...document.images].filter(x => x.complete && !x.naturalWidth)
                      .map(x => ({src: x.getAttribute('src'), cls: x.className})).slice(0, 30)
                })""")
                print("BOOT DIAGNOSTICS", json.dumps({
                    "snapshot": snapshot, "errors": errors,
                    "failed_requests": failed_requests, "failed_responses": failed_responses
                }, ensure_ascii=False), flush=True)
                page.screenshot(path=str(OUT / f"boot-failure-{width}.png"))
                raise AssertionError(f"Unexpected Skygate boot state: {initial_boot}")
            page.wait_for_function("document.documentElement.dataset.boot === 'ready'", timeout=30000)
            assert page.locator("#bootPlay").is_enabled()
            if width == 390:
                page.screenshot(path=str(OUT / "splash-390.png"))
            page.locator("#bootPlay").click()
            page.wait_for_function("document.documentElement.dataset.boot === 'entered'", timeout=12000)
            assert page.locator("#spin").is_visible()
            assert "Bonus Booster" in page.locator("#anteFeature").inner_text()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{width}: overflow"
            if width == 390:
                # Artwork is rendered through the same public Game shell and
                # Studio preview code. Banner text/centering are responsive.
                badge = page.locator("#promoBadge")
                assert "WIN UP TO" in badge.inner_text()
                assert "1000x" in badge.inner_text()
                stage = page.locator(".game").bounding_box()
                # The approved Olympus skin is live-only in production. Toggle
                # the style class to test the responsive design in local CI.
                page.evaluate("document.querySelector('.game').classList.add('olympus-gold')")
                banner = badge.bounding_box()
                assert abs(banner["x"] + banner["width"]/2 - stage["x"] - stage["width"]/2) < 2
                assert abs(banner["width"]/stage["width"] - .52) < .012
                page.screenshot(path=str(OUT / "play-390.png"))
                page.locator("#spin").click()
                page.wait_for_function(
                    "window.SlotGameTest?.getState().rounds === 1 && !window.SlotGameTest?.getState().busy",
                    timeout=35000
                )
                state = page.evaluate("window.SlotGameTest.getState()")
                assert state["rounds"] == 1 and state["credits"] >= 0, state
                # Use the shared real Game/Studio renderer with the imported
                # Olympus preset. Check visual geometry and preserved controls.
                preset = json.loads((ROOT / "studio/themes/olympus-gold/project.json").read_text())
                page.evaluate("(project) => window.SkygateApplyLayout(project, path => 'assets/' + path)", preset)
                assert page.locator(".split-credit-panel .wallet-coin-credit svg").count() == 1
                assert page.locator(".split-bet-panel .wallet-coin-bet svg").count() == 1
                assert page.locator('[data-layer="credits"] .wallet-a11y-label').count() == 1
                assert page.locator('[data-layer="betlabel"] .wallet-a11y-label').count() == 1
                assert page.locator('[data-layer="credits"] .wallet-a11y-label').evaluate(
                    "(el) => getComputedStyle(el).clipPath"
                ).startswith("inset(")
                panel = page.locator(".split-bet-panel").bounding_box()
                minus = page.locator('[data-layer="minusbtn"]').bounding_box()
                plus = page.locator('[data-layer="plusbtn"]').bounding_box()
                chip = page.locator(".wallet-coin-bet").bounding_box()
                bet_value = page.locator('[data-layer="betlabel"]').bounding_box()
                left_margin = minus["x"] - panel["x"]
                right_margin = panel["x"] + panel["width"] - plus["x"] - plus["width"]
                assert abs(left_margin-right_margin) < 1.5, (left_margin, right_margin)
                assert chip["x"] >= minus["x"]+minus["width"], (chip, minus)
                assert chip["x"]+chip["width"] < bet_value["x"], (chip, bet_value)
                credit_before = page.locator("#credits").inner_text()
                current_bet = page.evaluate("window.SlotGameTest.getState().bet")
                page.locator("#minus").click()
                assert page.evaluate("window.SlotGameTest.getState().bet") < current_bet
                page.locator("#plus").click()
                assert page.evaluate("window.SlotGameTest.getState().bet") == current_bet
                assert page.locator("#credits").inner_text() == credit_before
                page.screenshot(path=str(OUT / "olympus-coin-panel-390.png"))
            assert not errors, (width, errors)
            context.close()

        # Animate only the central medallion. Battery Saver freezes it.
        motion = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True, has_touch=True, reduced_motion="no-preference"
        )
        motion_page = motion.new_page()
        motion_page.goto(base + "/play/", wait_until="domcontentloaded", timeout=30000)
        motion_page.wait_for_function("document.documentElement.dataset.boot === 'ready'", timeout=30000)
        motion_page.locator("#bootPlay").click()
        rotor = motion_page.locator("#spin .spin-rotor")
        frame = motion_page.locator("#spin .spin-frame")
        assert "skygate-rotor-idle" in rotor.evaluate("(el) => getComputedStyle(el).animationName")
        assert frame.evaluate("(el) => getComputedStyle(el).animationName") == "none"
        motion_page.evaluate("document.getElementById('spin').classList.add('battery-saver')")
        assert rotor.evaluate("(el) => getComputedStyle(el).animationName") == "none"
        motion.close()

        studio = browser.new_context(viewport={"width": 390, "height": 844})
        page = studio.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        response = page.goto(base + "/studio/", wait_until="domcontentloaded", timeout=30000)
        assert response and response.status == 200
        page.wait_for_function(
            "document.getElementById('gameCanvas')?.contentDocument?.documentElement?.dataset.boot === 'entered'",
            timeout=30000
        )
        assert page.locator("#gameCanvas").count() == 1
        page.screenshot(path=str(OUT / "studio-390.png"))
        page.locator('[data-mobile-tab="test"]').click()
        slider = page.locator('input[data-path="spinMotion.normalMs"]')
        assert slider.count() == 1 and slider.input_value() == '1800'
        page.screenshot(path=str(OUT / "studio-spin-speed-390.png"))
        page.evaluate("""() => {
            document.getElementById('editModeBtn').click();
            const field = document.querySelector('input[data-path="spinMotion.normalMs"]');
            field.value = '1600';
            field.dispatchEvent(new Event('input', {bubbles:true}));
            field.dispatchEvent(new Event('change', {bubbles:true}));
        }""")
        assert page.evaluate("window.SKYGATE_STUDIO.getState().spinMotion.normalMs") == 1600
        page.wait_for_function(
            "document.getElementById('gameCanvas')?.contentWindow?.SkygateActiveRelease?.project?.spinMotion?.normalMs === 1600",
            timeout=30000
        )
        assert not errors, errors
        studio.close()
        browser.close()
    print("PASS: package-aligned health, 320/390/430 splash, Play, single spin, no overflow, Studio live preview")
finally:
    server.terminate()
    try:
        server.wait(timeout=8)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
    temp.cleanup()
