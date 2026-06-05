/**
 * Resultado de validação discriminado: ok=true traz o value já tipado/parseado;
 * ok=false traz uma mensagem de erro em pt-BR.
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Valida uma string obrigatória vinda de FormData.
 * Aplica trim, exige conteúdo não-vazio e limita o tamanho (default 120).
 */
export function parseRequiredString(
  v: FormDataEntryValue | null,
  field: string,
  max: number = 120
): ValidationResult<string> {
  if (typeof v !== "string") {
    return { ok: false, error: `${field} é obrigatório.` };
  }

  const trimmed = v.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${field} é obrigatório.` };
  }

  if (trimmed.length > max) {
    return {
      ok: false,
      error: `${field} deve ter no máximo ${max} caracteres.`,
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * Valida um valor monetário vindo de FormData.
 * Exige número finito dentro do intervalo [min, max] (defaults: 0 e 1 bilhão).
 */
export function parseMoney(
  v: FormDataEntryValue | null,
  field: string,
  opts?: { min?: number; max?: number }
): ValidationResult<number> {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? 1_000_000_000;

  if (typeof v !== "string" || v.trim().length === 0) {
    return { ok: false, error: `${field} é obrigatório.` };
  }

  const num = Number(v);
  if (!Number.isFinite(num)) {
    return { ok: false, error: `${field} deve ser um número válido.` };
  }

  if (num < min) {
    return { ok: false, error: `${field} deve ser maior ou igual a ${min}.` };
  }

  if (num > max) {
    return { ok: false, error: `${field} deve ser menor ou igual a ${max}.` };
  }

  return { ok: true, value: num };
}

/**
 * Valida uma data vinda de FormData.
 * Exige string não-vazia que produza uma Date válida.
 */
export function parseDate(
  v: FormDataEntryValue | null,
  field: string
): ValidationResult<Date> {
  if (typeof v !== "string" || v.trim().length === 0) {
    return { ok: false, error: `${field} é obrigatório.` };
  }

  const date = new Date(v);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${field} deve ser uma data válida.` };
  }

  return { ok: true, value: date };
}
