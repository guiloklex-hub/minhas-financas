import { getExchangeRates } from "@/actions/exchange-rates";
import CurrencyClient from "./CurrencyClient";

export default async function MoedasPage() {
  const rates = await getExchangeRates();

  return (
    <div>
      <CurrencyClient initialRates={rates} />
    </div>
  );
}
