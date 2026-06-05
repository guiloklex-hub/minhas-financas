"use server"

import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { createAuditLog } from "@/lib/audit"
import { rateLimit } from "@/lib/rate-limit"
import { sendEmail } from "@/lib/email"
import { generateSecret2FA, otpauthURL, verifyToken } from "@/lib/totp"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import QRCode from "qrcode"
import { headers } from "next/headers"

type ActionResult = { success: boolean; message?: string; error?: string };

/**
 * Extrai o IP do cliente dos headers (best-effort, nunca lança).
 * Usa o último hop de `x-forwarded-for` (não o primeiro — spoofável).
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

/**
 * Determina a base URL absoluta para montar o link de reset de senha.
 * Prioriza o header `origin`, depois `host`, depois `APP_URL`, e por fim
 * localhost em dev.
 */
async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const origin = h.get("origin");
    if (origin) return origin.replace(/\/$/, "");
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
      return `${proto}://${host}`;
    }
  } catch {
    // ignora — usa fallback abaixo
  }
  return (process.env.APP_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

// ── 2FA ──────────────────────────────────────────────────────────────────────

/**
 * Inicia o cadastro de 2FA: gera um segredo (ainda NÃO ativa) e retorna o
 * otpauth URL + QR Code em data URL. O client guarda o `secret` pendente e o
 * reenvia em `confirmTwoFactor`.
 */
export async function startTwoFactorSetup(): Promise<
  ActionResult & { secret?: string; otpauthUrl?: string; qrDataUrl?: string }
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Usuário não autenticado." };

    const secret = generateSecret2FA();
    const otpauthUrl = otpauthURL(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { success: true, secret, otpauthUrl, qrDataUrl };
  } catch (error) {
    console.error("Erro ao iniciar 2FA:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

/**
 * Confirma e ativa o 2FA: valida o token contra o segredo pendente e, se ok,
 * persiste `twoFactorSecret` + `twoFactorEnabled = true`.
 */
export async function confirmTwoFactor(secret: string, token: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Usuário não autenticado." };

    if (!secret || !token) {
      return { success: false, error: "Código inválido." };
    }

    const isValid = verifyToken(token, secret);
    if (!isValid) {
      return { success: false, error: "Código inválido. Verifique o app autenticador e tente novamente." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret, twoFactorEnabled: true },
    });

    await createAuditLog({
      action: "TWO_FACTOR_ENABLED",
      entity: "User",
      entityId: user.id,
      ipAddress: await getRequestIp(),
    });

    return { success: true, message: "Verificação em duas etapas ativada com sucesso!" };
  } catch (error) {
    console.error("Erro ao confirmar 2FA:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

/**
 * Desativa o 2FA. Exige a senha atual (bcrypt) para confirmar a identidade.
 */
export async function disableTwoFactor(password: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Usuário não autenticado." };

    if (!password) {
      return { success: false, error: "Informe sua senha para desativar." };
    }

    const userDb = await prisma.user.findUnique({ where: { id: user.id } });
    if (!userDb) return { success: false, error: "Usuário não encontrado." };

    const passwordMatch = await bcrypt.compare(password, userDb.password);
    if (!passwordMatch) {
      return { success: false, error: "Senha incorreta." };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });

    await createAuditLog({
      action: "TWO_FACTOR_DISABLED",
      entity: "User",
      entityId: user.id,
      ipAddress: await getRequestIp(),
    });

    return { success: true, message: "Verificação em duas etapas desativada." };
  } catch (error) {
    console.error("Erro ao desativar 2FA:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

// ── Recuperação de senha ──────────────────────────────────────────────────────

const GENERIC_RESET_MESSAGE =
  "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.";

/**
 * Solicita reset de senha. SEMPRE retorna mensagem genérica (anti-enumeração).
 * Se o usuário existir, gera um token opaco + expiração de 1h e envia e-mail
 * com o link (best-effort).
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  try {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail) {
      return { success: true, message: GENERIC_RESET_MESSAGE };
    }

    const ip = await getRequestIp();

    // Rate limit por (recurso + email + IP): 5 solicitações por 15 min.
    const limited = rateLimit(`reset:${normalizedEmail}:${ip}`, 5, 15 * 60_000);
    if (!limited.ok) {
      return { success: false, error: "Muitas tentativas, tente novamente em instantes." };
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60_000); // 1 hora

      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpires: expires },
      });

      const baseUrl = await getBaseUrl();
      const link = `${baseUrl}/redefinir-senha?token=${token}`;

      await sendEmail({
        to: user.email,
        subject: "Redefinição de senha — Minhas Finanças",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Redefinição de senha</h2>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
            <p>Clique no botão abaixo para criar uma nova senha. O link expira em 1 hora.</p>
            <p style="margin: 24px 0;">
              <a href="${link}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                Redefinir senha
              </a>
            </p>
            <p style="font-size:12px;color:#888;">Se você não solicitou isso, ignore este e-mail. Sua senha permanece inalterada.</p>
          </div>
        `,
      });

      await createAuditLog({
        action: "PASSWORD_RESET_REQUESTED",
        entity: "User",
        entityId: user.id,
        ipAddress: ip,
      });
    } else {
      // Audita a tentativa mesmo sem usuário, mas não vaza a inexistência.
      await createAuditLog({ action: "PASSWORD_RESET_REQUESTED", entity: "User", ipAddress: ip });
    }

    return { success: true, message: GENERIC_RESET_MESSAGE };
  } catch (error) {
    console.error("Erro ao solicitar reset de senha:", error);
    // Mantém mensagem genérica mesmo em erro para não vazar nada.
    return { success: true, message: GENERIC_RESET_MESSAGE };
  }
}

/**
 * Redefine a senha consumindo o token ATOMICAMENTE via `updateMany` filtrando
 * `resetToken` E `resetTokenExpires > agora`. `count === 0` significa token
 * inválido/expirado ou já consumido (previne replay/race).
 */
export async function resetPassword(token: string, newPassword: string): Promise<ActionResult> {
  try {
    if (!token || !newPassword || newPassword.length < 6) {
      return { success: false, error: "Senha inválida. A nova senha deve ter no mínimo 6 caracteres." };
    }

    const ip = await getRequestIp();

    // Rate limit por (token + IP) para frear brute-force no token.
    const limited = rateLimit(`reset-consume:${ip}`, 10, 15 * 60_000);
    if (!limited.ok) {
      return { success: false, error: "Muitas tentativas, tente novamente em instantes." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await prisma.user.updateMany({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    if (result.count === 0) {
      return { success: false, error: "Token inválido ou expirado." };
    }

    await createAuditLog({ action: "PASSWORD_RESET_COMPLETED", entity: "User", ipAddress: ip });

    return { success: true, message: "Senha redefinida com sucesso! Você já pode entrar com a nova senha." };
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}
