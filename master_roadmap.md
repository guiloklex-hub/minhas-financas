# Master Roadmap: Gerenciador de Finanças

Este documento detalha as 5 fases estruturais para a construção da versão completa do Gerenciador de Finanças, seguindo a stack Next.js App Router, Server Actions, Prisma e Tailwind CSS (Dark/Minimalista).

## Fase 1: Gestão de Contas
**Objetivo:** Permitir ao usuário criar, editar e excluir contas (ex: Carteira, Nubank, Itaú), além de definir seus saldos iniciais pela interface.
- **Server Actions:** `createAccount`, `updateAccount`, `deleteAccount` (em `src/actions/accounts.ts`).
- **Componentes e Páginas:**
  - Página `/contas` para listar todas as contas atuais.
  - Formulário modal ou página para Adicionar/Editar Conta.
- **Integração:** Atualizar o Dashboard (`/`) para refletir os saldos globais reais consolidados.

## Fase 2: Módulo de Transações
**Objetivo:** CRUD completo de receitas, despesas e transferências entre as contas.
- **Server Actions:** `createTransaction`, `updateTransaction`, `deleteTransaction` (em `src/actions/transactions.ts`).
- **Componentes e Páginas:**
  - Página `/transacoes` com tabela moderna e filtros (por mês, tipo, conta, categoria).
  - Formulário para registrar Nova Transação com seletores de Conta, Categoria, Tipo e Data.

## Fase 3: Orçamentos (Budgets)
**Objetivo:** Definição e acompanhamento de metas mensais por categoria.
- **Server Actions:** `createBudget`, `updateBudget`, `deleteBudget` (em `src/actions/budgets.ts`).
- **Componentes e Páginas:**
  - Página `/orcamentos` exibindo as metas do mês atual vs. o realizado (com barras de progresso).
  - Integração com o fluxo de despesas para calcular o progresso automaticamente.

## Fase 4: Relatórios e Gráficos
**Objetivo:** Dashboards interativos para análise financeira utilizando Recharts.
- **Server Actions:** Actions para buscar dados agrupados para os gráficos (ex: `getMonthlyCashFlow`, `getExpensesByCategory`).
- **Componentes e Páginas:**
  - Inclusão de gráficos de barras/linhas no Dashboard ou em página de `/relatorios`.
  - Gráfico de pizza (Pie chart) para gastos por categoria.

## Fase 5: Painel de Insights
**Objetivo:** Resumo analítico textual ou destacados de métricas-chave do comportamento financeiro do mês (ex: "Sua maior despesa este mês foi Alimentação").
- **Componentes e Páginas:**
  - Cards de Insights na página principal.
  - Algoritmos simples em Server Components para analisar dados do mês vs. mês anterior.
