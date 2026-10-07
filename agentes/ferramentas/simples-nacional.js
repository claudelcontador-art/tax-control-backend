// Cálculo do DAS do Simples Nacional pelas tabelas da LC 123/2006 (redação da LC 155/2016).
// Alíquota efetiva = (RBT12 x alíquota nominal - parcela a deduzir) / RBT12.

const ANEXOS = {
  I: {
    descricao: 'Comércio',
    faixas: [
      [180000, 0.04, 0],
      [360000, 0.073, 5940],
      [720000, 0.095, 13860],
      [1800000, 0.107, 22500],
      [3600000, 0.143, 87300],
      [4800000, 0.19, 378000],
    ],
  },
  II: {
    descricao: 'Indústria',
    faixas: [
      [180000, 0.045, 0],
      [360000, 0.078, 5940],
      [720000, 0.1, 13860],
      [1800000, 0.112, 22500],
      [3600000, 0.147, 85500],
      [4800000, 0.3, 720000],
    ],
  },
  III: {
    descricao: 'Serviços (inclusive atividades do Anexo V com Fator R >= 28%)',
    faixas: [
      [180000, 0.06, 0],
      [360000, 0.112, 9360],
      [720000, 0.135, 17640],
      [1800000, 0.16, 35640],
      [3600000, 0.21, 125640],
      [4800000, 0.33, 648000],
    ],
  },
  IV: {
    descricao: 'Serviços com CPP recolhida à parte (limpeza, vigilância, obras, advocacia)',
    faixas: [
      [180000, 0.045, 0],
      [360000, 0.09, 8100],
      [720000, 0.102, 12420],
      [1800000, 0.14, 39780],
      [3600000, 0.22, 183780],
      [4800000, 0.33, 828000],
    ],
  },
  V: {
    descricao: 'Serviços intelectuais/técnicos com Fator R < 28%',
    faixas: [
      [180000, 0.155, 0],
      [360000, 0.18, 4500],
      [720000, 0.195, 9900],
      [1800000, 0.205, 17100],
      [3600000, 0.23, 62100],
      [4800000, 0.305, 540000],
    ],
  },
};

const LIMITE_SIMPLES = 4800000;
const SUBLIMITE_ICMS_ISS = 3600000;

function arred(valor, casas = 2) {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

function calcularDAS({ rbt12, receita_mes, anexo, folha_12_meses }) {
  rbt12 = Number(rbt12);
  receita_mes = Number(receita_mes);
  const avisos = [];
  let anexoAplicado = String(anexo || '').toUpperCase();

  if (!(rbt12 >= 0) || !(receita_mes >= 0)) {
    return { erro: 'rbt12 e receita_mes devem ser números não negativos.' };
  }

  let fatorR = null;
  if (folha_12_meses !== undefined && folha_12_meses !== null && rbt12 > 0) {
    fatorR = Number(folha_12_meses) / rbt12;
    if (anexoAplicado === 'V' && fatorR >= 0.28) {
      anexoAplicado = 'III';
      avisos.push(`Fator R de ${arred(fatorR * 100)}% (>= 28%): tributação deslocada do Anexo V para o Anexo III.`);
    } else if (anexoAplicado === 'III' && fatorR < 0.28) {
      avisos.push(`Fator R de ${arred(fatorR * 100)}% (< 28%): confirme se a atividade está sujeita ao Fator R; se estiver, a tributação vai para o Anexo V.`);
    }
  }

  const tabela = ANEXOS[anexoAplicado];
  if (!tabela) return { erro: `Anexo inválido: ${anexo}. Use I, II, III, IV ou V.` };

  if (rbt12 > LIMITE_SIMPLES) {
    avisos.push('RBT12 acima de R$ 4.800.000,00: empresa excluída do Simples Nacional. Verifique o desenquadramento.');
  } else if (rbt12 > SUBLIMITE_ICMS_ISS) {
    avisos.push('RBT12 acima do sublimite de R$ 3.600.000,00: ICMS e ISS devem ser recolhidos fora do DAS.');
  }

  // Empresa em início de atividade (RBT12 zero) usa a alíquota nominal da 1ª faixa.
  const base = rbt12 === 0 ? 0 : Math.min(rbt12, LIMITE_SIMPLES);
  const indice = tabela.faixas.findIndex(([teto]) => base <= teto);
  const [teto, aliquotaNominal, deducao] = tabela.faixas[indice === -1 ? tabela.faixas.length - 1 : indice];

  const aliquotaEfetiva = base === 0 ? aliquotaNominal : (base * aliquotaNominal - deducao) / base;
  if (rbt12 === 0) avisos.push('RBT12 zerado (início de atividade): usada a alíquota nominal da 1ª faixa. Confirme a proporcionalização do art. 22 da Resolução CGSN 140/2018.');

  return {
    anexo: anexoAplicado,
    descricao_anexo: tabela.descricao,
    faixa: indice + 1,
    teto_faixa: teto,
    aliquota_nominal_pct: arred(aliquotaNominal * 100, 4),
    parcela_deduzir: deducao,
    aliquota_efetiva_pct: arred(aliquotaEfetiva * 100, 4),
    fator_r_pct: fatorR === null ? null : arred(fatorR * 100, 2),
    receita_mes,
    valor_das: arred(receita_mes * aliquotaEfetiva),
    avisos,
    fundamento: 'LC 123/2006, art. 18, com redação da LC 155/2016; Resolução CGSN 140/2018.',
  };
}

module.exports = { calcularDAS, ANEXOS };
