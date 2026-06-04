# Guia de Contribuição

Obrigado por considerar contribuir para o Minhas Finanças!

## Regras de Arquitetura e Código

1. **Next.js (App Router):** Use Server Components por padrão. Utilize `"use client"` apenas no topo de arquivos que necessitam de interatividade do cliente.
2. **Mutações (Server Actions):** Mutações de banco de dados devem ocorrer via Next.js Server Actions na pasta `src/actions/`. Use `revalidatePath` para atualizar a UI.
3. **Estilo e UI:** O projeto usa Tailwind CSS. Priorize um design minimalista, premium e temas escuros (ex: fundos `zinc-900`, cores vibrantes apenas em destaques).
4. **TypeScript Rigoroso:** 
   - Proibido uso do tipo `any`.
   - Utilize tipos gerados pelo Prisma para as entidades.
5. **Banco de Dados:** Qualquer alteração no schema do banco (`schema.prisma`) requer criação de migração executando `npx prisma migrate dev --name <nome_da_migracao>`.

## Como enviar alterações

1. Faça um Fork do projeto
2. Crie sua Feature Branch (`git checkout -b feature/MinhaFeature`)
3. Faça commit de suas alterações (`git commit -m 'feat: Adiciona MinhaFeature'`)
4. Faça o Push para a Branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request
