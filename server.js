const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGO_URI = 'mongodb+srv://raiz:0909raizen09@cluster0.s0zajji.mongodb.net/raizpro?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Veritabanina Basariyla Baglandi!'))
  .catch(err => console.error('❌ MongoDB Baglanti Hatasi:', err));

// MongoDB Schema
const keySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    created_at: { type: String, required: true },
    duration_days: { type: Number, required: true },
    expires_at: { type: String, required: true },
    hwid: { type: String, default: null },
    status: { type: String, default: 'Active' }
});
const KeyModel = mongoose.model('Key', keySchema);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ADMIN PANELİ API'LERİ ──────────────────────────────────────────────────

// Şifre doğrulama (Giriş)
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === 'raizdeneme') {
        res.json({ success: true, token: 'session_raiz_pro_auth_token_9988' });
    } else {
        res.status(401).json({ success: false, message: 'Hatalı şifre!' });
    }
});

// Key listeleme
app.get('/api/keys', async (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }
    try {
        const keys = await KeyModel.find();
        res.json(keys);
    } catch(err) {
        res.status(500).json({ error: 'DB Hatasi' });
    }
});

// Yeni key oluşturma
app.post('/api/keys/create', async (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const { durationDays } = req.body;
    
    const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyString = `RAIZ-${randomPart1}-${randomPart2}`;

    const newKey = new KeyModel({
        key: keyString,
        created_at: new Date().toISOString(),
        duration_days: parseInt(durationDays) || 30,
        expires_at: durationDays === -1 ? 'Sınırsız' : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        hwid: null,
        status: 'Active'
    });

    try {
        await newKey.save();
        res.json({ success: true, key: newKey });
    } catch(err) {
        res.status(500).json({ error: 'Key olusturulamadi.' });
    }
});

// Key silme
app.delete('/api/keys/:key', async (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    try {
        const result = await KeyModel.deleteOne({ key: req.params.key });
        if (result.deletedCount > 0) {
            res.json({ success: true, message: 'Key silindi.' });
        } else {
            res.status(404).json({ success: false, message: 'Key bulunamadı!' });
        }
    } catch(err) {
        res.status(500).json({ error: 'DB Hatasi' });
    }
});

// HWID Sıfırlama
app.post('/api/keys/reset-hwid', async (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    try {
        const target = await KeyModel.findOne({ key: req.body.key });
        if (target) {
            target.hwid = null;
            await target.save();
            res.json({ success: true, message: 'HWID başarıyla sıfırlandı.' });
        } else {
            res.status(404).json({ success: false, message: 'Key bulunamadı!' });
        }
    } catch(err) {
        res.status(500).json({ error: 'DB Hatasi' });
    }
});

// Key Durumu Değiştirme (Banlama / Açma)
app.post('/api/keys/toggle-status', async (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    try {
        const target = await KeyModel.findOne({ key: req.body.key });
        if (target) {
            target.status = req.body.status;
            await target.save();
            res.json({ success: true, key: target });
        } else {
            res.status(404).json({ success: false, message: 'Key bulunamadı!' });
        }
    } catch(err) {
        res.status(500).json({ error: 'DB Hatasi' });
    }
});

// ── CLIENT (MINECRAFT HİLE) API'Sİ ─────────────────────────────────────────

// Client Key Doğrulama & HWID Kilitleme
app.post('/api/client/verify', async (req, res) => {
    const { key, hwid } = req.body;
    console.log(`[Verify Request] Key: "${key}", HWID: "${hwid}"`);

    if (!key || !hwid) {
        return res.json({ success: false, message: 'Eksik parametre!' });
    }

    try {
        const target = await KeyModel.findOne({ key: new RegExp(`^${key}$`, 'i') });
        if (!target) {
            return res.json({ success: false, message: 'Gecersiz anahtar!' });
        }

        if (target.status === 'Banned') {
            return res.json({ success: false, message: 'Bu anahtar yasaklanmistir!' });
        }

        if (target.expires_at !== 'Sınırsız') {
            const expiresDate = new Date(target.expires_at);
            if (new Date() > expiresDate) {
                target.status = 'Expired';
                await target.save();
                return res.json({ success: false, message: 'Anahtarinizin suresi dolmustur!' });
            }
        }

        if (!target.hwid) {
            target.hwid = hwid;
            await target.save();
            return res.json({ success: true, message: 'Giris basarili, HWID kilitlendi.', expires_at: target.expires_at });
        } else {
            if (target.hwid === hwid) {
                return res.json({ success: true, message: 'Giris basarili.', expires_at: target.expires_at });
            } else {
                return res.json({ success: false, message: 'HWID uyusmuyor! Baska PCden giris engellendi.' });
            }
        }
    } catch(err) {
        return res.json({ success: false, message: 'Sunucu hatasi!' });
    }
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`RaizPro Key API sunucusu calisiyor: http://localhost:${PORT}`);
});
