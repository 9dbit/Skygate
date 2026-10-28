#!/usr/bin/env python3
from pathlib import Path
import json,numpy as np,soundfile as sf
R=Path(__file__).resolve().parents[1];tracks={}
for file in sorted((R/'assets/audio').glob('*.ogg')):
  data,sr=sf.read(str(file),always_2d=True); mono=data.mean(axis=1)
  bars=44;chunks=np.array_split(mono,bars)
  rms=np.array([np.sqrt(np.mean(x*x)) for x in chunks]);rms=(rms/(np.quantile(rms,.95) or 1)).clip(0,1)
  tracks[file.stem]=[max(8,round(float(x)*100)) for x in rms]
(R/'assets/audio/waveforms.json').write_text(json.dumps(tracks,indent=2))
(R/'assets/audio/waveforms.js').write_text('window.SKY_AUDIO_WAVES = '+json.dumps(tracks)+';\n')
print('Audio waveforms',len(tracks),'tracks')
