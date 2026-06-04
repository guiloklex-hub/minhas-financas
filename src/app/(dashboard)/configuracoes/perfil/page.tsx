import { getCurrentUser } from "@/actions/profile";
import ProfileFormClient from "./ProfileFormClient";
import { redirect } from "next/navigation";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8 max-w-2xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white">Informações Pessoais</h3>
        <p className="text-sm text-zinc-400">Atualize a foto e o seu nome de exibição no sistema.</p>
      </div>

      <ProfileFormClient 
        initialName={user.name || ""} 
        initialAvatar={user.avatarUrl || ""} 
        email={user.email} 
      />
    </div>
  );
}
