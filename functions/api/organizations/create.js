import { createClient } from '@supabase/supabase-js';

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const { orgName, address, phoneNumber, whatsappNumber, email, representativeName, representativePhone, password, userRole } = await request.json();

        if (userRole !== 'master_admin' && userRole !== 'admin') {
            return new Response(JSON.stringify({ success: false, message: 'Unauthorized!' }), {
                headers: { 'Content-Type': 'application/json' }, status: 403
            });
        }

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

        const { data: lastOrg } = await supabase
            .from('organizations')
            .select('org_code')
            .order('created_at', { ascending: false })
            .limit(1);

        let orgCode = 'ORG001';
        if (lastOrg && lastOrg.length > 0) {
            const numPart = parseInt(lastOrg[0].org_code.replace('ORG', '')) || 0;
            orgCode = `ORG${String(numPart + 1).padStart(3, '0')}`;
        }

        const { data, error } = await supabase
            .from('organizations')
            .insert([{
                org_code: orgCode,
                org_name: orgName,
                address,
                phone_number: phoneNumber,
                whatsapp_number: whatsappNumber,
                email,
                representative_name: representativeName,
                representative_phone: representativePhone
            }])
            .select();

        if (error) {
            return new Response(JSON.stringify({ success: false, message: error.message }), {
                headers: { 'Content-Type': 'application/json' }, status: 400
            });
        }

        await supabase
            .from('queues')
            .insert([{ org_code: orgCode, current_number: 0, counter_name: 'Counter 1' }]);

        if (password && password.trim() !== '') {
            await supabase
                .from('system_users')
                .insert([{
                    org_code: orgCode,
                    username: orgCode + '_operator',
                    password: password,
                    role: 'operator'
                }]);
        }

        return new Response(JSON.stringify({ success: true, message: 'Organization added successfully!', data }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, message: err.message }), {
            headers: { 'Content-Type': 'application/json' }, status: 500
        });
    }
}