import { prisma } from "@/lib/prisma";
import StatusDashboardClient from "./StatusDashboardClient";

export default async function StatusIAPage() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const logs = await prisma.aiUsageLog.findMany({
    where: {
      createdAt: {
        gte: thirtyDaysAgo
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Calculate Metrics
  const totalCalls = logs.length;
  const last7dCalls = logs.filter(l => l.createdAt >= sevenDaysAgo).length;
  const totalTokens = logs.reduce((acc, log) => acc + log.totalTokens, 0);
  const totalCost = logs.reduce((acc, log) => acc + log.costUsd, 0);
  const errors = logs.filter(l => l.status === "ERROR").length;
  const errorRate = totalCalls > 0 ? (errors / totalCalls) * 100 : 0;

  // Latency percentiles
  const successfulLatencies = logs
    .filter(l => l.status === "SUCCESS")
    .map(l => l.latencyMs)
    .sort((a, b) => a - b);
  
  let p50 = 0;
  let p95 = 0;
  if (successfulLatencies.length > 0) {
    p50 = successfulLatencies[Math.floor(successfulLatencies.length * 0.50)];
    p95 = successfulLatencies[Math.floor(successfulLatencies.length * 0.95)];
  }

  // Group chart data by Date (DD/MM)
  const chartDataMap: Record<string, any> = {};
  
  // Initialize last 5 days just to look nice even if empty
  for (let i = 4; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    chartDataMap[dateStr] = { date: dateStr, "Lançamento Mágico": 0, "Conselheiro": 0 };
  }

  logs.forEach(log => {
    const dateStr = log.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (!chartDataMap[dateStr]) {
      chartDataMap[dateStr] = { date: dateStr, "Lançamento Mágico": 0, "Conselheiro": 0 };
    }
    
    // As per feature name mapping
    if (log.feature === "Lançamento Mágico") {
      chartDataMap[dateStr]["Lançamento Mágico"]++;
    } else {
      chartDataMap[dateStr]["Conselheiro"]++;
    }
  });

  // Sort by date strings (simple assuming same year, month/day order won't break if strictly last 30d without year crossover, but let's keep it simple)
  const chartData = Object.values(chartDataMap);

  const recentLogs = logs.map(l => ({
    id: l.id,
    feature: l.feature,
    status: l.status,
    totalTokens: l.totalTokens,
    costUsd: l.costUsd,
    latencyMs: l.latencyMs,
    date: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(l.createdAt)
  }));

  return (
    <StatusDashboardClient 
      metrics={{
        totalCalls,
        last7dCalls,
        totalTokens,
        totalCost,
        errorRate,
        p50,
        p95
      }}
      chartData={chartData}
      recentLogs={recentLogs}
    />
  );
}
