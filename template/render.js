// usage: node render.js <outdir> <fps> [onlyTimes comma]
const { chromium } = require('playwright');
const path = require('path');
const seg = [
  'Para tudo! Se você é MEI, um único boleto atrasado pode cancelar o perdão da sua dívida.',
  'A Lei Complementar duzentos e trinta e oito perdoa cem por cento do INSS do MEI vencido até treze de outubro.',
  'Mas tem uma pegadinha: atrasou um DAS, o perdão cai, e a dívida volta inteira.',
  'A portaria fala dos boletos de janeiro a junho de dois mil e vinte e sete. Pra não correr risco: pague todo DAS em dia, de agora até julho.',
  'E cuidado: o ICMS e o ISS do boleto não são perdoados.',
  'Comenta DAS, que eu te mando o calendário. Ou me chama no WhatsApp!',
];
const AUDIO = 37.07, TAIL = 1.8;
const w = seg.map(s => s.length + 10);
const sum = w.reduce((a, b) => a + b, 0);
const D = w.map(x => AUDIO * x / sum); D[5] += TAIL;
const out = process.argv[2], fps = +process.argv[3] || 30, only = process.argv[4];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.addInitScript(d => { window.DUR = d; }, D);
  await p.goto('file://' + path.resolve(__dirname, 'anim.html'));
  await p.evaluate(() => document.fonts.ready);
  const total = D.reduce((a, b) => a + b, 0);
  console.log('durations', D.map(x => x.toFixed(2)).join(','), 'total', total.toFixed(2));
  const times = only ? only.split(',').map(Number) : [...Array(Math.round(total * fps)).keys()].map(i => i / fps);
  let i = 0;
  for (const t of times) {
    await p.evaluate(t => window.render(t), t);
    await p.screenshot({ path: `${out}/f${String(i++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
  }
  await b.close();
})();
