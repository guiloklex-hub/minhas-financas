# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Infraestrutura de repositório open source: workflow de CI (lint, typecheck, testes, build),
  análise de segurança CodeQL, Dependabot, templates de issue/PR, `CODEOWNERS`,
  política de segurança, `.editorconfig`, `.nvmrc`, `.gitattributes` e este changelog.

### Corrigido
- Script `lint` (`next lint` foi removido no Next.js 16) agora usa `eslint src`.
- Banco SQLite `dev.db` deixou de ser versionado (já estava no `.gitignore`).

## [0.1.0]

### Adicionado
- Núcleo de finanças pessoais single-user: contas com saldo derivado, transações,
  transferências, orçamentos, metas, investimentos e recorrências.
- Módulo de cartão de crédito: faturas por competência, parcelamento, limite,
  pagamento de fatura, cartões virtuais, recompensas e projeção de faturas.
- Importação de CSV e de faturas (PDF/imagem) com auto-categorização determinística + IA (Gemini).
- Assistente financeiro com IA, insights, relatórios, multi-moeda e detecção de anomalias.
- Autenticação (JWT + bcrypt), 2FA (TOTP), auditoria, notificações (sino + Web Push) e PWA.
- Automação via cron diário (recorrências, alertas de orçamento/vencimento, cotações de câmbio).

[Não lançado]: https://github.com/guiloklex-hub/minhas-financas/compare/main...HEAD
