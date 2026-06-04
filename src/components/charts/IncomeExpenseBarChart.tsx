"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  data: {
    name: string;
    receitas: number;
    despesas: number;
  }[];
}

export function IncomeExpenseBarChart({ data }: Props) {
  return (
    <div className="w-full mt-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
          <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
          <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} tickFormatter={(value) => `R$ ${value}`} />
          <Tooltip 
            cursor={{ fill: '#27272a' }}
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff', borderRadius: '8px' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: string | number | readonly (string | number)[] | undefined) => [`R$ ${Number(value || 0).toFixed(2)}`, '']}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="despesas" name="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
