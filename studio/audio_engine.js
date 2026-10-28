/* SKYGATE Studio 0.4.1 - user-activated Web Audio mixer.
   Browser-first, no network service, no autoplay, virtual-credit sound events only. */
(function(global){
  'use strict';
  class SkyAudioMixer {
    constructor({resolve,track,settings,onStatus,onError}){
      this.resolve=resolve;this.track=track;this.settings=settings;
      this.onStatus=onStatus||(()=>{});this.onError=onError||(()=>{});
      this.ctx=null;this.master=null;this.active=new Map();this.pending=new Map();this.cache=new Map();
      this.webAudio=!!(global.AudioContext||global.webkitAudioContext);
    }
    unlock(){
      if(!this.webAudio){this.onStatus('unsupported');return Promise.resolve(false);}
      try{
        if(!this.ctx){
          const Context=global.AudioContext||global.webkitAudioContext;
          this.ctx=new Context();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);
          this.updateMix();
        }
        const ctx=this.ctx;
        // A silent frame starts during a genuine tap, needed for iOS WebKit audio activation.
        const buffer=ctx.createBuffer(1,1,ctx.sampleRate);
        const src=ctx.createBufferSource();src.buffer=buffer;src.connect(this.master);src.start(0);
        const r=ctx.resume();
        this.onStatus(ctx.state==='running'?'ready':'unlocking');
        return Promise.resolve(r).then(()=>{this.onStatus(ctx.state==='running'?'ready':'blocked');return ctx.state==='running';}).catch(()=>{this.onStatus('blocked');return false;});
      }catch(err){this.onStatus('blocked');this.onError('Audio is unavailable: '+err.message);return Promise.resolve(false);}
    }
    updateMix(){
      if(!this.ctx||!this.master)return;
      const s=this.settings();const level=s.muted?0:Math.max(0,Math.min(1,(Number(s.master)||0)/100));
      this.master.gain.setTargetAtTime(level,this.ctx.currentTime,.015);
      for(const [id,channel] of this.active){
        const track=this.track(id);if(!track)continue;
        channel.source.playbackRate.setTargetAtTime(Number(track.rate)||1,this.ctx.currentTime,.015);
        const desired=Math.max(0,Math.min(1,(Number(track.volume)||0)/100));
        channel.gain.gain.setTargetAtTime(desired,this.ctx.currentTime,.015);
      }
    }
    async decode(url){
      if(!this.ctx)throw Error('Tap Enable Sound first');
      if(!this.cache.has(url)){
        this.cache.set(url,(async()=>{
          const response=await fetch(url);
          if(!response.ok)throw Error('Audio file HTTP '+response.status);
          const data=await response.arrayBuffer();
          return this.ctx.decodeAudioData(data);
        })());
      }
      try{return await this.cache.get(url);}catch(err){this.cache.delete(url);throw err;}
    }
    clearCache(){this.cache.clear();}
    async play(id,offsetOverride){
      const t=this.track(id);if(!t||this.settings().muted)return false;
      // On iOS the audio context may suspend after an app switch. A fresh user
      // gesture can resume it; never start sound until it reports 'running'.
      if(!this.ctx||this.ctx.state!=='running')await this.unlock();
      if(!this.ctx||this.ctx.state!=='running'){
        this.onStatus('blocked');this.onError('Tap Enable Sound once before playing.');return false;
      }
      this.stop(id,false);
      const marker=this.pending.get(id);
      let buffer;
      try{buffer=await this.decode(this.resolve(id));}
      catch(err){if(this.pending.get(id)===marker)this.onError('Could not decode '+id+': '+err.message);return false;}
      if(this.pending.get(id)!==marker||this.settings().muted)return false;
      const ctx=this.ctx;
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
      const rate=Number(t.rate)||1;source.playbackRate.value=rate;
      const end=t.trimEnd>0?Math.min(buffer.duration,Math.max(0,Number(t.trimEnd))):buffer.duration;
      const start=Math.max(0,Math.min(Math.max(0,end-.015),offsetOverride??(Number(t.trimStart)||0)));
      source.loop=!!t.loop;
      if(source.loop){source.loopStart=Math.max(0,Number(t.trimStart)||0);source.loopEnd=Math.max(source.loopStart+.01,end);}
      const target=Math.max(0,Math.min(1,(Number(t.volume)||0)/100));
      gain.gain.value=0;source.connect(gain);gain.connect(this.master);
      const now=ctx.currentTime+.012;const fade=Math.max(0,(Number(t.fade)||0)/1000);
      gain.gain.setValueAtTime(fade>0?0:target,now);
      if(fade>0)gain.gain.linearRampToValueAtTime(target,now+Math.min(fade,3));
      const rec={source,gain,buffer,startTime:now,offset:start,rate};this.active.set(id,rec);
      source.onended=()=>{
        // Clean up even when a newer sound replaced this channel.
        if(this.active.get(id)===rec)this.active.delete(id);
        try{source.disconnect();gain.disconnect();}catch{}
      };
      try{
        if(!source.loop&&t.trimEnd>0)source.start(now,start,Math.max(.01,end-start));
        else source.start(now,start);
        this.onStatus('ready');return true;
      }catch(err){this.active.delete(id);this.onError('Audio start failed: '+err.message);return false;}
    }
    stop(id,fade=true){
      this.pending.set(id,(this.pending.get(id)||0)+1);
      const rec=this.active.get(id);if(!rec)return;
      this.active.delete(id);
      if(!this.ctx)return;
      const t=this.track(id),now=this.ctx.currentTime;
      const seconds=fade?Math.min(2,Math.max(0,(Number(t?.fade)||0)/1000)):0;
      try{
        if(seconds>0){rec.gain.gain.cancelScheduledValues(now);rec.gain.gain.setValueAtTime(rec.gain.gain.value,now);rec.gain.gain.linearRampToValueAtTime(0,now+seconds);rec.source.stop(now+seconds+.02);}
        else rec.source.stop();
      }catch{}
    }
    stopAll(){for(const id of [...new Set([...this.active.keys(),...this.pending.keys()])])this.stop(id,false);}
    seek(id,fraction){
      const rec=this.active.get(id);if(!rec)return false;
      const t=this.track(id);const duration=rec.buffer.duration;const min=Math.max(0,Number(t?.trimStart)||0);const end=t?.trimEnd>0?Math.min(duration,Number(t.trimEnd)):duration;
      const target=min+Math.max(0,Math.min(1,fraction))*(end-min);
      this.play(id,Math.min(end-.01,target));return true;
    }
    isPlaying(id){return this.active.has(id);}
    isReady(){return !!this.ctx&&this.ctx.state==='running';}
  }
  global.SkyAudioMixer=SkyAudioMixer;
})(typeof window!=='undefined'?window:globalThis);
