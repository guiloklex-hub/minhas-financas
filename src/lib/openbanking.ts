/**
 * Scaffold de integração com Open Banking via agregador (ex.: Pluggy).
 *
 * Este módulo é um STUB intencional: ele NÃO faz chamadas de rede. Serve como
 * ponto de bloqueio claro até que as credenciais sejam configuradas e a
 * integração real seja implementada. Os pontos de extensão estão marcados com
 * ROADMAP (feature planejada e gated — ver master_roadmap.md), não como código
 * incompleto a finalizar agora.
 *
 * Para habilitar, defina no ambiente:
 *   PLUGGY_CLIENT_ID
 *   PLUGGY_CLIENT_SECRET
 */

const NOT_CONFIGURED_MESSAGE =
  "Open Banking não configurado (defina PLUGGY_CLIENT_ID/SECRET).";

/**
 * Conexão bancária retornada pelo agregador. Formato mínimo para a UI; será
 * expandido quando a integração real for implementada.
 */
export interface BankConnection {
  id: string;
  institution: string;
  status: string;
}

/**
 * Transação bancária trazida pela sincronização. Mantida intencionalmente
 * genérica até o mapeamento real para `Transaction`.
 */
export interface BankTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  currency: string;
}

/**
 * Indica se as credenciais do agregador estão presentes no ambiente.
 * Usado como gate antes de qualquer operação de Open Banking.
 */
export function isOpenBankingConfigured(): boolean {
  return Boolean(
    process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET
  );
}

/**
 * Lista as conexões bancárias ativas do usuário.
 *
 * Lança um erro claro enquanto o Open Banking não estiver configurado.
 */
export async function listConnections(): Promise<BankConnection[]> {
  if (!isOpenBankingConfigured()) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  // ROADMAP (Open Banking — gated, ver master_roadmap.md): autenticar no
  // agregador (obter API key a partir de PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET)
  // e buscar as conexões (items) do usuário, mapeando a resposta para
  // BankConnection[]. Scaffold intencional: sem chamadas de rede reais aqui.
  throw new Error(NOT_CONFIGURED_MESSAGE);
}

/**
 * Sincroniza as transações bancárias mais recentes a partir do agregador.
 *
 * Lança um erro claro enquanto o Open Banking não estiver configurado.
 */
export async function syncTransactions(): Promise<BankTransaction[]> {
  if (!isOpenBankingConfigured()) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  // ROADMAP (Open Banking — gated, ver master_roadmap.md): para cada conexão de
  // listConnections(), buscar as transações no agregador, deduplicar contra
  // Transaction existentes, converter moeda via @/lib/currency quando necessário
  // e persistir. Scaffold intencional: sem chamadas de rede reais aqui.
  throw new Error(NOT_CONFIGURED_MESSAGE);
}
