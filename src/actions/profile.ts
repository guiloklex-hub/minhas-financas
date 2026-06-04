"use server"

import { prisma } from "@/lib/prisma"
import { verifyJwt } from "@/lib/auth"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"

// Utilitário interno para pegar o usuário logado
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) return null;

  try {
    const payload = await verifyJwt(sessionCookie);
    if (!payload || !payload.userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true
      }
    });

    return user;
  } catch (error) {
    return null;
  }
}

// Action para atualizar perfil
export async function updateProfile(formData: FormData): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Usuário não autenticado." };
    }

    const name = formData.get("name") as string;
    const avatarUrl = formData.get("avatarUrl") as string;

    await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        name: name || null,
        avatarUrl: avatarUrl || null,
      }
    });

    revalidatePath("/", "layout");
    
    return { success: true, message: "Perfil atualizado com sucesso!" };
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}

// Action para trocar a senha
export async function changePassword(formData: FormData): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Usuário não autenticado." };
    }

    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return { success: false, error: "Senhas inválidas. A nova senha deve ter no mínimo 6 caracteres." };
    }

    // Busca o usuário completo para pegar o hash
    const userDb = await prisma.user.findUnique({ where: { id: currentUser.id } });
    if (!userDb) return { success: false, error: "Usuário não encontrado." };

    const passwordMatch = await bcrypt.compare(currentPassword, userDb.password);
    if (!passwordMatch) {
      return { success: false, error: "A senha atual está incorreta." };
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { password: hashedNewPassword }
    });

    return { success: true, message: "Senha alterada com segurança!" };
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return { success: false, error: "Erro interno no servidor." };
  }
}
