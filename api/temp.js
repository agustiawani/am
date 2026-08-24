const API_BASE = 'https://www.1secmail.com/api/v1/';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, email, id } = req.query;

    try {
        if (action === 'generate') {
            const url = `${API_BASE}?action=genRandomMailbox&count=1`;
            const response = await fetch(url);
            const data = await response.json();
            return res.json(data);
        }

        if (action === 'inbox' && email) {
            const url = `${API_BASE}?action=getMessages&email=${encodeURIComponent(email)}`;
            const response = await fetch(url);
            const data = await response.json();
            return res.json(data);
        }

        if (action === 'read' && email && id) {
            const url = `${API_BASE}?action=fetchMessage&email=${encodeURIComponent(email)}&id=${id}`;
            const response = await fetch(url);
            const data = await response.json();
            return res.json(data);
        }

        return res.status(400).json({ error: 'Parameter tidak lengkap' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
