// Calendário de obrigações federais com ajuste para fins de semana e feriados nacionais.
// Os prazos seguem a regra geral; confirme sempre com a legislação vigente e com
// eventuais prorrogações publicadas pela Receita Federal, estados e municípios.

function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data, dias) {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

const iso = (d) => d.toISOString().slice(0, 10);

// Feriados nacionais e dias sem expediente bancário (Carnaval e Corpus Christi).
function feriados(ano) {
  const p = pascoa(ano);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
    .map((md) => `${ano}-${md}`);
  const moveis = [somarDias(p, -48), somarDias(p, -47), somarDias(p, -2), somarDias(p, 60)].map(iso);
  return new Set([...fixos, ...moveis]);
}

function diaUtil(data) {
  const dow = data.getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados(data.getUTCFullYear()).has(iso(data));
}

function ajustar(data, regra) {
  let d = new Date(data);
  const passo = regra === 'antecipa' ? -1 : 1;
  while (!diaUtil(d)) d = somarDias(d, passo);
  return d;
}

function ultimoDiaUtil(ano, mes) {
  return ajustar(new Date(Date.UTC(ano, mes, 0)), 'antecipa'); // mes 1-12; dia 0 do mês seguinte
}

function enesimoDiaUtil(ano, mes, n) {
  let d = new Date(Date.UTC(ano, mes - 1, 1));
  let cont = diaUtil(d) ? 1 : 0;
  while (cont < n) {
    d = somarDias(d, 1);
    if (diaUtil(d)) cont++;
  }
  return d;
}

// Obrigações mensais: "meses" = quantos meses após a competência vence.
const MENSAIS = [
  { obrigacao: 'DAS - Simples Nacional', regimes: ['simples'], dia: 20, meses: 1, ajuste: 'prorroga' },
  { obrigacao: 'DAS-MEI', regimes: ['mei'], dia: 20, meses: 1, ajuste: 'prorroga' },
  { obrigacao: 'eSocial - eventos periódicos (folha)', regimes: ['todos'], dia: 15, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'EFD-Reinf', regimes: ['todos'], dia: 15, meses: 1, ajuste: 'prorroga' },
  { obrigacao: 'DCTFWeb (transmissão)', regimes: ['todos'], dia: 15, meses: 1, ajuste: 'prorroga' },
  { obrigacao: 'DARF Previdenciário (DCTFWeb)', regimes: ['todos'], dia: 20, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'FGTS Digital', regimes: ['todos'], dia: 20, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'IRRF (folha e serviços)', regimes: ['todos'], dia: 20, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'PIS/COFINS', regimes: ['presumido', 'real'], dia: 25, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'CSRF (PIS/COFINS/CSLL retidos)', regimes: ['todos'], dia: 20, meses: 1, ajuste: 'antecipa' },
  { obrigacao: 'IRPJ/CSLL - estimativa mensal', regimes: ['real'], ultimoDiaUtil: true, meses: 1 },
  { obrigacao: 'EFD-Contribuições', regimes: ['presumido', 'real'], diaUtil: 10, meses: 2 },
];

// Obrigações anuais: mês de vencimento e regra.
const ANUAIS = [
  { obrigacao: 'DIMOB / DMED', regimes: ['todos'], mes: 2, ultimoDiaUtil: true },
  { obrigacao: 'DEFIS (Simples Nacional)', regimes: ['simples'], mes: 3, dia: 31, ajuste: 'prorroga' },
  { obrigacao: 'DASN-SIMEI', regimes: ['mei'], mes: 5, dia: 31, ajuste: 'prorroga' },
  { obrigacao: 'DIRPF (pessoa física)', regimes: ['pf'], mes: 5, ultimoDiaUtil: true },
  { obrigacao: 'ECD', regimes: ['presumido', 'real'], mes: 6, ultimoDiaUtil: true },
  { obrigacao: 'ECF', regimes: ['presumido', 'real'], mes: 7, ultimoDiaUtil: true },
];

const TRIMESTRAIS = [
  { obrigacao: 'IRPJ/CSLL trimestral (quota única ou 1ª quota)', regimes: ['presumido', 'real'] },
];

function aplicaRegime(item, regime) {
  return !regime || item.regimes.includes('todos') || item.regimes.includes(regime);
}

function proximosPrazos({ competencia, regime }) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(competencia || ''));
  if (!m) return { erro: 'Informe a competência no formato AAAA-MM.' };
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  regime = regime ? String(regime).toLowerCase() : null;

  const prazos = [];
  for (const o of MENSAIS.filter((x) => aplicaRegime(x, regime))) {
    const alvo = new Date(Date.UTC(ano, mes - 1 + o.meses, 1));
    const a = alvo.getUTCFullYear();
    const mm = alvo.getUTCMonth() + 1;
    let venc;
    if (o.ultimoDiaUtil) venc = ultimoDiaUtil(a, mm);
    else if (o.diaUtil) venc = enesimoDiaUtil(a, mm, o.diaUtil);
    else venc = ajustar(new Date(Date.UTC(a, mm - 1, o.dia)), o.ajuste);
    prazos.push({ obrigacao: o.obrigacao, competencia, vencimento: iso(venc) });
  }

  if (mes % 3 === 0) {
    for (const o of TRIMESTRAIS.filter((x) => aplicaRegime(x, regime))) {
      const venc = ultimoDiaUtil(mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1);
      prazos.push({ obrigacao: o.obrigacao, competencia: `${ano}-T${mes / 3}`, vencimento: iso(venc) });
    }
  }

  // Anuais que vencem no mês seguinte à competência (janela de aviso).
  const prox = new Date(Date.UTC(ano, mes, 1));
  for (const o of ANUAIS.filter((x) => aplicaRegime(x, regime) && x.mes === prox.getUTCMonth() + 1)) {
    const a = prox.getUTCFullYear();
    const venc = o.ultimoDiaUtil ? ultimoDiaUtil(a, o.mes) : ajustar(new Date(Date.UTC(a, o.mes - 1, o.dia)), o.ajuste);
    prazos.push({ obrigacao: o.obrigacao, competencia: `ano-calendário ${a - 1}`, vencimento: iso(venc) });
  }

  prazos.sort((x, y) => x.vencimento.localeCompare(y.vencimento));
  return {
    competencia,
    regime: regime || 'todos',
    prazos,
    aviso: 'Datas calculadas pela regra geral com feriados nacionais. Confira feriados estaduais/municipais, prazos de ICMS/ISS e prorrogações publicadas.',
  };
}

module.exports = { proximosPrazos, diaUtil, feriados, pascoa };
