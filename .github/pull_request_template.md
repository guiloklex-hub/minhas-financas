<!-- Obrigado por contribuir com o Minhas Finanças! Preencha o checklist abaixo. -->

## Descrição

<!-- O que esta mudança faz e por quê? -->

## Tipo de mudança

- [ ] 🐛 Correção de bug
- [ ] ✨ Nova funcionalidade
- [ ] ♻️ Refatoração (sem mudança de comportamento)
- [ ] 📝 Documentação
- [ ] 🔧 Build / CI / infra

## Como testar

<!-- Passos para validar a mudança localmente. -->

## Checklist

- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] `npm run test:run` passa (testes co-localizados adicionados/atualizados quando aplicável)
- [ ] Guarda de sessão (`getSession`) presente em toda Server Action que muta dados
- [ ] Entradas validadas via `validation.ts` com limites explícitos
- [ ] `revalidatePath` em todas as rotas afetadas
- [ ] Sem `any`, `ts-ignore` ou `eslint-disable`
- [ ] `.env.example`, `README.md` e `.agents/rules/` atualizados se a mudança for visível/estrutural
