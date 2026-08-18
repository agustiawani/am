export default async function handler(req, res) {
    // Hanya terima method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Email tidak valid.' });
    }

    // Konfigurasi API eksternal (disembunyikan di sini)
    const API_BASE = 'https://api.qsr.web.id/alight';
    const API_KEY = 'qsr'; // Bisa pindahkan ke environment variable untuk keamanan ekstra

    try {
        // --- Langkah 1: Kirim magic link ---
        const sendUrl = `${API_BASE}/send?apikey=${API_KEY}&email=${encodeURIComponent(email)}`;
        const sendRes = await fetch(sendUrl);
        const sendData = await sendRes.json();

        // Cek rate limit / error
        if (sendData.status === false) {
            const errorMsg = sendData.error || 'Gagal mengirim magic link.';
            return res.status(429).json({ error: errorMsg });
        }

        // --- Langkah 2: Verifikasi link (otomatis) ---
        // Catatan: di sini kita asumsikan link verifikasi didapat dari email.
        // Karena ini proxy, kita tidak bisa otomatis mengambil link dari email pengguna.
        // Maka kita kirim response bahwa link sudah dikirim, dan minta pengguna memasukkan link.
        // Tapi sesuai permintaan, kita tampilkan hasil sukses dengan link yang perlu di-klik.
        // Kita bisa mengembalikan link verifikasi yang dikirim ke email (jika tersedia di response).
        // Namun API /send tidak mengembalikan link, hanya mengirim ke email.
        // Maka kita beri instruksi ke pengguna untuk cek email dan klik link.

        // Jika sukses kirim, kita return sukses dengan pesan.
        return res.status(200).json({
            success: true,
            message: 'Magic link berhasil dikirim ke email. Silakan cek email dan klik link untuk verifikasi.',
            // Kita tidak punya link karena dikirim via email, tapi kita bisa beri placeholder
            verificationLink: '(cek email Anda)'
        });

    } catch (err) {
        console.error('Proxy error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
    }
}
