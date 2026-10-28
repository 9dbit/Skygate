from pathlib import Path
import zipfile,json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1380,'height':900},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((R/'SKYGATE_Studio_Standalone_v0.3.html').read_text(),wait_until='domcontentloaded',timeout=90000)
 assert page.locator('.stage-layer').count()==23
 # Layout coordinates
 before=page.evaluate('SKYGATE_STUDIO.getState().layers.find(l=>l.id==="guardian").x')
 inp=page.locator('input[data-path="layers.3.x"]') # 3 is logo, not guardian
 layer=page.evaluate('SKYGATE_STUDIO.getState().layers.findIndex(l=>l.id==="guardian")')
 inp=page.locator(f'input[data-path="layers.{layer}.x"]');inp.fill('478');inp.press('Tab')
 now=page.evaluate('SKYGATE_STUDIO.getState().layers.find(l=>l.id==="guardian").x')
 assert now==478,(before,now)
 page.locator('#undoBtn').click()
 undone=page.evaluate('SKYGATE_STUDIO.getState().layers.find(l=>l.id==="guardian").x')
 assert undone==before,(before,undone)
 # Jackpot toggles and validation
 page.locator('[data-tab="jackpot"]').click()
 page.locator('input[data-path="jackpot.enabled"]').check()
 assert page.evaluate('SKYGATE_STUDIO.getState().jackpot.enabled') is True
 page.locator('#testJackpotGrand').click()
 assert 'FX preview only' in page.locator('#traceStatus').inner_text()
 page.locator('[data-tab="math"]').click()
 ruby=page.locator('input[data-path="math.paytable.ruby.0"]');ruby.fill('1.25');ruby.press('Tab')
 assert page.evaluate('SKYGATE_STUDIO.getState().math.paytable.ruby[0]')==1.25
 # Audio upload replace and physical ZIP export
 page.locator('[data-tab="audio"]').click()
 assert page.locator('.audio-row').count()==13
 with page.expect_file_chooser() as fc: page.locator('[data-audio-upload="spin_start"]').click()
 chooser=fc.value;chooser.set_files(str(R/'assets/audio/spin_start.ogg'))
 page.wait_for_function('SKYGATE_STUDIO.getOverrideKeys().length>0',timeout=20000)
 assert 'audio:spin_start' in page.evaluate('SKYGATE_STUDIO.getOverrideKeys()')
 # Export stand-alone changes ZIP with replacement sound
 with page.expect_download() as di: page.locator('#bundleBtn').click()
 download=di.value;target=R/'qa'/'export_changes_test.zip';download.save_as(target)
 with zipfile.ZipFile(target) as z:
  names=z.namelist();assert 'project.json' in names and 'override-manifest.json' in names,names
  assert any('audio_spin_start' in name for name in names),names
  manifest=json.loads(z.read('override-manifest.json'));assert 'audio:spin_start' in manifest['files']
  print('ZIP PASS',len(names),'files',names)
 # Simulation event integrity
 page.locator('[data-tab="test"]').click();page.locator('#simCount').select_option('1000');page.locator('#runSimBtn').click()
 page.wait_for_function("document.querySelector('#simStats').textContent.includes('OBSERVED RTP')",timeout=30000)
 assert 'OBSERVED RTP' in page.locator('#simStats').inner_text()
 initial=page.evaluate('SKYGATE_STUDIO.getState().credit')
 page.locator('#testSingleSpin').click();page.wait_for_timeout(900)
 current=page.evaluate('SKYGATE_STUDIO.getState().credit')
 page.locator('[data-tab="test"]').click();page.locator('#replayLast').click();page.wait_for_timeout(850)
 replay=page.evaluate('SKYGATE_STUDIO.getState().credit')
 assert replay==current,'Replay must not spend/award credits'
 print('INTERACTIONS PASS: layer edit/undo, jackpot, paytable, audio replacement, zip export, simulation, replay.')
 print('initial credits:',initial,'after spin:',current,'after replay:',replay,'browser errors:',errors)
 assert not errors,errors
 browser.close()
