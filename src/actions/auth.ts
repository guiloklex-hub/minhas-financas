"use server"

import { prisma } from "@/lib/prisma"
import { signJwt, setSessionCookie, deleteSessionCookie } from "@/lib/auth"
import { rateLimit, resetRateLimit } from "@/lib/rate-limit"
import { createAuditLog } from "@/lib/audit"
import { verifyToken } from "@/lib/totp"
import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Extrai o IP do cliente a partir dos headers da requisição (best-effort).
 * Usa o último hop de `x-forwarded-for` (não o primeiro — spoofável) e cai para
 * `x-real-ip`. Retorna "unknown" se indisponível. Nunca lança.
 */
async function getRequestIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
    return h.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}

type AuthResult = {
  success: boolean;
  message?: string;
  error?: string;
  requiresTwoFactor?: boolean;
};

export async function hasRegisteredUser(): Promise<boolean> {
  try {
    const count = await prisma.user.count();
    return count > 0;
  } catch {
    return false;
  }
}

export async function registerUser(formData: FormData): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const hasUsers = await hasRegisteredUser();
    if (hasUsers) {
      return { success: false, error: "Registro desativado: O sistema já possui um usuário cadastrado." };
    }

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password || password.length < 6) {
      return { success: false, error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." };
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return { success: false, error: "E-mail já está em uso." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      }
    });

    const token = await signJwt({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return { success: true, message: "Conta criada com sucesso!" };
  } catch (error) {
    console.error("Erro ao registrar:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

export async function authenticateUser(formData: FormData): Promise<AuthResult> {
  try {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const token = (formData.get("token") as string | null) ?? undefined;

    if (!email || !password) {
      return { success: false, error: "E-mail e senha são obrigatórios." };
    }

    const ip = await getRequestIp();

    // Rate limit por (recurso + email + IP): 5 tentativas por minuto.
    const limited = rateLimit(`login:${email}:${ip}`, 5, 60_000);
    if (!limited.ok) {
      return { success: false, error: "Muitas tentativas, tente novamente em instantes." };
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Mensagem indistinta (anti-enumeração): não diferenciar email x senha.
    if (!user) {
      await createAuditLog({ action: "LOGIN_FAILED", entity: "User", ipAddress: ip });
      return { success: false, error: "Credenciais inválidas." };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await createAuditLog({ action: "LOGIN_FAILED", entity: "User", entityId: user.id, ipAddress: ip });
      return { success: false, error: "Credenciais inválidas." };
    }

    // 2FA: senha confere, mas o usuário tem TOTP ativo.
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const normalizedToken = typeof token === "string" ? token.trim() : "";
      if (!normalizedToken || normalizedToken === "undefined") {
        // Frontend ainda não coletou o código: pedir o segundo fator.
        return { success: false, requiresTwoFactor: true };
      }

      const validToken = verifyToken(normalizedToken, user.twoFactorSecret);
      if (!validToken) {
        await createAuditLog({ action: "LOGIN_FAILED", entity: "User", entityId: user.id, ipAddress: ip });
        return { success: false, requiresTwoFactor: true, error: "Código de verificação inválido." };
      }
    }

    const jwt = await signJwt({ userId: user.id, email: user.email });
    await setSessionCookie(jwt);

    // Sucesso: zera o contador de tentativas e audita.
    resetRateLimit(`login:${email}:${ip}`);
    await createAuditLog({ action: "LOGIN_SUCCESS", entity: "User", entityId: user.id, ipAddress: ip });

    return { success: true, message: "Login realizado com sucesso!" };
  } catch (error) {
    console.error("Erro no login:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

export async function logoutUser() {
  await deleteSessionCookie();
  redirect("/login");
}
