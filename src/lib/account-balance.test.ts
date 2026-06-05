import { describe, it, expect } from "vitest";
import {
  computeAccountBalance,
  computeAccountBalances,
} from "./account-balance";

describe("account-balance.ts", () => {
  describe("computeAccountBalance", () => {
    it("deve somar INCOME e subtrair EXPENSE (100 + 50 - 30 === 120)", () => {
      const result = computeAccountBalance(100, [
        { type: "INCOME", amount: 50 },
        { type: "EXPENSE", amount: 30 },
      ]);
      expect(result).toBe(120);
    });

    it("deve retornar o saldo inicial quando não há transações", () => {
      expect(computeAccountBalance(250.75, [])).toBe(250.75);
    });

    it("deve ignorar transações de tipo desconhecido", () => {
      const result = computeAccountBalance(100, [
        { type: "INCOME", amount: 50 },
        { type: "TRANSFER", amount: 999 },
        { type: "UNKNOWN", amount: 12 },
      ]);
      expect(result).toBe(150);
    });

    it("deve arredondar o resultado para 2 casas decimais", () => {
      const result = computeAccountBalance(0, [
        { type: "INCOME", amount: 0.1 },
        { type: "INCOME", amount: 0.2 },
      ]);
      expect(result).toBe(0.3);
    });

    it("deve permitir saldo final negativo", () => {
      const result = computeAccountBalance(0, [
        { type: "EXPENSE", amount: 100 },
        { type: "INCOME", amount: 30 },
      ]);
      expect(result).toBe(-70);
    });
  });

  describe("computeAccountBalances", () => {
    it("deve mapear currentBalance para cada conta usando suas próprias transações", () => {
      const accounts = [
        { id: "a", initialBalance: 100 },
        { id: "b", initialBalance: 200 },
      ];
      const transactions = [
        { accountId: "a", type: "INCOME", amount: 50 },
        { accountId: "a", type: "EXPENSE", amount: 30 },
        { accountId: "b", type: "EXPENSE", amount: 100 },
      ];

      const result = computeAccountBalances(accounts, transactions);

      expect(result).toEqual([
        { id: "a", initialBalance: 100, currentBalance: 120 },
        { id: "b", initialBalance: 200, currentBalance: 100 },
      ]);
    });

    it("deve ignorar transações cujo accountId não pertence à conta", () => {
      const accounts = [{ id: "a", initialBalance: 100 }];
      const transactions = [
        { accountId: "a", type: "INCOME", amount: 50 },
        { accountId: "outra-conta", type: "INCOME", amount: 9999 },
      ];

      const result = computeAccountBalances(accounts, transactions);

      expect(result[0].currentBalance).toBe(150);
    });

    it("deve usar o saldo inicial quando a conta não tem transações", () => {
      const accounts = [
        { id: "a", initialBalance: 100 },
        { id: "b", initialBalance: 200 },
      ];
      const transactions = [{ accountId: "a", type: "INCOME", amount: 50 }];

      const result = computeAccountBalances(accounts, transactions);

      expect(result[0].currentBalance).toBe(150);
      expect(result[1].currentBalance).toBe(200);
    });

    it("deve preservar campos extras da conta no resultado", () => {
      const accounts = [{ id: "a", initialBalance: 100, name: "Carteira" }];
      const transactions = [{ accountId: "a", type: "INCOME", amount: 25 }];

      const result = computeAccountBalances(accounts, transactions);

      expect(result[0].name).toBe("Carteira");
      expect(result[0].currentBalance).toBe(125);
    });

    it("deve retornar lista vazia quando não há contas", () => {
      expect(computeAccountBalances([], [])).toEqual([]);
    });
  });
});
