---
trigger: always_on
---

# Diretrizes de Qualidade de Código: TypeScript e ESLint

Para garantir a escalabilidade e evitar falhas de build, você deve atuar como um compilador rigoroso. Siga estas regras sem exceções:

1. **Tolerância Zero para 'any':** É estritamente proibido o uso do tipo `any`. Tipos implícitos de `any` também não são permitidos. Crie interfaces ou types explícitos para todas as propriedades, retornos de funções e payloads.
2. **Sem Atalhos de Ignorar Erros:** É proibido usar as diretivas `// @ts-ignore`, `// @ts-expect-error` ou `eslint-disable-next-line` para mascarar erros. O erro deve ser resolvido na raiz (corrigindo a tipagem).
3. **Tipagem do Prisma:** Ao lidar com dados vindos do banco, utilize os tipos autogerados pelo Prisma (ex: `import { Transaction } from '@prisma/client'`) em vez de recriar as interfaces manualmente no frontend.
4. **Hooks do React:** Respeite rigorosamente a regra `exhaustive-deps`. Se criar um `useEffect` ou `useCallback`, todas as dependências externas utilizadas dentro do hook devem estar declaradas no array de dependências.
5. **Variáveis Não Utilizadas:** Remova imediatamente do código qualquer importação ou variável que não esteja sendo utilizada (`no-unused-vars`).
6. **Retorno de Server Actions:** Todas as Server Actions devem retornar objetos fortemente tipados, preferencialmente um padrão de resultado como `{ success: boolean, data?: T, error?: string }`, para que o cliente saiba exatamente o que esperar.