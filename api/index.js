const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Konfigurasi
const CONFIG = {
    BASE_URL: 'https://amprem.irfanjawa.com',
    TURNSTILE_API: 'https://fgsi.dpdns.org/api/tools/cfclearance/turnstile-min',
    TURNSTILE_SITE_KEY: '0x4AAAAAADsWLA16vNVNqTCH',
    TURNSTILE_API_KEY: 'fgsiapi-36d42133-6d', // API key yang diberikan
    FIREBASE_API_KEY: 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0',
    FIREBASE_URL: 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0',
    USER_AGENT: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
};

// Helper: Request dengan Promise
function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(body);
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// 1. Solve Turnstile
async function solveTurnstile() {
    const url = `${CONFIG.TURNSTILE_API}?sitekey=${CONFIG.TURNSTILE_SITE_KEY}&apikey=${CONFIG.TURNSTILE_API_KEY}`;
    const options = {
        hostname: 'fgsi.dpdns.org',
        path: `/api/tools/cfclearance/turnstile-min?sitekey=${CONFIG.TURNSTILE_SITE_KEY}&apikey=${CONFIG.TURNSTILE_API_KEY}`,
        method: 'GET',
        headers: { 'User-Agent': CONFIG.USER_AGENT }
    };
    const result = await request(options);
    return result.token || result.response || result.data || result.result;
}

// 2. Registrasi & Login
async function registerAndLogin(email, password, turnstileToken) {
    // Register
    const registerData = { email, password, turnstileToken };
    const registerOptions = {
        hostname: 'amprem.irfanjawa.com',
        path: '/api/register',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT,
            'Referer': 'https://amprem.irfanjawa.com/'
        }
    };
    const registerResult = await request(registerOptions, registerData);
    if (!registerResult.success) throw new Error('Registrasi gagal');

    // Login
    const loginOptions = {
        hostname: 'amprem.irfanjawa.com',
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT,
            'Referer': 'https://amprem.irfanjawa.com/'
        }
    };
    const loginResult = await request(loginOptions, { email, password });
    if (!loginResult.token) throw new Error('Login gagal');
    return loginResult.token;
}

// 3. Watch Ads
async function watchAds(token, count = 5) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const options = {
            hostname: 'amprem.irfanjawa.com',
            path: '/api/watch-ad',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': CONFIG.USER_AGENT
            }
        };
        const result = await request(options, { adType: 'v2' });
        results.push(result);
        await new Promise(r => setTimeout(r, 700)); // delay
    }
    return results;
}

// 4. Generate Temp Email & Kirim Magic Link
async function generateTempEmail(token) {
    const options = {
        hostname: 'amprem.irfanjawa.com',
        path: '/api/temp-email',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': CONFIG.USER_AGENT
        }
    };
    const result = await request(options, {});
    if (!result.email) throw new Error('Gagal membuat email sementara');
    return result.email;
}

async function sendMagicLink(email) {
    const options = {
        hostname: 'amprem.irfanjawa.com',
        path: '/api/send-magic-link',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT,
            'Referer': 'https://amprem.irfanjawa.com/'
        }
    };
    const result = await request(options, { email });
    if (!result.success) throw new Error('Gagal mengirim magic link');
    return result;
}

async function pollDeepLink(email, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const options = {
            hostname: 'amprem.irfanjawa.com',
            path: `/api/poll-deeplink?email=${encodeURIComponent(email)}`,
            method: 'GET',
            headers: {
                'User-Agent': CONFIG.USER_AGENT,
                'Referer': 'https://amprem.irfanjawa.com/'
            }
        };
        const result = await request(options);
        if (result.deepLink) return result.deepLink;
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Timeout: Deep link tidak ditemukan');
}

// 5. Exchange Token
async function exchangeToken(oobCode) {
    const options = {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/accounts:signInWithEmailLink?key=${CONFIG.FIREBASE_API_KEY}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': CONFIG.USER_AGENT
        }
    };
    const data = {
        email: 'temp@example.com', // akan diisi dari magic link
        oobCode: oobCode,
        returnSecureToken: true
    };
    const result = await request(options, data);
    if (!result.idToken) throw new Error('Gagal exchange token');
    return {
        idToken: result.idToken,
        refreshToken: result.refreshToken,
        localId: result.localId
    };
}

// === ENDPOINT UTAMA ===
app.post('/api/generate', async (req, res) => {
    try {
        const { email: userEmail } = req.body;
        const email = userEmail || `user_${Date.now()}@zxy.com`;
        const password = crypto.randomBytes(8).toString('hex');

        res.write(`data: Memulai proses untuk ${email}...\n\n`);

        // 1. Solve Turnstile
        res.write('data: Menyelesaikan Turnstile...\n\n');
        const turnstileToken = await solveTurnstile();

        // 2. Register & Login
        res.write('data: Registrasi & Login...\n\n');
        const token = await registerAndLogin(email, password, turnstileToken);

        // 3. Watch Ads
        res.write('data: Menonton iklan (5x)...\n\n');
        await watchAds(token, 5);

        // 4. Temp Email & Magic Link
        res.write('data: Membuat email sementara & mengirim magic link...\n\n');
        const tempEmail = await generateTempEmail(token);
        await sendMagicLink(tempEmail);

        // 5. Poll Deep Link
        res.write('data: Menunggu deep link...\n\n');
        const deepLink = await pollDeepLink(tempEmail);

        // 6. Extract oobCode & Exchange Token
        const oobCode = new URL(deepLink).searchParams.get('oobCode');
        if (!oobCode) throw new Error('oobCode tidak ditemukan');

        res.write('data: Menukar token...\n\n');
        const tokens = await exchangeToken(oobCode);

        // 7. Selesai
        const result = {
            success: true,
            email: tempEmail,
            password: password,
            idToken: tokens.idToken,
            refreshToken: tokens.refreshToken,
            deepLink: deepLink
        };

        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.write('data: DONE\n\n');
        res.end();

    } catch (error) {
        res.write(`data: ERROR: ${error.message}\n\n`);
        res.end();
    }
});

// Root endpoint
app.get('/api', (req, res) => {
    res.json({ status: 'Alight Motion Premium Generator API' });
});

module.exports = app;
