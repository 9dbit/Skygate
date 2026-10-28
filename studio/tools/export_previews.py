from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];M=R/'previews';M.mkdir(exist_ok=True)
html=(R/'SKYGATE_Studio_Standalone_v0.3.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1536,'height':940},device_scale_factor=2)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded',timeout=90000)
 page.wait_for_timeout(350)
 for name,tab in [('SKYGATE_Studio_Editor_v0.3','layers'),('SKYGATE_Studio_Audio_Editor_v0.3','audio'),('SKYGATE_Studio_Win_Setting_v0.3','math'),('SKYGATE_Studio_Jackpot_Setting_v0.3','jackpot')]:
  page.locator(f'[data-tab="{tab}"]').click()
  path=M/(name+'.png');page.screenshot(path=str(path),full_page=False)
  im=Image.open(path).convert('RGB');im.save(M/(name+'.jpg'),quality=89,subsampling=0);path.unlink()
 # Reset selection only for the stage-only portrait export.
 page.locator('#resetSelectionBtn').click()
 stage_png=M/'stage_hi.png'
 page.locator('#stage').screenshot(path=str(stage_png))
 img=Image.open(stage_png).convert('RGB').resize((1080,1920),Image.Resampling.LANCZOS)
 img.save(M/'SKYGATE_Mobile_Layered_1080x1920_v0.3.jpg',quality=93,subsampling=0)
 stage_png.unlink()
 assert not errors,errors
 browser.close()
 print('Created previews:',*[p.name for p in M.glob('*.jpg')],sep='\n - ')
