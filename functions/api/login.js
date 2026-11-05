import { createClient } from '@supabase/supabase-js';

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { orgCode, username, password } = await request.json();
        
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        let query = supabase
            .from('system_users')
            .select('*')
            .ilike('username', username);

        if (orgCode && orgCode.trim() !== '') {
            query = query.eq('org_code', orgCode);
        } else {
            query = query.is('org_code', null);
        }

        const { data, error } = await query.maybeSingle();

        if (error || !data) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid username, password, or organization code!' }), {
                headers: { 'Content-Type': 'application/json' }, status: 401
            });
        }

        // සටහන: Cloudflare Workers වටපිටාව තුළ bcrypt වෙනුවට Web Crypto API හෝ plain comparison හෝ Supabase Auth භාවිත කිරීම වඩාත් සුදුසුය.
        if (password !== data.password) {
            return new Response(JSON.stringify({ success: false, message: 'Invalid password!' }), {
                headers: { 'Content-Type': 'application/json' }, status: 401
            });
        }

        return new Response(JSON.stringify({ success: true, message: 'Login successful', data }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            headers: { 'Content-Type': 'application/json' }, status: 500
        });
    }
}