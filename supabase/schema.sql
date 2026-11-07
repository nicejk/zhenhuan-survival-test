-- 在 Supabase SQL Editor 中执行本文件，即可把测评切到云数据库。
-- 之后在 .env 或部署环境里设置：
--   SUPABASE_URL=https://xxxx.supabase.co
--   SUPABASE_SERVICE_KEY=service_role key

create table if not exists passwords (
  code text primary key,
  max_uses integer not null default 3,
  used_count integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  code text not null references passwords(code),
  created_at timestamptz not null default now(),
  completed boolean not null default false,
  unlocked boolean not null default false,
  answers jsonb,
  result jsonb,
  episode integer,
  archetype text,
  total numeric,
  attempt_no integer not null default 1,
  contact_name text,
  contact_phone text,
  contact_wechat text,
  rebate_claimed boolean not null default false
);

create index if not exists idx_sessions_code on sessions(code);

-- 只允许 service_role（Edge Function）访问，前端匿名密钥无法直接读写
alter table passwords enable row level security;
alter table sessions enable row level security;

-- 原子扣次函数：并发下也不会超卖
create or replace function reserve_password(p_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_row passwords;
  v_updated integer;
begin
  update passwords
     set used_count = used_count + 1
   where code = upper(trim(p_code))
     and used_count < max_uses
  returning * into v_row;

  if v_row.code is null then
    select * into v_row from passwords where code = upper(trim(p_code));
    if v_row.code is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid', 'row', null);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'exhausted', 'row', to_jsonb(v_row));
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'row', to_jsonb(v_row));
end;
$$;

-- 只允许 service_role 调用扣次函数，避免匿名用户绕过 Edge Function
revoke execute on function reserve_password(text) from public;
revoke execute on function reserve_password(text) from anon;
revoke execute on function reserve_password(text) from authenticated;
grant execute on function reserve_password(text) to service_role;

-- 插入一个演示密码
insert into passwords (code, max_uses, note) values ('ZHENHUAN-001', 3, '演示密码')
on conflict (code) do nothing;
