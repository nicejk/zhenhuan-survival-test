-- 0.99 元测评权益系统：兑换码 + 匿名用户绑定 + 原子扣减
-- 不删除旧表 passwords / sessions 中的任何历史数据。

-- ============ 1. 兑换码表（仅存哈希） ============
create table if not exists codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  status text not null default 'inactive'
    check (status in ('inactive','active','exhausted','expired','frozen','void')),
  total_uses integer not null default 3,
  remaining_uses integer not null default 3,
  user_id uuid,                      -- 绑定的匿名用户 UUID（auth.users）
  note text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists idx_codes_user on codes(user_id);
create index if not exists idx_codes_status on codes(status);

-- ============ 2. 测评记录：扩展 sessions（保留旧数据） ============
alter table sessions add column if not exists user_id uuid;
alter table sessions add column if not exists code_id uuid references codes(id);
alter table sessions add column if not exists request_id text;
alter table sessions add column if not exists consumed boolean not null default false;
alter table sessions add column if not exists started_at timestamptz not null default now();
alter table sessions add column if not exists completed_at timestamptz;
alter table sessions add column if not exists status text not null default 'started'
  check (status in ('started','completed','failed'));

-- 同一请求 ID 全库唯一：幂等关键
create unique index if not exists idx_sessions_request_id on sessions(request_id) where request_id is not null;
create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_code_id on sessions(code_id);

-- ============ 3. 管理操作日志（含人工迁移记录） ============
create table if not exists admin_logs (
  id bigint generated always as identity primary key,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============ 4. RLS ============
alter table codes enable row level security;
alter table admin_logs enable row level security;
-- sessions 的 RLS 此前已开启；普通登录用户只能读自己的测评记录
drop policy if exists sessions_select_own on sessions;
create policy sessions_select_own on sessions
  for select to authenticated
  using (user_id = auth.uid());
-- codes / admin_logs 无任何策略：anon 与 authenticated 默认全拒，
-- 一切读写只能经由 Edge Function（service_role）或服务端管理通道。

-- ============ 5. 通用校验：取码并做状态判定（服务内部函数） ============
create or replace function _code_state(c codes)
returns text
language plpgsql
stable
as $$
begin
  if c.id is null then return 'invalid'; end if;
  if c.status in ('frozen','void') then return c.status; end if;
  if c.activated_at is not null and c.expires_at is not null and now() > c.expires_at then
    return 'expired';
  end if;
  if c.remaining_uses <= 0 then return 'exhausted'; end if;
  return 'ok';
end;
$$;

-- ============ 6. 激活兑换码（绑定当前匿名用户，开启 7 天有效期） ============
create or replace function activate_code(p_code_hash text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c codes;
  v_state text;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  select * into c from codes where code_hash = p_code_hash for update;

  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- 幂等：同一用户重复激活直接返回当前状态
  if c.user_id = p_user_id then
    v_state := _code_state(c);
    if v_state in ('expired','exhausted') then
      update codes set status = v_state, updated_at = now() where id = c.id;
      return jsonb_build_object('ok', true, 'reason', null, 'already', true,
        'status', v_state, 'remaining', 0,
        'expires_at', c.expires_at);
    end if;
    return jsonb_build_object('ok', true, 'reason', null, 'already', true,
      'status', 'active', 'remaining', c.remaining_uses,
      'expires_at', c.expires_at);
  end if;

  if c.user_id is not null and c.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'bound');
  end if;

  v_state := _code_state(c);
  if v_state <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_state);
  end if;

  -- 首次激活：绑定 + 起算 7 天
  update codes
     set user_id = p_user_id,
         status = 'active',
         activated_at = now(),
         expires_at = now() + interval '7 days',
         updated_at = now()
   where id = c.id
  returning * into c;

  return jsonb_build_object('ok', true, 'reason', null, 'already', false,
    'status', 'active', 'remaining', c.remaining_uses,
    'expires_at', c.expires_at);
end;
$$;

-- ============ 7. 开始一次测评（不扣次，仅校验 + 建记录，幂等） ============
create or replace function begin_attempt(p_code_hash text, p_user_id uuid, p_request_id text, p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c codes;
  v_state text;
  s sessions;
  v_inflight sessions;
begin
  if p_user_id is null or p_request_id is null or length(p_request_id) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  -- 幂等：同 request_id 直接返回已有记录
  select * into s from sessions where request_id = p_request_id;
  if s.id is not null then
    if s.user_id is distinct from p_user_id then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
    return jsonb_build_object('ok', true, 'session_id', s.id,
      'attempt_no', s.attempt_no, 'resumed', true, 'status', s.status);
  end if;

  select * into c from codes where code_hash = p_code_hash for update;
  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if c.user_id is null or c.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_state := _code_state(c);
  if v_state = 'expired' then
    update codes set status = 'expired', updated_at = now() where id = c.id;
    return jsonb_build_object('ok', false, 'reason', 'expired', 'expires_at', c.expires_at);
  end if;
  if v_state <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_state);
  end if;

  -- 已存在进行中的测评：返回它（刷新恢复），不重复开新记录
  select * into v_inflight from sessions
   where code_id = c.id and status = 'started'
   order by started_at desc limit 1;
  if v_inflight.id is not null then
    return jsonb_build_object('ok', true, 'session_id', v_inflight.id,
      'request_id', v_inflight.request_id,
      'attempt_no', v_inflight.attempt_no, 'resumed', true, 'status', v_inflight.status);
  end if;

  insert into sessions (id, code, user_id, code_id, request_id, attempt_no, status, started_at)
  values (p_session_id, 'code:' || c.id::text, p_user_id, c.id, p_request_id,
          (select count(*) + 1 from sessions where code_id = c.id and status = 'completed'),
          'started', now())
  returning * into s;

  return jsonb_build_object('ok', true, 'session_id', s.id,
    'attempt_no', s.attempt_no, 'resumed', false, 'status', 'started');
end;
$$;

-- ============ 8. 完成测评：原子扣次（核心，防并发/防重复） ============
create or replace function finalize_attempt(
  p_request_id text, p_user_id uuid,
  p_result jsonb, p_episode integer, p_archetype text, p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions;
  c codes;
  v_state text;
begin
  if p_user_id is null or p_request_id is null or p_result is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  select * into s from sessions where request_id = p_request_id for update;
  if s.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if s.user_id is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- 幂等：已结算过的请求直接返回，绝不重复扣次
  if s.consumed then
    select remaining_uses into c from codes where id = s.code_id;
    return jsonb_build_object('ok', true, 'already', true, 'remaining', c.remaining_uses);
  end if;

  select * into c from codes where id = s.code_id for update;
  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if c.user_id is null or c.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_state := _code_state(c);
  if v_state = 'expired' then
    update codes set status = 'expired', updated_at = now() where id = c.id;
    update sessions set status = 'failed' where id = s.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_state <> 'ok' then
    update sessions set status = 'failed' where id = s.id;
    return jsonb_build_object('ok', false, 'reason', v_state);
  end if;

  -- 原子扣减：行锁内判断并更新，并发安全
  update codes
     set remaining_uses = remaining_uses - 1,
         status = case when remaining_uses - 1 <= 0 then 'exhausted' else status end,
         updated_at = now()
   where id = c.id and remaining_uses > 0
  returning * into c;

  if c.id is null then
    update sessions set status = 'failed' where id = s.id;
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  update sessions
     set status = 'completed', completed = true, consumed = true,
         completed_at = now(), result = p_result,
         episode = p_episode, archetype = p_archetype, total = p_total
   where id = s.id;

  return jsonb_build_object('ok', true, 'already', false, 'remaining', c.remaining_uses);
end;
$$;

-- ============ 9. 测评失败登记（不扣次） ============
create or replace function fail_attempt(p_request_id text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update sessions set status = 'failed'
   where request_id = p_request_id
     and user_id = p_user_id
     and status = 'started' and consumed = false;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'updated', n);
end;
$$;

-- ============ 10. 人工迁移（客服）：换绑用户并留痕 ============
create or replace function migrate_code_user(p_code_hash text, p_from uuid, p_to uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c codes;
begin
  if p_to is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  select * into c from codes where code_hash = p_code_hash for update;
  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_from is not null and c.user_id is distinct from p_from then
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;

  update codes set user_id = p_to, updated_at = now() where id = c.id;
  update sessions set user_id = p_to where code_id = c.id;

  insert into admin_logs (action, detail) values (
    'migrate',
    jsonb_build_object('code_id', c.id, 'from_user', p_from, 'to_user', p_to, 'reason', coalesce(p_reason, ''))
  );

  return jsonb_build_object('ok', true, 'code_id', c.id);
end;
$$;

-- ============ 11. RPC 权限：仅 service_role 可调用 ============
revoke execute on function activate_code(text, uuid) from public, anon, authenticated;
revoke execute on function begin_attempt(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) from public, anon, authenticated;
revoke execute on function fail_attempt(text, uuid) from public, anon, authenticated;
revoke execute on function migrate_code_user(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function activate_code(text, uuid) to service_role;
grant execute on function begin_attempt(text, uuid, text, text) to service_role;
grant execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) to service_role;
grant execute on function fail_attempt(text, uuid) to service_role;
grant execute on function migrate_code_user(text, uuid, uuid, text) to service_role;

-- ============ 12. 迁移旧兑换码：哈希入库，剩余次数照算，历史数据不丢 ============
insert into codes (code_hash, status, total_uses, remaining_uses, note)
select encode(sha256(convert_to(upper(trim(p.code)), 'UTF8')), 'hex'),
       case when p.used_count >= p.max_uses then 'exhausted' else 'inactive' end,
       p.max_uses,
       greatest(p.max_uses - p.used_count, 0),
       coalesce(p.note, '') || '（旧数据迁移）'
  from passwords p
on conflict (code_hash) do nothing;
