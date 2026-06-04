---
trigger: always_on
---

# Diretrizes para Gráficos (Recharts) e Prevenção de Erros

Você deve atuar como um Engenheiro Frontend Sênior. Sempre que for criar ou modificar um componente de gráfico utilizando a biblioteca `recharts`, é ESTRITAMENTE OBRIGATÓRIO aplicar as regras abaixo para evitar o erro de console "The width(-1) and height(-1) of chart should be greater than 0" e falhas de layout:

1. **Wrapper Obrigatório:** NUNCA retorne o componente `<ResponsiveContainer>` solto na tela. Ele DEVE estar obrigatoriamente dentro de uma tag `<div>` pai.
2. **Dimensões Geométricas Explícitas:** A `<div>` pai (wrapper) DEVE possuir classes Tailwind fixando sua altura (ex: `h-[300px]`, `h-72`, `h-80`) e sua largura (`w-full`). O Recharts precisa de um limite rígido para calcular as proporções.
3. **Prevenção de Colapso (Flex/Grid):** Se o gráfico estiver inserido em um Dashboard construído com CSS Grid ou Flexbox, a `<div>` pai DEVE conter as classes `min-w-0` e `min-h-0`. Isso impede que o contêiner colapse durante a pintura inicial do DOM.
4. **Fallback do Componente:** No componente `<ResponsiveContainer>`, sempre defina explicitamente: `width="100%"`, `height="100%"` e `minWidth={0}`.

**Código de Exemplo Padrão Exigido:**
```tsx
<div className="w-full h-[300px] min-w-0 min-h-0">
  <ResponsiveContainer height="100%" minWidth="{0}" width="100%">
    <BarChart data="{data}">
      
    </BarChart>
  </ResponsiveContainer>
</div>