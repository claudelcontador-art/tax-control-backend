# TAX CONTROL BI PRO: Backend e 57 agentes de IA

Backend em Express e Supabase com **57 agentes de IA** para o escritório contábil. São 6 frentes:

| Frente | Agentes |
|---|---|
| Apuração & Tributário (11) | DAS Simples, ICMS, ISS, PIS/COFINS, IRPJ/CSLL, Conferência de Guia, Conferência de NF-e, ICMS-ST e DIFAL, Retenções, Planejamento Tributário, Reforma Tributária |
| Obrigações Acessórias (11) | SPED Fiscal, EFD-Contribuições, ECD, ECF, DCTFWeb, EFD-Reinf, eSocial, DEFIS/DASN-SIMEI, Declarações Municipais, Certidões, IRPF |
| Folha & Dep. Pessoal (10) | Holerite, Férias e 13º, Rescisão, INSS/FGTS, Admissão, Pró-labore, Ponto e Horas Extras, Benefícios, Afastamentos, Convenção Coletiva |
| Conciliação & Financeiro (9) | Conciliação Bancária, Cobrança de Honorários, DRE Mensal, Fluxo de Caixa, Contas a Pagar/Receber, Classificação Contábil, Análise de Balancete, Indicadores, Precificação de Honorários |
| Atendimento ao Cliente (8) | Triagem WhatsApp, Documentos Pendentes, Onboarding, Follow-up, Dúvidas do Cliente, Comunicados, Satisfação, Societário |
| Operação Interna (8) | Cadastro de NF, Lembrete de Prazo, Relatório Mensal, Backup, Coordenador, Revisor, Gestão de Tarefas, Procedimentos (POP) |

A lista completa, com as instruções de cada agente, está em [`agentes/catalogo.js`](agentes/catalogo.js).

## Como funciona

- Cada agente é o Claude (`claude-opus-5-5`) com instruções específicas da sua função.
- **As contas com regra fixa ficam no código, não na IA.** Os agentes usam ferramentas determinísticas, que têm testes:
  - `calcular_das`: Simples Nacional, Anexos I a V, Fator R, sublimite.
  - `analisar_xml_nfe`: chave de acesso, situação, CFOP x operação, CST/CSOSN x regime, NCM e totais.
  - `ler_extrato_ofx`: lançamentos e totais do extrato bancário.
  - `calcular_descontos_folha`: INSS progressivo, IRRF com a redução da Lei 15.270/2025, FGTS e líquido.
  - `proximos_prazos`: vencimentos federais ajustados para fins de semana e feriados nacionais.
  - `validar_documento`: CPF e CNPJ, inclusive o CNPJ alfanumérico.
  - `buscar_clientes`: consulta a tabela `clientes` do Supabase.
- Toda resposta termina com "Conferir antes de enviar". **Os agentes ajudam, mas o contador responsável revisa antes de a entrega ir para o cliente ou para o fisco.**

## Instalação

```bash
npm install
cp .env.example .env    # preencha SUPABASE_URL, SUPABASE_KEY e ANTHROPIC_API_KEY
npm test                # testa as ferramentas de cálculo
npm start
```

No Supabase, rode `supabase/migrations/001_execucoes_agentes.sql` para criar o histórico de execuções.

Depois abra **http://localhost:5000** para usar o painel: escolha o agente, escreva o pedido, anexe arquivos (XML, OFX, PDF, CSV, imagem) e envie.

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/agentes?frente=tributario` | Lista os agentes, com filtro opcional por frente |
| GET | `/api/agentes/:id` | Detalhes e instruções de um agente |
| POST | `/api/agentes/:id/executar` | Executa um agente |
| POST | `/api/webhook/n8n/agente` | Executa um agente a partir do n8n: `{ "agente": "conferencia-nfe", "mensagem": "...", "anexos": [] }` |
| GET | `/api/ferramentas` | Lista as ferramentas de cálculo |
| POST | `/api/ferramentas/:nome` | Executa uma ferramenta sem IA e sem custo: `{ "input": {...}, "anexos": [{ "nome", "texto" }] }` |
| GET | `/api/execucoes?agente=das-simples` | Histórico de execuções |
| GET | `/api/backup` | Exporta os dados do sistema em JSON |

Exemplo de execução:

```bash
curl -X POST http://localhost:5000/api/agentes/das-simples/executar \
  -H "Content-Type: application/json" \
  -H "x-api-token: $API_TOKEN" \
  -d '{"mensagem": "Serviços de TI, RBT12 R$ 540.000, receita do mês R$ 52.000, folha 12 meses R$ 160.000. Quanto dá o DAS?"}'
```

Corpo da requisição:

- `mensagem` (obrigatório): o pedido.
- `anexos`: `[{ "nome": "nota.xml", "tipo": "application/xml", "conteudo_base64": "..." }]`.
- `historico`: o campo `historico` devolvido pela resposta anterior, para continuar a mesma conversa.
- `cliente_id`: opcional, registrado no histórico.

A resposta traz `resposta` (texto em Markdown), `status`, `ferramentas_usadas`, `uso` (tokens) e `historico`.

## Segurança e custos

- Defina `API_TOKEN` no `.env` para exigir o cabeçalho `x-api-token` nas rotas que gastam créditos ou expõem dados.
- Cada execução consome créditos da API do Claude. O uso de tokens fica registrado em `execucoes_agentes`.
- Os dados enviados aos agentes (notas, folha, extratos) são processados pela API da Anthropic. Avalie esse ponto na política de LGPD do escritório.

## Manutenção anual

As tabelas mudam todo ano. Revise:

- `agentes/ferramentas/folha.js`: faixas do INSS e do IRRF, dependente, desconto simplificado.
- `agentes/ferramentas/prazos.js`: datas de vencimento e prorrogações.
- `agentes/ferramentas/simples-nacional.js`: tabelas do Simples, se houver alteração na LC 123.
