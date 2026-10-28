"""SKYGATE server authentication smoke tests. No real credentials used."""
from pathlib import Path
import base64,os,subprocess,time,urllib.error,urllib.request
ROOT=Path(__file__).resolve().parents[2]

def server(env,port):
    cfg=os.environ.copy();cfg.update({'PORT':str(port),'NODE_ENV':'production',**env})
    p=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=cfg,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=.5)
            return p
        except Exception:
            time.sleep(.1)
    p.terminate();raise RuntimeError('Server failed to start')

def status(port,path,credentials=None):
    req=urllib.request.Request(f'http://127.0.0.1:{port}{path}')
    if credentials:
        req.add_header('Authorization','Basic '+base64.b64encode(credentials.encode()).decode())
    try:
        with urllib.request.urlopen(req,timeout=4) as res:return res.status
    except urllib.error.HTTPError as err:return err.code

def check(pairs,port):
    for path,credentials,expected in pairs:
        got=status(port,path,credentials)
        assert got==expected, (path,got,expected)
    return len(pairs)

p=server({'SKYGATE_STUDIO_USER':'qa','SKYGATE_STUDIO_PASSWORD':'test-only-do-not-use'},8760)
try:
    a=check([('/health',None,200),('/play/',None,200),('/studio/',None,401),('/studio/assets/audio/bgm_celestial_loop.mp3',None,401),('/',None,401),('/studio/','qa:test-only-do-not-use',200),('/studio/assets/audio/bgm_celestial_loop.mp3','qa:test-only-do-not-use',200)],8760)
finally:p.terminate();p.wait(timeout=5)
p=server({'SKYGATE_STUDIO_REQUIRE_AUTH':'true'},8761)
try:
    b=check([('/studio/',None,503),('/health',None,200),('/play/',None,200)],8761)
finally:p.terminate();p.wait(timeout=5)
print(f'AUTH SMOKE PASS: {a+b}/{a+b}, Basic-auth protection and fail-closed mode verified')
