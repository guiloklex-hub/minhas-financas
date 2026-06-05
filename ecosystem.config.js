// Configuração do PM2 para rodar o app em produção.
// Roda o binário do Next diretamente (em vez de "npm run start") para o PM2
// monitorar o processo real do servidor — evita o double-fork do wrapper npm.
// A porta (3002) espelha o script "start" do package.json.
module.exports = {
  apps: [
    {
      name: "minhas-financas",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      interpreter: "node",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
