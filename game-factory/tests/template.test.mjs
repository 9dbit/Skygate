import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gitBlobSha1, validateSource, validateProfile } from '../validate.mjs';
import { createGame } from '../create-game.mjs';

const profile = JSON.parse(await readFile(new URL('../profiles/legend-ball-x1000.json', import.meta.url), 'utf8'));

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'soft-tech-factory-test-'));
  const source = join(base, 'source');
  const config = { grid_columns: 6, grid_rows: 5, min_match: 8, bonus_trigger_scatters: 4, bonus_start_spins: 15, bonus_retrigger_scatters: 3, bonus_retrigger_add_spins: 5, round_max_win_x: 5000, scatter_paytable: {4:3,5:5,6:100} };
  const files = {
    'play/config.js': 'window.SlotGameConfig = ' + JSON.stringify(config) + ';',
    'play/engine.js': 'engine-original',
    'play/reels.js': 'reels-original',
    'play/game.js': 'renderer-original',
    'play/release.js': 'release-original',
    'studio/math/engine.js': 'engine-original',
    'studio/math/base-config.js': 'window.SKY_BASE_CONFIG = {"grid_columns":6,"grid_rows":5};',
    'studio/math/studio_math.js': 'math-wrapper-original',
    'studio/project.json': JSON.stringify({ schema: 'skygate/studio-v0.3', projectName: 'SKYGATE', stage: {width:1080,height:1920} }),
    'studio/assets/logo.png': 'old-art',
    'studio/assets/.env.secret': 'do-not-copy',
    'play/assets/logo.png': 'old-art',
    'release-store.mjs': 'release-store-original',
    'package.json': JSON.stringify({name:'skygate-studio',version:'0.14.3',scripts:{test:'echo test'}}),
    'README.md': '# SKYGATE',
    'server.mjs': 'server-original',
    'Dockerfile': 'FROM node:22',
    'scripts/prepare-play.mjs': 'prepare-original',
    'media_assets.tar.gz': 'fake archive',
    'audio_mp3.tar.gz': 'fake archive',
    'apple-touch-icon.png': 'old-icon'
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(source,path)), {recursive:true});
    await writeFile(join(source,path),contents);
  }
  const tracked = Object.entries(files).filter(([p]) => p.includes('engine.js') || p === 'play/config.js' || p === 'studio/math/base-config.js' || p === 'release-store.mjs' || p === 'studio/project.json' || p === 'play/game.js' || p === 'play/reels.js' || p === 'play/release.js');
  const lock = {schema:'soft-tech-skygate-source-lock/v1',repository:'9dbit/Skygate',commit:'fixture',gitBlobSha1:Object.fromEntries(tracked.map(([p,s])=>[p,gitBlobSha1(Buffer.from(s))])),expectedPlayableRules:config};
  return {base,source,lock,output:join(base,'legend-ball-x1000'),files};
}

test('profile does not falsely enforce one Scatter per column', async () => {
  const f=await fixture();
  try {
    const rules=await validateSource(f.source,f.lock);
    assert.equal(validateProfile(profile,rules),true);
    assert.throws(()=>validateProfile({...profile,scatter:{...profile.scatter,maxOnePerColumnEnforced:true}},rules),/Scatter design/);
  } finally { await rm(f.base,{recursive:true,force:true}); }
});

test('source engine drift fails closed', async () => {
  const f=await fixture();
  try {
    await writeFile(join(f.source,'play/engine.js'),'tampered');
    await assert.rejects(()=>validateSource(f.source,f.lock),/Source drift/);
  } finally { await rm(f.base,{recursive:true,force:true}); }
});

test('independent game clone keeps math exact, avoids secrets and refuses overwrite', async () => {
  const f=await fixture();
  try {
    const result=await createGame({sourceRoot:f.source,profile,outputPath:f.output,lock:f.lock});
    assert.equal(result.title,'LEGEND BALL X1000');
    assert.equal(await readFile(join(f.output,'play/engine.js'),'utf8'),'engine-original');
    assert.equal(await readFile(join(f.output,'play/config.js'),'utf8'),f.files['play/config.js']);
    assert.equal(JSON.parse(await readFile(join(f.output,'studio/project.json'),'utf8')).projectName,'LEGEND BALL X1000');
    assert.equal(JSON.parse(await readFile(join(f.output,'package.json'),'utf8')).name,'legend-ball-x1000');
    assert.equal(JSON.parse(await readFile(join(f.output,'game-profile.json'),'utf8')).scatter.maxOnePerColumnEnforced,false);
    await assert.rejects(()=>access(join(f.output,'studio/assets/.env.secret')));
    await assert.rejects(()=>createGame({sourceRoot:f.source,profile,outputPath:f.output,lock:f.lock}),/already exists/);
  } finally { await rm(f.base,{recursive:true,force:true}); }
});

test('refuses clone target inside the source repository', async () => {
  const f=await fixture();
  try {
    await assert.rejects(()=>createGame({sourceRoot:f.source,profile,outputPath:join(f.source,'clone'),lock:f.lock}),/cannot be inside/);
  } finally { await rm(f.base,{recursive:true,force:true}); }
});
