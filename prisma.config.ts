import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Configuração do Prisma CLI (v7). A URL de conexão saiu do schema.prisma e
// vive aqui; no runtime, o PrismaClient usa o driver adapter (ver src/lib/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
