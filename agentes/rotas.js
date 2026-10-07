// Rotas HTTP dos agentes.
const express = require('express');
const { FRENTES, buscarAgente, listarAgentes } = require('./catalogo');
const { executarAgente, MODELO } = require('./executor');
const ferramentas = require('./ferramentas');

function criarRotas({ supabase }) {
  const router = express.Router();

  // Se API_TOKEN estiver definido, as rotas que gastam créditos ou expõem dados exigem o cabeçalho x-api-token.
  function exigirToken(req, res, next) {
    const token = process.env.API_TOKEN;
    if (!token || req.get('x-api-token') === token) return next();
    return res.status(401).json({ error: 'Token inválido. Envie o cabeçalho x-api-token.' });
  }

  async function registrarExecucao(dados) {
    if (!supabase) return;
    const { error } = await supabase.from('execucoes_agentes').insert([dados]);
    if (error) console.warn('Não foi possível registrar a execução do agente:', error.message);
  }

  async function rodar(req, res, idOuNome) {
    const agente = buscarAgente(idOuNome);
    if (!agente) return res.status(404).json({ error: `Agente "${idOuNome}" não encontrado. Veja GET /api/agentes.` });

    const { mensagem, anexos, historico, cliente_id } = req.body || {};
    const inicio = Date.now();
    try {
      const resultado = await executarAgente({ agente, mensagem, anexos, historico, supabase });
      await registrarExecucao({
        agente_id: agente.id,
        cliente_id: cliente_id ? String(cliente_id) : null,
        pedido: String(mensagem).slice(0, 10000),
        resposta: resultado.resposta,
        status: resultado.status,
        ferramentas_usadas: resultado.ferramentas_usadas,
        tokens_entrada: resultado.uso.input_tokens,
        tokens_saida: resultado.uso.output_tokens,
        duracao_ms: Date.now() - inicio,
      });
      return res.json(resultado);
    } catch (e) {
      console.error(`Erro ao executar ${agente.id}:`, e);
      // e.status vem de erros de entrada (400) ou da API do Claude (401, 429, 5xx...).
      return res.status(e.status || 500).json({ error: e.message });
    }
  }

  router.get('/agentes', (req, res) => {
    res.json({ modelo: MODELO, frentes: FRENTES, total: listarAgentes().length, agentes: listarAgentes(req.query.frente) });
  });

  router.get('/agentes/:id', (req, res) => {
    const a = buscarAgente(req.params.id);
    if (!a) return res.status(404).json({ error: 'Agente não encontrado.' });
    res.json({ ...a, frente_nome: FRENTES[a.frente] });
  });

  // Executa um agente pelo id (ex.: conferencia-nfe) ou pelo nome (ex.: "Agente Conferência").
  router.post('/agentes/:id/executar', exigirToken, (req, res) => rodar(req, res, req.params.id));

  // Mesmo comportamento, no formato usado pelo n8n: { agente, mensagem, anexos }.
  router.post('/webhook/n8n/agente', exigirToken, (req, res) => rodar(req, res, (req.body || {}).agente));

  // Executa uma ferramenta de cálculo diretamente, sem IA (sem custo de API).
  router.post('/ferramentas/:nome', exigirToken, async (req, res) => {
    const nome = req.params.nome;
    if (!ferramentas.FERRAMENTAS[nome]) {
      return res.status(404).json({ error: 'Ferramenta não encontrada.', disponiveis: Object.keys(ferramentas.FERRAMENTAS) });
    }
    const { input = {}, anexos = [] } = req.body || {};
    const ctx = {
      supabase,
      anexos: anexos.map((a) => ({ nome: a.nome, texto: a.texto ?? Buffer.from(a.conteudo_base64 || '', 'base64').toString('utf8') })),
    };
    try {
      res.json(await ferramentas.executar(nome, input, ctx));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get('/ferramentas', (req, res) => {
    res.json(Object.values(ferramentas.FERRAMENTAS).map((f) => f.definicao));
  });

  router.get('/execucoes', exigirToken, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    let q = supabase.from('execucoes_agentes').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(req.query.limite) || 50, 500));
    if (req.query.agente) q = q.eq('agente_id', req.query.agente);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Exporta os dados do sistema em JSON (usado pelo Agente Backup).
  router.get('/backup', exigirToken, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    const tabelas = ['clientes', 'execucoes_agentes'];
    const dados = {};
    for (const t of tabelas) {
      const { data, error } = await supabase.from(t).select('*');
      dados[t] = error ? { erro: error.message } : data;
    }
    const nome = `backup-tax-control-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.json({ gerado_em: new Date().toISOString(), dados });
  });

  return router;
}

module.exports = { criarRotas };
