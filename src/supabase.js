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
  if (error) return 'client';
  return data?.role || 'client';
}

export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  
  if (data?.user) {
    // Create profile explicitly as 'client'
    await supabase.from('profiles').insert({
      id: data.user.id,
      full_name: fullName,
      role: 'client'
    });
  }
  return { data, error };
}

export async function signOut() {
  return supabase.auth.signOut();
}
