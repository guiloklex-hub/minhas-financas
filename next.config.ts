import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default é 1MB. Subimos para 10MB para suportar uploads via Server Action:
      // import de fatura por IA (PDF/imagem), OCR/conciliação e import de CSV (até 2MB).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
