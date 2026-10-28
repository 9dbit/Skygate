"""Offline isolated-browser QA: browser policy blocks file:/localhost navigations.
Serve app in page.set_content with built-in assets converted to data URLs for QA only.
The actual distribution remains modular files and paths.
"""
from pathlib import Path
import re,json,base64,mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'qa';out.mkdir(exist_ok=True)
html=(root/'index.html').read_text()
css=(root/'studio.css').read_text();html=html.replace('<link rel="stylesheet" href="studio.css">','<style>'+css+'</style>')
assets={}
# Embed only artwork used by the active editor. Skip multi-megabyte reference sheets.
for f in (root/'assets').rglob('*'):
 if f.suffix.lower() in ['.png','.jpg','.jpeg','.svg','.webp'] and f.parent.name in ('scene','symbols','ui') and f.name not in ('reference_original.jpg','hero_composite_reference.jpg','bottom_controls_reference.jpg','controls_reference.jpg'):
  mime=mimetypes.guess_type(str(f))[0] or 'image/png'
  assets[str(f.relative_to(root/'assets'))]='data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode('ascii')
html=re.sub(r'<img src="../03-UI-References/SKYGATE_Mobile_UI_Preview_v1.jpg"[^>]*>', '', html)
asset_code='window.QA_ASSET_DATA='+json.dumps(assets)+';'
html=html.replace('</head>','<script>'+asset_code+'</script></head>')
def embed(m):
 file=root/m.group(1);s=file.read_text()
 if file.name=='studio.js':
  s=s.replace("return overrideURL.get('asset:'+path)||'assets/'+path;", "return overrideURL.get('asset:'+path)||window.QA_ASSET_DATA[path]||'assets/'+path;")
 return '<script>'+s+'</script>'
html=re.sub(r'<script src="([^"]+)"></script>',embed,html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1536,'height':950},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded',timeout=30000)
 page.wait_for_timeout(900)
 print('TITLE',page.title()); print('loaded layers',page.locator('#stageLayers .stage-layer').count(),'tree',page.locator('#sideContent .layer-row').count());print('errors',errors)
 page.screenshot(path=str(out/'studio_desktop.png'),full_page=True)
 page.locator('[data-tab="audio"]').click();print('audio rows',page.locator('.audio-row').count());page.screenshot(path=str(out/'studio_audio.png'),full_page=True)
 page.locator('[data-tab="math"]').click();page.screenshot(path=str(out/'studio_math.png'),full_page=True)
 page.locator('[data-tab="jackpot"]').click();page.screenshot(path=str(out/'studio_jackpot.png'),full_page=True)
 page.locator('#testJackpotMini').click();page.wait_for_timeout(120)
 page.locator('[data-tab="test"]').click();page.locator('#simCount').select_option('1000');page.locator('#runSimBtn').click();page.wait_for_function("document.querySelector('#simStats').textContent.includes('OBSERVED RTP')",timeout=30000)
 print('sim summary',page.locator('#simStats').inner_text()[:200]);page.screenshot(path=str(out/'studio_test.png'),full_page=True)
 page.locator('#testSingleSpin').click();page.wait_for_timeout(1000)
 print('credits',page.evaluate('SKYGATE_STUDIO.getState().credit'))
 print('desktop errors',errors);print('desktop overflow',page.evaluate('document.documentElement.scrollWidth > window.innerWidth'))
 mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 moberr=[];mobile.on('pageerror',lambda e:moberr.append(str(e)))
 mobile.set_content(html,wait_until='domcontentloaded',timeout=30000);mobile.wait_for_timeout(700)
 mobile.screenshot(path=str(out/'studio_mobile.png'),full_page=True)
 print('mobile overflow',mobile.evaluate('document.documentElement.scrollWidth > window.innerWidth'))
 print('mobile phone bounding',mobile.locator('.phone').bounding_box());print('mobile errors',moberr)
 print('broken images',page.evaluate('''[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')?.slice(0,70))''')[:10])
 browser.close()
