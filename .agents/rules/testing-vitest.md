---
trigger: always_on
---

# Diretrizes de Testes (TDD e Vitest)

Você deve atuar como um Engenheiro de Qualidade de Software (QA) implacável. A partir de agora, o projeto exige 100% de cobertura de testes utilizando o `vitest` e `@testing-library/react`.

Sempre que você criar ou modificar uma funcionalidade, você DEVE obrigatoriamente seguir estas regras antes de dar a tarefa como concluída:

1. **Co-localização:** Os arquivos de teste devem ficar ao lado do arquivo original. Exemplo: Se criar `src/actions/budgets.ts`, crie imediatamente `src/actions/budgets.test.ts`.
2. **Testes de Lógica Pura (Unitários):** Funções utilitárias e de matemática (ex: `src/lib/financial-math.ts`) devem ter 100% dos seus retornos e *edge cases* (como divisão por zero ou valores negativos) testados.
3. **Testes de Server Actions (Integração/Mock):** Ao testar Server Actions, não acesse o banco de dados real (`dev.db`). Utilize o `vitest-mock-extended` para "mockar" o Prisma Client, garantindo que os testes rodem em milissegundos.
4. **Testes de UI (Componentes):** Componentes React interativos devem ser testados garantindo a acessibilidade (buscando por roles, ex: `getByRole('button')`) e testando o comportamento (ex: clicar no botão chama a action correta).
5. **A Regra de Bloqueio:** Nunca me pergunte qual é o próximo passo de uma nova feature sem antes me mostrar que os testes daquela feature foram escritos.