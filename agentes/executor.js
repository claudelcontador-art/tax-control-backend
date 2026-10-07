// Executa um agente do catálogo na API do Claude, com laço de ferramentas.
const Anthropic = require('@anthropic-ai/sdk');
const { AGENTES, FRENTES } = require('./catalogo');
const ferramentas = require('./ferramentas');

const MODELO = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_RODADAS = 12;
const LIMITE_TEXTO_ANEXO = 400000; // caracteres por anexo de texto

let cliente = null;
// Erro de entrada do usuário (vira HTTP 400).
function erroEntrada(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function claude() {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

const INSTRUCOES_GERAIS = `Você é um agente de IA de um escritório de contabilidade no Brasil e trabalha para os contadores do escritório (não diretamente para o cliente final, a não ser quando pedirem um texto para enviar ao cliente).

Como trabalhar:
- Responda em português do Brasil, com a terminologia contábil e fiscal brasileira.
- Faça contas com as ferramentas sempre que existir uma para aquele cálculo (DAS, INSS, IRRF, prazos, dígitos de CPF/CNPJ, leitura de XML e OFX). Para outros cálculos, mostre a memória de cálculo para que o contador possa conferir.
- Cite a base legal (lei, IN, resolução) quando ela sustentar a resposta. Se não tiver certeza de um número, alíquota ou prazo, diga isso claramente e indique onde confirmar; não invente.
- Se faltar informação essencial, faça o que der com o que foi informado, declare as premissas que adotou e liste o que falta.
- Legislação estadual e municipal varia: deixe explícito quando uma resposta depende da UF ou do município.
- Prefira tabelas para valores e listas curtas para pendências. Seja direto; o contador está com pressa.
- Seu trabalho é revisado por um contador responsável antes de ir para o cliente ou para o fisco. Termine com uma linha "Conferir antes de enviar:" listando os pontos que exigem validação humana, quando houver.`;

function catalogoResumido() {
  return AGENTES.map((a) => `- ${a.id} | ${a.nome} | ${FRENTES[a.frente]} | ${a.descricao}`).join('\n');
}

function montarSistema(agente) {
  let especifico = `# Seu papel: ${agente.nome} (${FRENTES[agente.frente]})\n\n${agente.instrucoes}`;
  if (agente.id === 'coordenador') {
    especifico += `\n\nAgentes disponíveis (id | nome | frente | descrição):\n${catalogoResumido()}`;
  }
  return [
    { type: 'text', text: INSTRUCOES_GERAIS },
    { type: 'text', text: especifico, cache_control: { type: 'ephemeral' } },
  ];
}

const TIPOS_TEXTO = /\.(xml|ofx|csv|txt|json|md|sped|tsv)$/i;

function decodificar(base64) {
  const buf = Buffer.from(base64, 'base64');
  const utf8 = buf.toString('utf8');
  // Arquivos de SPED e OFX costumam vir em ISO-8859-1; se o UTF-8 quebrar, usa latin1.
  return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

// Converte os anexos recebidos em blocos de conteúdo e em textos para as ferramentas.
function prepararAnexos(anexos = []) {
  const blocos = [];
  const paraFerramentas = [];
  const listagem = [];

  anexos.forEach((a, i) => {
    const nome = a.nome || `anexo-${i}`;
    const tipo = a.tipo || '';
    if (!a.conteudo_base64) throw erroEntrada(`Anexo "${nome}" sem conteudo_base64.`);

    if (tipo === 'application/pdf' || /\.pdf$/i.test(nome)) {
      blocos.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.conteudo_base64 }, title: nome });
      listagem.push(`[${i}] ${nome} (PDF, incluído acima)`);
    } else if (/^image\/(png|jpeg|gif|webp)$/.test(tipo)) {
      blocos.push({ type: 'image', source: { type: 'base64', media_type: tipo, data: a.conteudo_base64 } });
      listagem.push(`[${i}] ${nome} (imagem, incluída acima)`);
    } else if (TIPOS_TEXTO.test(nome) || tipo.startsWith('text/') || /xml|json/.test(tipo)) {
      const texto = decodificar(a.conteudo_base64);
      if (texto.length > LIMITE_TEXTO_ANEXO) {
        throw erroEntrada(`Anexo "${nome}" tem ${texto.length} caracteres, acima do limite de ${LIMITE_TEXTO_ANEXO}. Divida o arquivo.`);
      }
      paraFerramentas[i] = { nome, texto };
      if (/\.(xml|ofx)$/i.test(nome) || /<\?xml|<OFX>|OFXHEADER/i.test(texto.slice(0, 500))) {
        // XML e OFX são lidos pelas ferramentas, para não gastar contexto com o arquivo bruto.
        listagem.push(`[${i}] ${nome} (${/\.ofx$/i.test(nome) || /OFX/i.test(texto.slice(0, 500)) ? 'extrato OFX: use ler_extrato_ofx' : 'XML: use analisar_xml_nfe'})`);
      } else {
        blocos.push({ type: 'text', text: `<anexo indice="${i}" nome="${nome}">\n${texto}\n</anexo>` });
        listagem.push(`[${i}] ${nome} (texto, incluído acima)`);
      }
    } else {
      throw erroEntrada(`Tipo de anexo não suportado: ${nome} (${tipo}). Use PDF, imagem, XML, OFX, CSV ou TXT.`);
    }
  });

  return { blocos, paraFerramentas, listagem };
}

function textoDaResposta(conteudo) {
  return conteudo.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

/**
 * Executa um agente.
 * @param {object} p
 * @param {object} p.agente     item do catálogo
 * @param {string} p.mensagem   pedido do usuário
 * @param {Array}  p.anexos     [{ nome, tipo, conteudo_base64 }]
 * @param {Array}  p.historico  mensagens devolvidas por uma execução anterior (para continuar a conversa)
 * @param {object} p.supabase   cliente Supabase (para ferramentas que consultam o banco)
 */
async function executarAgente({ agente, mensagem, anexos = [], historico = [], supabase = null }) {
  if (!mensagem || !String(mensagem).trim()) throw erroEntrada('Envie a mensagem com o pedido para o agente.');

  const { blocos, paraFerramentas, listagem } = prepararAnexos(anexos);
  const conteudoUsuario = [...blocos];
  let texto = String(mensagem);
  if (listagem.length) texto += `\n\nAnexos desta mensagem:\n${listagem.join('\n')}`;
  conteudoUsuario.push({ type: 'text', text: texto });

  // As ferramentas enxergam só os anexos da mensagem atual; para reanalisar um arquivo, anexe de novo.
  const ctx = { anexos: paraFerramentas, supabase };
  const messages = [...historico, { role: 'user', content: conteudoUsuario }];
  const tools = ferramentas.definicoes(agente.ferramentas);
  const ferramentasUsadas = [];
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  let status = 'concluido';

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const resposta = await claude().beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: agente.esforco || 'medium' },
      system: montarSistema(agente),
      ...(tools.length ? { tools } : {}),
      messages,
    });

    uso.input_tokens += resposta.usage.input_tokens || 0;
    uso.output_tokens += resposta.usage.output_tokens || 0;
    uso.cache_read_input_tokens += resposta.usage.cache_read_input_tokens || 0;

    // Mantém o conteúdo completo (inclusive blocos de raciocínio) para a próxima chamada.
    messages.push({ role: 'assistant', content: resposta.content });

    if (resposta.stop_reason === 'refusal') {
      status = 'recusado';
      break;
    }
    if (resposta.stop_reason === 'pause_turn') continue;
    if (resposta.stop_reason !== 'tool_use') {
      if (resposta.stop_reason === 'max_tokens') status = 'resposta_truncada';
      break;
    }

    const chamadas = resposta.content.filter((b) => b.type === 'tool_use');
    const resultados = await Promise.all(
      chamadas.map(async (c) => {
        let saida;
        let erro = false;
        try {
          saida = await ferramentas.executar(c.name, c.input, ctx);
          erro = Boolean(saida && saida.erro);
        } catch (e) {
          saida = { erro: e.message };
          erro = true;
        }
        ferramentasUsadas.push({ ferramenta: c.name, entrada: c.input, erro });
        return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(saida), is_error: erro };
      }),
    );
    messages.push({ role: 'user', content: resultados });

    if (rodada === MAX_RODADAS - 1) status = 'limite_de_rodadas';
  }

  const ultima = messages[messages.length - 1];
  const resposta = ultima.role === 'assistant' ? textoDaResposta(ultima.content) : '';

  return {
    agente: { id: agente.id, nome: agente.nome, frente: FRENTES[agente.frente] },
    status,
    resposta: status === 'recusado' && !resposta ? 'O modelo recusou este pedido. Reformule a solicitação.' : resposta,
    ferramentas_usadas: ferramentasUsadas,
    uso,
    historico: messages,
  };
}

module.exports = { executarAgente, MODELO, INSTRUCOES_GERAIS };
