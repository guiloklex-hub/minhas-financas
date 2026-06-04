"use server"

import { prisma } from "@/lib/prisma"
import { signJwt, setSessionCookie, deleteSessionCookie } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"

export async function registerUser(formData: FormData): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
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

export async function authenticateUser(formData: FormData): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      return { success: false, error: "E-mail e senha são obrigatórios." };
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { success: false, error: "Credenciais inválidas." };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return { success: false, error: "Credenciais inválidas." };
    }

    const token = await signJwt({ userId: user.id, email: user.email });
    await setSessionCookie(token);

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
