import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lmwrrtezxhaaaacjqeev.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FJ2w3dQE7jHrWg04OEiwWA_mqN2oKVk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data?.role || 'client';
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (data?.user) {
    // Ensure profile exists for this user
    await supabase.from('profiles').upsert({ 
      id: data.user.id, 
      full_name: data.user.user_metadata?.full_name || email.split('@')[0],
      role: 'client' 
    }, { onConflict: 'id' });
  }
  return { data, error };
}

export async function signOut() {
  return supabase.auth.signOut();
}
