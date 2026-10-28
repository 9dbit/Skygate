"""Package independently editable Olympus assets for Studio's stored-ZIP importer.

Image bytes are copied unchanged. Cropping is stored as layer geometry, not baked
into the source artwork. The SVG proof renders the actual project coordinates.
"""
import base64, html, json, shutil, sys, zipfile
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]).resolve()
ASSETS = ROOT / 'assets'
OUT = ROOT / 'deliverables'
OUT.mkdir(exist_ok=True)
project = json.loads((REPO/'studio/project.json').read_text())
project.update(projectName='SKYGATE · Olympus Gold', presentation='olympus-gold', credit=100000, bet=20, seed=20261027)
layers = []
files = {}
sources = {}
def source(key, file):
    sources[key] = file
    files[key] = 'overrides/' + key.replace(':','_').replace('/','_').rsplit('.',1)[0] + file.suffix
def add(id, name, kind, x,y,w,h,z, **kw):
    l=dict(id=id,name=name,kind=kind,x=x,y=y,w=w,h=h,z=z,rotate=0,opacity=100,visible=True,locked=False,**kw)
    layers.append(l)
    return l
def crop(file):
    im=Image.open(file)
    if im.mode!='RGBA':return None
    box=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    if not box:return None
    x,y,r,b=box
    return dict(x=x/im.width,y=y/im.height,w=(r-x)/im.width,h=(b-y)/im.height)
def art(id,name,file,x,y,w,h,z,trim=True):
    p=ASSETS/file;key='custom/'+file;source('asset:'+key,p)
    l=add(id,name,'image',x,y,w,h,z,asset=key)
    if trim and (c:=crop(p)):l['crop']=c
    return l
def text(id,name,value,x,y,w,h,z,font=30,color='#fff0b8'):
    return add(id,name,'text',x,y,w,h,z,text=value,font=font,color=color)
def control(id,name,glyph,x,y,size,z=40):
    file='round_button.png';key='custom/'+file;source('asset:'+key,ASSETS/file)
    return add(id,name,'circle',x,y,size,size,z,text=glyph,font=size*.36,color='#fff0a3',asset=key,crop=crop(ASSETS/file))

art('sky','Olympus storm and temple environment','olympus_background.png',0,0,1080,1920,1,False)
art('guardian','Zeus · transparent character','zeus_guardian.png',504,-8,610,610,5)
art('logo','SKYGATE · sculpted gold logo','skygate_logo.png',12,36,572,337,7)
art('reelframe','Gold Ionic columns · reel architecture','reel_architecture.png',0,520,1080,740,22)
add('reels','Live 6 × 5 symbols','grid',122,596,836,578,21)
art('winbanner','Round total · laurel banner','win_banner.png',92,457,896,145,24)
text('winamount','Live round amount','0.00',205,487,670,84,25,86)
art('antebtn','Win table · button panel','feature_panel.png',293,1268,495,105,26)
text('antetext','Win table · live rules action','WIN TABLE',403,1288,330,34,27,33)
text('wintable_sub','Win table · caption','8+ MATCHING SYMBOLS',402,1330,330,20,27,15,'#ece6d9')
text('pay_arrow','Win table · chevron','›',737,1290,33,52,28,50)
art('controlboard','Credit and bet · marble panel','feature_panel.png',28,1390,1024,114,29)
text('credits','Live credit value','100,000.00',60,1409,460,72,31,43)
text('betlabel','Live bet value','20',747,1409,150,72,31,43)
control('minusbtn','Decrease bet','−',643,1402,90)
control('plusbtn','Increase bet','+',930,1402,90)
art('spinbutton','Spin · gold laurel medallion','spin_medallion.png',366,1471,348,348,42)
control('autobtn','Auto · live toggle','▶',202,1552,143)
control('turbobtn','Turbo · live toggle','ϟ',735,1552,143)
text('autolabel','Auto · live start/stop caption','AUTO',197,1704,153,33,43,25,'#fff9e6')
text('turbolabel','Turbo caption','TURBO',728,1704,157,33,43,25,'#fff9e6')
control('menubtn','Menu','☰',32,1814,90)
control('soundbtn','Sound · live mute toggle','♪',850,1814,90)
control('infobtn','Rules and information','i',958,1814,90)

# Each outcome uses its own independently replaceable transparent sprite.
symbol_aliases={'ruby':'ruby','sapphire':'sapphire','emerald':'emerald','amethyst':'amethyst','topaz':'topaz','amber':'ring','pearl':'chalice','scatter':'crown'}
(ASSETS/'symbols').mkdir(exist_ok=True)
for name, original in symbol_aliases.items():
    target=ASSETS/'symbols'/f'{name}.png';new=ASSETS/'symbols_new'/f'{name}.png'
    shutil.copy2(new if new.exists() else REPO/'studio/assets/symbols'/f'{original}.png',target)
    source('asset:symbols/'+name+'.png',target)
source('asset:symbols/orb.png',ASSETS/'multiplier_orb.png')
project['grid']=['emerald','amethyst','amber','topaz','amber','topaz','topaz','sapphire','amber','topaz','orb','amber','amethyst','pearl','ruby','sapphire','amber','topaz','ruby','sapphire','sapphire','amethyst','amber','topaz','sapphire','pearl','orb','amber','amethyst','topaz']

# Small glyphs remain vector assets, independently replaceable in Studio.
icons={
 'auto':'<path d="M38 27 76 50 38 73Z"/>',
 'turbo':'<path d="M57 12 26 57h22l-5 31 32-47H54Z"/>',
 'menu':'<path d="M26 32h48M26 50h48M26 68h48" fill="none" stroke="currentColor" stroke-width="7"/>',
 'sound':'<path d="M49 22 31 38H20v24h11l18 16ZM62 33q18 17 0 34"/><path d="m25 78 53-56" fill="none" stroke="currentColor" stroke-width="5"/>',
 'info':'<circle cx="50" cy="26" r="5"/><path d="M45 42h10v35H45Z"/>',
 'minus':'<path d="M26 50h48" fill="none" stroke="currentColor" stroke-width="8"/>',
 'plus':'<path d="M26 50h48M50 26v48" fill="none" stroke="currentColor" stroke-width="8"/>',
 'swirl':'<path d="M67 26C32 3 2 42 22 70c22 32 68 6 61-23-6-27-47-26-49-2-2 18 25 21 27 6 1-10-14-13-15-3M77 19l-4 13-12-6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>',
 'trophy':'<path d="M29 18h42v12c0 27-11 37-21 37S29 57 29 30ZM45 65h10v15H45ZM31 80h38v7H31Z"/><path d="M29 25H14c0 25 13 27 23 26M71 25h15c0 25-13 27-23 26" fill="none" stroke="currentColor" stroke-width="5"/>'
}
(ASSETS/'icons').mkdir(exist_ok=True)
for name, shapes in icons.items():
    (ASSETS/'icons'/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" color="#ffdf83" fill="currentColor">{shapes}</svg>')
for name,x in [('trophy',319)]:
    file=ASSETS/'icons'/f'{name}.svg';source('asset:custom/'+name+'.svg',file)
    add(name+'_icon',name.title()+' · feature icon','image',x,1287,70,70,28,asset='custom/'+name+'.svg')
project['layers']=layers
project['assets']={}
(ROOT/'project.json').write_text(json.dumps(project,indent=2))
(ROOT/'override-manifest.json').write_text(json.dumps({'schema':'skygate/studio-overrides-v0.4','files':files},indent=2))
(ROOT/'source-paths.json').write_text(json.dumps({key:str(p) for key,p in sources.items()},indent=2))

# A source-controlled preset; image payloads stay in the portable asset package.
preset=REPO/'studio/themes/olympus-gold';preset.mkdir(parents=True,exist_ok=True)
(preset/'project.json').write_text(json.dumps(project,indent=2))

# Vector composition proof uses the same source images and crop geometry as Studio.
def data(file):return 'data:'+('image/svg+xml' if file.suffix=='.svg' else 'image/png')+';base64,'+base64.b64encode(file.read_bytes()).decode()
def image(l,file):
    c=l.get('crop',dict(x=0,y=0,w=1,h=1));x=-c['x']/c['w']*l['w'];y=-c['y']/c['h']*l['h']
    return f'<svg x="{l["x"]}" y="{l["y"]}" width="{l["w"]}" height="{l["h"]}" overflow="hidden"><image x="{x}" y="{y}" width="{l["w"]/c["w"]}" height="{l["h"]/c["h"]}" preserveAspectRatio="none" href="{data(file)}"/></svg>'
def txt(value,x,y,size,color='#fff0b8',family='Liberation Serif',weight='bold',anchor='middle'):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{color}">{html.escape(value)}</text>'
parts=['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#050b10"/>']
control_icons={'autobtn':'auto','turbobtn':'turbo','menubtn':'menu','soundbtn':'sound','infobtn':'info','minusbtn':'minus','plusbtn':'plus'}
for l in sorted(layers,key=lambda l:l['z']):
    if l['kind']=='image':parts.append(image(l,sources['asset:'+l['asset']]))
    elif l['kind']=='circle':
        parts.append(image(l,sources['asset:'+l['asset']]))
        n=control_icons[l['id']];s=l['w']*.45
        parts.append(f'<svg x="{l["x"]+(l["w"]-s)/2}" y="{l["y"]+(l["h"]-s)/2}" width="{s}" height="{s}" viewBox="0 0 100 100" color="#ffdf83" fill="currentColor">{icons[n]}</svg>')
    elif l['kind']=='grid':
        parts.append(f'<rect x="{l["x"]}" y="{l["y"]}" width="{l["w"]}" height="{l["h"]}" fill="#060d12"/>')
        for i,sym in enumerate(project['grid']):
            w=l['w']/6;h=l['h']/5;x=l['x']+i%6*w;y=l['y']+i//6*h
            parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#bd934c" stroke-opacity=".5"/>')
            parts.append(f'<image x="{x+w*.03}" y="{y+h*.03}" width="{w*.94}" height="{h*.94}" href="{data(sources["asset:symbols/"+sym+".png"])}"/>')
            if sym=='orb':parts.append(txt('2×',x+w/2,y+h*.64,48))
    elif l['id'] in ['credits','betlabel']:
        parts.append(txt('CREDIT' if l['id']=='credits' else 'BET',l['x']+l['w']/2,l['y']+17,20,'#fff9e5','Liberation Sans','normal'))
        parts.append(txt(l['text'],l['x']+l['w']/2,l['y']+68,l['font']))
    elif l['kind']=='text':parts.append(txt(l['text'],l['x']+l['w']/2,l['y']+l['h']/2+l['font']*.34,l['font'],l['color']))
parts.append(txt('VIRTUAL CREDITS',540,1862,17,'#efeee6','Liberation Sans','normal'))
parts.append(txt('SKYGATE · OLYMPUS',540,1890,14,'#efeee6','Liberation Sans','normal'))
parts.append('</svg>')
(OUT/'Skygate_Olympus_Layout.svg').write_text(''.join(parts))
import cairosvg
(OUT/'Skygate_Olympus_Layout.png').write_bytes(cairosvg.svg2png(bytestring=''.join(parts).encode(),output_width=864,output_height=1536))
README='''SKYGATE · OLYMPUS GOLD — Studio import package

Import through Studio: back up existing work with Export changes ZIP, then use
Import JSON/ZIP and select Skygate_Olympus_Studio.zip. Save local, open Preview &
Publish, prepare the snapshot, check it, then publish the snapshot.

Requires the v0.8 renderer for cropped image layers, skinned controls and on-canvas
bet controls. All artwork remains independently replaceable. Dynamic amounts and
orb multipliers are live text. Game math and starting credit/bet are unchanged.

The seventeen new raster assets were created with built-in Imagegen using the
supplied gold/black reference. All nine outcome sprites are separate files with
transparent backgrounds. Small control glyphs are editable SVG assets. Source PNGs
are unchanged; optional layer crop geometry removes transparent canvas padding.

Preview PNG/SVG is a composition proof generated from project coordinates, not a
live Studio screenshot. Authentication blocked live Studio access, so this package
has not been imported or published through the live editor by the assistant yet.
'''
(ROOT/'README.txt').write_text(README)
with zipfile.ZipFile(OUT/'Skygate_Olympus_Studio.zip','w',compression=zipfile.ZIP_STORED) as z:
    for name in ['project.json','override-manifest.json','README.txt']:z.write(ROOT/name,name)
    if (ROOT/'PROMPTS.md').exists():z.write(ROOT/'PROMPTS.md','PROMPTS.md')
    for key,p in sources.items():z.write(p,files[key])
    for file in (ASSETS/'icons').glob('*.svg'):z.write(file,'editable-icons/'+file.name)
print(json.dumps({'layers':len(layers),'overrides':len(sources),'override_bytes':sum(p.stat().st_size for p in sources.values()),'zip':str(OUT/'Skygate_Olympus_Studio.zip'),'preview':str(OUT/'Skygate_Olympus_Layout.png')}))
