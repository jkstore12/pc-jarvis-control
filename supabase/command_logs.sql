create table if not exists public.command_logs (
  id uuid primary key,
  command text not null check (
    command in (
      'status',
      'screenshot',
      'open_chrome',
      'open_vscode',
      'shutdown',
      'restart',
      'set_volume'
    )
  ),
  source text not null check (source in ('web', 'telegram', 'system')),
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'rejected')),
  requested_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result_summary text,
  error_message text
);

alter table public.command_logs enable row level security;

revoke all on table public.command_logs from anon, authenticated;
grant select, insert, update, delete on table public.command_logs to service_role;

create index if not exists command_logs_created_at_idx
  on public.command_logs (created_at desc);
