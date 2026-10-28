#!/usr/bin/env python3
"""Make one-click standalone Skygate Studio HTML with all default graphics and audio embedded.
The full modular project is the preferred editable source, but this version works offline from one file.
"""
from pathlib import Path
import base64,json,re,mimetypes
R=Path(__file__).resolve().parents[1]
html=(R/'index.html').read_text()
css=(R/'studio.css').read_text()
html=html.replace('<link rel="stylesheet" href="studio.css">','<style>'+css+'</style>')
assets={};audio={}
for f in (R/'assets').rglob('*'):
  if f.suffix.lower() in {'.png','.svg','.jpg','.jpeg','.webp'}:
    mime=mimetypes.guess_type(str(f))[0] or 'image/png'
    rel=str(f.relative_to(R/'assets'))
    if rel in ['studio_moodboard_reference.png','scene/hero_composite_reference.jpg','scene/bottom_controls_reference.jpg','scene/controls_reference.jpg']:
      continue
    assets[rel]='data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode('ascii')
  elif f.suffix.lower()=='.mp3':
    audio[f.stem]='data:audio/mpeg;base64,'+base64.b64encode(f.read_bytes()).decode('ascii')
html=html.replace('src="assets/scene/reference_original.jpg"','src="'+assets['scene/reference_original.jpg']+'"')
html=html.replace('</head>', '<script>window.SKY_EMBEDDED_ASSETS='+json.dumps(assets)+';window.SKY_EMBEDDED_AUDIO='+json.dumps(audio)+';</script></head>')
def inline(match):
  file=R/match.group(1);s=file.read_text()
  if file.name=='studio.js':
    s=s.replace("return overrideURL.get('asset:'+path)||'assets/'+path;","return overrideURL.get('asset:'+path)||window.SKY_EMBEDDED_ASSETS[path]||'assets/'+path;")
    s=s.replace("return overrideURL.get('audio:'+trackId)||'assets/audio/'+trackId+'.ogg';","return overrideURL.get('audio:'+trackId)||window.SKY_EMBEDDED_AUDIO[trackId]||'assets/audio/'+trackId+'.ogg';")
    s=s.replace("window.open('assets/asset_contact_sheet.jpg','_blank')", "window.open(window.SKY_EMBEDDED_ASSETS['asset_contact_sheet.jpg'],'_blank')")
  return '<script>\n'+s+'\n</script>'
html=re.sub(r'<script src="([^"]+)"></script>',inline,html)
name=R/'SKYGATE_Studio_Standalone_v0.4.html';name.write_text(html)
print('Wrote',name,'bytes',name.stat().st_size,'graphics',len(assets),'audio',len(audio))
