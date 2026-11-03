"""Read-only Studio viewport QA on a disposable local server.

The 1080x1920 source project is never published or modified. Both the canvas
and publish review iframe must keep a 393x852 logical viewport at any UI zoom.
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
OUT = ROOT / 'qa-device'
OUT.mkdir(exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
base = f'http://127.0.0.1:{port}'
temp = tempfile.TemporaryDirectory(prefix='skygate-device-')
server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT,
    env=dict(os.environ, PORT=str(port), NODE_ENV='development',
             SKYGATE_RELEASE_DIR=temp.name, GAMEOPS_BRIDGE_ENABLED='false'),
    stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)

MEASURE = """id => {
  const frame=document.getElementById(id), doc=frame.contentDocument;
  const r=frame.getBoundingClientRect(), slot=frame.closest('.device-screen-slot');
  const s=slot.getBoundingClientRect(), game=doc.querySelector('.game').getBoundingClientRect();
  return {id, width:frame.contentWindow.innerWidth,height:frame.contentWindow.innerHeight,
    screenWidth:r.width,screenHeight:r.height,slotWidth:s.width,slotHeight:s.height,
    gameWidth:game.width,gameHeight:game.height, url:frame.getAttribute('src')};
}"""

def verify(page, frame_id):
    data = page.evaluate(MEASURE, frame_id)
    assert (data['width'],data['height']) == (393,852), data
    assert abs(data['screenWidth']/data['screenHeight']-393/852)<.0001, data
    assert abs(data['screenWidth']-data['slotWidth'])<.1, data
    assert abs(data['screenHeight']-data['slotHeight'])<.1, data
    assert abs(data['gameWidth']-393)<1 and abs(data['gameHeight']-852)<1, data
    return data

try:
    for _ in range(100):
        try:
            with urllib.request.urlopen(base+'/health',timeout=2) as r:
                assert json.load(r)['ok']
            break
        except OSError:
            if server.poll() is not None:
                raise RuntimeError('Local server failed')
            time.sleep(.2)
    else:
        raise RuntimeError('Local server unavailable')
    results=[]
    with sync_playwright() as p:
        for name in ('chromium','webkit'):
            browser=getattr(p,name).launch(headless=True)
            context=browser.new_context(viewport={'width':1536,'height':992},
                reduced_motion='reduce')
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.goto(base+'/studio/',wait_until='domcontentloaded')
            page.wait_for_function('window.SKYGATE_CANVAS?.session() != null',timeout=45000)
            page.wait_for_function('window.SkygateDevicePreview?.profile.width === 393')
            page.wait_for_timeout(200)
            results.append(dict(browser=name,mode='live',**verify(page,'gameCanvas')))
            assert 'iPhone 15 Pro' in page.locator('.workspace-header h1').inner_text()
            assert page.locator('#gameCanvas').content_frame.locator('html').get_attribute('data-boot') == 'entered'
            page.screenshot(path=str(OUT/f'{name}-desktop-live.png'),full_page=True)
            # Switch only the disposable local browser draft. No Publish action.
            page.locator('#editModeBtn').click()
            page.wait_for_function("document.getElementById('gameCanvas').getAttribute('src').includes('editor-preview')")
            page.wait_for_function("document.getElementById('gameCanvas').contentDocument?.documentElement.dataset.boot === 'entered'",timeout=45000)
            page.wait_for_timeout(300)
            original=page.evaluate('JSON.stringify(window.SKYGATE_STUDIO.getState())')
            url=page.locator('#gameCanvas').get_attribute('src')
            for width,height in [(1536,992),(1024,768),(393,852),(320,720)]:
                page.set_viewport_size({'width':width,'height':height})
                page.wait_for_timeout(250)
                results.append(dict(browser=name,outer=[width,height],mode='draft',**verify(page,'gameCanvas')))
                assert page.locator('#gameCanvas').get_attribute('src') == url, 'resize reloaded draft'
                assert page.evaluate('JSON.stringify(window.SKYGATE_STUDIO.getState())') == original
                overflow=page.evaluate("""() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
                  elements:[...document.querySelectorAll('body *')].filter(el=>{
                    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
                    return r.width>0 && s.visibility!=='hidden' && s.display!=='none' && r.right>innerWidth+1;
                  }).slice(0,25).map(el=>({tag:el.tagName,id:el.id,cls:el.className,
                    right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,
                    minWidth:getComputedStyle(el).minWidth,overflow:getComputedStyle(el).overflow}))})""")
                if overflow['scroll']>width+1:
                    page.screenshot(path=str(OUT/f'{name}-overflow-{width}.png'),full_page=True)
                    (OUT/f'{name}-overflow-{width}.json').write_text(json.dumps(overflow,indent=2))
                assert overflow['scroll']<=width+1,(name,width,height,overflow)
                alignment=page.evaluate("""() => {
                  const frame=document.getElementById('gameCanvas');
                  const layer=frame.contentDocument.querySelector('[data-layer="guardian"]');
                  const handle=document.querySelector('#stageLayers [data-id="guardian"]');
                  const f=frame.getBoundingClientRect(),r=layer.getBoundingClientRect(),h=handle.getBoundingClientRect();
                  const scale=f.width/frame.clientWidth;
                  return {dx:h.left-(f.left+r.left*scale),dy:h.top-(f.top+r.top*scale),
                    dw:h.width-r.width*scale,dh:h.height-r.height*scale};
                }""")
                assert max(abs(x) for x in alignment.values())<1.2, alignment
            page.screenshot(path=str(OUT/f'{name}-mobile-draft.png'),full_page=True)
            page.locator('#releaseBtn').click()
            page.locator('#releaseFrame').wait_for(state='visible',timeout=45000)
            page.wait_for_function("document.getElementById('releaseFrame').contentDocument?.documentElement.dataset.boot === 'entered'",timeout=45000)
            page.wait_for_timeout(200)
            results.append(dict(browser=name,mode='publish-review',**verify(page,'releaseFrame')))
            page.screenshot(path=str(OUT/f'{name}-publish-review.png'),full_page=True)
            page.locator('#closeRelease').click()
            assert page.evaluate('JSON.stringify(window.SKYGATE_STUDIO.getState())') == original
            assert page.locator('[data-audio-preview]').count() == 0
            assert not errors, errors
            context.close();browser.close()
    (OUT/'geometry.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results))
    print('PASS: iPhone 15 Pro 393x852 Live, Draft, Publish, responsive scale and aligned selection handles; project unchanged')
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill();server.wait()
    temp.cleanup()
