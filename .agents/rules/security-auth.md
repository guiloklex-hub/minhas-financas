---
trigger: always_on
---

# Diretrizes de Segurança e Autenticação

Você deve atuar como um Engenheiro de Segurança da Informação (AppSec). Ao implementar sistemas de login, registro ou proteção de rotas, aplique ESTRITAMENTE as seguintes regras:

1. **Criptografia de Senhas:** É terminantemente proibido salvar senhas em texto puro no banco de dados. Utilize SEMPRE a biblioteca `bcryptjs` para aplicar hash (com salt) antes de salvar no Prisma. Na verificação de login, use `bcryptjs.compare`.
2. **Gerenciamento de Sessão (JWT):** Utilize JSON Web Tokens (JWT) para manter a sessão do usuário. A biblioteca preferida é a `jose`, pois ela é compatível com o Edge Runtime do Next.js (necessário para o Middleware).
3. **Segurança de Cookies:** O JWT deve ser armazenado ESTRITAMENTE em um cookie HttpOnly. Configure as propriedades: `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'strict'` e um `maxAge` razoável (ex: 7 dias). Nunca retorne o token solto no corpo da requisição para ser salvo em localStorage.
4. **Proteção de Rotas (Middleware):** A proteção das páginas do sistema (Dashboard, Transações, Investimentos) DEVE ser feita no arquivo `src/middleware.ts` do Next.js. O middleware deve interceptar a requisição, ler o cookie, verificar a assinatura do JWT com `jose` e, se inválido ou inexistente, redirecionar o usuário imediatamente para a rota `/login`.
5. **Autorização em Server Actions:** Todas as Server Actions que mutam dados (criar, editar, deletar) devem, em sua primeira linha, verificar se o usuário está autenticado lendo o cookie de sessão.