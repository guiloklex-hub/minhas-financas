"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Props {
  data: {
    name: string;
    value: number;
    color: string;
  }[];
}

export function CategoryPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] w-full mt-4 flex items-center justify-center text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/50">
        Nenhuma despesa no período
      </div>
    );
  }

  return (
    <div className="w-full mt-4">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || '#52525b'} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff', borderRadius: '8px' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: string | number | readonly (string | number)[] | undefined) => [`R$ ${Number(value || 0).toFixed(2)}`, 'Valor']}
          />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '20px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
