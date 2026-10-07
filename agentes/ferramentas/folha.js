// Cálculos de folha com tabelas configuráveis.
// ATENÇÃO: as tabelas mudam todo ano (salário mínimo, teto do INSS, faixas do IR).
// Atualize TABELAS ao virar o ano ou quando sair portaria nova.

const TABELAS = {
  inss: {
    vigencia: '2025-01',
    fundamento: 'Portaria Interministerial MPS/MF nº 6/2025',
    faixas: [
      [1518.0, 0.075],
      [2793.88, 0.09],
      [4190.83, 0.12],
      [8157.41, 0.14],
    ],
  },
  irrf: {
    vigencia: '2026-01',
    fundamento: 'Lei 9.250/1995 (tabela vigente desde 05/2025) com a redução da Lei 15.270/2025',
    faixas: [
      [2428.8, 0, 0],
      [2826.65, 0.075, 182.16],
      [3751.05, 0.15, 394.16],
      [4664.68, 0.225, 675.49],
      [Infinity, 0.275, 908.73],
    ],
    deducao_dependente: 189.59,
    desconto_simplificado: 607.2,
    // Redução mensal: zera o imposto até R$ 5.000; entre 5.000,01 e 7.350 reduz parcialmente.
    reducao: { isento_ate: 5000, limite: 7350, constante: 978.62, fator: 0.133145 },
  },
};

const arred = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

function calcularINSS(salario) {
  let anterior = 0;
  let total = 0;
  const detalhe = [];
  for (const [teto, aliquota] of TABELAS.inss.faixas) {
    if (salario <= anterior) break;
    const base = Math.min(salario, teto) - anterior;
    const valor = base * aliquota;
    detalhe.push({ faixa_ate: teto, base: arred(base), aliquota_pct: aliquota * 100, valor: arred(valor) });
    total += valor;
    anterior = teto;
  }
  return { valor: arred(total), detalhe, teto_atingido: salario > anterior };
}

function calcularIRRF(base) {
  const t = TABELAS.irrf;
  const faixa = t.faixas.find(([teto]) => base <= teto);
  const imposto = Math.max(0, base * faixa[1] - faixa[2]);
  return { aliquota_pct: faixa[1] * 100, deducao: faixa[2], imposto: arred(imposto) };
}

function calcularDescontosFolha({ salario_bruto, dependentes = 0, pensao_alimenticia = 0, outros_descontos_legais = 0 }) {
  const bruto = Number(salario_bruto);
  if (!(bruto >= 0)) return { erro: 'salario_bruto deve ser um número não negativo.' };

  const inss = calcularINSS(bruto);
  const t = TABELAS.irrf;

  const deducoesLegais = inss.valor + Number(dependentes) * t.deducao_dependente + Number(pensao_alimenticia) + Number(outros_descontos_legais);
  const baseLegal = Math.max(0, bruto - deducoesLegais);
  const baseSimplificada = Math.max(0, bruto - t.desconto_simplificado);

  const irLegal = calcularIRRF(baseLegal);
  const irSimpl = calcularIRRF(baseSimplificada);
  const usarSimplificado = irSimpl.imposto < irLegal.imposto;
  const escolhido = usarSimplificado ? irSimpl : irLegal;

  // Redução da Lei 15.270/2025, calculada sobre os rendimentos tributáveis do mês.
  let reducao = 0;
  const r = t.reducao;
  if (bruto <= r.isento_ate) reducao = escolhido.imposto;
  else if (bruto <= r.limite) reducao = Math.max(0, Math.min(escolhido.imposto, r.constante - r.fator * bruto));
  const irrf = arred(Math.max(0, escolhido.imposto - reducao));

  const fgts = arred(bruto * 0.08);
  const liquido = arred(bruto - inss.valor - irrf - Number(pensao_alimenticia) - Number(outros_descontos_legais));

  const anoAtual = new Date().getFullYear();
  const avisos = [];
  if (!TABELAS.inss.vigencia.startsWith(String(anoAtual))) {
    avisos.push(`Tabela do INSS configurada é de ${TABELAS.inss.vigencia}. Confirme se houve reajuste para ${anoAtual} e atualize agentes/ferramentas/folha.js.`);
  }

  return {
    salario_bruto: bruto,
    inss: { valor: inss.valor, detalhe: inss.detalhe, vigencia: TABELAS.inss.vigencia },
    irrf: {
      base_calculo: arred(usarSimplificado ? baseSimplificada : baseLegal),
      metodo: usarSimplificado ? 'desconto simplificado' : 'deduções legais',
      aliquota_pct: escolhido.aliquota_pct,
      imposto_tabela: escolhido.imposto,
      reducao_lei_15270: arred(reducao),
      valor: irrf,
      vigencia: t.vigencia,
    },
    fgts_empregador: fgts,
    salario_liquido: liquido,
    avisos,
  };
}

module.exports = { calcularDescontosFolha, calcularINSS, calcularIRRF, TABELAS };
