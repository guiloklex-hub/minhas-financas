# Minhas Finanças 💰

Gerenciador de finanças pessoais **single-user**, focado em simplicidade, com interface moderna e premium. Desenvolvido para ser executado localmente.

O app possui **autenticação por segurança**: a tela de login protege o acesso e a tela de registro só funciona enquanto **não houver nenhum usuário cadastrado** (o sistema recusa um segundo usuário).

## ✨ Módulos

- **Contas** — saldo inicial imutável; o saldo atual é derivado (inicial + receitas − despesas).
- **Transações** — receitas e despesas categorizadas.
- **Transferências** — par de transações entre contas ligadas por `transferGroupId`.
- **Orçamentos** — limites de gastos por categoria.
- **Investimentos** — acompanhamento e projeções.
- **Insights / IA** — análises e categorização assistidas por IA (Google Gemini).

## 🚀 Tecnologias

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript
- **Banco de Dados**: SQLite
- **ORM**: Prisma
- **Estilização**: Tailwind CSS v4
- **IA**: Google Gemini (`@google/generative-ai`)

## 🛠️ Instalação e Execução

### Pré-requisitos
- Node.js (v20 ou superior)
- npm ou yarn

### Passos

1. Clone o repositório
```bash
git clone https://github.com/guiloklex-hub/minhas-financas.git
cd minhas-financas
```

2. Instale as dependências
```bash
npm install
```

3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz com:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JWT_SECRET` | **Sim (em produção)** | Segredo de assinatura do JWT de sessão. Sem ela a aplicação **não inicia em produção** (não há fallback). Em desenvolvimento, usa um segredo inseguro apenas para conveniência. |
| `GEMINI_API_KEY` | Para os recursos de IA | Chave da API do Google Gemini (Insights / categorização). |
| `GEMINI_MODEL` | Não | Modelo Gemini a usar (padrão: `gemini-3.1-flash-lite`). |

4. Configure o banco de dados
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

5. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

No primeiro acesso, cadastre o **único** usuário na tela de registro; depois disso o registro é desativado e o acesso passa a exigir login.

## 📜 Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Gera o build de produção. |
| `npm run start` | Sobe o servidor de produção (após `build`). |
| `npm run lint` | Executa o ESLint. |
| `npm run test` | Roda a suíte de testes (Vitest). |

## 🤝 Como Contribuir

Por favor, leia nosso [Guia de Contribuição](CONTRIBUTING.md) para entender como você pode ajudar a melhorar o projeto.

## 📄 Licença

Este projeto está sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
