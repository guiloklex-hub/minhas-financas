import { getInvestments } from "@/actions/investments";
import InvestmentDashboardClient from "./InvestmentDashboardClient";

export default async function InvestimentosPage() {
  const investments = await getInvestments();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Investimentos</h2>
        <p className="text-muted mt-1">Simule o poder dos juros compostos e consulte a IA.</p>
      </div>
      
      <InvestmentDashboardClient initialInvestments={investments} />
    </div>
  );
}
