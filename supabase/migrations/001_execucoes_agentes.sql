-- Histórico de execuções dos agentes de IA.
-- Rode no SQL Editor do Supabase (ou com `supabase db push`).
create table if not exists public.execucoes_agentes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  agente_id text not null,
  cliente_id text, -- id do cliente na tabela clientes (texto para aceitar uuid ou número)
  pedido text not null,
  resposta text,
  status text not null,
  ferramentas_usadas jsonb,
  tokens_entrada integer,
  tokens_saida integer,
  duracao_ms integer
);

create index if not exists execucoes_agentes_agente_idx on public.execucoes_agentes (agente_id, created_at desc);
create index if not exists execucoes_agentes_cliente_idx on public.execucoes_agentes (cliente_id, created_at desc);

-- O backend acessa com a chave de serviço; bloqueie o acesso público.
alter table public.execucoes_agentes enable row level security;
