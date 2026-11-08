-- ============ 兑换码改 5 位纯数字：服务端限流与风控 ============
-- 背景：5 位数字码空间仅 10 万，必须靠服务端限流 + 错误信息统一防枚举。
-- 本迁移：1) 验证尝试记录表（RLS 全拒，仅 service_role 经 RPC 写入）
--         2) activate_code 增加 p_ip 参数与四重限流、连续失败临时封禁、错误原因统一

create table if not exists code_attempts (
  id bigint generated always as identity primary key,
  ip_key text not null,             -- 归一化 IP（IPv6 取 /64 网段）
  user_id uuid,                     -- 匿名身份（第二风控维度，不单纯依赖 IP）
  ok boolean not null,              -- 本次验证是否成功
  created_at timestamptz not null default now()
);
create index if not exists code_attempts_ip_time on code_attempts (ip_key, created_at desc);
create index if not exists code_attempts_user_time on code_attempts (user_id, created_at desc);
create index if not exists code_attempts_time on code_attempts (created_at desc);
alter table code_attempts enable row level security;
revoke all on code_attempts from public, anon, authenticated;

-- 旧的 2 参数版本不带风控，必须删除（create or replace 参数个数不同会形成重载残留）
drop function if exists activate_code(text, uuid);

create or replace function activate_code(p_code_hash text, p_user_id uuid, p_ip text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c codes;
  v_state text;
  v_count int;
  v_streak int;
  v_result jsonb;
  v_ok boolean := false;
begin
  if p_code_hash is null or length(p_code_hash) <> 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  -- ===== 限流（全部在服务端、同一事务内执行） =====
  -- 全局：每分钟最多 120 次验证，防换 IP 大规模枚举
  select count(*) into v_count from code_attempts where created_at > now() - interval '1 minute';
  if v_count >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  -- 同一 IP：每分钟最多 5 次验证请求
  select count(*) into v_count from code_attempts
   where ip_key = p_ip and created_at > now() - interval '1 minute';
  if v_count >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  -- 同一 IP：每小时最多 10 次无效验证
  select count(*) into v_count from code_attempts
   where ip_key = p_ip and not ok and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  -- 同一匿名身份：每小时最多 10 次无效验证（换 IP 也换不掉身份维度）
  select count(*) into v_count from code_attempts
   where user_id = p_user_id and not ok and created_at > now() - interval '1 hour';
  if v_count >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  -- 连续失败 5 次（自最近一次成功以来）且最近失败在 15 分钟内：临时封禁
  select count(*) into v_streak
  from code_attempts a
  where a.ip_key = p_ip and not a.ok
    and a.created_at > coalesce(
      (select max(b.created_at) from code_attempts b where b.ip_key = p_ip and b.ok),
      '-infinity'::timestamptz);
  if v_streak >= 5
     and exists (select 1 from code_attempts a
                  where a.ip_key = p_ip and not a.ok
                    and a.created_at > now() - interval '15 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;

  -- ===== 原有激活逻辑（错误原因对外统一，见下） =====
  select * into c from codes where code_hash = p_code_hash for update;

  if c.id is null then
    v_result := jsonb_build_object('ok', false, 'reason', 'invalid');
  elsif c.user_id = p_user_id then
    -- 本人重复激活：幂等返回详细状态（不泄露给他人，因为只发给绑定者本人）
    v_ok := true;
    v_state := _code_state(c);
    if v_state in ('expired','exhausted') then
      update codes set status = v_state, updated_at = now() where id = c.id;
      v_result := jsonb_build_object('ok', true, 'reason', null, 'already', true,
        'status', v_state, 'remaining', 0, 'expires_at', c.expires_at);
    else
      v_result := jsonb_build_object('ok', true, 'reason', null, 'already', true,
        'status', 'active', 'remaining', c.remaining_uses, 'expires_at', c.expires_at);
    end if;
  elsif c.user_id is not null then
    -- 已绑定他人：与“码不存在”返回完全一致，不泄露存在性/绑定状态
    v_result := jsonb_build_object('ok', false, 'reason', 'invalid');
  else
    v_state := _code_state(c);
    if v_state <> 'ok' then
      -- 未绑定但冻结/作废/过期/用完：同样统一为 invalid，不泄露状态
      v_result := jsonb_build_object('ok', false, 'reason', 'invalid');
    else
      -- 首次激活：绑定 + 起算 7 天
      update codes
         set user_id = p_user_id, status = 'active',
             activated_at = now(), expires_at = now() + interval '7 days', updated_at = now()
       where id = c.id
      returning * into c;
      v_ok := true;
      v_result := jsonb_build_object('ok', true, 'reason', null, 'already', false,
        'status', 'active', 'remaining', c.remaining_uses, 'expires_at', c.expires_at);
    end if;
  end if;

  -- 记录本次真实验证（被限流拒绝的请求不计入，避免封禁自我延续）
  insert into code_attempts (ip_key, user_id, ok) values (p_ip, p_user_id, v_ok);
  return v_result;
end;
$$;

revoke all on function activate_code(text, uuid, text) from public, anon, authenticated;
grant execute on function activate_code(text, uuid, text) to service_role;
