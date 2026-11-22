# Assistente de mensagens

Objetivo: organizar solicitações recebidas via Gmail e, futuramente, WhatsApp Business, criando tarefas no Asana e sugerindo eventos no Google Agenda.

Estado: protótipo planejado. Integração do WhatsApp não ativada. Não afirmar monitoramento 24 horas antes de implantar e testar.

Segurança: usar somente conexão autorizada; não publicar tokens, mensagens ou informações fiscais no GitHub; validar assinatura de webhooks; exigir autenticação no painel; armazenar o mínimo necessário; deduplicar eventos por identificador; nunca enviar mensagens automaticamente.

Fluxo: receber evento -> validar origem -> extrair ação e prazo -> verificar duplicidade no Asana -> criar tarefa -> registrar resultado. Eventos de calendário exigem horário confirmado e aprovação.

Hospedagem: verificar plano gratuito real e estabilidade antes de conectar número principal. Evitar conexão não oficial do WhatsApp Web no número principal sem avaliação de risco.

Próximos passos: definir conector de mensagens oficial e elegibilidade de coexistência; implementar webhook isolado; testes com dados fictícios; integrar Asana; validar segurança antes de produção.
