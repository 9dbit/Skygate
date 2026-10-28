import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),math=require('../../play/engine.js'),settings=require('../../play/settings-model.js'),cfg=require('../math/reference-config.json');
const round=(seed=41,opt={})=>math.createEngine(cfg,seed).playRound({trace:true,...opt});
test('reference paytable matches all nine screenshot payouts at base bet 2',()=>{
 const expected={crown:[20,50,100],hourglass:[5,20,50],ring:[4,10,30],chalice:[3,4,24],ruby:[2,3,20],amethyst:[1.6,2.4,16],topaz:[1,2,10],emerald:[.8,1.8,8],sapphire:[.5,1.5,4]};
 for(const [kind,values] of Object.entries(expected))for(const [i,count] of [8,10,12].entries()){const grid=Array.from({length:30},(_,n)=>({kind:n<count?kind:'orb',multiplier:2}));assert.equal(math.evaluateBoard(grid,cfg).awardX*2,values[i]);}
 assert.deepEqual(cfg.multiplier_values,[2,3,4,5,6,8,10,12,15,20,25,50,100,250,500]);
 assert.deepEqual(cfg.scatter_paytable,{'4':3,'5':5,'6':100});
});
test('purchased feature has four scatters and same 15 free spin resolver; ante cannot purchase',()=>{
 for(let seed=1;seed<=30;seed++){const r=round(seed,{buyBonus:true});assert.equal(r.base.initial.filter(t=>t.kind==='scatter').length,4);assert(r.bonus.triggered);assert.equal(r.bonus.spins[0].leftBefore,15);assert(r.winX<=5000);assert(!r.safetyTruncated);}
 assert.throws(()=>round(1,{buyBonus:true,ante:true}),/unavailable/);
});
test('scatter payout is separate from the multiplied symbol payout',()=>{
 const r=round();for(const spin of [r.base,...r.bonus.spins])if(!spin.capHit)assert.equal(spin.payoutX,Math.min(5000,Number((spin.symbolWinX*spin.appliedMultiplierX+spin.scatterWinX).toFixed(10))));
 assert.deepEqual(math.resolvePayout(0,500,25,true),{payoutX:0,nextBankX:25,appliedMultiplierX:1});
 assert.deepEqual(math.resolvePayout(2,0,25,true),{payoutX:2,nextBankX:25,appliedMultiplierX:1});
 assert.deepEqual(math.resolvePayout(2,4,25,true),{payoutX:58,nextBankX:29,appliedMultiplierX:29});
});
test('round cap immediately stops a winning cascade and cancels remaining bonus features',()=>{
 const c=structuredClone(cfg);for(const k of Object.keys(c.symbol_weights))c.symbol_weights[k]=k==='crown'?1e12:1e-12;c.paytable.crown=[5000,5000,5000];
 const r=math.createEngine(c,9).playRound({trace:true});assert.equal(r.winX,5000);assert(r.capHit);assert.equal(r.base.tumbles,1);assert.equal(r.base.cascades.length,1);assert.equal(r.bonus.spinsPlayed,0);
 const b=structuredClone(cfg);for(const k of Object.keys(b.bonus_symbol_weights))b.bonus_symbol_weights[k]=k==='scatter'?1e12:1e-12;
 const bonus=math.createEngine(b,9).playRound({trace:true,buyBonus:true});assert(bonus.capHit);assert.equal(bonus.winX,5000);assert.equal(bonus.bonus.spins.at(-1).retriggered,false);assert(bonus.bonus.spinsPlayed<10000);
});
test('watchdog failures void rather than silently truncating a payable round',()=>{
 const c=structuredClone(cfg);c.safety_max_tumbles=1;for(const k of Object.keys(c.symbol_weights))c.symbol_weights[k]=k==='sapphire'?1e12:1e-12;
 assert.throws(()=>math.createEngine(c,9).playRound(),/Round void/);
});
test('20x and 25x bet math, min/max, stepping and preference validation',()=>{
 assert.equal(settings.total(1,.1),2);assert.equal(settings.total(1,.1,true),2.5);
 for(const ante of [false,true]){const all=settings.combinations(ante);assert(all.every(b=>b.total>=.2&&b.total<=300));assert.equal(Math.max(...all.map(b=>b.total)),300);for(const b of all)assert.equal(b.total,settings.money(b.base*(ante?1.25:1)));}
 assert.equal(settings.step(2,1).base,2.4);assert.equal(settings.step(2,-1).base,1.8);
 assert.equal(settings.normalize({speed:'invalid',autospins:99999}).speed,'normal');assert.equal(settings.normalize({autospins:99999}).autospins,1000);
});
