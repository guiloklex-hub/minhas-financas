import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Limpando banco de dados para o seed...')
  await prisma.transaction.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.category.deleteMany()
  await prisma.account.deleteMany()

  console.log('Criando contas (Accounts)...')
  const account1 = await prisma.account.create({
    data: {
      name: 'Carteira (Dinheiro)',
      type: 'CASH',
      initialBalance: 150.0,
    },
  })

  const account2 = await prisma.account.create({
    data: {
      name: 'Nubank',
      type: 'CHECKING',
      initialBalance: 1200.50,
    },
  })

  console.log('Criando categorias...')
  await prisma.category.create({ data: { name: 'Salário', color: '#10b981' } })
  await prisma.category.create({ data: { name: 'Alimentação', color: '#f59e0b' } })
  await prisma.category.create({ data: { name: 'Moradia', color: '#3b82f6' } })
  await prisma.category.create({ data: { name: 'Lazer', color: '#ec4899' } })

  console.log('Seed completo: Contas e Categorias criadas!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
