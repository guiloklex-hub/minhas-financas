---
trigger: always_on
---

# Diretrizes de Segurança e Integração com LLMs (Gemini)

Durante a manutenção ou criação de funcionalidades envolvendo a API do Google Gemini (ou outros LLMs), siga ESTRITAMENTE estas regras:

1. **Gestão de Segredos:** É estritamente proibido fazer hardcode de chaves de API (ex: `GEMINI_API_KEY`) em qualquer arquivo `.ts` ou `.tsx`. Use sempre `process.env.GEMINI_API_KEY`. Se criar uma nova variável, você deve obrigatoriamente adicioná-la ao arquivo `.env.example`.
2. **Structured Outputs (JSON):** Quando o objetivo for extrair dados (ex: Lançamento Mágico), você DEVE configurar o modelo do Gemini para retornar JSON puro, definindo o `responseSchema` na chamada do SDK ou utilizando o `responseMimeType: "application/json"`. 
3. **Resiliência:** LLMs podem falhar, demorar ou alucinar. As funções em `src/actions/ai-advisor.ts` e `src/actions/ai-transactions.ts` devem possuir fallbacks (respostas padrão) caso a API retorne erro de timeout ou erro 500, garantindo que o Dashboard principal nunca fique fora do ar por causa da IA.