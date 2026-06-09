import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import BackupClient from "./BackupClient";

export default async function BackupPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-foreground">Backup</h3>
        <p className="text-sm text-muted">
          Exporte seus dados em JSON ou restaure a partir de um backup anterior.
        </p>
      </div>

      <BackupClient />
    </div>
  );
}
