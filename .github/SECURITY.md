# Política de Segurança

## Versões suportadas

Por ser um projeto single-user em evolução, apenas a branch `main` recebe correções de segurança.

## Como reportar uma vulnerabilidade

**Não** abra uma issue pública para vulnerabilidades de segurança.

Em vez disso, use o canal privado **"Report a vulnerability"** em
[Security Advisories](https://github.com/guiloklex-hub/minhas-financas/security/advisories/new)
do repositório.

Descreva:

- O tipo de vulnerabilidade e o impacto potencial.
- Passos para reproduzir (proof-of-concept, se possível).
- Versão/commit afetado.

Você receberá uma resposta o mais breve possível. Pedimos discrição até que uma
correção seja publicada.

## Boas práticas já adotadas no projeto

- Senhas com hash `bcryptjs`; sessões via JWT (`jose`) em cookie `httpOnly` + `secure`.
- `JWT_SECRET` obrigatória em produção; segredos comparados com `timingSafeEquals`.
- Login com mensagem indistinta (anti-enumeração) + rate limit + trilha de auditoria.
- 2FA (TOTP), reset de senha com consumo atômico de token, guardrail de custo de IA.

Nunca commite segredos reais (`.env`) nem o banco SQLite (`*.db`) — ambos estão no `.gitignore`.
