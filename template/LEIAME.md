# Modelo de Reel animado – Claudel Contador
- `anim.html`: 6 cenas animadas (gancho com foto, número grande, carimbo, calendário, alerta, CTA com foto). Topo com a logomarca e barra verde fixa com o WhatsApp (75) 98149-4989.
- `render.js`: `node render.js <pasta> 30` renderiza os quadros. As durações de cada cena saem do tamanho de cada frase da narração (array `seg`) e da duração do áudio (`AUDIO`).
- Para um tema novo: troque os textos das cenas em `anim.html`, as frases em `seg` e `AUDIO`. Mantenha o gancho nos 2 primeiros segundos, a logomarca e o WhatsApp.
- Depois: `npm i @fontsource/anton@5.0.8 @fontsource/montserrat@5.0.8`, render, `ffmpeg -framerate 30 -i f%05d.jpg -c:v libx264 -pix_fmt yuv420p`, push para este branch, `vidiq_video_upload` (url raw) e `vidiq_compose` (cena de vídeo + voiceover).

## Com a voz do dono (sem créditos)
1. Ele envia o áudio (ogg/m4a/mp3). `python3 sync_audio.py <audio> 6` → gera `voz.m4a` e imprime DURS (as 5 pausas mais longas viram os cortes de cena). Confira se as durações fazem sentido com o roteiro.
2. `DURS='[...]' node render.js fr 30`, codifique o mp4 mudo e junte o áudio: `ffmpeg -i mudo.mp4 -i voz.m4a -c:v copy -c:a aac -shortest -movflags +faststart final.mp4` (a última cena tem 1,8 s extra; use `-af apad` no áudio para não cortar o vídeo).
3. Hospede: push para este branch → `vidiq_video_upload` (grátis) com a URL raw → use o videoUrl no Metricool.

## Só texto (plano B)
Sem narração: DURS='[3.5,5,5,6,4.5,5.5]' (mais tempo para ler). Sem áudio, ou com música via instagramData.audioConfiguration (se o Instagram recusar, publique sem música).
