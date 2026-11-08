-- 修复 finalize_attempt 幂等分支：plpgsql 不允许把标量 SELECT 进 codes 行类型变量，
-- 导致重复提交/并发重试走到 consumed=true 分支时报错（扣次本身正确，仅返回路径报错）。
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
  v_remaining integer;
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
    select remaining_uses into v_remaining from codes where id = s.code_id;
    return jsonb_build_object('ok', true, 'already', true, 'remaining', v_remaining);
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

revoke execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) from public;
revoke execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) from anon;
revoke execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) from authenticated;
grant execute on function finalize_attempt(text, uuid, jsonb, integer, text, numeric) to service_role;
