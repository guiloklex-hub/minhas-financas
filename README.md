# Minhas Finanças 💰

Gerenciador de finanças pessoais focado em simplicidade, com interface moderna e premium. Desenvolvido para ser executado localmente.

## 🚀 Tecnologias

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript
- **Banco de Dados**: SQLite
- **ORM**: Prisma
- **Estilização**: Tailwind CSS v4

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

3. Configure o banco de dados
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

4. Inicie o servidor de desenvolvimento
```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

## 🤝 Como Contribuir

Por favor, leia nosso [Guia de Contribuição](CONTRIBUTING.md) para entender como você pode ajudar a melhorar o projeto.

## 📄 Licença

Este projeto está sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para mais detalhes.
