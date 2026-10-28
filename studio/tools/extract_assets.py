#!/usr/bin/env python3
"""Create separately addressable illustrated assets from an existing FLAT concept JPEG.
Cutout quality is intended for editing and art-direction preview, not final production masters.
"""
from pathlib import Path
import json, math
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageDraw
R=Path(__file__).resolve().parents[1]; assets=R/'assets'
source=Image.open('/mnt/data/SKYGATE_Mobile_UI_Preview_v1.jpg').convert('RGB')
sprite=Image.open('/mnt/data/a_highly_detailed_professional_slot_game_develop.png').convert('RGB')

def cutout(img, box, dest, mode='dark', inner=2):
    base=np.asarray(img.crop(box), dtype=np.uint8)
    h,w=base.shape[:2]
    # Prefer bright gold/jewel foreground over the dark burgundy/charcoal palette.
    lum=base.max(axis=2).astype(float)
    rgb=base.astype(float)
    border=np.concatenate([rgb[:min(5,h),:,:].reshape(-1,3),rgb[-min(5,h):,:,:].reshape(-1,3),rgb[:,:min(5,w),:].reshape(-1,3),rgb[:,-min(5,w):,:].reshape(-1,3)],axis=0)
    background=np.median(border, axis=0)
    d=np.linalg.norm(rgb-background[None,None,:], axis=2)
    if mode=='dark':
        # Eliminate dark background; retain shadowed metallic edges by adding color distance.
        alpha=np.maximum((lum-57)/40,(d-40)/65)
    else:
        alpha=np.maximum((lum-75)/40,(d-48)/72)
    alpha=np.clip(alpha*255,0,255).astype(np.uint8)
    # Clear edges where game grid border or sprite sheet's panel line might remain
    if inner:
      alpha[:inner,:]=0; alpha[-inner:,:]=0; alpha[:,:inner]=0; alpha[:,-inner:]=0
    # remove small disconnected glowing specks only if not attached to main icon
    binary=(alpha>80).astype('uint8')
    n, labels, stats, cent=cv2.connectedComponentsWithStats(binary,8)
    sizes=[(stats[i,4],i) for i in range(1,n)]
    if sizes:
      sizes.sort(reverse=True); keep={i for s,i in sizes if s >= 16 and (s>=sizes[0][0]*.008)}
      mask=np.isin(labels,list(keep)).astype(np.uint8)*255
      mask=cv2.dilate(mask,np.ones((3,3),np.uint8), iterations=1)
      alpha=np.minimum(alpha,cv2.GaussianBlur(mask,(0,0),1.3))
    rgba=np.concatenate([base,alpha[:,:,None]],axis=2)
    dest.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(rgba,'RGBA').save(dest)
    return (w,h)
# Symbol samples mapped from actual 1080x1920 JPEG canvas, row and column.
# The imagery is a flattened concept; each sprite is a masked cutout, not a source layered PSD.
catalog={
 'emerald':(0,0),'ring':(1,0),'ruby':(2,0),'crown':(3,0),'sapphire':(4,0),'topaz':(5,0),
 'amethyst':(0,1),'hourglass':(1,1),'chalice':(4,1),'orb':(2,2),
 'amber':(1,2),'pearl':(3,3)
}
for name,(c,r) in catalog.items():
    x=36+c*168;y=540+r*151
    box=(round(x+13),round(y+14),round(x+153),round(y+140))
    cutout(source,box,assets/'symbols'/f'{name}.png')
# bonus scatter distinct cropped from generated mockup: around x 17..143 y 437..522
cutout(sprite,(18,425,150,523),assets/'symbols'/'scatter.png',mode='dark')
# Character, logo from black-backed 3D concept sheet
cutout(sprite,(11,44,294,205),assets/'scene'/'guardian.png',mode='dark')
cutout(sprite,(413,45,673,196),assets/'scene'/'logo.png',mode='dark')
# Ornaments from original preview, kept as editable rectangular image layers
source.crop((0,0,1079,444)).save(assets/'scene'/'hero_composite_reference.jpg',quality=94)
source.crop((0,1105,1080,1310)).save(assets/'scene'/'controls_reference.jpg',quality=92)
source.crop((0,1277,1080,1920)).save(assets/'scene'/'bottom_controls_reference.jpg',quality=92)
# Create a standalone stage background by heavily blurring the original image and tinting,
# without displaying duplicated sharp foreground content behind editor layers.
bg=np.asarray(source.resize((540,960)).filter(ImageFilter.GaussianBlur(36))).astype(np.float32)
y=np.linspace(0,1,960,dtype=np.float32)[:,None,None]
tint=np.zeros_like(bg); tint[:,:,:]=[48,25,99]; tint+= (np.sin(y*np.pi)*.5)[...,None] if False else 0
bg=(bg*.48 + tint*.52).astype('uint8')
BG=Image.fromarray(bg,'RGB').resize((1080,1920),Image.Resampling.BICUBIC)
BG.save(assets/'scene'/'sky_background.jpg',quality=91)
# Transparent environmental details from reference: columns left and right with feathering
for name,bx in {'column_left':(0,0,86,475),'column_right':(994,0,1080,475)}.items():
    patch=source.crop(bx).convert('RGBA'); a=np.zeros((patch.height,patch.width),dtype=np.uint8)
    # strong at outer edge; feather on inner side
    for xx in range(patch.width):
        p=(1-xx/max(1,patch.width-1)) if name=='column_left' else (xx/max(1,patch.width-1))
        a[:,xx]=int(255*min(1,p*2.6))
    patch.putalpha(Image.fromarray(a,'L'));patch.save(assets/'scene'/f'{name}.png')
# Gold and burgundy display components as editable SVG, no embedded preview raster.
svg_ui = {
'reel_frame':'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1010 648" preserveAspectRatio="none"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff4ba"/><stop offset=".22" stop-color="#a15b07"/><stop offset=".52" stop-color="#ffd978"/><stop offset=".8" stop-color="#9d5208"/><stop offset="1" stop-color="#ffe7a7"/></linearGradient><linearGradient id="b" x2="1" y2="1"><stop stop-color="#510c33"/><stop offset=".5" stop-color="#260717"/><stop offset="1" stop-color="#4a1034"/></linearGradient></defs><rect x="8" y="9" width="994" height="630" rx="28" fill="url(#b)" stroke="#55201a" stroke-width="13"/><rect x="8" y="9" width="994" height="630" rx="28" fill="none" stroke="url(#g)" stroke-width="13"/><rect x="25" y="25" width="960" height="597" rx="13" fill="none" stroke="#e8aa51" stroke-width="3"/><path d="M32 145H978M32 264H978M32 384H978M32 503H978M191 29V623M354 29V623M517 29V623M680 29V623M843 29V623" stroke="#b77675" stroke-opacity=".36" stroke-width="2"/><g stroke="url(#g)" fill="#5e210f" stroke-width="7"><circle cx="19" cy="20" r="17"/><circle cx="991" cy="20" r="17"/><circle cx="19" cy="628" r="17"/><circle cx="991" cy="628" r="17"/></g></svg>''',
'gold_banner':'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 150" preserveAspectRatio="none"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff1b7"/><stop offset=".22" stop-color="#a36213"/><stop offset=".52" stop-color="#ffd272"/><stop offset="1" stop-color="#874104"/></linearGradient><linearGradient id="d" x2="1" y2="1"><stop stop-color="#24081c"/><stop offset=".48" stop-color="#621a3a"/><stop offset="1" stop-color="#260820"/></linearGradient></defs><path d="M56 25H844L880 75L844 125H56L20 75Z" fill="url(#d)" stroke="url(#g)" stroke-width="13"/><path d="M50 36H850" stroke="#fff0bf" stroke-opacity=".55" stroke-width="3"/><path d="M10 75L48 48L36 75L48 102Z M890 75L852 48L864 75L852 102Z" fill="#ffc95c"/></svg>''',
'blue_button':'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 160" preserveAspectRatio="none"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff2b4"/><stop offset=".18" stop-color="#aa6008"/><stop offset=".48" stop-color="#ffd37c"/><stop offset="1" stop-color="#9c530b"/></linearGradient><linearGradient id="d" x2="0" y2="1"><stop stop-color="#254eaf"/><stop offset=".52" stop-color="#071546"/><stop offset="1" stop-color="#152879"/></linearGradient></defs><rect x="12" y="12" width="496" height="136" rx="58" fill="url(#d)" stroke="url(#g)" stroke-width="18"/><rect x="28" y="26" width="464" height="108" rx="48" fill="none" stroke="#b8ceff" stroke-opacity=".6" stroke-width="3"/></svg>''',
'spin_button':'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 250"><defs><radialGradient id="d" cx=".3" cy=".25"><stop stop-color="#bc4ad5"/><stop offset=".58" stop-color="#6a1a90"/><stop offset="1" stop-color="#200331"/></radialGradient><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff1bb"/><stop offset=".45" stop-color="#c2760c"/><stop offset=".65" stop-color="#ffe2a6"/><stop offset="1" stop-color="#b56c11"/></linearGradient></defs><circle cx="125" cy="125" r="114" fill="url(#d)" stroke="url(#g)" stroke-width="19"/><circle cx="125" cy="125" r="92" fill="none" stroke="#fff5c7" stroke-width="4"/><path d="M61 128a64 64 0 0 1 105-49l7-16 27 49-53 1 13-17a44 44 0 0 0-75 32 M187 123a64 64 0 0 1-105 48l-6 16-27-49 52-2-13 18a44 44 0 0 0 75-31" stroke="#ffffff" stroke-linecap="round" stroke-width="11" fill="#fff"/></svg>'''
}
for name,content in svg_ui.items():
    (assets/'ui'/f'{name}.svg').write_text(content,encoding='utf-8')
# bonus and jackpot banners transparent vectors created as distinct flat-editable elements
for name,label,shade in [('mini','MINI JACKPOT','#187e66'),('minor','MINOR JACKPOT','#2268d4'),('major','MAJOR JACKPOT','#6620b2'),('grand','GRAND JACKPOT','#b32745')]:
    title=label
    code=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 176"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff7cb"/><stop offset=".4" stop-color="#d79523"/><stop offset=".6" stop-color="#ffecaf"/><stop offset="1" stop-color="#9b5b0b"/></linearGradient></defs><rect x="16" y="22" width="818" height="132" rx="65" fill="{shade}" stroke="url(#g)" stroke-width="19"/><rect x="31" y="37" width="788" height="102" rx="55" fill="none" stroke="#fff2c9" stroke-width="3"/><text x="425" y="114" fill="#ffe8b8" font-size="66" font-weight="900" font-family="Georgia,serif" text-anchor="middle" stroke="#57220e" stroke-width="2" paint-order="stroke">{title}</text></svg>'''
    (assets/'ui'/f'jackpot_{name}.svg').write_text(code)
# README manifest
manifest=[]
for file in sorted(assets.rglob('*')):
 if file.is_file():
  manifest.append({'id':file.stem,'path':str(file.relative_to(R)), 'type':file.suffix.lstrip('.'),'source':'isolated/edited from concept preview' if file.suffix=='.png' else 'original vector or scenic reference'})
(R/'assets'/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
# Contact sheet on checkerboard for extracted assets
items=[p for p in (assets/'symbols').glob('*.png')]+[assets/'scene'/'guardian.png',assets/'scene'/'logo.png']
contact=Image.new('RGB',(850,math.ceil(len(items)/4)*196),(22,20,41));draw=ImageDraw.Draw(contact)
for i,p in enumerate(items):
    x=(i%4)*210+14; y=(i//4)*196+12
    pic=Image.open(p).convert('RGBA'); pic.thumbnail((178,150));
    chk=Image.new('RGBA',(184,150),(62,55,86,255));di=ImageDraw.Draw(chk)
    for cy in range(0,150,16):
      for cx in range(0,184,16):
        if (cy//16+cx//16)%2==0:di.rectangle((cx,cy,cx+15,cy+15),fill=(88,81,111,255))
    chk.alpha_composite(pic,((184-pic.width)//2,(150-pic.height)//2));contact.paste(chk.convert('RGB'),(x,y));draw.text((x+6,y+155),p.stem,fill='#fff2c8')
contact.save(R/'assets'/'asset_contact_sheet.jpg',quality=93)
print('Wrote',len(manifest),'assets to',assets)
