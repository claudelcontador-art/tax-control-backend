const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Iniciar a ligação ao Supabase com as chaves do ficheiro .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/api/status', (req, res) => {
  res.json({ status: 'TAX CONTROL BI PRO 8.1 - Conectado ao Supabase' });
});

// Rota para ler os dados reais da nuvem
app.get('/api/clientes', async (req, res) => {
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} conectado ao Supabase`));