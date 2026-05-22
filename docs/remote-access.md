# Acesso remoto profissional

Este projeto agora suporta um modo cloud de uma unica origem:

- O backend Node roda em um provedor cloud com HTTPS.
- O mesmo backend serve o painel web ja buildado.
- O celular acessa `https://seu-dominio`.
- O agente Windows conecta para fora em `https://seu-dominio` usando `AGENT_SECRET`.
- Socket.IO usa WSS automaticamente quando a URL e HTTPS.

## Variaveis do servidor cloud

Configure no provedor:

```env
NODE_ENV=production
PORT=4000
STATIC_WEB_DIR=/app/apps/web/dist
TRUST_PROXY=true
CORS_ORIGIN=https://seu-dominio.com
JWT_SECRET=gere-um-segredo-forte-com-mais-de-32-caracteres
ADMIN_EMAIL=seu-email@dominio.com
ADMIN_PASSWORD_HASH=hash-bcrypt-da-senha
AGENT_SECRET=gere-outro-segredo-forte-com-mais-de-24-caracteres
DANGEROUS_CONFIRMATION_PHRASE=CONFIRMAR
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-apenas-no-servidor
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
```

`CORS_ORIGIN` deve ser exatamente a origem HTTPS do painel. Para mais de uma origem, separe por virgula.

## Build e start

Sem Docker:

```powershell
pnpm install
pnpm build
$env:STATIC_WEB_DIR="apps/web/dist"
pnpm --filter @pc-jarvis/server start
```

Com Docker:

```powershell
docker build -t pc-jarvis-control .
docker run --env-file apps/server/.env -p 4000:4000 pc-jarvis-control
```

## Deploy no Render via Blueprint

O arquivo `render.yaml` ja define o servico web Docker. Para publicar:

1. Crie um repositorio no GitHub, GitLab ou Bitbucket.
2. Envie este projeto para o repositorio.
3. Abra:

```text
https://dashboard.render.com/blueprint/new
```

4. Selecione o repositorio.
5. Preencha as variaveis marcadas como secret/sync false.
6. Aplique o Blueprint.
7. Depois do deploy, copie a URL gerada pelo Render e use como `CORS_ORIGIN`.

Exemplo:

```env
CORS_ORIGIN=https://pc-jarvis-control.onrender.com
```

## Agente Windows remoto

No PC que sera controlado:

```env
SERVER_URL=https://seu-dominio.com
AGENT_SECRET=o-mesmo-agent-secret-do-servidor
PC_NAME=Meu PC Windows
STATUS_INTERVAL_MS=5000
LOG_DIR=logs
LOG_STATUS_HEARTBEATS=false
POWER_COMMANDS_ENABLED=false
```

Depois rode:

```powershell
pnpm dev:agent
```

Em producao, o proximo passo recomendado e empacotar o agente como Windows Service para iniciar junto com o sistema.

## Checklist de seguranca

- Use HTTPS obrigatoriamente.
- Use segredos diferentes para `JWT_SECRET` e `AGENT_SECRET`.
- Nao coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Mantenha `POWER_COMMANDS_ENABLED=false` ate validar tudo.
- Configure `TELEGRAM_ALLOWED_USER_IDS` se ativar Telegram.
- Use uma senha admin forte e hash bcrypt.
- Habilite logs e monitore tentativas de login.

## Fluxo final

1. Publicar o servidor cloud.
2. Abrir `https://seu-dominio.com` no celular.
3. Fazer login.
4. Rodar o agente no Windows apontando para o dominio.
5. Verificar no painel se aparece `Agente online`.
