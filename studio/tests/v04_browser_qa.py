"""v0.4 real interaction QA in isolated Chromium DOM. Hardware iPhone verification remains separate."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa_v04';OUT.mkdir(exist_ok=True)
HTML=(ROOT/'SKYGATE_Studio_Standalone_v0.4.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(320,720),(375,812),(390,844),(768,1024),(1440,900)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=width<500,has_touch=width<500,accept_downloads=True)
  page.set_default_timeout(5000)
  print('BEGIN',width,flush=True)
  errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content(HTML,wait_until='domcontentloaded',timeout=45000)
  page.wait_for_timeout(300)
  assert page.locator('.stage-layer').count()==23,(width,page.locator('.stage-layer').count())
  assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),width
  assert not errors,(width,errors)
  if width<500:
   assert page.locator('#mobileDock').is_visible()
   assert not page.locator('.inspector').is_visible()
   page.locator('[data-mobile-tab="layers"]').click()
   assert page.locator('.inspector').is_visible()
   assert page.locator('#mobileLayerSelect').is_visible()
   page.locator('#mobileLayerSelect').select_option('logo')
   page.wait_for_timeout(330)
   assert page.locator('.inspector').bounding_box()['y'] < height - 200
   assert page.evaluate('SKYGATE_STUDIO.getSelected()')=='logo'
   page.screenshot(path=str(OUT/f'mobile_{width}_sheet.png'),full_page=False)
   page.locator('[data-mobile-tab="canvas"]').click()
   assert not page.locator('.inspector').is_visible()
   page.screenshot(path=str(OUT/f'mobile_{width}_canvas.png'),full_page=False)
  else:
   page.screenshot(path=str(OUT/f'desktop_{width}.png'),full_page=False)
  print('VIEWPORT',width,'overflow=false','errors=',len(errors),flush=True)
  page.close()
 # Full interaction test: use iPhone-like viewport to exercise editor and virtual-credit engine.
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,accept_downloads=True)
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 page.set_content(HTML,wait_until='domcontentloaded',timeout=45000)
 page.locator('[data-mobile-tab="audio"]').click();assert page.locator('.audio-row').count()==13
 page.locator('#audioUnlockPanelBtn').click()
 page.wait_for_function('SKYGATE_STUDIO.audioReady()',timeout=10000)
 page.locator('[data-audio-play="bgm_celestial_loop"]').first.click()
 page.wait_for_function('SKYGATE_STUDIO.audioPlaying("bgm_celestial_loop")',timeout=10000)
 print('AUDIO',page.evaluate('SKYGATE_STUDIO.audioReady()'),page.evaluate('SKYGATE_STUDIO.audioPlaying("bgm_celestial_loop")'),flush=True)
 print('STOP ALL',flush=True)
 page.locator('#stopAllAudio').click();assert not page.evaluate('SKYGATE_STUDIO.audioPlaying("bgm_celestial_loop")')
 # Customize audio and win profile, then export and import ZIP.
 print('UPLOAD START',flush=True)
 with page.expect_file_chooser(timeout=10000) as fc:page.locator('[data-audio-upload="spin_start"]').click()
 fc.value.set_files(str(ROOT/'assets/audio/spin_start.mp3'))
 page.wait_for_function('SKYGATE_STUDIO.getOverrideKeys().includes("audio:spin_start")',timeout=15000)
 print('UPLOAD DONE',flush=True)
 page.locator('[data-mobile-tab="math"]').click();inp=page.locator('input[data-path="math.paytable.ruby.0"]');inp.fill('1.21');inp.press('Tab')
 assert abs(page.evaluate('SKYGATE_STUDIO.getState().math.paytable.ruby[0]')-1.21)<1e-9
 print('MATH EDITED',flush=True)
 page.locator('[data-mobile-tab="canvas"]').click()
 with page.expect_download(timeout=10000) as d:page.locator('#bundleBtn').click()
 backup=OUT/'backup.zip';d.value.save_as(backup)
 with zipfile.ZipFile(backup) as z:
  assert z.testzip() is None
  meta=json.loads(z.read('override-manifest.json'))
  assert 'audio:spin_start' in meta['files']
  assert json.loads(z.read('project.json'))['math']['paytable']['ruby'][0]==1.21
 # Mutate state again and then import archived settings + binary audio.
 print('ZIP EXPORTED',flush=True)
 page.locator('[data-mobile-tab="math"]').click()
 inp=page.locator('input[data-path="math.paytable.ruby.0"]');inp.fill('1.32');inp.press('Tab')
 page.locator('[data-mobile-tab="canvas"]').click()
 print('MATH ALTERED',flush=True)
 with page.expect_file_chooser(timeout=10000) as fc:page.locator('#importBtn').click()
 fc.value.set_files(str(backup))
 page.wait_for_function('SKYGATE_STUDIO.getState().math.paytable.ruby[0]===1.21',timeout=15000)
 assert 'audio:spin_start' in page.evaluate('SKYGATE_STUDIO.getOverrideKeys()')
 # Engine remains deterministic, replay does not change virtual credits.
 print('ZIP IMPORTED',flush=True)
 page.locator('[data-mobile-tab="test"]').click();page.locator('#simCount').select_option('1000');page.locator('#runSimBtn').click()
 page.wait_for_function('document.querySelector("#simStats").textContent.includes("OBSERVED RTP")',timeout=35000)
 page.locator('#testSingleSpin').click();page.wait_for_timeout(900)
 before=page.evaluate('SKYGATE_STUDIO.getState().credit')
 print('ZIP IMPORTED',flush=True)
 page.locator('[data-mobile-tab="test"]').click();page.locator('#replayLast').click();page.wait_for_timeout(900)
 after=page.evaluate('SKYGATE_STUDIO.getState().credit');assert before==after,(before,after)
 page.reload(wait_until='domcontentloaded') if False else None
 assert not errors,errors
 print('QA PASS: audio unlock, MP3 playback, ZIP export/import, editable wins, 1000-spin sample, replay-neutral credits')
 browser.close()
