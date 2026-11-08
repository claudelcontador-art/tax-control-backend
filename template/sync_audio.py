"""Mede onde cada cena começa num áudio gravado pelo dono.
uso: python3 sync_audio.py audio.(ogg|m4a|mp3|wav) [n_cenas=6]
Converte para voz.m4a (limpa, normalizada) e imprime DURS em JSON para o render.js.
Corta nas n-1 pausas mais longas do áudio; a última cena ganha 1,8 s extra."""
import subprocess, re, sys, json
src = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
subprocess.run(['ffmpeg','-v','error','-y','-i',src,'-af','highpass=f=80,loudnorm=I=-14:TP=-1.5,silenceremove=start_periods=1:start_threshold=-45dB','-ac','1','-ar','44100','-c:a','aac','-b:a','160k','voz.m4a'],check=True)
dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','voz.m4a'],capture_output=True,text=True).stdout)
log = subprocess.run(['ffmpeg','-i','voz.m4a','-af','silencedetect=n=-38dB:d=0.25','-f','null','-'],capture_output=True,text=True).stderr
st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
en = [float(x) for x in re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', log) and [m[0] for m in re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', log)]]
gaps = sorted([(e - s, (s + e) / 2) for s, e in zip(st, en) if e < dur - 0.3], reverse=True)[:n-1]
cuts = sorted(c for _, c in gaps)
edges = [0] + cuts + [dur]
D = [round(edges[i+1] - edges[i], 2) for i in range(len(edges)-1)]
D[-1] = round(D[-1] + 1.8, 2)
print(json.dumps(D)); print('duracao_audio', round(dur, 2), file=sys.stderr)
