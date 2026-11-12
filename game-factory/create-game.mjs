import { readFile, writeFile, mkdir, cp, mkdtemp, rename, rm, access, lstat } from 'node:fs/promises';
import { resolve, dirname, basename, sep, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource, validateProfile, gitBlobSha1, factoryRoot } from './validate.mjs';

function argsToObject(items) {
  const out = {};
  for (let i = 0; i < items.length; i += 2) {
    const key = items[i];
    if (!['--profile', '--output'].includes(key) || !items[i+1] || items[i+1].startsWith('--') || out[key]) throw Error('Usage: node game-factory/create-game.mjs --profile game-factory/profiles/legend-ball-x1000.json --output ../legend-ball-x1000');
    out[key] = items[i+1];
  }
  if (!out['--profile'] || !out['--output']) throw Error('Both --profile and --output are required');
  return out;
}

const topLevel = ['play', 'studio', 'scripts', 'server.mjs', 'release-store.mjs', 'Dockerfile', 'package.json', 'README.md', 'media_assets.tar.gz', 'audio_mp3.tar.gz', 'apple-touch-icon.png'];
const skippedNames = new Set(['.git', '.github', '.env', '.local-data', '.tmp', 'node_modules', '.DS_Store', '.cache', 'coverage', 'game-factory']);

export async function createGame({ sourceRoot, profile, outputPath, lock }) {
  const source = resolve(sourceRoot);
  const output = resolve(outputPath);
  if (output === source || output.startsWith(source + sep) || source.startsWith(output + sep)) throw Error('Output cannot be inside, equal to or contain source repository');
  try { await access(output); throw Error('Output already exists: ' + output); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const rules = await validateSource(source, lock);
  validateProfile(profile, rules);
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const temp = await mkdtemp(join(parent, '.' + basename(output) + '.factory-'));
  let created = false;
  try {
    for (const entry of topLevel) {
      const from = join(source, entry);
      const info = await lstat(from);
      if (info.isSymbolicLink()) throw Error('Refusing symlink source: ' + entry);
      await cp(from, join(temp, entry), {
        recursive: true,
        errorOnExist: true,
        filter: async path => {
          const rel = relative(source, path);
          const segments = rel.split(sep);
          if (segments.some(s => skippedNames.has(s) || s.startsWith('.env.'))) return false;
          const stat = await lstat(path);
          if (stat.isSymbolicLink()) throw Error('Refusing symlink inside source: ' + rel);
          return true;
        }
      });
    }
    // Do not modify math, reel, payout, bonus or credit-ledger code in the clone.
    for (const path of Object.keys(lock.gitBlobSha1)) {
      if (path === 'studio/project.json') continue; // The displayed new Studio identity is safe to rename.
      const bytes = await readFile(join(temp, path));
      if (gitBlobSha1(bytes) !== lock.gitBlobSha1[path]) throw Error('Clone integrity failure: ' + path);
    }
    const pjPath = join(temp, 'studio/project.json');
    const pj = JSON.parse(await readFile(pjPath, 'utf8'));
    pj.projectName = profile.title;
    await writeFile(pjPath, JSON.stringify(pj, null, 2) + '\n');
    const packagePath = join(temp, 'package.json');
    const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
    pkg.name = profile.slug;
    pkg.description = profile.title + ': isolated Skygate-derived virtual-credit preview (artwork pending)';
    await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    await writeFile(join(temp, 'game-profile.json'), JSON.stringify(profile, null, 2) + '\n');
    await writeFile(join(temp, 'game-source-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    const status = [
      '# ' + profile.title + ' | isolated source clone',
      '',
      'This copy is NOT a finished game, a certified RNG or an approved production deployment. Source: ' + lock.repository + '@' + lock.commit + '.',
      '',
      'Math, scatter triggers, bonus/retrigger, tumble, round cap and credit logic are byte-for-byte unchanged from Skygate. Board remains ' + rules.grid_columns + 'x' + rules.grid_rows + '.',
      'The Studio projectName and package metadata were renamed, but the game still contains Skygate artwork and labels. Replace all scene art, reel symbols, icons, UI, audio and share metadata using original IP before staging.',
      '',
      'Six Scatter ball treatments are CONCEPT ONLY. This engine uses one Scatter kind per cell; several Scatter can appear in one column. No one-per-column constraint is enabled.',
      '',
      'Next: npm test, responsive and real phone QA, independent game-math/RNG and IP review, separate staging and approvals.',
      ''
    ].join('\n');
    await writeFile(join(temp, 'CLONE_STATUS.md'), status);
    try { await access(output); throw Error('Output created by another process: ' + output); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(temp, output);
    created = true;
    return { output, source: lock.commit, title: profile.title, filesKeptUnchanged: Object.keys(lock.gitBlobSha1).filter(p => p !== 'studio/project.json') };
  } finally {
    if (!created) await rm(temp, { recursive: true, force: true });
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    const args = argsToObject(process.argv.slice(2));
    const profile = JSON.parse(await readFile(resolve(args['--profile']), 'utf8'));
    const lock = JSON.parse(await readFile(resolve(factoryRoot, 'game-factory/source-lock.json'), 'utf8'));
    const result = await createGame({ sourceRoot: factoryRoot, profile, outputPath: args['--output'], lock });
    console.log('CREATED ' + result.output + ' from locked Skygate ' + result.source + '. Artwork and QA pending; not deployed.');
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  }
}
