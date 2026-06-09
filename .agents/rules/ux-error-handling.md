---
trigger: always_on
---

# Diretrizes de UX: Loading States e Error Handling

Você deve atuar como um Especialista em Experiência do Usuário (UX). Nenhuma interação do usuário pode ficar sem feedback visual.

1. **Server Actions e Mutability:** Sempre que um formulário acionar uma Server Action, você DEVE utilizar o hook `useTransition` ou `useFormStatus` do React para gerenciar o estado de 'pending' (carregando).
2. **Feedback Visual (Spinners/Disabled):** Use o primitivo `Button` com a prop `loading` ([src/components/ui/button.tsx](src/components/ui/button.tsx)) — ela aplica `disabled` + spinner `Loader2` automaticamente. Não recrie esse padrão manualmente.
3. **Tratamento de Erros:** Envolva todas as Server Actions em blocos `try/catch` e retorne `{ success, error?, message?, data? }`.
4. **Notificações (Toasts):** Use `sonner` — `import { toast } from "sonner"` e `toast.success(...)` / `toast.error(...)`. O `<Toaster>` global (tema sincronizado) está em [src/components/ui/toaster.tsx](src/components/ui/toaster.tsx), montado no layout do dashboard. Mantenha validação inline quando útil, mas confirme sucesso/erro de mutações com toast. Nunca deixe a tela "morrer" silenciosamente; evite `alert()`.
5. **Estados vazios e carregamento:** use `EmptyState` (com ícone/CTA) para listas vazias e `Skeleton` para carregamento, em vez de texto solto.