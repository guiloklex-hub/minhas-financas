import { getCurrentUser } from "@/lib/session";
import ProfileFormClient from "./ProfileFormClient";
import { redirect } from "next/navigation";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="bg-card/60 border border-border rounded-xl p-8 max-w-2xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-foreground">Informações Pessoais</h3>
        <p className="text-sm text-muted">Atualize a foto e o seu nome de exibição no sistema.</p>
      </div>

      <ProfileFormClient 
        initialName={user.name || ""} 
        initialAvatar={user.avatarUrl || ""} 
        email={user.email} 
      />
    </div>
  );
}
