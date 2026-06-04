---
trigger: always_on
---

# Diretrizes de UI/UX: Estilo Minimalista e Premium (Vercel/Linear)

Para fugir do padrão genérico de IA, aplique rigorosamente este Design System na interface:
1. **Paleta de Cores:** Priorize um tema escuro (Dark Mode) ou um tema claro de altíssimo contraste. Evite os azuis e índigos padrão do Tailwind. Use tons de cinza muito escuros (`zinc-900`, `neutral-950`) para o fundo e branco puro para o texto. Use apenas uma cor de destaque vibrante (ex: `emerald-500` para receitas, `rose-500` para despesas).
2. **Bordas e Sombras:** Não use sombras gigantes (`shadow-lg`). Prefira separações feitas com bordas sutis (`border border-white/10` no dark mode) e sombras muito suaves.
3. **Tipografia:** Use fontes sem serifa modernas e limpas (ex: Inter, Geist ou Roboto). Faça uso forte de pesos de fonte para hierarquia (ex: `font-semibold` para títulos, `font-medium` para valores).
4. **Espaçamento e Layout:** Seja generoso com o *padding* e *margin*. As interfaces não devem parecer espremidas.
5. **Micro-interações:** Todos os botões e links devem ter um estado de `:hover` claro (mudança de opacidade ou cor sutil) e a classe `transition-all duration-200`.