import { getCashFlow, getYearComparison, getCategoryBreakdown } from "@/actions/reports";
import ReportsClient from "./ReportsClient";

/** Formata uma Date para "YYYY-MM-DD" no fuso local (formato dos filtros). */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function RelatoriosPage() {
  const now = new Date();
  const year = now.getFullYear();

  // Preset padrão: últimos 12 meses (início no 1º dia do mês, 11 meses atrás).
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // fim do mês atual
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const fromISO = toISODate(from);
  const toISO = toISODate(to);

  const [cashFlow, yearComparison, categoryBreakdown] = await Promise.all([
    getCashFlow(fromISO, toISO),
    getYearComparison(year),
    getCategoryBreakdown(fromISO, toISO),
  ]);

  return (
    <ReportsClient
      initialFrom={fromISO}
      initialTo={toISO}
      initialYear={year}
      initialCashFlow={cashFlow}
      initialYearComparison={yearComparison}
      initialCategoryBreakdown={categoryBreakdown}
    />
  );
}
