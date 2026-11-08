-- 修复：旧 sessions.code 列带 NOT NULL + 外键到 passwords(code)，
-- 新权益体系不再使用明文密码表，begin_attempt 写入 breadcrumb 时触发 FK 冲突。
-- 解除外键并允许 NULL（保留历史数据列本身）。
alter table sessions drop constraint if exists sessions_code_fkey;
alter table sessions alter column code drop not null;
