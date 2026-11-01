const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from the root directory
app.use(express.static(path.join(__dirname)));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// -------------------------------------------------------------
// AUTOMATICALLY CREATE MASTER ADMIN ON FIRST RUN (Safely handled)
// -------------------------------------------------------------
async function initializeMasterAdmin() {
    try {
        const { data, error } = await supabase
            .from('system_users')
            .select('*')
            .ilike('username', 'Daminda')
            .maybeSingle();

        if (error) {
            console.error('Error checking Master Admin existence:', error.message);
            return;
        }

        if (!data) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123', salt); // Default password: 123

            const { error: insertError } = await supabase
                .from('system_users')
                .insert([{
                    org_code: null,
                    username: 'Daminda',
                    password: hashedPassword,
                    role: 'master_admin'
                }]);

            if (insertError) {
                console.error('Failed to initialize Master Admin:', insertError.message);
            } else {
                console.log('Master Admin (Daminda) auto-created successfully!');
            }
        } else {
            console.log('Master Admin (Daminda) already exists.');
        }
    } catch (err) {
        console.error('Exception during Master Admin initialization:', err.message);
    }
}

// ROOT ROUTE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ROUTE FOR SHORT PUBLIC LIVE VIEW (e.g. /q.html)
app.get('/q.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'q.html'));
});

// -------------------------------------------------------------
// 1. QUEUE MANAGEMENT API ENDPOINTS (Supports /api/queue/:orgCode & /q/:orgCode)
// -------------------------------------------------------------
app.get(['/api/queue/:orgCode', '/q/:orgCode'], async (req, res) => {
    const { orgCode } = req.params;
    
    try {
        const { data: queueData } = await supabase
            .from('queues')
            .select('current_number, updated_at')
            .eq('org_code', orgCode)
            .maybeSingle();

        const { data: orgData } = await supabase
            .from('organizations')
            .select('org_name')
            .eq('org_code', orgCode)
            .maybeSingle();
    
        const queueNumber = queueData ? queueData.current_number : 0;
        const orgName = orgData ? orgData.org_name : orgCode;

        if (req.path.startsWith('/q/') && !req.xhr && req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.sendFile(path.join(__dirname, 'q.html'));
        }

        res.json({ 
            success: true, 
            data: {
                current_number: queueNumber,
                org_name: orgName
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/queue/update', async (req, res) => {
    const { orgCode, currentNumber } = req.body;
    
    const { data, error } = await supabase
        .from('queues')
        .update({ current_number: currentNumber, updated_at: new Date() })
        .eq('org_code', orgCode);

    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    res.json({ success: true, message: 'Queue updated successfully', currentNumber });
});

// -------------------------------------------------------------
// 2. SYSTEM USERS API ENDPOINTS (With Bcrypt Hashing)
// -------------------------------------------------------------
app.get('/api/users/:orgCode', async (req, res) => {
    const { orgCode } = req.params;
    const { data, error } = await supabase
        .from('system_users')
        .select('*')
        .eq('org_code', orgCode);

    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    res.json({ success: true, data });
});

app.post('/api/users/add', async (req, res) => {
    const { orgCode, username, password, role } = req.body;
    
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { data, error } = await supabase
            .from('system_users')
            .insert([{ org_code: orgCode || null, username, password: hashedPassword, role }]);

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.json({ success: true, message: 'User added successfully with hashed password', data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// -------------------------------------------------------------
// 3. ORGANIZATIONS MANAGEMENT CRUD API ENDPOINTS
// -------------------------------------------------------------

app.get('/api/organizations/paginated', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    try {
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
            return res.status(400).json({ success: false, message: error.message });
        }

        res.json({
            success: true,
            data,
            totalRecords: count,
            totalPages: Math.ceil((count || 0) / limit),
            currentPage: page
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/organizations/next-code', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('org_code')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        let nextCode = 'ORG001';
        if (data && data.length > 0) {
            const lastCode = data[0].org_code;
            const numPart = parseInt(lastCode.replace('ORG', '')) || 0;
            nextCode = `ORG${String(numPart + 1).padStart(3, '0')}`;
        }

        res.json({ success: true, nextCode });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Add Organization with Auto-generated Org Code, All Fields & Counter Login Password
app.post('/api/organizations/create', async (req, res) => {
    const { orgName, address, phoneNumber, whatsappNumber, email, representativeName, representativePhone, password, userRole } = req.body;

    if (userRole !== 'master_admin' && userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Unauthorized: Only Master Admin and Admin can add organizations.' });
    }

    try {
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

        // 1. Insert into organizations table
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
            return res.status(400).json({ success: false, message: error.message });
        }

        // 2. Auto create default queue for this organization
        await supabase
            .from('queues')
            .insert([{ org_code: orgCode, current_number: 0, counter_name: 'Counter 1' }]);

        // 3. Auto create system user for counter login if password provided
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            await supabase
                .from('system_users')
                .insert([{
                    org_code: orgCode,
                    username: orgCode + '_operator',
                    password: hashedPassword,
                    role: 'operator'
                }]);
        }

        res.json({ success: true, message: 'Organization added successfully!', data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update Organization and optionally Update Counter Password
app.put('/api/organizations/update/:id', async (req, res) => {
    const { id } = req.params;
    const { orgName, address, phoneNumber, whatsappNumber, email, representativeName, representativePhone, password, userRole } = req.body;

    if (userRole !== 'master_admin' && userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Unauthorized!' });
    }

    try {
        const { data: orgData } = await supabase
            .from('organizations')
            .select('org_code')
            .eq('id', id)
            .single();

        if (!orgData) {
            return res.status(404).json({ success: false, message: 'Organization not found!' });
        }

        const orgCode = orgData.org_code;

        const { error } = await supabase
            .from('organizations')
            .update({
                org_name: orgName,
                address,
                phone_number: phoneNumber,
                whatsapp_number: whatsappNumber,
                email,
                representative_name: representativeName,
                representative_phone: representativePhone
            })
            .eq('id', id);

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const { data: existingUser } = await supabase
                .from('system_users')
                .select('id')
                .eq('org_code', orgCode)
                .maybeSingle();

            if (existingUser) {
                await supabase
                    .from('system_users')
                    .update({ password: hashedPassword })
                    .eq('org_code', orgCode);
            } else {
                await supabase
                    .from('system_users')
                    .insert([{
                        org_code: orgCode,
                        username: orgCode + '_operator',
                        password: hashedPassword,
                        role: 'operator'
                    }]);
            }
        }

        res.json({ success: true, message: 'Organization updated successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/organizations/delete/:id', async (req, res) => {
    const { id } = req.params;
    const { userRole } = req.body;

    if (userRole !== 'master_admin') {
        return res.status(403).json({ success: false, message: 'Unauthorized: Only Master Admin can delete organizations!' });
    }

    try {
        const { error } = await supabase
            .from('organizations')
            .delete()
            .eq('id', id);

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        res.json({ success: true, message: 'Organization deleted successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// -------------------------------------------------------------
// 4. LOGIN AUTHENTICATION API ENDPOINT
// -------------------------------------------------------------
app.post('/api/login', async (req, res) => {
    const { orgCode, username, password } = req.body;
    
    try {
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
            return res.status(401).json({ success: false, message: 'Invalid username, password, or organization code!' });
        }

        const isMatch = await bcrypt.compare(password, data.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid password!' });
        }

        res.json({ success: true, message: 'Login successful', data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// -------------------------------------------------------------
// 5. COUNTER LOGIN & SINGLE DEVICE SESSION APIS
// -------------------------------------------------------------
app.post('/api/counter/login', async (req, res) => {
    const { orgCode, password } = req.body;

    try {
        const { data: user, error: userError } = await supabase
            .from('system_users')
            .select('*')
            .eq('org_code', orgCode)
            .maybeSingle();

        if (userError || !user) {
            return res.status(401).json({ success: false, message: 'Invalid Organization Code or Password!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid Password!' });
        }

        const sessionToken = 'TOKEN_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

        const { error: updateError } = await supabase
            .from('organizations')
            .update({ active_session_token: sessionToken })
            .eq('org_code', orgCode);

        if (updateError) {
            return res.status(500).json({ success: false, message: updateError.message });
        }

        const { data: orgData } = await supabase
            .from('organizations')
            .select('org_name')
            .eq('org_code', orgCode)
            .maybeSingle();

        res.json({
            success: true,
            message: 'Login successful',
            sessionToken,
            orgCode,
            orgName: orgData ? orgData.org_name : orgCode
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/counter/verify-session', async (req, res) => {
    const { orgCode, sessionToken } = req.body;

    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('active_session_token')
            .eq('org_code', orgCode)
            .maybeSingle();

        if (error || !data || data.active_session_token !== sessionToken) {
            return res.json({ success: false, message: 'Session expired. Logged in from another device.' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Start Server & Initialize Master Admin
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Queue ERP Backend Server running on port ${PORT}`);
    await initializeMasterAdmin();
});