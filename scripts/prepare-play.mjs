// Publish only shipped game art/audio, never Studio settings or uploaded assets.
import { mkdir, copyFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const [file, archive] of [['scene/hero_composite_reference.jpg','media_assets.tar.gz'], ['audio/bgm_celestial_loop.mp3','audio_mp3.tar.gz']]) {
  try { await access(resolve(root,'studio/assets',file)); }
  catch { execFileSync('tar', ['--no-same-owner','-xzf',archive], {cwd:root}); }
}
const files = [
  'scene/hero_composite_reference.jpg', 'scene/sky_background.jpg',
  ...['ruby','sapphire','emerald','amethyst','topaz','ring','chalice','crown','orb'].map(n=>`symbols/${n}.png`),
  ...['gold_banner','blue_button','spin_button','reel_frame'].map(n=>`ui/${n}.svg`),
  ...['bgm_celestial_loop','spin_start','reel_stop','tumble','symbol_win','multiplier','bonus_intro','free_spin_start','big_win','mega_win','ui_click'].map(n=>`audio/${n}.mp3`),
];
for (const file of files) {
  const target=resolve(root,'play/assets',file);
  await mkdir(dirname(target),{recursive:true});
  await copyFile(resolve(root,'studio/assets',file),target);
}
await copyFile(resolve(root,'studio/audio_engine.js'),resolve(root,'play/audio_engine.js'));
console.log(`Prepared ${files.length} public game assets and audio mixer.`);
