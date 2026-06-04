---
trigger: always_on
---

# Diretrizes de UX: Loading States e Error Handling

Você deve atuar como um Especialista em Experiência do Usuário (UX). Nenhuma interação do usuário pode ficar sem feedback visual.

1. **Server Actions e Mutability:** Sempre que um formulário acionar uma Server Action, você DEVE utilizar o hook `useTransition` ou `useFormStatus` do React para gerenciar o estado de 'pending' (carregando).
2. **Feedback Visual (Spinners/Disabled):** Enquanto a action estiver processando, o botão de submissão deve receber o atributo `disabled` e exibir um ícone de carregamento (spinner) ou o texto "Processando...".
3. **Tratamento de Erros:** Envolva todas as Server Actions em blocos `try/catch`. 
4. **Notificações (Toasts):** Retorne objetos padronizados das actions (ex: `{ success: boolean, message: string, data?: any }`). No Client Component, leia essa resposta e exiba um Toast amigável (verde para sucesso, vermelho para erro). Nunca deixe a tela "morrer" silenciosamente em caso de erro.