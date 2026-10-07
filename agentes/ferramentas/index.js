// Ferramentas que os agentes podem chamar. Cálculos com regra fixa (DAS, INSS, IRRF,
// dígitos verificadores, prazos) são feitos aqui em código, não pela IA, para não errar conta.
const { calcularDAS } = require('./simples-nacional');
const { analisarNFe } = require('./nfe');
const { validarDocumento } = require('./documentos');
const { proximosPrazos } = require('./prazos');
const { calcularDescontosFolha } = require('./folha');
const { lerExtratoOFX } = require('./extrato');

function localizarAnexo(ctx, referencia) {
  const anexos = ctx.anexos || [];
  if (referencia === undefined || referencia === null) return null;
  const idx = Number(referencia);
  if (Number.isInteger(idx) && anexos[idx]) return anexos[idx];
  return anexos.find((a) => a.nome === referencia) || null;
}

const FERRAMENTAS = {
  calcular_das: {
    definicao: {
      name: 'calcular_das',
      description:
        'Calcula a alíquota efetiva e o valor do DAS do Simples Nacional pelas tabelas da LC 123/2006. ' +
        'Use sempre que precisar do valor do DAS, em vez de fazer a conta de cabeça. Aplica o Fator R quando folha_12_meses for informada.',
      input_schema: {
        type: 'object',
        properties: {
          rbt12: { type: 'number', description: 'Receita bruta acumulada dos 12 meses anteriores ao período de apuração, em reais.' },
          receita_mes: { type: 'number', description: 'Receita bruta do mês de apuração, em reais.' },
          anexo: { type: 'string', enum: ['I', 'II', 'III', 'IV', 'V'], description: 'Anexo da atividade.' },
          folha_12_meses: { type: 'number', description: 'Folha de salários dos últimos 12 meses (inclui pró-labore e encargos), para o Fator R. Opcional.' },
        },
        required: ['rbt12', 'receita_mes', 'anexo'],
      },
    },
    executar: (input) => calcularDAS(input),
  },

  analisar_xml_nfe: {
    definicao: {
      name: 'analisar_xml_nfe',
      description:
        'Lê um XML de NF-e/NFC-e anexado e confere chave de acesso, situação, CFOP x tipo de operação, CST/CSOSN x regime, NCM e totais. ' +
        'Informe o índice (0, 1, 2...) ou o nome do anexo.',
      input_schema: {
        type: 'object',
        properties: { anexo: { type: 'string', description: 'Índice ou nome do arquivo XML anexado.' } },
        required: ['anexo'],
      },
    },
    executar: (input, ctx) => {
      const anexo = localizarAnexo(ctx, input.anexo);
      if (!anexo) return { erro: `Anexo "${input.anexo}" não encontrado.` };
      return analisarNFe(anexo.texto);
    },
  },

  ler_extrato_ofx: {
    definicao: {
      name: 'ler_extrato_ofx',
      description: 'Lê um extrato bancário OFX anexado e devolve os lançamentos, totais de créditos e débitos e saldo final.',
      input_schema: {
        type: 'object',
        properties: { anexo: { type: 'string', description: 'Índice ou nome do arquivo OFX anexado.' } },
        required: ['anexo'],
      },
    },
    executar: (input, ctx) => {
      const anexo = localizarAnexo(ctx, input.anexo);
      if (!anexo) return { erro: `Anexo "${input.anexo}" não encontrado.` };
      return lerExtratoOFX(anexo.texto);
    },
  },

  validar_documento: {
    definicao: {
      name: 'validar_documento',
      description: 'Valida o dígito verificador de CPF ou CNPJ (inclusive CNPJ alfanumérico).',
      input_schema: {
        type: 'object',
        properties: { documento: { type: 'string', description: 'CPF ou CNPJ, com ou sem pontuação.' } },
        required: ['documento'],
      },
    },
    executar: (input) => validarDocumento(input),
  },

  proximos_prazos: {
    definicao: {
      name: 'proximos_prazos',
      description:
        'Lista os vencimentos das obrigações federais de uma competência, já ajustados para fim de semana e feriados nacionais.',
      input_schema: {
        type: 'object',
        properties: {
          competencia: { type: 'string', description: 'Mês de competência no formato AAAA-MM.' },
          regime: { type: 'string', enum: ['mei', 'simples', 'presumido', 'real', 'pf'], description: 'Regime tributário do cliente. Opcional.' },
        },
        required: ['competencia'],
      },
    },
    executar: (input) => proximosPrazos(input),
  },

  calcular_descontos_folha: {
    definicao: {
      name: 'calcular_descontos_folha',
      description:
        'Calcula INSS progressivo do empregado, IRRF (com desconto simplificado e redução da Lei 15.270/2025), FGTS e salário líquido. ' +
        'Use para holerite, férias, 13º e rescisão sempre que precisar desses descontos.',
      input_schema: {
        type: 'object',
        properties: {
          salario_bruto: { type: 'number', description: 'Total de proventos tributáveis do mês.' },
          dependentes: { type: 'integer', description: 'Número de dependentes para IR.' },
          pensao_alimenticia: { type: 'number', description: 'Pensão alimentícia judicial descontada.' },
          outros_descontos_legais: { type: 'number', description: 'Outras deduções legais do IR (ex.: previdência oficial de outro vínculo).' },
        },
        required: ['salario_bruto'],
      },
    },
    executar: (input) => calcularDescontosFolha(input),
  },

  buscar_clientes: {
    definicao: {
      name: 'buscar_clientes',
      description: 'Consulta os clientes do escritório cadastrados no sistema (razão social, CNPJ, risco). Pode filtrar por nome ou CNPJ.',
      input_schema: {
        type: 'object',
        properties: { busca: { type: 'string', description: 'Parte do nome ou do CNPJ. Vazio lista os mais recentes.' } },
        required: [],
      },
    },
    executar: async (input, ctx) => {
      if (!ctx.supabase) return { erro: 'Banco de dados não configurado.' };
      let q = ctx.supabase.from('clientes').select('*').order('created_at', { ascending: false }).limit(50);
      const busca = String(input.busca || '').trim();
      if (busca) {
        const digitos = busca.replace(/\D/g, '');
        q = digitos.length >= 4 ? q.ilike('cnpj', `%${digitos}%`) : q.ilike('razao_social', `%${busca}%`);
      }
      const { data, error } = await q;
      if (error) return { erro: error.message };
      return { quantidade: data.length, clientes: data };
    },
  },
};

function definicoes(nomes) {
  return nomes.map((n) => {
    if (!FERRAMENTAS[n]) throw new Error(`Ferramenta desconhecida: ${n}`);
    return FERRAMENTAS[n].definicao;
  });
}

async function executar(nome, input, ctx) {
  const f = FERRAMENTAS[nome];
  if (!f) return { erro: `Ferramenta desconhecida: ${nome}` };
  return f.executar(input || {}, ctx);
}

module.exports = { FERRAMENTAS, definicoes, executar };
