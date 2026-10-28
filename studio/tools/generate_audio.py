#!/usr/bin/env python3
"""Generate original, non-copyrighted synthesized music/SFX for virtual-credit demo."""
import json, math, subprocess
from pathlib import Path
import numpy as np
from scipy.io.wavfile import write
R=Path(__file__).resolve().parents[1]; OUT=R/'assets'/'audio';OUT.mkdir(exist_ok=True,parents=True)
SR=24000
rng=np.random.default_rng(20261027)

def osc(f,t,phase=0,wave='sin'):
    p=2*np.pi*f*t+phase
    return np.sin(p) if wave=='sin' else (np.sin(p)+.21*np.sin(2*p)+.09*np.sin(3*p))/.99

def env(n, attack=.025, decay=.15, sustain=.45, release=.24):
    # relative length of attack etc
    a=min(n//4,max(1,int(attack*SR))); d=min(n//3,max(1,int(decay*SR))); r=min(n//3,max(1,int(release*SR)))
    arr=np.ones(n)*sustain
    arr[:a]=np.linspace(0,1,a)
    arr[a:a+d]=np.linspace(1,sustain,d)
    arr[n-r:]=np.linspace(sustain,0,r)
    return arr

def tone(f,d,amp=.5,harm=2,sweep=None):
    t=np.arange(int(d*SR))/SR
    if sweep is None: x=osc(f,t)+.23*osc(f*2,t)+.06*osc(f*3,t)
    else:
        ff=f+(sweep-f)*(t/max(t[-1],1e-9))
        x=np.sin(2*np.pi*np.cumsum(ff)/SR)+.15*np.sin(4*np.pi*np.cumsum(ff)/SR)
    return x*env(len(t),attack=.008,decay=max(.02,d*.26),sustain=.20,release=min(.4,d*.34))*amp

def delay(signal, seconds=.095, gain=.18):
    k=int(seconds*SR)
    if k<len(signal):
        out=signal.copy();out[k:]+=signal[:-k]*gain;return out
    return signal

def stereo_audio(x):
    x=np.asarray(x,dtype=np.float64)
    if x.ndim==1:
        a=delay(x,.012,.12); b=delay(x,.023,.18)
        stereo=np.stack([a,b],axis=-1)
    else: stereo=x
    peak=max(1.0,float(np.max(np.abs(stereo)))/.88)
    return (stereo/peak*32760).astype(np.int16)

def save(name,arr):
    wav=OUT/(name+'.wav');write(wav,SR,stereo_audio(arr))
    ogg=OUT/(name+'.ogg')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','4',str(ogg)],check=True)
    wav.unlink()
    return {'id':name,'path':'assets/audio/'+ogg.name,'duration_sec':round(len(arr)/SR,3),'size_bytes':ogg.stat().st_size}

def mix_events(length,events):
    x=np.zeros(int(length*SR))
    for at,sig,level in events:
        i=int(at*SR)
        if i<0 or i>=len(x):continue
        e=min(len(x),i+len(sig)); x[i:e]+=sig[:e-i]*level
    return x

# Ambient BGM: original evolving, loopable celestial synth theme in A minor
length=24.0
t=np.arange(int(length*SR))/SR
bg=np.zeros(len(t))
progression=[[220,261.63,329.63],[174.61,220,293.66],[196,246.94,329.63],[164.81,220,293.66]]
for j,chord in enumerate(progression):
    start=int(j*6*SR);end=int((j+1)*6*SR);tt=t[start:end]
    seg=np.zeros(len(tt))
    for i,f in enumerate(chord):
        ph=.11*i
        seg+=.037*osc(f/2,tt,phase=ph)+.022*osc(f,tt,phase=ph)+.012*osc(f*2,tt,phase=ph)
    envelope=np.minimum(1.0,np.minimum((tt-j*6)/.55,((j+1)*6-tt)/.55))
    bg[start:end]+=seg*np.clip(envelope,0,1)
    for beat in range(12):
        note=chord[beat%len(chord)]*2
        at=j*6+beat*.5+.09
        spark=tone(note,.55,.053)
        i0=int(at*SR);i1=min(len(bg),i0+len(spark));bg[i0:i1]+=spark[:i1-i0]
# A soft distant thunder texture
noise=rng.normal(size=len(t));broad=np.convolve(noise, np.ones(1000)/1000, mode='same')
bg+=broad*.026
# seamless wrap crossfade endpoints
f=int(.6*SR); w=np.linspace(0,1,f)
start=bg[:f].copy();end=bg[-f:].copy()
blend=start*w+end*(1-w)
bg[:f]=blend;bg[-f:]=blend
tracks=[save('bgm_celestial_loop',bg)]

tracks.append(save('spin_start',mix_events(1.12,[(0,tone(155,.72,.44,sweep=640),1),(.13,tone(120,.85,.22,sweep=360),1)])))
tracks.append(save('reel_stop',mix_events(.43,[(0,tone(210,.21,.3,sweep=90),1),(.07,tone(470,.18,.12),1)])))
tracks.append(save('tumble',mix_events(.9,[(0,tone(440,.38,.25,sweep=280),1),(.2,tone(560,.38,.21,sweep=320),1),(.42,tone(770,.34,.19,sweep=480),1)])))
tracks.append(save('symbol_win',mix_events(1.2,[(0,tone(523,.55,.26),1),(.13,tone(660,.62,.3),1),(.28,tone(784,.78,.33),1)])))
tracks.append(save('multiplier',mix_events(1.3,[(0,tone(350,.5,.25,sweep=920),1),(.3,tone(730,.62,.25,sweep=1250),1)])))
tracks.append(save('bonus_intro',mix_events(3,[(0,tone(220,.8,.28),1),(.28,tone(330,.9,.25),1),(.55,tone(440,1.1,.3),1),(.9,tone(660,1.7,.34),1),(1.25,tone(880,1.2,.32),1)])))
tracks.append(save('big_win',mix_events(2.55,[(i*.20,tone(392*2**(i/12),1.05,.23),1) for i in [0,3,7,10,12,15]])))
tracks.append(save('mega_win',mix_events(3.7,[(i*.24,tone(262*2**(i/12),1.25,.21),1) for i in [0,2,4,7,9,12,14,16]])))
tracks.append(save('jackpot',mix_events(5.0,[(i*.18,tone(392*2**(i/12),1.4,.25),1) for i in [0,2,4,5,7,9,11,12,14,16,19,24]])))
tracks.append(save('ui_click',tone(780,.11,.27,sweep=520)))
tracks.append(save('free_spin_start',mix_events(1.4,[(0,tone(590,.45,.17),1),(.2,tone(740,.53,.23),1),(.44,tone(980,.75,.29),1)])))
tracks.append(save('ambient_thunder',mix_events(2.8,[(0,tone(98,2.5,.23,sweep=45),1),(.25,tone(54,2,.19,sweep=38),1)])))
manifest={'original_audio':True,'source':'Procedurally synthesized in this project. No third-party music, samples, or copyrighted melodies.','tracks':tracks}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
print('Generated',len(tracks),'tracks',sum(t['size_bytes'] for t in tracks),'bytes')
