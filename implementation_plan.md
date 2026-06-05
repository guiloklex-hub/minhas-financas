# Gerenciador de Finanças Pessoais

Este documento descreve a arquitetura, estrutura e o plano de implementação passo a passo para o aplicativo de gerenciamento de finanças pessoais.

## Arquitetura Sugerida

*   **Framework Frontend/Fullstack**: Next.js (utilizando a nova arquitetura App Router).
*   **Estilização**: Tailwind CSS. A interface terá um foco moderno, podendo utilizar conceitos de Glassmorphism, paletas vibrantes/escuras e tipografia limpa (ex: fonte Inter).
*   **Banco de Dados**: SQLite. Por ser um arquivo local, garante a persistência das finanças na máquina, sem necessidade de configurar bancos externos para uso individual.
*   **ORM**: Prisma, para gerenciamento do schema, migrações e acesso aos dados de forma fortemente tipada.
*   **Comunicação de Dados**: Next.js Server Actions para mutação dos dados (criar/editar transações), evitando a necessidade de criar endpoints de API separados para o CRUD básico.

## Estrutura de Pastas Proposta

Uma vez inicializado o projeto, a estrutura base (focada na pasta `src`) será:

```text
/
├── prisma/
│   ├── schema.prisma       # Definição do schema do banco de dados (SQLite)
│   └── dev.db              # Banco de dados local (gerado após a migração)
├── src/
│   ├── actions/            # Server Actions do Next.js (ex: createTransaction)
│   ├── app/                # App Router
│   │   ├── layout.tsx      # Layout global com sidebar/navegação
│   │   ├── page.tsx        # Dashboard principal (resumo financeiro)
│   │   └── transacoes/     # Rota para listagem e criação de transações
│   ├── components/         # Componentes React de UI (botões, modais, cards)
│   └── lib/                # Configurações globais, utilitários e cliente do Prisma
├── package.json
└── tailwind.config.ts
```

## Modelagem de Dados (Prisma Schema Inicial)

Sugerimos dois modelos iniciais para suprir a demanda básica:
1.  **Category (Categoria):** Nome, Cor (para usar na UI).
2.  **Transaction (Transação):** Título, Valor, Tipo (RECEITA ou DESPESA), Data e relação com a Categoria.

## Proposed Changes (Plano de Ação)

### 1. Inicialização do Repositório
*   Executar o gerador do Next.js na raiz (`npx create-next-app@latest ./`).
*   Instalar dependências do Prisma e inicializá-lo (`npm i -D prisma`, `npx prisma init --datasource-provider sqlite`).

### 2. Configuração do Backend Local (Prisma)
*   Escrever o `schema.prisma`.
*   Executar a primeira migração (`npx prisma migrate dev`).
*   Criar o cliente Prisma em `src/lib/prisma.ts` para evitar conexões duplicadas em ambiente de desenvolvimento.

### 3. Desenvolvimento da UI e Componentes
*   Configurar tokens de cor, fontes e utilitários modernos no `tailwind.config.ts`.
*   Criar os componentes base:
    *   Layout e Sidebar/Header.
    *   Cards de resumo financeiro (Saldo, Entradas, Saídas).
    *   Tabela/Lista de Transações.
    *   Formulário para adicionar novas transações.

### 4. Integração (Server Components & Server Actions)
*   Fazer com que a Dashboard consulte o banco via Prisma e calcule o balanço total.
*   Conectar o formulário com Server Actions para inserir dados no SQLite e revalidar o caminho (`revalidatePath`) para atualização instantânea da UI.

## User Review Required

> [!IMPORTANT]
> **Por favor, revise o plano acima e confirme:**
> 1. Você concorda com o uso de **Server Actions** para as mutações de dados (criação de transações), em vez de rotas de API (`/api/...`)?
> 2. Há alguma funcionalidade específica que você quer garantir na **versão inicial** (ex: gráficos de despesas, ou podemos focar em tabelas/listas na v1)?
> 3. Podemos focar em um design Single-User (sem sistema de login/autenticação), já que o banco é local (SQLite)?

## Verification Plan

*   O comando `npm run dev` deverá iniciar a aplicação na porta 3002 sem erros.
*   A interface deverá carregar mostrando os cards de resumo financeiro zerados.
*   Ao inserir uma transação pelo formulário, ela deve aparecer instantaneamente na tela, e as somas de saldo deverão refletir o novo valor (validando que Next.js, Prisma e SQLite estão integrados corretamente).
