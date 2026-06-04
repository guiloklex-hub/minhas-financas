import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export type ParsedTransaction = {
  amount: number;
  description: string;
  categoryId: string;
  type: "INCOME" | "EXPENSE";
};

export async function parseTransactionText(
  text: string,
  categories: { id: string; name: string }[]
): Promise<ParsedTransaction> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  
  // O prompt especifica o uso do gemini-3.1-flash-lite (ou o que estiver no .env)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          amount: {
            type: SchemaType.NUMBER,
            description: "Valor numérico da transação sempre positivo (ex: 50.00)"
          },
          description: {
            type: SchemaType.STRING,
            description: "Descrição limpa e profissional do gasto ou receita"
          },
          categoryId: {
            type: SchemaType.STRING,
            description: "O ID exato da categoria que melhor se encaixa"
          },
          type: {
            type: SchemaType.STRING,
            description: "Apenas a palavra INCOME para receitas/ganhos, ou EXPENSE para despesas/gastos"
          }
        },
        required: ["amount", "description", "categoryId", "type"]
      }
    }
  });

  const categoriesContext = categories
    .map(c => `ID: ${c.id} - Nome: ${c.name}`)
    .join("\n");

  const prompt = `
Você é um interpretador financeiro. Sua tarefa é ler o texto do usuário e extrair os dados para estruturar uma transação.
Aqui estão as categorias disponíveis no banco de dados:
${categoriesContext}

Se não encontrar uma categoria perfeita, escolha a que mais se aproxima ou lance na mais genérica.

Texto do usuário: "${text}"
`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    const parsed = JSON.parse(responseText) as ParsedTransaction;
    return parsed;
  } catch (e) {
    console.error("Failed to parse Gemini response:", responseText);
    throw new Error("Não foi possível entender a transação estruturada.");
  }
}
