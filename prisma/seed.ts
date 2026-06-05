import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Limpando banco de dados para o seed...')
  await prisma.transaction.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.investment.deleteMany()
  await prisma.category.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()

  console.log('Criando usuário padrão...')
  const hashedPassword = await bcrypt.hash('123456', 10)
  await prisma.user.create({
    data: {
      email: 'admin@financas.local',
      password: hashedPassword,
      name: 'Admin',
      avatarUrl: 'https://github.com/shadcn.png'
    },
  })

  console.log('Criando contas (Accounts)...')
  const nubank = await prisma.account.create({
    data: { name: 'Nubank', type: 'CHECKING', initialBalance: 1500.00 },
  })
  const itau = await prisma.account.create({
    data: { name: 'Itaú', type: 'CHECKING', initialBalance: 3200.00 },
  })
  const carteira = await prisma.account.create({
    data: { name: 'Carteira (Dinheiro)', type: 'CASH', initialBalance: 250.00 },
  })

  console.log('Criando categorias...')
  const catSalario = await prisma.category.create({ data: { name: 'Salário', color: '#10b981' } })
  const catAlimentacao = await prisma.category.create({ data: { name: 'Alimentação', color: '#f59e0b' } })
  const catMoradia = await prisma.category.create({ data: { name: 'Moradia', color: '#3b82f6' } })
  const catLazer = await prisma.category.create({ data: { name: 'Lazer', color: '#ec4899' } })
  const catTransporte = await prisma.category.create({ data: { name: 'Transporte', color: '#8b5cf6' } })
  const catAssinaturas = await prisma.category.create({ data: { name: 'Assinaturas', color: '#6366f1' } })
  const catSaude = await prisma.category.create({ data: { name: 'Saúde', color: '#ef4444' } })
  const catFreela = await prisma.category.create({ data: { name: 'Freelance', color: '#14b8a6' } })

  console.log('Criando orçamentos mensais (Budgets)...')
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  
  await prisma.budget.create({ data: { categoryId: catAlimentacao.id, amountLimit: 1200, month: currentMonth, year: currentYear } })
  await prisma.budget.create({ data: { categoryId: catLazer.id, amountLimit: 400, month: currentMonth, year: currentYear } })
  await prisma.budget.create({ data: { categoryId: catTransporte.id, amountLimit: 300, month: currentMonth, year: currentYear } })

  console.log('Criando investimentos (Investments)...')
  await prisma.investment.create({
    data: {
      name: 'Tesouro IPCA+ 2029',
      type: 'FIXED_INCOME',
      initialAmount: 5000,
      currentAmount: 5400.25,
      yieldRate: 0.115, // 11.5% ao ano
      startDate: new Date(currentYear - 1, 5, 10),
      maturityDate: new Date(2029, 4, 15)
    }
  })
  
  await prisma.investment.create({
    data: {
      name: 'CDB Banco Inter 110% CDI',
      type: 'FIXED_INCOME',
      initialAmount: 2000,
      currentAmount: 2150.10,
      yieldRate: 0.108, // Aprox 10.8% ao ano
      startDate: new Date(currentYear, currentMonth - 4, 20),
      maturityDate: new Date(currentYear + 2, currentMonth - 4, 20)
    }
  })

  await prisma.investment.create({
    data: {
      name: 'Bitcoin (BTC)',
      type: 'CRYPTO',
      initialAmount: 1500,
      currentAmount: 1250.00, // Crypto com perda momentanea para o bot analisar
      yieldRate: 0,
      startDate: new Date(currentYear, currentMonth - 2, 5),
    }
  })

  console.log('Criando transações históricas...')
  
  const transactions = []
  
  // Gerando transações para os últimos 12 meses (1 ano de histórico)
  for (let i = 0; i <= 11; i++) {
    const targetMonth = currentMonth - i
    const targetYear = targetMonth <= 0 ? currentYear - 1 : currentYear
    const adjustedMonth = targetMonth <= 0 ? 12 + targetMonth : targetMonth
    
    // Salário todo dia 5
    transactions.push({
      title: 'Salário TechCorp',
      amount: 6500.00,
      type: 'INCOME',
      date: new Date(targetYear, adjustedMonth - 1, 5),
      categoryId: catSalario.id,
      accountId: itau.id
    })
    
    // Freela esporádico
    if (i !== 1) { // Mês sim, mês não
      transactions.push({
        title: 'Freelance Design',
        amount: 1200.00,
        type: 'INCOME',
        date: new Date(targetYear, adjustedMonth - 1, 18),
        categoryId: catFreela.id,
        accountId: nubank.id
      })
    }

    // Aluguel dia 10
    transactions.push({
      title: 'Aluguel Apartamento',
      amount: 2200.00,
      type: 'EXPENSE',
      date: new Date(targetYear, adjustedMonth - 1, 10),
      categoryId: catMoradia.id,
      accountId: itau.id
    })

    // Contas de casa
    transactions.push({ title: 'Conta de Luz (Enel)', amount: 180.50, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 12), categoryId: catMoradia.id, accountId: nubank.id })
    transactions.push({ title: 'Internet Claro', amount: 119.90, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 15), categoryId: catMoradia.id, accountId: nubank.id })

    // Assinaturas
    transactions.push({ title: 'Netflix', amount: 39.90, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 20), categoryId: catAssinaturas.id, accountId: nubank.id })
    transactions.push({ title: 'Spotify Premium', amount: 21.90, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 21), categoryId: catAssinaturas.id, accountId: nubank.id })
    
    // Supermercado (2x por mês)
    transactions.push({ title: 'Supermercado Extra', amount: 540.20, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 6), categoryId: catAlimentacao.id, accountId: nubank.id })
    transactions.push({ title: 'Hortifruti', amount: 125.00, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 22), categoryId: catAlimentacao.id, accountId: nubank.id })

    // Restaurantes e Ifood
    transactions.push({ title: 'iFood Pizza', amount: 89.90, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 14), categoryId: catAlimentacao.id, accountId: nubank.id })
    transactions.push({ title: 'Restaurante Outback', amount: 215.00, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 28), categoryId: catLazer.id, accountId: nubank.id })

    // Transporte (Uber)
    transactions.push({ title: 'Uber Viagem', amount: 35.40, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 8), categoryId: catTransporte.id, accountId: nubank.id })
    transactions.push({ title: 'Uber Viagem', amount: 42.10, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 25), categoryId: catTransporte.id, accountId: nubank.id })
    transactions.push({ title: 'Posto Ipiranga (Gasolina)', amount: 250.00, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 11), categoryId: catTransporte.id, accountId: nubank.id })

    // Saúde
    transactions.push({ title: 'Farmácia Droga Raia', amount: 105.80, type: 'EXPENSE', date: new Date(targetYear, adjustedMonth - 1, 16), categoryId: catSaude.id, accountId: nubank.id })
  }

  // Insere todas as transações de uma vez
  for (const t of transactions) {
    await prisma.transaction.create({ data: t })
  }

  console.log(`Foram inseridas ${transactions.length} transações simuladas.`)
  console.log('Seed rico finalizado com sucesso!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
