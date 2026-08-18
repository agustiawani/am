const API_BASE = 'https://api.qsr.web.id/alight';
const API_KEY = 'qsr';

module.exports = async (req, res) => {
    // Handle preflight CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Hanya menerima POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
    }

    const { email, action, link } = req.body;

    // Validasi email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Email tidak valid.' });
    }

    try {
        // Aksi 1: Kirim Magic Link
        if (action === 'send') {
            const url = `${API_BASE}/send?apikey=${API_KEY}&email=${encodeURIComponent(email)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === false) {
                return res.status(429).json({
                    success: false,
                    message: data.error || 'Gagal mengirim magic link.',
                    retry_after: data.retry_after
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Magic link berhasil dikirim. Cek inbox/spam email Anda.'
            });
        }

        // Aksi 2: Verifikasi Link
        if (action === 'verify') {
            if (!link || typeof link !== 'string' || link.length < 20) {
                return res.status(400).json({ success: false, message: 'Link verifikasi tidak valid.' });
            }

            const url = `${API_BASE}/verify?apikey=${API_KEY}&email=${encodeURIComponent(email)}&link=${encodeURIComponent(link)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === false) {
                return res.status(429).json({
                    success: false,
                    message: data.error || 'Gagal verifikasi link.',
                    retry_after: data.retry_after
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Verifikasi berhasil! Akses premium aktif.'
            });
        }

        // Aksi tidak dikenal
        return res.status(400).json({ success: false, message: 'Aksi tidak dikenali.' });

    } catch (err) {
        console.error('Proxy Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan internal pada server proxy.'
        });
    }
};
