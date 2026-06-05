# Master Roadmap — Minhas Finanças

> As 5 fases originais (gráficos, transferências, recorrência, importador CSV, insights) foram **concluídas**. Este documento reflete o estado **atual** após a expansão (Tiers 1–5). Detalhes técnicos canônicos vivem em [AGENTS.md](AGENTS.md).

## ✅ Concluído

### Tier 1 — Completude de CRUD/UX
- Edição de categorias (+ ícone e reordenação), edição de investimentos, exclusão de orçamentos.
- Transações: filtros + busca + paginação **server-side**, tags e observações.
- Edição de transferências (par atômico) e **extrato por conta** (`/contas/[id]`).

### Tier 2 — Relatórios & Exportação
- Hub `/relatorios`: período customizável, **fluxo de caixa**, comparativo **YoY**, despesas por categoria com **drill-down**.
- Exportação **CSV** (`/api/export/transactions`) e **relatório imprimível** (`/relatorios/imprimir`).
- **Backup/restore** em JSON (`/api/backup` + `/configuracoes/backup`). ⚠️ restore é destrutivo.

### Tier 3 — Automação & Alertas
- **Recorrências** (`RecurringRule`) materializadas por **cron** (`/api/cron/daily`).
- **Metas** financeiras (`/metas`) com aportes.
- **Notificações**: sino in-app + **Web Push** (VAPID) + e-mail (SMTP), tudo best-effort.
- Alertas de orçamento (≥80%/100%) e lembretes de vencimento de investimentos.
- Conciliação de transações e **dedup** no importador.

### Tier 4 — IA Avançada (Gemini)
- Auto-categorização **aprendida** (determinística) + categorização no import.
- **Detecção de anomalias** e **previsão de fluxo de caixa** (números no código; IA só narra).
- **Insights proativos** (`MonthlyInsight`), **chatbot financeiro** (RAG sobre agregados), **leitura de comprovante** (OCR multimodal), **orçamento sugerido** por IA.
- **Guardrails de custo** de IA (`AI_MONTHLY_BUDGET_USD`) + painel em `/configuracoes/status-ia`.

### Tier 5 — Apostas (parcial)
- **PWA** instalável (manifest + service worker + push).
- **Segurança**: 2FA (TOTP), recuperação de senha, **audit log** (`/configuracoes/auditoria`), **rate limiting** no login.
- **Multi-moeda**: `currency` por conta + cotações (`/configuracoes/moedas`) + conversão.

## 🔒 Gated (precisa de credenciais/infra)
- **Open Banking** (Pluggy/Belvo): scaffold pronto (`src/lib/openbanking.ts`); requer `PLUGGY_CLIENT_ID/SECRET`.
- **Postgres + deploy**: opcional; o app é local-first com SQLite.

## 🚫 Fora de escopo (decisão do produto)
- **Multi-usuário / multi-tenant**: o app permanece **single-user** por decisão explícita.
