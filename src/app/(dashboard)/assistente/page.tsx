import AssistantClient from "./AssistantClient";

export const metadata = {
  title: "Assistente IA",
};

export default function AssistentePage() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Assistente IA</h2>
        <p className="text-zinc-400 mt-2">
          Converse sobre suas finanças, gere sugestões de orçamento e leia comprovantes — tudo com IA.
        </p>
      </div>

      <AssistantClient month={currentMonth} year={currentYear} />
    </div>
  );
}
