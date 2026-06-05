<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Minhas Finanças — Regras do Projeto

Gerenciador de finanças pessoais **single-user**, com interface moderna/premium, executado localmente. Possui **autenticação por segurança**: o login protege todas as telas e dados; o registro só funciona enquanto **não houver nenhum usuário cadastrado**.

> As regras granulares (com `trigger: always_on`) vivem em [`.agents/rules/`](.agents/rules/). Este arquivo é o guia canônico e consolidado — em caso de conflito, prevalece o comportamento real do código.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2 (App Router, React 19.2) |
| Linguagem | TypeScript (`strict: true`) |
| Banco | SQLite + Prisma ORM (v5) |
| Auth | JWT via `jose` (Edge-safe) + `bcryptjs` (hash de senha) |
| UI | Tailwind CSS v4 + Lucide Icons + Recharts |
| IA | Google Gemini (`@google/generative-ai`) |
| Testes | Vitest + Testing Library + `vitest-mock-extended` |

### Comandos

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build de produção
npm run start    # Servir produção (após build)
npm run lint     # ESLint
npm run test     # Vitest

npx prisma migrate dev --name <nome>   # Aplicar mudança de schema
npx prisma db seed                     # Popular dados (prisma/seed.ts)
npx prisma studio                      # GUI do banco
```

---

## Estrutura de Diretórios

```
src/
  actions/        # Server Actions ("use server") — TODAS as mutações de dados
  app/
    (dashboard)/  # Páginas autenticadas: contas (+[id] extrato), transacoes,
                  #   recorrencias, orcamentos, metas, investimentos, insights,
                  #   relatorios (+imprimir), assistente, configuracoes
                  #   (perfil, seguranca, categorias, moedas, backup, auditoria, status-ia)
    api/          # Route handlers: cron/daily, notifications, push/subscribe,
                  #   export/transactions, backup
    login/ registro/            # Auth (públicas)
    (auth)/                     # esqueci-senha, redefinir-senha (públicas)
  components/     # NotificationBell, PushManager, charts/ (wrappers de Recharts)
  lib/            # Helpers (ver índice abaixo)
  proxy.ts        # Proteção de rotas (antigo middleware — ver Next.js 16)
public/           # manifest.webmanifest, sw.js, icon.svg (PWA)
prisma/schema.prisma   # Models
```

### Índice de Helpers (`src/lib/`)

Antes de escrever lógica nova, procure por estes módulos:

| Módulo | Propósito |
|---|---|
| [auth.ts](src/lib/auth.ts) | `signJwt`, `verifyJwt`, `setSessionCookie`, `deleteSessionCookie`. |
| [jwt-secret.ts](src/lib/jwt-secret.ts) | `JWT_SECRET_KEY` (edge-safe). Lança erro em produção se `JWT_SECRET` ausente. |
| [session.ts](src/lib/session.ts) | `getSession()` (payload do JWT) e `getCurrentUser()` (usuário do banco). **Guarda de sessão das actions.** |
| [money.ts](src/lib/money.ts) | `roundMoney(v)` e `sumMoney(vs)` — toda aritmética monetária. |
| [account-balance.ts](src/lib/account-balance.ts) | `computeAccountBalance` / `computeAccountBalances` — saldo derivado. |
| [date-utils.ts](src/lib/date-utils.ts) | `addMonthsClamped` — soma meses com clamp de fim de mês. |
| [validation.ts](src/lib/validation.ts) | `parseRequiredString`, `parseMoney`, `parseDate` (`ValidationResult<T>`). |
| [financial-math.ts](src/lib/financial-math.ts) | `calculateCompoundInterest`, `calculateBrazilianTaxes` (IR/IOF). |
| [prisma.ts](src/lib/prisma.ts) | Singleton do Prisma Client. **Sempre importar daqui.** |
| [gemini.ts](src/lib/gemini.ts) | Cliente Gemini + `logAiUsage`. |
| [ai-budget.ts](src/lib/ai-budget.ts) | `isAiBudgetExceeded()` / `getAiSpendThisMonthUsd()` — **guardrail de custo de IA** (checar antes de toda chamada ao Gemini). |
| [notifications.ts](src/lib/notifications.ts) | `createNotification(...)` — orquestrador único (sino in-app + Web Push best-effort). |
| [push.ts](src/lib/push.ts) / [email.ts](src/lib/email.ts) | `sendPushToAll` (VAPID) / `sendEmail` (SMTP) — best-effort, no-op sem config. |
| [cron.ts](src/lib/cron.ts) | `isAuthorizedCron(req)` — valida Bearer `CRON_SECRET` (timing-safe). |
| [timing-safe.ts](src/lib/timing-safe.ts) | `timingSafeEquals(a,b)` — comparar segredos. Nunca `===`. |
| [audit.ts](src/lib/audit.ts) | `createAuditLog(...)` — trilha de auditoria (best-effort). |
| [rate-limit.ts](src/lib/rate-limit.ts) | `rateLimit(key,max,windowMs)` — in-memory; usar em login/recuperação. |
| [totp.ts](src/lib/totp.ts) | 2FA (otplib): `generateSecret`, `otpauthURL`, `verifyToken`. |
| [recurring.ts](src/lib/recurring.ts) | `runRecurringRules()` — materializa `RecurringRule` em transações (chamado pelo cron). |
| [categorization.ts](src/lib/categorization.ts) | `suggestCategoryIdByHistory` — auto-categorização **determinística** (sem IA). |
| [anomaly.ts](src/lib/anomaly.ts) / [forecast.ts](src/lib/forecast.ts) | Detecção de anomalias e previsão de fluxo (números no código). |
| [currency.ts](src/lib/currency.ts) | Multi-moeda: `convert`, `formatMoney`, `getLatestRate`. |
| [exchange-rate-fetch.ts](src/lib/exchange-rate-fetch.ts) | `refreshExchangeRatesFromApi()` — busca cotações na AwesomeAPI (`EXCHANGE_RATE_API_URL`) e faz upsert em `ExchangeRate` (chamado pelo cron e pela tela de Moedas). |
| [openbanking.ts](src/lib/openbanking.ts) | Scaffold Open Banking (Pluggy) — gated por credenciais. |

---

## Regra #1: Arquitetura Next.js (App Router)

1. **Server Components por padrão.** Use `"use client"` apenas no topo de arquivos que precisam de interatividade (`useState`, `onClick`, `useTransition`, etc.).
2. **Mutações via Server Actions.** Não crie rotas `/api/` para CRUD básico. Actions ficam em `src/actions/` com `"use server"`. Use `revalidatePath` após cada mutação (inclua todas as rotas afetadas: `/`, `/contas`, `/transacoes`, `/insights`, ...).
3. **`params` é Promise** no Next.js 16 — sempre `await params`.
4. **Proteção de rotas** fica em [src/proxy.ts](src/proxy.ts) (não `middleware.ts` — renomeado no Next 16). A função exportada chama-se `proxy`. O `matcher` exclui rotas públicas (`login`, `registro`, `esqueci-senha`, `redefinir-senha`), `api`, estáticos e arquivos PWA (`manifest.webmanifest`, `sw.js`, `icon.svg`). **Ao criar uma rota pública nova, adicione-a ao matcher.**
5. **Retorno de Server Actions** é sempre um objeto tipado: `{ success: boolean; data?: T; error?: string; message?: string }`.

---

## Regra #2: Single-User + Autenticação

- O app é **single-user**: [`registerUser`](src/actions/auth.ts) recusa criar um 2º usuário (retorna `success: false` quando `hasRegisteredUser()` é `true`).
- **Não há `userId` nos models de negócio** (Account, Category, Transaction, Budget, Investment) — e isso é intencional. Não adicione escopo multi-tenant sem antes rediscutir a arquitetura.
- **Guarda de sessão obrigatória** em toda Server Action que **muta dados**, na primeira linha:

```typescript
const session = await getSession();
if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };
```

- **Segurança de senha/sessão:**
  - Senhas com `bcryptjs` (hash + salt). Nunca em texto puro. Verificação com `bcrypt.compare`.
  - JWT com `jose` (compatível com Edge). Token em cookie `httpOnly`, `secure` em produção, `sameSite: "strict"`, `maxAge` de 7 dias.
  - Nunca retornar o token no corpo da resposta nem salvar em `localStorage`.
  - Login não distingue "usuário inexistente" de "senha incorreta" — ambos retornam `Credenciais inválidas.` (anti-enumeração).
- **`JWT_SECRET` é obrigatória em produção.** [jwt-secret.ts](src/lib/jwt-secret.ts) lança erro se ausente em produção; o fallback inseguro só vale em desenvolvimento. Documentar variáveis novas em [.env.example](.env.example).

---

## Regra #3: Modelo Financeiro

- **Saldo inicial é imutável.** `Account.initialBalance` é o ponto de partida. O **saldo atual é sempre derivado**: `initialBalance + receitas (INCOME) − despesas (EXPENSE)`, via `computeAccountBalance` / `computeAccountBalances`. **Nenhuma action deve mutar `initialBalance` ao criar/editar/excluir transações.**
- **Aritmética monetária** sempre por `roundMoney` / `sumMoney` (evita erro de ponto flutuante; valores são `Float` no SQLite).
- **Transferências** são um **par de transações** ligadas pelo mesmo `transferGroupId` (uma `EXPENSE` na origem, uma `INCOME` no destino):
  - Criadas e excluídas **em conjunto** (atomicamente, dentro de `prisma.$transaction`).
  - **Nunca editadas individualmente** — `updateTransaction` bloqueia pernas de transferência; a UI desabilita o botão de editar.
  - Ao excluir uma conta, as pernas correspondentes em outras contas também são removidas (evita saldo desbalanceado).
- **Transferências NÃO são receita/despesa.** Excluir `isTransfer: true` das KPIs/relatórios de receita e despesa (Dashboard, Insights). No **saldo global** elas podem permanecer (as duas pernas se anulam); no **saldo por conta** elas contam (cada perna afeta uma conta).
- **Recorrência:** transações de uma série compartilham `recurrenceGroupId`; datas calculadas com `addMonthsClamped` (31/jan + 1 mês → 28/29 fev). Há `deleteRecurrenceSeries(groupId)` para excluir a série inteira.

---

## Regra #4: Validação de Entrada

Toda action que recebe `FormData`/argumentos **deve validar** com os helpers de [validation.ts](src/lib/validation.ts) (com limites explícitos):

```typescript
const nameRes = parseRequiredString(formData.get("name"), "Nome"); // max 120 por padrão
if (!nameRes.ok) return { success: false, error: nameRes.error };

const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
if (!amountRes.ok) return { success: false, error: amountRes.error };

const dateRes = parseDate(formData.get("date"), "Data");
if (!dateRes.ok) return { success: false, error: dateRes.error };
```

- Valores monetários: `parseMoney` (finito, `min`/`max` configuráveis). Saldo inicial pode ser negativo (`min: -1_000_000_000`).
- Datas: `parseDate`. No importador de CSV, validar que a data **existe de fato** (rejeitar 31/02).
- **Uploads/CSV:** validar tamanho máximo (2MB), extensão/`type` e número de linhas (5000). Não truncar em silêncio — avisar na `message`. Validar existência de `accountId`/`categoryId` antes de gravar.

---

## Regra #5: Qualidade de Código (TypeScript estrito)

1. **Tolerância zero a `any`** (explícito ou implícito). Em catch, use `catch (e)` / `catch (e: unknown)` com narrowing (`e instanceof Error ? e.message : "..."`), ou `catch {}` quando o erro não for usado.
2. **Sem atalhos:** proibido `// @ts-ignore`, `// @ts-expect-error`, `eslint-disable`. Corrija a causa raiz.
3. **Use os tipos do Prisma** (`import { Transaction } from "@prisma/client"`) em vez de recriar interfaces.
4. **`react-hooks/exhaustive-deps`:** declare todas as dependências de `useEffect`/`useCallback`. Não chame `setState` síncronamente no corpo de um effect — mova para callbacks assíncronos.
5. **Sem imports/variáveis não usados.**
6. **`next/image`** em vez de `<img>` (use `unoptimized` para URLs arbitrárias/data URLs de avatar).
7. **Antes de concluir:** `npx tsc --noEmit`, `npx eslint src --ext .ts,.tsx` e `npm run test` devem passar **sem erros**.

---

## Regra #6: Testes (Vitest)

- **Co-localização:** o teste fica ao lado do arquivo (`foo.ts` → `foo.test.ts`).
- **Lógica pura** (ex.: `money`, `account-balance`, `date-utils`, `validation`, `financial-math`): cobrir edge cases (divisão por zero, negativos, fim de mês, ponto flutuante).
- **Server Actions:** mockar Prisma com `vitest-mock-extended` (nunca tocar `dev.db`). Padrão:

```typescript
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));
```

- Testar também o caminho **sem sessão** (`vi.mocked(getSession).mockResolvedValueOnce(null)` → `"Não autorizado..."`).
- **UI:** buscar por roles acessíveis (`getByRole`) e testar comportamento (clique chama a action correta).

---

## Regra #7: Integração com IA (Gemini)

1. **Sem chave hardcoded.** Use `process.env.GEMINI_API_KEY`; documente variáveis novas em `.env.example`. Modelo configurável via `GEMINI_MODEL` (padrão `gemini-3.1-flash-lite`).
2. **Structured outputs:** ao extrair dados (ex.: "Lançamento Mágico"), configure `responseMimeType: "application/json"` + `responseSchema`.
3. **Resiliência:** chamadas de IA podem falhar/alucinar. As actions de IA ([ai-advisor.ts](src/actions/ai-advisor.ts), [ai-transactions.ts](src/actions/ai-transactions.ts)) devem ter **fallback** (resposta padrão) para que o app nunca quebre por causa da IA.
4. **Telemetria:** registre uso via `logAiUsage` (modelo `AiUsageLog`: tokens, custo, latência, status).
5. **Guardrail de custo:** antes de chamar o Gemini, cheque `isAiBudgetExceeded()` de [ai-budget.ts](src/lib/ai-budget.ts). Se excedido, retorne o fallback (não chame a IA).
6. **Números são determinísticos.** Cálculos financeiros (totais, médias, anomalias, previsões, conversões) são feitos **em código**; a IA só **interpreta/classifica/redige**. Em chatbot/RAG, passe os agregados já calculados e instrua o modelo a não recalcular — nunca deixe a IA ser fonte de valores.

---

## Regra #8: Gráficos (Recharts) — Prevenção de erros de layout

Para evitar `"The width(-1) and height(-1) of chart should be greater than 0"`:

1. `<ResponsiveContainer>` **sempre** dentro de uma `<div>` pai.
2. A `<div>` pai precisa de dimensões fixas (`h-[300px]`/`h-72` + `w-full`).
3. Em Flex/Grid, adicione `min-w-0` e `min-h-0` na `<div>` pai (evita colapso na pintura inicial).
4. No `<ResponsiveContainer>`: `width="100%"`, `height="100%"`, `minWidth={0}`.

```tsx
<div className="w-full h-[300px] min-w-0 min-h-0">
  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    {/* gráfico */}
  </ResponsiveContainer>
</div>
```

---

## Regra #9: UI/UX

- **Design minimalista/premium** (estilo Vercel/Linear): tema escuro de alto contraste (`zinc-900`/`neutral-950`), uma cor de destaque (`emerald-500` receitas, `rose-500` despesas). Bordas sutis (`border-white/10`), arredondamentos generosos (`rounded-xl`/`rounded-2xl`). Suporte a dark mode com bom contraste.
- **Feedback visual obrigatório:** toda action acionada por formulário usa `useTransition`/`useFormStatus`; durante o `pending`, botão `disabled` + spinner (`Loader2`) ou "Processando...".
- **Tratamento de erros:** envolver actions em `try/catch`; ler o `{ success, error, message }` no client e exibir feedback amigável. Nunca falhar silenciosamente.
- **Micro-interações:** `:hover` claro + `transition-all duration-200`.

---

## Subsistemas (Automação, Notificações, Segurança, Multi-moeda, PWA)

- **Cron** ([cron.ts](src/lib/cron.ts)): jobs ficam em `src/app/api/cron/*` e **exigem** `Authorization: Bearer ${CRON_SECRET}` validado via `isAuthorizedCron` (timing-safe). O `daily` materializa recorrências (`runRecurringRules`), alertas de orçamento e lembretes de vencimento. Datas/decisões em fuso correto; idempotência diária (dedupe por título no dia).
- **Recorrências:** `RecurringRule` é a fonte; **não** crie N transações de uma vez no cadastro — o cron gera no dia certo, avançando `nextRunDate` com `addMonthsClamped`.
- **Notificações:** nunca chame push/email direto para o usuário — use `createNotification(...)` ([notifications.ts](src/lib/notifications.ts)). Push/email são **best-effort** (no-op sem VAPID/SMTP). O sino lê `GET /api/notifications`.
- **Segurança:** login tem `rateLimit` + `createAuditLog`; mantenha a mensagem **indistinta** "Credenciais inválidas.". 2FA via [totp.ts](src/lib/totp.ts) — `verifyToken` valida 6 dígitos. Reset de senha **consome o token atomicamente** (`updateMany` filtrando token + expiração; `count===0` ⇒ inválido). Compare segredos com `timingSafeEquals`. Ações sensíveis gravam `AuditLog`.
- **Multi-moeda:** `Account.currency`; conversões via [currency.ts](src/lib/currency.ts) (`convert`/`getLatestRate`, fallback 1:1). Exibição com `formatMoney`.
- **PWA:** `public/manifest.webmanifest` + `public/sw.js` (push/notificationclick); registro via `PushManager`. Ao adicionar rota pública/estática, lembre do matcher do proxy.
- **Open Banking:** apenas scaffold em [openbanking.ts](src/lib/openbanking.ts) — gated por `PLUGGY_CLIENT_ID/SECRET`; retorne erro claro quando não configurado.

---

## Banco de Dados

- **Singleton:** sempre `import { prisma } from "@/lib/prisma"`. Nunca instanciar `PrismaClient` diretamente.
- **Após alterar `schema.prisma`:** `npx prisma migrate dev --name <nome>` (e regenerar o client).
- **IDs:** todos os models usam `@default(uuid())`.
- **Atomicidade:** use `prisma.$transaction` quando múltiplas operações precisam ser atômicas (transferências, exclusão de conta com pernas, séries recorrentes).
- **Models:** `User`, `Account`, `Category`, `Budget`, `Transaction` (campos `isTransfer`, `transferGroupId`, `recurrenceGroupId`), `Investment`, `AiUsageLog`.

---

## Checklist do Reviewer

Ao revisar uma mudança que toque Server Actions, conferir:

- [ ] Guarda de sessão (`getSession`) no topo de toda action que muta dados → `{ success: false }` se ausente.
- [ ] Entradas validadas via `validation.ts` com limites explícitos.
- [ ] Aritmética monetária via `roundMoney`/`sumMoney`; `initialBalance` nunca mutado por transações.
- [ ] Transferências: par criado/excluído junto; edição individual bloqueada; `isTransfer` excluído das KPIs de receita/despesa.
- [ ] Operações múltiplas dentro de `prisma.$transaction`.
- [ ] Retorno tipado `{ success, data?, error?, message? }`.
- [ ] Zero `any`, sem `ts-ignore`/`eslint-disable`; tipos do Prisma reutilizados.
- [ ] Testes co-localizados (lógica pura + action com Prisma mockado + caminho sem sessão).
- [ ] `revalidatePath` em todas as rotas afetadas.
- [ ] `tsc --noEmit`, `eslint` e `vitest` verdes.
- [ ] `.env.example`, `README.md` e `.agents/rules/` atualizados se a mudança for visível/estrutural.
