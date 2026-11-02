"""Real gesture + Web Audio QA against a disposable local Skygate server.

Publishes a synthetic WAV into a temporary release store, never production.
Tests both the built-in soundtrack and a Studio-uploaded replacement.
"""
from pathlib import Path
import base64
import io
import json
import math
import os
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
import wave
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'qa-audio'
OUT.mkdir(exist_ok=True)
TRACK = 'bgm_celestial_loop'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
BASE = f'http://127.0.0.1:{port}'

INSTRUMENT = """(() => {
  let Mixer;
  window.__audioUnlocks = [];
  window.__inSplashGesture = false;
  document.addEventListener('click', event => {
    if (event.isTrusted && event.target.closest?.('#bootPlay')) {
      window.__inSplashGesture = true;
      setTimeout(() => { window.__inSplashGesture = false; }, 0);
    }
  }, true);
  Object.defineProperty(window, 'SkyAudioMixer', {
    configurable: true,
    get() { return Mixer; },
    set(Original) {
      Mixer = class extends Original {
        constructor(options) { super(options); window.__audioMixer = this; }
        unlock() {
          window.__audioUnlocks.push({inSplash:window.__inSplashGesture,
            active:navigator.userActivation?.isActive ?? null});
          return super.unlock();
        }
      };
    }
  });
})();"""


def request(path, body=None, csrf=None):
    headers = {'Content-Type':'application/json', 'Origin':BASE}
    if csrf:
        headers['X-Skygate-CSRF'] = csrf
    req = urllib.request.Request(BASE+path,
        data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def publish_test_music():
    project = json.loads((ROOT/'studio/project.json').read_text())
    project['audio']['master'] = 63
    track = next(t for t in project['tracks'] if t['id'] == TRACK)
    # The release schema supports loop, volume and fade. It intentionally
    # excludes editor-only rate/trim fields; test the public contract.
    track.update(loop=True, volume=23, fade=80)
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(b''.join(struct.pack('<h', round(12000*math.sin(2*math.pi*440*i/44100)))
                                for i in range(88200)))
    summary = request('/studio/api/releases')
    staged = request('/studio/api/releases', {'project':project,
        'overrides':{'audio:'+TRACK:{'mime':'audio/wav',
        'data':base64.b64encode(output.getvalue()).decode()}}}, summary['csrf'])
    request('/studio/api/publish', {'id':staged['id'], 'expectedActive':summary['active']}, summary['csrf'])
    live = request('/play/release.json')
    return '/play/media/'+live['overrides']['audio:'+TRACK]['file']


def assert_audible(page):
    page.wait_for_function("""() => {
      const m=window.__audioMixer;
      if(!m?.ctx || m.ctx.state!=='running')return false;
      if(!window.__audioAnalyser){
        window.__audioAnalyser=m.ctx.createAnalyser();
        window.__audioAnalyser.fftSize=2048;
        m.master.connect(window.__audioAnalyser);
      }
      const data=new Float32Array(2048);
      window.__audioAnalyser.getFloatTimeDomainData(data);
      const rms=Math.sqrt(data.reduce((total,n)=>total+n*n,0)/data.length);
      window.__audioRms=rms;
      return rms > 0.0001;
    }""", timeout=20000)


def check_game(browser, engine, custom_path=None):
    context = browser.new_context(viewport={'width':390,'height':844},
        is_mobile=True, has_touch=True, reduced_motion='reduce')
    context.add_init_script(INSTRUMENT)
    page = context.new_page()
    errors, audio_requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: audio_requests.append(req.url) if
        ('/audio/' in req.url or '/play/media/' in req.url) else None)
    try:
        page.goto(BASE+'/play/', wait_until='domcontentloaded')
        page.wait_for_function("document.documentElement.dataset.boot==='ready'", timeout=30000)
        assert page.evaluate('window.__audioMixer.ctx===null')
        assert page.locator('#sound').get_attribute('aria-pressed') == 'false'
        assert page.evaluate('window.__audioUnlocks.length') == 0
        page.locator('#bootPlay').tap()
        page.wait_for_function("""() => document.documentElement.dataset.boot==='entered' &&
          window.__audioMixer?.isPlaying('bgm_celestial_loop') &&
          window.__audioMixer.ctx.state==='running'""", timeout=20000)
        assert page.evaluate('window.__audioUnlocks[0].inSplash')
        assert page.locator('#sound').get_attribute('aria-pressed') == 'true'
        assert page.locator('#soundSetting').is_checked()
        assert page.evaluate('window.__audioMixer.active.size') == 1
        assert page.evaluate('window.SlotGameTest.getState().rounds') == 0
        assert_audible(page)
        if custom_path:
            assert any(url.endswith(custom_path) for url in audio_requests), audio_requests
            assert not any(url.endswith('/audio/'+TRACK+'.mp3') for url in audio_requests)
            values = page.evaluate("""() => {
              const m=window.__audioMixer, channel=m.active.get('bgm_celestial_loop');
              return {loop:channel.source.loop, start:channel.source.loopStart,
                end:channel.source.loopEnd, rate:channel.source.playbackRate.value,
                master:m.settings().master, volume:m.track('bgm_celestial_loop').volume,
                fade:m.track('bgm_celestial_loop').fade, duration:channel.buffer.duration};
            }""")
            assert values['loop'] and abs(values['start'])<.001, values
            assert abs(values['end']-2)<.01 and abs(values['rate']-1)<.001, values
            assert values['master']==63 and values['volume']==23 and values['fade']==80, values
            assert abs(values['duration']-2)<.01, values
        # The same original mixer owns both splash start and subsequent controls.
        page.locator('#sound').tap()
        page.wait_for_function("!window.SlotGameTest.getState().sound && window.__audioMixer.active.size===0")
        assert page.locator('#sound').get_attribute('aria-pressed') == 'false'
        assert not page.locator('#soundSetting').is_checked()
        page.locator('#sound').tap()
        page.wait_for_function("window.__audioMixer.isPlaying('bgm_celestial_loop')")
        assert page.evaluate('window.__audioMixer.active.size') == 1
        assert_audible(page)
        page.screenshot(path=str(OUT/(f'{engine}-'+('custom' if custom_path else 'default')+'.png')))
        assert not errors, errors
        return {'engine':engine, 'custom':bool(custom_path), 'rms':page.evaluate('window.__audioRms'),
                'unlockInPlay':True, 'muteUnmute':True}
    finally:
        context.close()


with tempfile.TemporaryDirectory(prefix='skygate-audio-') as release_dir:
    env = dict(os.environ, PORT=str(port), NODE_ENV='development', SKYGATE_RELEASE_DIR=release_dir)
    server = subprocess.Popen(['node','server.mjs'], cwd=ROOT, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                if request('/health')['ok']:
                    break
            except (OSError, ValueError):
                if server.poll() is not None:
                    raise RuntimeError('Local server exited')
                time.sleep(.25)
        else:
            raise RuntimeError('Local server did not become healthy')
        results = []
        with sync_playwright() as playwright:
            engines = {}
            try:
                engines['chromium'] = playwright.chromium.launch(headless=True,
                    args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
                engines['webkit'] = playwright.webkit.launch(headless=True)
                for name, browser in engines.items():
                    results.append(check_game(browser, name))
                media_path = publish_test_music()
                for name, browser in engines.items():
                    results.append(check_game(browser, name, media_path))
                    # Live Studio preview still auto-enters silently without a tap.
                    context = browser.new_context()
                    context.add_init_script(INSTRUMENT)
                    page = context.new_page()
                    page.goto(BASE+'/studio/preview/?live=1', wait_until='domcontentloaded')
                    page.wait_for_function("document.documentElement.dataset.boot==='entered'", timeout=30000)
                    assert page.evaluate('window.__audioMixer.ctx===null && window.__audioUnlocks.length===0')
                    context.close()
            finally:
                for browser in engines.values():
                    browser.close()
        (OUT/'results.json').write_text(json.dumps(results, indent=2)+'\n')
        print(json.dumps({'PASS':'splash Play audio, actual Studio-uploaded WAV, mute/unmute, silent preview',
                          'results':results}, indent=2))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
