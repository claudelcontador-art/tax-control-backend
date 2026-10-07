const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { criarRotas } = require('./agentes/rotas');

const app = express();
app.use(cors());
// Limite maior para aceitar anexos (XML, PDF, OFX) em base64.
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar a ligação ao Supabase com as chaves do ficheiro .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
if (!supabase) console.warn('SUPABASE_URL/SUPABASE_KEY não definidos: rotas de banco de dados ficam indisponíveis.');

app.get('/api/status', (req, res) => {
  res.json({
    status: 'TAX CONTROL BI PRO 8.1 - Conectado ao Supabase',
    supabase: Boolean(supabase),
    agentes_ia: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// Rota para ler os dados reais da nuvem
app.get('/api/clientes', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado.' });
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Erro ao buscar clientes:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// Rota Webhook para receber os dados do n8n e guardar no Supabase
app.post('/api/webhook/n8n', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Banco de dados não configurado.' });
  const { razao_social, cnpj, risco } = req.body;

  const { data, error } = await supabase
    .from('clientes')
    .insert([{ razao_social, cnpj, risco }])
    .select();

  if (error) {
    console.error("Erro ao inserir no Supabase via n8n:", error);
    return res.status(500).json({ error: error.message });
  }

  console.log("Novo dado fiscal guardado no Supabase:", data);
  res.status(200).json({ message: "Dados processados com sucesso!", cliente: data });
});

// Os 57 agentes de IA do escritório
app.use('/api', criarRotas({ supabase }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} conectado ao Supabase`));
