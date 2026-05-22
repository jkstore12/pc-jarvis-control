# PC Jarvis Control

PC Jarvis Control e uma plataforma MVP para controlar um PC Windows pelo celular usando painel web responsivo, API em tempo real, agente local e bot Telegram.

## Arquitetura

- `apps/web`: painel React Vite + TailwindCSS.
- `apps/server`: API Express, Socket.IO, JWT, Telegram Bot API e logs Supabase.
- `apps/agent`: agente local Windows conectado ao servidor por Socket.IO.
- `packages/shared`: tipos, whitelist de comandos e contratos compartilhados.

Topologia do MVP: o servidor fica em uma maquina cloud ou acessivel publicamente, e o agente Windows conecta para fora usando `AGENT_SECRET`. O celular acessa o painel web/API pelo endereco do servidor.

## Funcionalidades MVP

- Login com JWT.
- Status do PC: CPU, RAM, disco e uptime.
- Screenshot remota.
- Abrir Chrome e VS Code.
- Controle de volume.
- Desligar e reiniciar com confirmacao.
- Historico de comandos.
- Bot Telegram com `/status`, `/screenshot`, `/open_chrome`, `/open_vscode`, `/shutdown` e `/restart`.
- Whitelist obrigatoria de comandos, sem execucao livre.

## Requisitos

- Node.js 22+.
- pnpm 9+.
- Windows com PowerShell para rodar `apps/agent`.
- Projeto Supabase para persistir logs.
- Bot Telegram opcional para o MVP.

## Instalacao

```powershell
pnpm install
```

Crie os arquivos de ambiente:

```powershell
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/agent/.env.example apps/agent/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Gere o hash bcrypt da senha admin:

```powershell
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('sua-senha-forte', 10).then(console.log)"
```

Cole o resultado em `apps/server/.env` como `ADMIN_PASSWORD_HASH`.

## Supabase

Execute o SQL em `supabase/command_logs.sql` no SQL Editor do Supabase.

Use `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor. Nunca coloque essa chave no frontend. A tabela ativa RLS, remove acesso de `anon` e `authenticated`, e concede acesso ao `service_role`, alinhado com o modelo server-side do MVP.

Se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nao forem configurados, o servidor usa logs em memoria apenas para desenvolvimento.

## Rodando em desenvolvimento

Terminal 1:

```powershell
pnpm dev:server
```

Terminal 2:

```powershell
pnpm dev:web
```

Terminal 3, no PC Windows que sera controlado:

```powershell
pnpm dev:agent
```

Abra o painel em `http://localhost:5173`.

## Telegram

No `apps/server/.env`, configure:

```env
TELEGRAM_BOT_TOKEN=token-do-bot
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

Somente IDs listados podem executar comandos. Comandos perigosos pedem um codigo temporario de confirmacao.

## Comandos permitidos

A whitelist fica em `packages/shared/src/index.ts` e tambem e validada pelo agente:

- `status`
- `screenshot`
- `open_chrome`
- `open_vscode`
- `shutdown`
- `restart`
- `set_volume`

O agente bloqueia `shutdown` e `restart` por padrao. Para permitir de verdade no Windows, configure:

```env
POWER_COMMANDS_ENABLED=true
```

## Logs locais do agente

O agente salva logs locais no diretorio configurado por `LOG_DIR`, com `logs` como padrao:

- `agent.log.jsonl`: fluxo agregado de eventos do agente.
- `agent-YYYY-MM-DD.log.jsonl`: arquivo diario.
- `latest-status.json`: ultimo status coletado do PC.

Por padrao, o agente registra conexao, desconexao, erros, comandos recebidos e comandos concluidos. Para registrar tambem cada heartbeat de status enviado a cada 5 segundos, use:

```env
LOG_STATUS_HEARTBEATS=true
```

## Scripts

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm dev:server
pnpm dev:web
pnpm dev:agent
```

## Seguranca do MVP

- Nao existe comando livre.
- Web usa JWT em rotas protegidas e no Socket.IO.
- Agente usa `AGENT_SECRET` no handshake Socket.IO.
- Telegram usa allowlist de user IDs.
- Desligar e reiniciar exigem confirmacao.
- Toda tentativa de comando e registrada.
- Supabase service role fica apenas no backend.

## Acesso remoto fora do Wi-Fi

O projeto suporta modo cloud profissional: o servidor Node publica a API, Socket.IO e tambem serve o painel web buildado na mesma origem HTTPS.

Leia o guia completo em [docs/remote-access.md](docs/remote-access.md).

Resumo:

```env
# servidor cloud
NODE_ENV=production
STATIC_WEB_DIR=/app/apps/web/dist
TRUST_PROXY=true
CORS_ORIGIN=https://seu-dominio.com

# agente Windows
SERVER_URL=https://seu-dominio.com
AGENT_SECRET=o-mesmo-agent-secret-do-servidor
```

No celular, acesse `https://seu-dominio.com`.

## Deploy

O servidor respeita `PORT` e `CORS_ORIGIN`, entao pode ser hospedado em qualquer plataforma Node.js. Para producao, use HTTPS, configure `CORS_ORIGIN` com o dominio real do painel, use segredos fortes e rode o agente como processo persistente no Windows.

## Proximos passos

- Empacotar o agente como Windows Service.
- Adicionar Supabase Auth ou SSO.
- Criar permissoes por usuario e papeis.
- Adicionar auditoria visual e filtros de historico.
- Melhorar volume com CoreAudio nativo.
- Adicionar transferencia de arquivos.
- Configurar deploy com HTTPS, dominio e observabilidade.
