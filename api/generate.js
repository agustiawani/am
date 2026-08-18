const API_BASE = 'https://api.qsr.web.id/alight';
const API_KEY = 'qsr';

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
    }

    const { email, action, link } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Email tidak valid.' });
    }

    try {
        if (action === 'send') {
            const url = `${API_BASE}/send?apikey=${API_KEY}&email=${encodeURIComponent(email)}`;
            const response = await fetch(url);
            const data = await response.json();

            // Jika rate limit atau error lain, ubah pesan menjadi generik
            if (data.status === false) {
                // Jika ada indikasi rate limit, kita kirim status 429 dengan pesan generik
                if (data.error && data.error.toLowerCase().includes('rate limit')) {
                    return res.status(429).json({ success: false, message: 'Terlalu banyak permintaan. Tunggu beberapa saat.' });
                }
                return res.status(400).json({ success: false, message: 'Gagal mengirim magic link. Periksa email atau coba lagi.' });
            }

            return res.status(200).json({ success: true, message: 'Magic link berhasil dikirim ke email Anda.' });

        } else if (action === 'verify') {
            if (!link || typeof link !== 'string' || link.length < 20) {
                return res.status(400).json({ success: false, message: 'Link verifikasi tidak valid.' });
            }

            const url = `${API_BASE}/verify?apikey=${API_KEY}&email=${encodeURIComponent(email)}&link=${encodeURIComponent(link)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === false) {
                if (data.error && data.error.toLowerCase().includes('rate limit')) {
                    return res.status(429).json({ success: false, message: 'Terlalu banyak permintaan. Tunggu beberapa saat.' });
                }
                return res.status(400).json({ success: false, message: 'Verifikasi gagal. Pastikan link benar dan belum kedaluwarsa.' });
            }

            return res.status(200).json({ success: true, message: 'Verifikasi berhasil! Akses premium aktif.' });

        } else {
            return res.status(400).json({ success: false, message: 'Aksi tidak dikenali.' });
        }
    } catch (err) {
        console.error('Proxy Error:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan internal pada server.' });
    }
};
