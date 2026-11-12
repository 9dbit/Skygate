import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
export const factoryRoot = resolve(dirname(thisFile), '..');

export function gitBlobSha1(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}

async function readOrdinaryFile(root, path) {
  const rootAbs = resolve(root);
  const abs = resolve(rootAbs, path);
  if (!abs.startsWith(rootAbs + sep)) throw Error('Unsafe source path: ' + path);
  const info = await lstat(abs);
  if (!info.isFile() || info.isSymbolicLink()) throw Error('File must be ordinary: ' + path);
  return readFile(abs);
}

export function decodeJsAssignedJson(contents, variableName) {
  const text = contents.toString('utf8').trim();
  const prefix = 'window.' + variableName;
  if (!text.startsWith(prefix)) throw Error('Expected ' + prefix + ' assignment');
  const equal = text.indexOf('=');
  const opening = text.indexOf('{', equal + 1);
  const closing = text.lastIndexOf('}');
  if (equal < 0 || opening < 0 || closing < opening || !/^;?$/.test(text.slice(closing + 1).trim())) throw Error('Invalid ' + variableName + ' JSON');
  return JSON.parse(text.slice(opening, closing + 1));
}

export function validateProfile(profile, rules) {
  if (profile?.schema !== 'soft-tech-game-factory-profile/v1') throw Error('Unknown game profile schema');
  if (typeof profile.slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(profile.slug)) throw Error('Invalid game slug');
  if (typeof profile.title !== 'string' || profile.title.length < 3 || profile.title.length > 80) throw Error('Invalid title');
  if (profile.inheritEngineUnchanged !== true || profile.grid?.columns !== rules.grid_columns || profile.grid?.rows !== rules.grid_rows) throw Error('Profile requests engine/grid changes');
  if (profile.credits !== 'fictional-only' || profile.production?.ready !== false || profile.production?.allowed !== false) throw Error('Template must remain unapproved virtual-credit research only');
  if (profile.scatter?.mathKind !== 'scatter' || profile.scatter?.maxOnePerColumnEnforced !== false || profile.scatter?.artStatus !== 'concept-only-not-implemented') throw Error('Scatter design must not claim new mathematics or implemented column restriction');
  const art = profile.scatter.treatments;
  if (!Array.isArray(art) || art.length !== 6 || new Set(art.map(s => s.name)).size !== 6 || art.some(s => !/^[A-Z][A-Z0-9]{2,20}$/.test(s.name) || !/^#[A-Fa-f0-9]{6}$/.test(s.color) || typeof s.rune !== 'string' || s.rune.length < 3)) throw Error('Need six distinct, valid art-only Scatter concepts');
  if (!profile.originalIP || typeof profile.originalIP.world !== 'string' || !Array.isArray(profile.scope?.new)) throw Error('Original creative brief and asset checklist are required');
  return true;
}

export async function validateSource(root, lock) {
  if (lock?.schema !== 'soft-tech-skygate-source-lock/v1' || !lock.gitBlobSha1) throw Error('Invalid source lock');
  for (const [path, sha] of Object.entries(lock.gitBlobSha1)) {
    const bytes = await readOrdinaryFile(root, path);
    if (gitBlobSha1(bytes) !== sha) throw Error('Source drift detected in ' + path + '. Use an approved, freshly reviewed source lock; do not silently change the engine.');
  }
  const playable = decodeJsAssignedJson(await readOrdinaryFile(root, 'play/config.js'), 'SlotGameConfig');
  for (const [key, expected] of Object.entries(lock.expectedPlayableRules)) {
    if (JSON.stringify(playable[key]) !== JSON.stringify(expected)) throw Error('Rule mismatch: ' + key);
  }
  const studio = decodeJsAssignedJson(await readOrdinaryFile(root, 'studio/math/base-config.js'), 'SKY_BASE_CONFIG');
  if (studio.grid_columns !== 6 || studio.grid_rows !== 5) throw Error('Unexpected Studio grid');
  return playable;
}

const directlyInvoked = process.argv[1] && resolve(process.argv[1]) === thisFile;
if (directlyInvoked) {
  try {
    const lock = JSON.parse(await readFile(resolve(factoryRoot, 'game-factory/source-lock.json'), 'utf8'));
    const profile = JSON.parse(await readFile(resolve(factoryRoot, 'game-factory/profiles/legend-ball-x1000.json'), 'utf8'));
    const rules = await validateSource(factoryRoot, lock);
    validateProfile(profile, rules);
    console.log('PASS: source ' + lock.repository + '@' + lock.commit + ', ' + rules.grid_columns + 'x' + rules.grid_rows + ', ' + rules.bonus_start_spins + ' Free Spins, profile ' + profile.slug);
  } catch (error) {
    console.error('FAIL: ' + error.message);
    process.exitCode = 1;
  }
}
