const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const mod = useSupabase ? await import('./supabase.js') : await import('./sqlite.js');

export const store = mod.store;
export const isCloud = useSupabase;
