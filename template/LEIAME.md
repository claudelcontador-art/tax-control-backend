# Modelo de Reel animado – Claudel Contador
- `anim.html`: 6 cenas animadas (gancho com foto, número grande, carimbo, calendário, alerta, CTA com foto). Topo com a logomarca e barra verde fixa com o WhatsApp (75) 98149-4989.
- `render.js`: `node render.js <pasta> 30` renderiza os quadros. As durações de cada cena saem do tamanho de cada frase da narração (array `seg`) e da duração do áudio (`AUDIO`).
- Para um tema novo: troque os textos das cenas em `anim.html`, as frases em `seg` e `AUDIO`. Mantenha o gancho nos 2 primeiros segundos, a logomarca e o WhatsApp.
- Depois: `npm i @fontsource/anton@5.0.8 @fontsource/montserrat@5.0.8`, render, `ffmpeg -framerate 30 -i f%05d.jpg -c:v libx264 -pix_fmt yuv420p`, push para este branch, `vidiq_video_upload` (url raw) e `vidiq_compose` (cena de vídeo + voiceover).
