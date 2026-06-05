/**
 * Rate limiter in-memory baseado em janela deslizante simples (fixed window).
 *
 * Mantém um Map de chaves → estado da janela atual. Não é distribuído: serve
 * para proteger endpoints/ações de força-bruta num único processo (login,
 * recuperação de senha). A chave deve combinar recurso + identificador
 * (ex.: `login:user@x.com`, `reset:1.2.3.4`).
 *
 * `now` é injetável para facilitar testes determinísticos sem fake timers.
 */

type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

export type RateLimitResult = { ok: boolean; retryAfterMs?: number };

/**
 * Registra uma tentativa para `key` e indica se ela é permitida.
 *
 * @param key        identificador único do recurso + ator
 * @param max        número máximo de tentativas permitidas dentro da janela
 * @param windowMs   duração da janela em milissegundos
 * @param now        timestamp atual (injetável; default Date.now())
 * @returns `{ ok: true }` se permitido; `{ ok: false, retryAfterMs }` se excedeu
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = store.get(key);

  // Sem janela ativa ou janela expirada → inicia uma nova.
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  // Dentro da janela: ainda há cota.
  if (existing.count < max) {
    existing.count += 1;
    return { ok: true };
  }

  // Excedeu a cota: bloqueia até o reset.
  return { ok: false, retryAfterMs: existing.resetAt - now };
}

/**
 * Remove o estado de uma chave (ex.: zerar tentativas após login bem-sucedido).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Limpa todo o estado. Uso principal: isolamento entre testes.
 */
export function clearRateLimitStore(): void {
  store.clear();
}
