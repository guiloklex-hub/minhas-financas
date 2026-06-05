# Minhas Finanças 💰

Gerenciador de finanças pessoais **single-user**, focado em simplicidade, com interface moderna e premium. Desenvolvido para ser executado localmente.

O app possui **autenticação por segurança**: a tela de login protege o acesso e a tela de registro só funciona enquanto **não houver nenhum usuário cadastrado** (o sistema recusa um segundo usuário).

## ✨ Módulos

- **Contas** — saldo inicial imutável; o saldo atual é derivado (inicial + receitas − despesas). Extrato por conta e multi-moeda.
- **Transações** — receitas/despesas categorizadas, com filtros + busca + paginação, tags, observações e conciliação.
- **Transferências** — par de transações entre contas ligadas por `transferGroupId` (criadas/editadas/excluídas em conjunto).
- **Recorrências** — regras (`RecurringRule`) que o cron materializa em transações no dia certo.
- **Orçamentos** — limites por categoria, com alertas (≥80%/100%) e sugestão por IA.
- **Metas** — objetivos financeiros com progresso e aportes.
- **Investimentos** — acompanhamento, projeções (juros compostos + IR/IOF) e simulador "E-se?".
- **Relatórios** — fluxo de caixa, comparativo anual (YoY), drill-down, exportação CSV/impressão e backup/restore.
- **Insights / IA** (Google Gemini) — categorização aprendida, lançamento mágico, conselheiro, detecção de anomalias, previsão de fluxo, resumo mensal, chatbot financeiro e leitura de comprovante (OCR), com guardrails de custo.
- **Notificações** — sino in-app + Web Push (VAPID) + e-mail (SMTP).
- **Segurança** — login com rate limiting, 2FA (TOTP), recuperação de senha e trilha de auditoria.
- **PWA** — instalável e com notificações push.

## 🚀 Tecnologias

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript
- **Banco de Dados**: SQLite (via driver adapter `better-sqlite3` — módulo nativo)
- **ORM**: Prisma 7 (generator `prisma-client`, client gerado em `src/generated/prisma`)
- **Estilização**: Tailwind CSS v4
- **IA**: Google Gemini (`@google/generative-ai`)

> **Prisma 7:** o client é gerado em `src/generated/prisma` (não em `node_modules`) — rode `npx prisma generate` após clonar (o `npm run setup` faz isso). A conexão usa um driver adapter; `DATABASE_URL` aponta para `file:./prisma/dev.db`. Em ambientes com `ignore-scripts`, pode ser preciso compilar o `better-sqlite3` (`npm rebuild better-sqlite3`).

## 🛠️ Instalação e Execução

### ⚡ Automatizada (recomendado)

Há um script inteligente que **instala ou atualiza** o sistema, detectando o cenário automaticamente:

```bash
# Instalação nova (clona e configura tudo):
git clone https://github.com/guiloklex-hub/minhas-financas.git
cd minhas-financas
npm run setup        # ou: bash scripts/setup.sh

# Atualização de uma instalação existente (dentro da pasta do projeto):
npm run update       # git pull + deps + migrações + build
```

O script: valida pré-requisitos (Node 20+), atualiza o código (`git pull --ff-only`, pulando se houver alterações locais), instala dependências (`npm ci`), cria o `.env` a partir do `.env.example` **gerando `JWT_SECRET`/`CRON_SECRET`**, faz **backup do SQLite** antes de migrar, roda `prisma migrate deploy` + `generate`, builda e lista as variáveis opcionais ainda pendentes. Opções: `--no-build`, `--seed`, `--no-pull`, `--no-backup`, `--dir`, `--repo`, `--branch` (veja `bash scripts/setup.sh --help`).

### Manual

#### Pré-requisitos
- Node.js (v20 ou superior)
- npm ou yarn

### Passos

1. Clone o repositório
```bash
git clone https://github.com/guiloklex-hub/minhas-financas.git
cd minhas-financas
```

2. Instale as dependências
```bash
npm install
```

3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz com:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Caminho do SQLite. Padrão: `file:./prisma/dev.db`. |
| `JWT_SECRET` | **Sim (em produção)** | Segredo de assinatura do JWT de sessão. Sem ela a aplicação **não inicia em produção** (não há fallback). Em desenvolvimento, usa um segredo inseguro apenas para conveniência. |
| `GEMINI_API_KEY` | Para os recursos de IA | Chave da API do Google Gemini (Insights / categorização / chatbot / OCR). |
| `GEMINI_MODEL` | Não | Modelo Gemini a usar (padrão: `gemini-3.1-flash-lite`). |
| `AI_MONTHLY_BUDGET_USD` | Não | Teto mensal de gasto com IA (USD). Vazio = sem limite. |
| `CRON_SECRET` | Para os cron jobs | Bearer exigido por `GET /api/cron/daily` (recorrências, alertas, lembretes). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Para Web Push | Geradas com `npx web-push generate-vapid-keys`. Sem elas, o push é no-op. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Para Web Push | A chave pública VAPID exposta ao client (assinatura do push). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `NOTIFY_EMAIL_TO` | Para e-mail | Envio de alertas e link de recuperação de senha. Sem isso, e-mail é no-op. |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | Para Open Banking | Integração bancária (scaffold). Sem isso, a sincronização fica desativada. |

> O modelo completo de variáveis está em [`.env.example`](.env.example).

### Cron

O job diário fica em `GET /api/cron/daily` (protegido por `Authorization: Bearer ${CRON_SECRET}`) e: materializa recorrências, gera alertas de orçamento e lembretes de vencimento. Agende-o externamente (ex.: `cron` do sistema, GitHub Actions, ou um serviço de scheduler).

4. Configure o banco de dados
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

5. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

No primeiro acesso, cadastre o **único** usuário na tela de registro; depois disso o registro é desativado e o acesso passa a exigir login.

## 📜 Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Gera o build de produção. |
| `npm run start` | Sobe o servidor de produção (após `build`). |
| `npm run lint` | Executa o ESLint. |
| `npm run test` | Roda a suíte de testes (Vitest). |

## 🤝 Como Contribuir

Por favor, leia nosso [Guia de Contribuição](CONTRIBUTING.md) para entender como você pode ajudar a melhorar o projeto.

## 📄 Licença

Este projeto está sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
