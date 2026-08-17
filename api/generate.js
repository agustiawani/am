const axios = require('axios');
const cheerio = require('cheerio');
const randomstring = require('randomstring');
const crypto = require('crypto');

class GenerateAmPremAkun {
  constructor(apiKey) {
    this.baseUrl = 'https://amprem.irfanjawa.com';
    this.turnstileSiteKey = '0x4AAAAAAAWWLolw8wO5vJBU';
    this.cfApiUrl = 'https://fgsi.dpdns.org/api/v1/turnstile';
    this.cfApiKey = apiKey || process.env.CF_API_KEY;
    this.firebaseApiKey = 'AIzaSyCfZtdAMy60-7Q7Nh2F6dj5e20QlZ9f7eE';
    this.client = axios.create({
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    this.cookieJar = {};
    this.logs = [];
    this.tempEmailId = null;
  }

  _log(msg) {
    console.log(msg);
    this.logs.push(msg);
  }

  _rateLimit() {
    return new Promise(resolve => setTimeout(resolve, 700));
  }

  async _request(method, url, options = {}) {
    await this._rateLimit();
    const fullUrl = url.startsWith('http') ? url : this.baseUrl + url;
    const headers = {
      ...this.client.defaults.headers,
      ...options.headers,
    };
    // attach cookies
    const cookieString = Object.entries(this.cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieString) headers['Cookie'] = cookieString;

    const config = {
      method,
      url: fullUrl,
      headers,
      data: options.data,
      params: options.params,
      responseType: options.responseType || 'json',
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
    };

    try {
      const response = await this.client(config);
      // update cookies
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        setCookie.forEach(cookie => {
          const [nameVal] = cookie.split(';');
          const [name, value] = nameVal.split('=');
          if (name && value) this.cookieJar[name.trim()] = value.trim();
        });
      }
      return response;
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  async solveTurnstile() {
    const response = await this._request('POST', this.cfApiUrl, {
      headers: { 'x-api-key': this.cfApiKey },
      data: {
        sitekey: this.turnstileSiteKey,
        url: this.baseUrl,
      }
    });
    if (response.data && response.data.token) {
      return response.data.token;
    } else {
      throw new Error('Failed to solve Turnstile');
    }
  }

  async register(email, password, turnstileToken) {
    const response = await this._request('POST', '/api/auth/register', {
      data: { email, password, turnstileToken }
    });
    return response.data;
  }

  async login(email, password) {
    const response = await this._request('POST', '/api/auth/login', {
      data: { email, password }
    });
    return response.data;
  }

  async watchV2Ads() {
    for (let i = 0; i < 3; i++) {
      await this._request('POST', '/api/ads/record', {
        data: { type: 'v2' }
      });
      await this._rateLimit();
    }
  }

  async createTempEmail() {
    const response = await this._request('POST', '/api/temp-mail/create', {
      data: {}
    });
    this.tempEmailId = response.data.id;
    return response.data.email;
  }

  async getEmails() {
    const response = await this._request('GET', '/api/temp-mail/emails');
    return response.data.emails;
  }

  async getEmailContent(emailId) {
    const response = await this._request('GET', `/api/temp-mail/email/${emailId}`);
    return response.data;
  }

  async pollForPremiumStatus() {
    for (let i = 0; i < 10; i++) {
      await this._rateLimit();
      const response = await this._request('GET', '/api/user/status');
      if (response.data.isPremium) return true;
    }
    return false;
  }

  async sendLoginLink(email) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this.firebaseApiKey}`;
    const response = await this._request('POST', url, {
      data: {
        requestType: 'EMAIL_SIGNIN',
        email: email,
      }
    });
    return response.data;
  }

  async exchangeOobCode(oobCode) {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${this.firebaseApiKey}`;
    const response = await this._request('POST', url, {
      data: {
        oobCode: oobCode,
        returnSecureToken: true,
      }
    });
    return response.data;
  }

  async pollForDeepLink() {
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const emails = await this.getEmails();
      if (emails && emails.length > 0) {
        const lastEmail = emails[emails.length - 1];
        const content = await this.getEmailContent(lastEmail.id);
        const html = content.html || content.body || '';
        const $ = cheerio.load(html);
        const links = $('a');
        for (let i = 0; i < links.length; i++) {
          const href = $(links[i]).attr('href');
          if (href && href.includes('deepLink')) {
            return href;
          }
        }
      }
    }
    return null;
  }

  async fullAutoWorkflow() {
    this._log('🚀 Memulai pembuatan akun premium...');

    const email = `user_${randomstring.generate(8)}@temp-mail.org`;
    const password = randomstring.generate(12);
    this._log(`📧 Credential: ${email} / ${password}`);

    this._log('🔐 Menyelesaikan Turnstile...');
    const token = await this.solveTurnstile();
    this._log('✅ Turnstile selesai');

    this._log('📝 Mendaftar...');
    await this.register(email, password, token);
    this._log('✅ Registrasi berhasil');

    this._log('🔑 Login...');
    await this.login(email, password);
    this._log('✅ Login berhasil');

    this._log('📺 Menonton iklan...');
    await this.watchV2Ads();
    this._log('✅ Iklan selesai');

    this._log('📧 Membuat email sementara...');
    const tempEmail = await this.createTempEmail();
    this._log(`📧 Email sementara: ${tempEmail}`);

    this._log('⏳ Menunggu status premium...');
    const isPremium = await this.pollForPremiumStatus();
    if (isPremium) this._log('✅ Status premium aktif!');
    else this._log('⚠️ Status premium belum aktif, melanjutkan...');

    this._log('📤 Mengirim tautan login ke email...');
    await this.sendLoginLink(tempEmail);
    this._log('✅ Tautan terkirim');

    this._log('⏳ Menyergap tautan deepLink...');
    const deepLink = await this.pollForDeepLink();
    if (deepLink) {
      this._log(`🔗 Tautan ditemukan: ${deepLink}`);
      const urlParams = new URL(deepLink).searchParams;
      const oobCode = urlParams.get('oobCode');
      if (oobCode) {
        this._log('🔄 Menukar oobCode dengan token...');
        const tokenData = await this.exchangeOobCode(oobCode);
        this._log('✅ Token berhasil didapatkan');
        return {
          success: true,
          data: {
            email: tempEmail,
            password: password,
            refreshToken: tokenData.refreshToken,
            appLink: deepLink,
          }
        };
      } else {
        this._log('⚠️ Tidak ada oobCode dalam tautan');
      }
    } else {
      this._log('❌ Tautan deepLink tidak ditemukan setelah polling');
    }

    return {
      success: false,
      data: {
        email: tempEmail,
        password: password,
        appLink: null,
      }
    };
  }
}

// ========== Handler untuk Vercel ==========
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let apiKey = req.body?.apiKey || req.query?.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  try {
    const generator = new GenerateAmPremAkun(apiKey);
    const result = await generator.fullAutoWorkflow();
    res.status(200).json({
      success: result.success,
      logs: generator.logs,
      data: result.data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
