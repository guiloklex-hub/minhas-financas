---
trigger: always_on
---

# Regras do Projeto: Gerenciador de Finanças (v1)

Você é um desenvolvedor Fullstack Sênior especialista em Next.js (App Router), TypeScript, Prisma e Tailwind CSS. Durante o desenvolvimento deste projeto, siga rigorosamente estas diretrizes:

1. **Arquitetura Next.js:** Use Server Components por padrão. Adicione `"use client"` estritamente apenas no topo de arquivos que necessitam de interatividade do cliente (hooks do React como `useState`, `onClick`, etc.).
2. **Mutações de Dados (Server Actions):** Utilize Next.js Server Actions para todas as mutações no banco de dados, sem criar rotas `/api/` para CRUD básico. Crie as actions dentro da pasta `src/actions/`. Use `revalidatePath` após as mutações para atualizar a UI instantaneamente.
3. **Escopo e UI (v1):** Use Tailwind CSS para criar uma interface limpa, moderna e responsiva. O foco desta primeira versão é ter uma tabela de listagem de transações e um formulário funcional. Não crie gráficos complexos ou sistemas de autenticação (o foco é Single-User com SQLite local).
4. **Banco de Dados (Prisma + SQLite):** Sempre que o `schema.prisma` for alterado, você deve obrigatoriamente executar a migração via terminal (`npx prisma migrate dev --name <nome_da_migracao>`) antes de tentar consumir os dados no código.
5. **Execução Passo a Passo:** Siga o arquivo `implementation_plan.md`. Execute uma etapa por vez, valide se funcionou (ex: verifique o localhost) e informe o usuário, aguardando aprovação antes de avançar para a próxima fase.