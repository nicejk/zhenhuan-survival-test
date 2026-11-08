-- 修复 _code_state 与 Edge 端 codeState 判定不一致：
-- SQL 端原要求 activated_at 非空才判定过期，Edge 端只看 expires_at，
-- 导致人工设置过期后管理端显示 expired、激活却能通过。统一为：expires_at 过期即 expired。
-- 正常业务流中未激活的码 expires_at 恒为 NULL，不受影响。
create or replace function _code_state(c codes)
returns text
language plpgsql
stable
as $$
begin
  if c.id is null then return 'invalid'; end if;
  if c.status in ('frozen','void') then return c.status; end if;
  if c.expires_at is not null and now() > c.expires_at then
    return 'expired';
  end if;
  if c.remaining_uses <= 0 then return 'exhausted'; end if;
  return 'ok';
end;
$$;
