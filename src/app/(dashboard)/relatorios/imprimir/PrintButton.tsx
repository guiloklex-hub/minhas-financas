"use client";

import { Printer } from "lucide-react";

/**
 * Botão de impressão do relatório. Chama window.print().
 * Escondido na própria impressão via print:hidden.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden px-4 py-2 rounded-md bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors flex items-center gap-2 shrink-0"
    >
      <Printer size={16} />
      Imprimir
    </button>
  );
}
