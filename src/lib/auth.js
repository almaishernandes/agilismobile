import { supabase } from './supabase';

export async function getSecurityContext() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
        .from('profiles')
        .select('family_id, role')
        .eq('id', user.id)
        .single();
    return { user_id: user.id, family_id: profile?.family_id, role: profile?.role, email: user.email };
}

export async function signOut() {
    await supabase.auth.signOut();
}
