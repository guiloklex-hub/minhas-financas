---
trigger: always_on
---

# Regras do Projeto: Gerenciador de Finanças (v1)

Você é um desenvolvedor Fullstack Sênior especialista em Next.js (App Router), TypeScript, Prisma e Tailwind CSS. Durante o desenvolvimento deste projeto, siga rigorosamente estas diretrizes:

1. **Arquitetura Next.js:** Use Server Components por padrão. Adicione `"use client"` estritamente apenas no topo de arquivos que necessitam de interatividade do cliente (hooks do React como `useState`, `onClick`, etc.).
2. **Mutações de Dados (Server Actions):** Utilize Next.js Server Actions para todas as mutações no banco de dados, sem criar rotas `/api/` para CRUD básico. Crie as actions dentro da pasta `src/actions/`. Use `revalidatePath` após as mutações para atualizar a UI instantaneamente.
3. **Escopo (SINGLE-USER com autenticação):** O app é **single-user**, mas **possui autenticação por segurança**. A tela de **login** protege o acesso a todas as telas e dados. A tela de **registro** só aparece/funciona enquanto **não houver nenhum usuário cadastrado**: `registerUser` (em `src/actions/auth.ts`) recusa a criação de um segundo usuário (retorna `success: false` quando `hasRegisteredUser()` é `true`). Use Tailwind CSS para uma interface limpa, moderna e responsiva.
4. **Guarda de sessão nas mutações:** Toda Server Action que **muta dados** deve chamar a guarda de sessão `getSession` de `@/lib/session` e, se não houver sessão, retornar imediatamente `{ success: false, error: "Não autorizado. Faça login novamente." }`. A variável de ambiente `JWT_SECRET` é **obrigatória em produção** — não há fallback (`src/lib/jwt-secret.ts` lança erro em produção quando ausente; o fallback inseguro só vale em desenvolvimento).
5. **Modelo de saldo (saldo inicial imutável):** `Account.initialBalance` é o **SALDO INICIAL** e é **imutável por transações**. O **saldo atual** é sempre **derivado**: `initialBalance + receitas (INCOME) - despesas (EXPENSE)`, via os helpers de `src/lib/account-balance.ts` (`computeAccountBalance` / `computeAccountBalances`). **Nenhuma action deve mutar `initialBalance` ao criar/editar/excluir transações.**
6. **Aritmética monetária:** Todo cálculo monetário (somas, saldos, splits) deve passar por `roundMoney` / `sumMoney` de `src/lib/money.ts` para evitar erros de ponto flutuante.
7. **Transferências:** Uma transferência é um **par de transações** ligadas pelo mesmo `transferGroupId`. O par deve ser **criado e excluído em conjunto** (atomicamente) e **nunca editado individualmente** — uma perna sem a outra corrompe o saldo das contas.
8. **Mutações de Dados (Server Actions):** Utilize Next.js Server Actions para todas as mutações no banco, sem criar rotas `/api/` para CRUD básico. Crie as actions em `src/actions/`. Toda action retorna o objeto tipado `{ success: boolean, data?, error?, message? }`. Use `revalidatePath` após as mutações para atualizar a UI instantaneamente.
9. **Banco de Dados (Prisma + SQLite):** Sempre que o `schema.prisma` for alterado, execute obrigatoriamente a migração via terminal (`npx prisma migrate dev --name <nome_da_migracao>`) antes de consumir os dados no código.
10. **Execução Passo a Passo:** Siga o arquivo `implementation_plan.md`. Execute uma etapa por vez, valide se funcionou (ex.: verifique o localhost) e informe o usuário, aguardando aprovação antes de avançar para a próxima fase.