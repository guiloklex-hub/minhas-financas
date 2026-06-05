import { roundMoney } from "./money";

/**
 * Calcula o saldo atual de uma conta:
 *   saldo = saldoInicial + soma(INCOME) - soma(EXPENSE)
 * O resultado é arredondado com roundMoney.
 */
export function computeAccountBalance(
  initialBalance: number,
  transactions: { type: string; amount: number }[]
): number {
  const total = transactions.reduce((acc, t) => {
    if (t.type === "INCOME") return acc + t.amount;
    if (t.type === "EXPENSE") return acc - t.amount;
    return acc;
  }, initialBalance);

  return roundMoney(total);
}

/**
 * Calcula o saldo atual de várias contas de uma só vez.
 * Agrupa as transações por accountId (Map) e retorna cada conta com o campo
 * adicional currentBalance.
 */
export function computeAccountBalances<
  A extends { id: string; initialBalance: number }
>(
  accounts: A[],
  transactions: { accountId: string; type: string; amount: number }[]
): Array<A & { currentBalance: number }> {
  const byAccount = new Map<string, { type: string; amount: number }[]>();

  for (const t of transactions) {
    const list = byAccount.get(t.accountId);
    if (list) {
      list.push({ type: t.type, amount: t.amount });
    } else {
      byAccount.set(t.accountId, [{ type: t.type, amount: t.amount }]);
    }
  }

  return accounts.map((account) => ({
    ...account,
    currentBalance: computeAccountBalance(
      account.initialBalance,
      byAccount.get(account.id) ?? []
    ),
  }));
}
