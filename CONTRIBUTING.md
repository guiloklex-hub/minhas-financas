# Guia de Contribuição

Obrigado por considerar contribuir para o **Minhas Finanças**! Este documento descreve
como configurar o ambiente, o padrão de código e o fluxo para enviar mudanças.

Ao participar, você concorda em seguir nosso [Código de Conduta](CODE_OF_CONDUCT.md).

## Pré-requisitos

- **Node.js 22** (há um `.nvmrc` — rode `nvm use`).
- **npm** (o repositório usa `package-lock.json`).

## Configuração do ambiente

```bash
# 1. Fork + clone
git clone https://github.com/<seu-usuario>/minhas-financas.git
cd minhas-financas

# 2. Instalação automatizada (instala deps, gera .env, migra o banco e gera o Prisma Client)
npm run setup

# 3. Rodar em desenvolvimento (porta 3002)
npm run dev
```

> Alternativa manual: `npm ci` → copie `.env.example` para `.env` e preencha →
> `npx prisma migrate deploy` → `npx prisma generate`. Veja o [README](README.md) para detalhes.

## Regras de Arquitetura e Código

1. **Next.js (App Router):** Server Components por padrão; `"use client"` apenas no topo de
   arquivos que precisam de interatividade.
2. **Mutações via Server Actions** em `src/actions/` com `"use server"`. Use `revalidatePath`
   em todas as rotas afetadas. Não crie rotas `/api/` para CRUD básico.
3. **Guarda de sessão obrigatória** (`getSession`) na primeira linha de toda action que muta dados.
4. **TypeScript estrito:** proibido `any`, `@ts-ignore` e `eslint-disable`. Reutilize os tipos
   gerados pelo Prisma.
5. **Validação de entrada** via `src/lib/validation.ts` com limites explícitos.
6. **Aritmética monetária** sempre via `roundMoney`/`sumMoney`. `initialBalance` é imutável.
7. **Banco:** mudanças em `schema.prisma` exigem migração (`npx prisma migrate dev --name <nome>`).
8. **IA (Gemini):** sem chave hardcoded; números são determinísticos (calculados em código),
   a IA só interpreta/redige; sempre com fallback e guardrail de custo.
9. **UI:** design minimalista/premium, Tailwind, feedback visual (`useTransition` + spinner).

> As regras detalhadas vivem em [`.agents/rules/`](.agents/rules/) e em [`AGENTS.md`](AGENTS.md).

## Antes de abrir o Pull Request

Garanta que **todos** os comandos abaixo passam sem erros:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src
npm run test:run    # vitest run
```

- Adicione/atualize testes co-localizados (`foo.ts` → `foo.test.ts`).
- Atualize `README.md`, `.env.example` e `CHANGELOG.md` quando a mudança for visível ou estrutural.

## Padrão de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
<tipo>(escopo opcional): descrição no imperativo

feat: adiciona projeção de fluxo de caixa
fix(cartao): corrige competência de compra parcelada no fim do mês
docs: atualiza instruções de instalação
```

Tipos comuns: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
Evite mensagens genéricas ("ajuste", "fix", "teste").

## Fluxo de Pull Request

1. Crie sua branch a partir de `main` (`git checkout -b feat/minha-feature`).
2. Faça commits claros e atômicos.
3. Garanta CI verde localmente (typecheck + lint + testes).
4. Faça push e abra um Pull Request preenchendo o template.
5. Aguarde a CI e a revisão. Não faça merge com a CI vermelha.

## Reportando bugs e sugerindo melhorias

Use os [templates de issue](https://github.com/guiloklex-hub/minhas-financas/issues/new/choose).
Para **vulnerabilidades de segurança**, siga a [Política de Segurança](.github/SECURITY.md) —
não abra issue pública.
