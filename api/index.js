const express = require('express');
const crypto = require('crypto');
const https = require('https');
const path = require('path'); // <-- Tambahkan ini

const app = express();

// MIDDLEWARE: Terima JSON
app.use(express.json());

// [PERBAIKAN] Arahkan static ke folder public di root proyek
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Konfigurasi (sama seperti sebelumnya)
const CONFIG = {
    BASE_URL: 'https://amprem.irfanjawa.com',
    TURNSTILE_API: 'https://fgsi.dpdns.org/api/tools/cfclearance/turnstile-min',
    TURNSTILE_SITE_KEY: '0x4AAAAAADsWLA16vNVNqTCH',
    TURNSTILE_API_KEY: 'fgsiapi-36d42133-6d',
    FIREBASE_API_KEY: 'AIzaSyDrZ9jr_Y16ltSBqsQR5IH6I04FRga6Ki0',
    USER_AGENT: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
};

// Helper: Request dengan Promise (sama seperti sebelumnya)
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
        if (data) {
            const jsonData = JSON.stringify(data);
            req.write(jsonData);
        }
        req.end();
    });
}

// 1. Solve Turnstile
async function solveTurnstile() {
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
    const registerResult = await request(registerOptions, { email, password, turnstileToken });
    if (!registerResult.success) throw new Error('Registrasi gagal');

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
        await request(options, { adType: 'v2' });
        await new Promise(r => setTimeout(r, 700));
    }
    return true;
}

// 4. Temp Email & Magic Link
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
async function exchangeToken(oobCode, email) {
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
        email: email,
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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (msg) => res.write(`data: ${msg}\n\n`);

    try {
        const { email: userEmail } = req.body;
        const email = userEmail || `user_${Date.now()}@zxy.com`;
        const password = crypto.randomBytes(8).toString('hex');

        send(`Memulai proses untuk ${email}...`);

        // 1. Turnstile
        send('Menyelesaikan Turnstile...');
        const turnstileToken = await solveTurnstile();

        // 2. Register & Login
        send('Registrasi & Login...');
        const token = await registerAndLogin(email, password, turnstileToken);

        // 3. Watch Ads
        send('Menonton iklan (5x)...');
        await watchAds(token, 5);

        // 4. Temp Email & Magic Link
        send('Membuat email sementara & mengirim magic link...');
        const tempEmail = await generateTempEmail(token);
        await sendMagicLink(tempEmail);

        // 5. Poll Deep Link
        send('Menunggu deep link...');
        const deepLink = await pollDeepLink(tempEmail);

        // 6. Extract oobCode & Exchange Token
        const oobCode = new URL(deepLink).searchParams.get('oobCode');
        if (!oobCode) throw new Error('oobCode tidak ditemukan');

        send('Menukar token...');
        const tokens = await exchangeToken(oobCode, tempEmail);

        const result = {
            success: true,
            email: tempEmail,
            password: password,
            idToken: tokens.idToken,
            refreshToken: tokens.refreshToken,
            deepLink: deepLink
        };

        send(JSON.stringify(result));
        send('DONE');
        res.end();

    } catch (error) {
        send(`ERROR: ${error.message}`);
        res.end();
    }
});

// Root API check
app.get('/api', (req, res) => {
    res.json({ status: 'Alight Motion Premium Generator API' });
});

// Fallback untuk route selain /api (akan dihandle oleh static public)
// Tapi karena kita sudah pake static, Vercel akan otomatis mencari index.html

module.exports = app;
