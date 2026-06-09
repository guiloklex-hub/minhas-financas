---
trigger: always_on
---

# Diretrizes de UI/UX: Design System (Vercel/Linear), tokens e tema

Interface minimalista/premium. Suporta **tema claro e escuro** via `next-themes` (classe `.dark` no `<html>`; default `dark`).

## Tokens semânticos (obrigatório)
Cores vivem como CSS variables em [src/app/globals.css](src/app/globals.css) (`:root` = claro, `.dark` = escuro) e são expostas como utilitários via `@theme`. **Use sempre os utilitários de token, nunca cores hardcoded** (`zinc-*`, `text-white`, `bg-black/50`), que não trocam com o tema:

- Fundo: `bg-background` · Superfície/card: `bg-card` · Texto: `text-foreground` · Secundário: `text-muted`
- Borda: `border-border` · Input: `border-input` · Realce sutil: `bg-accent`
- Marca/ação: `bg-primary text-primary-foreground` · Destrutivo: `bg-destructive`
- Financeiro: `text-income` (receitas) e `text-expense` (despesas)
- Foco: `ring-ring`

Exceções permitidas: cores fixas com semântica própria que valem nos dois temas (badges `emerald/rose/amber/sky` com `/10../20`, backdrops `bg-black/60`).

## Biblioteca de primitivos — use, não reinvente
Componentes em [src/components/ui/](src/components/ui/), compostos com `cn()` ([src/lib/cn.ts](src/lib/cn.ts), clsx + tailwind-merge) e `class-variance-authority`. **Prefira-os a classes inline**:

- `Button` (variantes `primary|secondary|outline|ghost|destructive|link`, `size`, prop `loading`), `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Input`, `Select`, `Label`, `Badge`, `Skeleton`, `EmptyState`, `StatCard` (KPI), `Modal` (framer-motion).
- Tema/privacidade: `ThemeToggle`, `HideValuesToggle` + hook `useHideValues`/`maskValue` ([src/lib/use-hide-values.ts](src/lib/use-hide-values.ts)) para mascarar valores monetários sensíveis.
- Ações globais ficam no `AppHeader` ([src/components/app-header.tsx](src/components/app-header.tsx)); não recrie barras de ação avulsas (evita o clipping anterior).

## Estilo
- Bordas sutis (`border-border`), arredondamento generoso (`rounded-xl`/`rounded-2xl`), `shadow-sm` (nunca `shadow-lg`).
- Hierarquia por peso de fonte (`font-semibold`/`font-bold` títulos, `font-medium` valores); valores monetários com `tabular-nums`.
- Micro-interações com framer-motion (entrada de cards/listas sutil) e `transition-colors`/`transition-all duration-200` em hover.
- Sem flash de tema: `<html suppressHydrationWarning>`; ícones que dependem do tema trocam via CSS (`dark:`), não via estado `mounted` em effect.

> Migração incremental: telas ainda não migradas podem conter cores hardcoded — ao tocá-las, converta para tokens/primitivos.
