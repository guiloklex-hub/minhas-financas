"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  data: {
    name: string; // "MM/AAAA"
    comprometido: number;
    projetado: number;
  }[];
}

export function FutureInvoicesBar({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] w-full flex items-center justify-center text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/50">
        Sem projeção disponível
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
      <h3 className="text-lg font-bold text-white mb-6">Projeção de faturas futuras</h3>
      <div className="w-full h-[300px] min-w-0 min-h-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
            <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
            <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} tickFormatter={(value) => `R$ ${value}`} />
            <Tooltip
              cursor={{ fill: '#27272a' }}
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value) => [`R$ ${Number(value || 0).toFixed(2)}`, '']}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="comprometido" name="Comprometido (parcelas)" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="projetado" name="Projetado (total)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
