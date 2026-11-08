import { createClient } from '@supabase/supabase-js';

// anon/publishable key 本身是公开的，数据安全由服务端 + RLS 保证
// 生产环境默认走同域代理（/sb → Supabase auth），避免国内无法直连 supabase.co；
// GitHub Pages / Cloudflare 构建通过 VITE_SUPABASE_URL 显式指定真实地址，本地开发直连。
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.DEV ? 'https://juiaetgiyltpbmmvctdc.supabase.co' : `${window.location.origin}/sb`);

export const supabase = createClient(SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

/** 确保存在匿名身份；返回当前 access_token */
export async function ensureIdentity() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return data.session.access_token;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signed.session.access_token;
}

export async function accessToken() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) throw new Error('身份已失效，请刷新页面');
  return data.session.access_token;
}
