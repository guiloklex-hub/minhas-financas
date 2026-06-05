#!/usr/bin/env bash
#
# Minhas Finanças — instalador/atualizador inteligente
# -----------------------------------------------------
# Detecta automaticamente se é uma INSTALAÇÃO nova ou uma ATUALIZAÇÃO, faz
# backup do banco SQLite antes de migrar, configura o .env (gerando segredos),
# aplica migrações, gera o Prisma Client e (opcionalmente) builda.
#
# Uso:
#   bash scripts/setup.sh [opções]
#
# Opções:
#   --dir <path>      Diretório do projeto (default: raiz do repo deste script)
#   --repo <url>      URL do git para clonar quando o --dir não existir
#   --branch <name>   Branch a usar (default: main)
#   --no-pull         Não fazer git pull (usa o código atual)
#   --no-build        Pular o build de produção
#   --seed            Rodar o seed do banco (popula dados de exemplo)
#   --no-backup       Não fazer backup do SQLite antes de migrar
#   --no-pm2          Não iniciar/recarregar a aplicação via PM2 ao final
#   -h, --help        Mostra esta ajuda
#
set -euo pipefail

# ----- aparência -------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET="\033[0m"; C_BLUE="\033[34m"; C_GREEN="\033[32m"; C_YELLOW="\033[33m"; C_RED="\033[31m"; C_BOLD="\033[1m"
else
  C_RESET=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""
fi
info()  { printf "${C_BLUE}▸${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}✓${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠${C_RESET} %s\n" "$*"; }
err()   { printf "${C_RED}✗ %s${C_RESET}\n" "$*" >&2; }
step()  { printf "\n${C_BOLD}== %s ==${C_RESET}\n" "$*"; }
die()   { err "$*"; exit 1; }

# ----- defaults / args -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"   # repo onde este script vive
OFFICIAL_REPO="https://github.com/guiloklex-hub/minhas-financas.git"

TARGET_DIR="$DEFAULT_DIR"
REPO_URL=""
BRANCH="main"
DO_PULL=1
DO_BUILD=1
DO_SEED=0
DO_BACKUP=1
DO_PM2=1

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)     TARGET_DIR="$2"; shift 2 ;;
    --repo)    REPO_URL="$2"; shift 2 ;;
    --branch)  BRANCH="$2"; shift 2 ;;
    --no-pull) DO_PULL=0; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    --seed)    DO_SEED=1; shift ;;
    --no-backup) DO_BACKUP=0; shift ;;
    --no-pm2)  DO_PM2=0; shift ;;
    -h|--help) sed -n '2,31p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Opção desconhecida: $1 (use --help)" ;;
  esac
done

# ----- pré-requisitos --------------------------------------------------------
step "Verificando pré-requisitos"
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' não encontrado. Instale antes de continuar."; }
need git
need node
need npm

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ é necessário (encontrado: $(node -v))."
fi
ok "git $(git --version | awk '{print $3}') · node $(node -v) · npm $(npm -v)"

# ----- gerar segredo (hex, seguro p/ sed) ------------------------------------
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 48
  else
    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  fi
}

# ----- clonar (instalação nova) ou usar diretório existente ------------------
step "Localizando o projeto"
if [ -d "$TARGET_DIR/.git" ] && [ -f "$TARGET_DIR/package.json" ]; then
  MODE="update"
  info "Repositório existente detectado em: $TARGET_DIR"
else
  MODE="install"
  if [ -z "$REPO_URL" ]; then REPO_URL="$OFFICIAL_REPO"; fi
  if [ -e "$TARGET_DIR" ] && [ -n "$(ls -A "$TARGET_DIR" 2>/dev/null || true)" ]; then
    die "Destino '$TARGET_DIR' existe e não está vazio, mas não é um repositório git. Aborte ou use --dir."
  fi
  info "Instalação nova — clonando $REPO_URL"
  git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
fi
cd "$TARGET_DIR"
ok "Modo: ${C_BOLD}${MODE}${C_RESET} · diretório: $(pwd)"

# ----- atualizar código (git pull) -------------------------------------------
if [ "$MODE" = "update" ] && [ "$DO_PULL" -eq 1 ]; then
  step "Atualizando código (git)"
  if ! git remote get-url origin >/dev/null 2>&1; then
    warn "Sem remote 'origin' — pulando git pull."
  elif [ -n "$(git status --porcelain)" ]; then
    warn "Há alterações locais não commitadas — pulando git pull para não sobrescrevê-las."
    warn "Faça commit/stash e rode novamente, ou use --no-pull para silenciar este aviso."
  else
    git fetch --prune origin
    if git pull --ff-only origin "$BRANCH"; then
      ok "Código atualizado para o topo de origin/$BRANCH."
    else
      warn "Não foi possível fazer fast-forward (branch divergente?). Continuando com o código atual."
    fi
  fi
fi

# ----- dependências ----------------------------------------------------------
step "Instalando dependências"
if [ -f package-lock.json ]; then
  npm ci || { warn "npm ci falhou (lockfile dessincronizado?) — caindo para npm install"; npm install; }
else
  npm install
fi
ok "Dependências instaladas."

# Prisma 7 usa o driver adapter better-sqlite3 (módulo nativo). Em ambientes com
# ignore-scripts ativo o binário pode não ser compilado no install — garantimos aqui.
if [ ! -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
  warn "Binário nativo do better-sqlite3 ausente — compilando..."
  if ( cd node_modules/better-sqlite3 && npx --yes node-gyp rebuild --release >/dev/null 2>&1 ); then
    ok "better-sqlite3 compilado."
  else
    warn "Falha ao compilar better-sqlite3 — verifique build tools (python3/make/g++)."
  fi
fi

# ----- .env ------------------------------------------------------------------
step "Configurando variáveis de ambiente (.env)"
if [ ! -f .env ]; then
  [ -f .env.example ] || die ".env.example não encontrado — não dá para gerar o .env."
  cp .env.example .env
  # Gera segredos fortes onde ainda há placeholder.
  if grep -q 'JWT_SECRET="troque' .env 2>/dev/null; then
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=\"$(gen_secret)\"|" .env
  fi
  if grep -q 'CRON_SECRET="troque' .env 2>/dev/null; then
    sed -i.bak "s|^CRON_SECRET=.*|CRON_SECRET=\"$(gen_secret)\"|" .env
  fi
  rm -f .env.bak
  ok ".env criado a partir de .env.example (JWT_SECRET e CRON_SECRET gerados)."
else
  ok ".env já existe — mantido como está."
fi

# Avisa sobre variáveis ainda vazias/placeholder relevantes para features opcionais.
PENDING=""
check_env() { # $1=chave  $2=descrição
  local val
  val="$(grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
  case "$val" in
    ""|"sua-chave-aqui") PENDING="${PENDING}\n   - $1 → $2" ;;
  esac
}
check_env GEMINI_API_KEY        "recursos de IA (categorização, chatbot, OCR, conselheiro)"
check_env NEXT_PUBLIC_VAPID_PUBLIC_KEY "notificações Web Push (gere com: npx web-push generate-vapid-keys)"
check_env SMTP_HOST             "envio de e-mail (alertas e recuperação de senha)"

# ----- backup do banco SQLite ------------------------------------------------
DB_URL="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [ "$MODE" = "update" ] && [ "$DO_BACKUP" -eq 1 ] && [ "${DB_URL#file:}" != "$DB_URL" ]; then
  step "Backup do banco (antes de migrar)"
  REL="${DB_URL#file:}"; REL="${REL#./}"
  # Prisma resolve file: relativo ao diretório do schema (prisma/).
  DB_PATH=""
  for cand in "prisma/$REL" "$REL"; do
    if [ -f "$cand" ]; then DB_PATH="$cand"; break; fi
  done
  if [ -n "$DB_PATH" ]; then
    mkdir -p backups
    BK="backups/$(basename "$DB_PATH" .db)-$(date +%Y%m%d-%H%M%S).db"
    cp "$DB_PATH" "$BK"
    ok "Backup salvo em: $BK"
  else
    info "Nenhum arquivo SQLite existente encontrado — pulando backup."
  fi
fi

# ----- prisma: migrações + client -------------------------------------------
step "Aplicando migrações e gerando o Prisma Client"
npx prisma migrate deploy
npx prisma generate
ok "Banco em sincronia com o schema."

if [ "$DO_SEED" -eq 1 ]; then
  step "Populando o banco (seed)"
  npx prisma db seed
  ok "Seed concluído."
fi

# ----- build -----------------------------------------------------------------
if [ "$DO_BUILD" -eq 1 ]; then
  step "Build de produção"
  npm run build
  ok "Build concluído."
else
  info "Build pulado (--no-build)."
fi

# ----- iniciar/recarregar com PM2 -------------------------------------------
PM2_ACTIVE=0
if [ "$DO_PM2" -eq 1 ]; then
  if [ "$DO_BUILD" -eq 0 ] && [ ! -d .next ]; then
    warn "Sem build (.next ausente) — pulando PM2. Rode sem --no-build para iniciar via PM2."
  else
    step "Iniciando/recarregando com PM2"
    # Resolve o comando do PM2: usa o global; se ausente, tenta instalar; senão npx.
    if command -v pm2 >/dev/null 2>&1; then
      PM2="pm2"
    else
      info "PM2 não encontrado — instalando globalmente (npm i -g pm2)..."
      if npm install -g pm2 >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
        PM2="pm2"
      else
        warn "Não foi possível instalar o PM2 globalmente — usando 'npx pm2'."
        PM2="npx --yes pm2"
      fi
    fi
    # Recarrega (zero-downtime) se já estiver rodando; senão, inicia.
    if $PM2 reload ecosystem.config.js --update-env >/dev/null 2>&1; then
      ok "Aplicação recarregada no PM2 (zero-downtime)."
    else
      $PM2 start ecosystem.config.js
      ok "Aplicação iniciada no PM2."
    fi
    $PM2 save >/dev/null 2>&1 || true
    PM2_ACTIVE=1
  fi
fi

# ----- resumo ----------------------------------------------------------------
step "Concluído (${MODE})"
if [ -n "$PENDING" ]; then
  warn "Variáveis opcionais ainda não configuradas no .env:"
  printf "%b\n" "$PENDING"
  echo
fi
printf "${C_BOLD}Próximos passos:${C_RESET}\n"
if [ "$PM2_ACTIVE" -eq 1 ]; then
  cat <<EOF
  • App rodando via PM2 em http://localhost:3002
  • Status / logs:       pm2 status · pm2 logs minhas-financas
  • Reiniciar / parar:   pm2 restart minhas-financas · pm2 stop minhas-financas
  • Iniciar no boot (1x, requer sudo): rode 'pm2 startup' e execute o comando exibido; depois 'pm2 save'
EOF
else
  cat <<EOF
  • Iniciar em produção:        npm run start
  • Iniciar em desenvolvimento: npm run dev
EOF
fi
cat <<EOF
  • Cron diário (recorrências/alertas/câmbio):
      curl -H "Authorization: Bearer \$CRON_SECRET" http://localhost:3002/api/cron/daily
$([ "$MODE" = "install" ] && echo "  • No 1º acesso, cadastre o usuário único na tela de registro.")
EOF
ok "Tudo pronto."
