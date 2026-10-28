"""Browser-level simulated resume regression test (not a physical Safari claim)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'SKYGATE_Studio_Standalone_v0.4.1.html').read_text()
TRACK = '''<script>
 (() => {
   const Orig = window.AudioContext || window.webkitAudioContext;
   if (!Orig) return;
   window.AudioContext = class Tracked extends Orig {
     constructor(...args) { super(...args); window.__skyAudioCtx = this; }
   };
 })();
</script>'''
HTML = HTML.replace('<head>', '<head>'+TRACK, 1)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML, wait_until='domcontentloaded', timeout=60000)
    page.locator('[data-mobile-tab="audio"]').click()
    page.locator('#audioUnlockPanelBtn').click()
    page.wait_for_function('SKYGATE_STUDIO.audioReady()')
    page.locator('[data-audio-play="bgm_celestial_loop"]').first.click()
    page.wait_for_function('SKYGATE_STUDIO.audioPlaying("bgm_celestial_loop")')
    page.evaluate('window.__skyAudioCtx.suspend()')
    page.wait_for_function('window.__skyAudioCtx.state === "suspended"')
    assert not page.evaluate('SKYGATE_STUDIO.audioReady()')
    page.locator('[data-audio-play="bgm_celestial_loop"]').first.click()
    page.wait_for_function('SKYGATE_STUDIO.audioReady()', timeout=10000)
    page.wait_for_function('SKYGATE_STUDIO.audioPlaying("bgm_celestial_loop")', timeout=10000)
    assert not errors, errors
    print('AUDIO RESUME QA PASS: suspended context recovered on a new user tap; BGM resumed; no JS errors')
    browser.close()
