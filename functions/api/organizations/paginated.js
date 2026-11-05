import { createClient } from '@supabase/supabase-js';

export async function onRequestGet(context) {
    try {
        const { request, env } = context;
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page')) || 1;
        const search = url.searchParams.get('search') || '';
        const limit = 12;
        const offset = (page - 1) * limit;

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        let query = supabase
            .from('organizations')
            .select('*', { count: 'exact' });

        if (search.trim() !== '') {
            query = query.or(`org_code.ilike.%${search}%,org_name.ilike.%${search}%,representative_name.ilike.%${search}%`);
        }

        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            return new Response(JSON.stringify({ success: false, message: error.message }), {
                headers: { 'Content-Type': 'application/json' }, status: 400
            });
        }

        return new Response(JSON.stringify({
            success: true,
            data,
            totalRecords: count,
            totalPages: Math.ceil((count || 0) / limit),
            currentPage: page
        }), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            headers: { 'Content-Type': 'application/json' }, status: 500
        });
    }
}