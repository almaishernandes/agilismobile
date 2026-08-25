import { supabase } from './supabase';

// Envia uma foto (URI local/blob do navegador) para o bucket "comprovantes"
// do Supabase Storage e devolve o caminho salvo (para gerar signed URLs
// depois, tanto no app quanto no Agilis-Web).
export async function uploadComprovante(uri, familyId) {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = blob.type?.split('/')[1] || 'jpg';
    const path = `${familyId || 'sem-familia'}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
        .from('comprovantes')
        .upload(path, blob, { contentType: blob.type || 'image/jpeg' });

    if (error) return { path: null, error };
    return { path, error: null };
}
