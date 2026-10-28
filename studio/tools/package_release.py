#!/usr/bin/env python3
from pathlib import Path
import json,shutil,zipfile,subprocess
from PIL import Image
R=Path(__file__).resolve().parents[1];ROOT=R.parents[1];DIST=Path('/mnt/data')
# Refresh visual manifest, do not confuse cutouts with native layered source.
visual=[]
for f in sorted((R/'assets').rglob('*')):
 if f.suffix.lower() not in {'.png','.svg','.jpg','.jpeg','.webp'}:continue
 rel=f.relative_to(R)
 origin='flattened screenshot reference' if 'reference' in f.name else 'separated PNG cutout from concept' if f.suffix=='.png' and (f.parent.name in {'symbols','scene'}) else 'original scalable UI SVG' if f.suffix=='.svg' else 'derived scene/base graphic'
 visual.append({'file':str(rel),'format':f.suffix[1:],'bytes':f.stat().st_size,'provenance':origin})
(R/'assets'/'manifest.json').write_text(json.dumps({'schema':'skygate/assets-v0.3','original_flat_JPEG_source':True,'original_layered_source_not_available':True,'assets':visual},indent=2))
# Verify major assets and interactive editor.
p=R/'project.json';project=json.loads(p.read_text());assert len(project['layers'])==23;assert len(project['tracks'])==13
for l in project['layers']:
 if l.get('asset'):assert (R/'assets'/l['asset']).exists(),l['asset']
for symbol in set(project['grid']):assert (R/'assets'/'symbols'/f'{symbol}.png').exists(),symbol
for f in (R/'assets/symbols').glob('*.png'):
 img=Image.open(f);assert img.mode=='RGBA' and img.getextrema()[3][0]<255,(f.name,img.mode)
for t in project['tracks']:assert (R/'assets/audio'/f'{t["id"]}.ogg').exists()
for f in [R/'index.html',R/'studio.css',R/'studio.js',R/'math/studio_math.js']:
 assert f.exists()
subprocess.run(['node','--test',str(R/'tests/studio_math.test.js')],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['node','--check',str(R/'studio.js')],check=True)
# Copy one-click standalone and high-quality JPEGs to user-facing root.
shutil.copy2(R/'SKYGATE_Studio_Standalone_v0.3.html',DIST/'SKYGATE_Studio_Standalone_v0.3.html')
for fn in ['SKYGATE_Studio_Editor_v0.3.jpg','SKYGATE_Studio_Audio_Editor_v0.3.jpg','SKYGATE_Studio_Win_Setting_v0.3.jpg','SKYGATE_Studio_Jackpot_Setting_v0.3.jpg','SKYGATE_Mobile_Layered_1080x1920_v0.3.jpg']:
 shutil.copy2(R/'previews'/fn,DIST/fn)
shutil.copy2(R/'assets'/'asset_contact_sheet.jpg',DIST/'SKYGATE_Separate_Assets_Contact_Sheet_v0.3.jpg')
# Asset-only package for independent re-render / asset replacement.
with zipfile.ZipFile(DIST/'SKYGATE_Separate_Assets_v0.3.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in (R/'assets').rglob('*'):
  if f.is_file():z.write(f,arcname='SKYGATE_Assets/'+str(f.relative_to(R/'assets')))
 z.write(R/'ASSET_CATALOG.md',arcname='SKYGATE_Assets/ASSET_CATALOG.md')
# Full project, preserves v0.1 and v0.2 alongside v0.3.
with zipfile.ZipFile(DIST/'Slot_Game_v0.3_Studio.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in (R.parents[0]).rglob('*'):
  if not f.is_file():continue
  rel=f.relative_to(R.parents[0])
  if '__pycache__' in rel.parts or 'qa' in rel.parts or f.suffix=='.pyc':continue
  z.write(f,arcname='Slot_Game/'+str(rel))
# Validate archives
for path in [DIST/'SKYGATE_Separate_Assets_v0.3.zip',DIST/'Slot_Game_v0.3_Studio.zip']:
 with zipfile.ZipFile(path) as z:assert z.testzip() is None;print(path.name, 'files',len(z.namelist()),'sizeMB',round(path.stat().st_size/1e6,2))
print('Standalone bytes', (DIST/'SKYGATE_Studio_Standalone_v0.3.html').stat().st_size)
print('Visual assets',len(visual),'audio tracks',len(project['tracks']),'studio layers',len(project['layers']))
