const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Bağlantısı
const MONGO_URI = 'mongodb+srv://raiz:0909raizen09@cluster0.s0zajji.mongodb.net/raizpro?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Veritabanına Başarıyla Bağlandı!'))
  .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

// Key Schema (HWID Destekli ve HWID'siz Genel Key Alanı)
const keySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    created_at: { type: String, required: true },
    duration_days: { type: Number, required: true },
    expires_at: { type: String, required: true },
    hwid: { type: String, default: null },
    is_genel: { type: Boolean, default: true }, // HWID'siz Genel Key olduğunu belirtir
    status: { type: String, default: 'Active' },
    note: { type: String, default: '' }
});
const KeyModel = mongoose.model('Key', keySchema);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── ADMIN GİRİŞİ ──────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === 'raizdeneme') {
        res.json({ success: true, token: 'session_raiz_pro_auth_token_9988' });
    } else {
        res.status(401).json({ success: false, message: 'Hatalı şifre!' });
    }
});

// ── KEY LİSTELEME ──────────────────────────────────────────────────────────
app.get('/api/keys', async (req, res) => {
    try {
        const keys = await KeyModel.find().sort({ created_at: -1 });
        res.json(keys);
    } catch (err) {
        res.status(500).json({ error: 'Key listesi alınamadı' });
    }
});

// ── GENEL / HWID'SİZ VE NORMAL KEY OLUŞTURMA ────────────────────────────────
app.post('/api/create-key', async (req, res) => {
    try {
        const { duration_days, is_genel, note } = req.body;
        const days = parseInt(duration_days) || 30;
        
        // Key Kodu
        const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const prefix = is_genel ? 'RAIZ-GENEL' : 'RAIZ-HWID';
        const generatedKey = `${prefix}-${part1}-${part2}`;

        const now = new Date();
        const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const newKey = new KeyModel({
            key: generatedKey,
            created_at: now.toISOString(),
            duration_days: days,
            expires_at: expires.toISOString(),
            hwid: null,
            is_genel: is_genel !== undefined ? Boolean(is_genel) : true,
            status: 'Active',
            note: note || (is_genel ? 'Genel Lisans Key' : 'HWID Kilitli Key')
        });

        await newKey.save();
        res.json({ success: true, key: newKey });
    } catch (err) {
        console.error('Key Oluşturma Hatası:', err);
        res.status(500).json({ success: false, message: 'Key oluşturulamadı.' });
    }
});

// ── ORTAK KEY DOĞRULAMA FONKSİYONU (RAIZLOADER EXE VE WEB TAM UYUMLU) ────────
const checkKeyHandler = async (req, res) => {
    try {
        const inputKey = req.body.key || req.query.key || req.body.activation_key || req.query.activation_key || req.body.license || req.query.license;
        const hwid = req.body.hwid || req.query.hwid || req.body.hwid_code || req.query.hwid_code;

        if (!inputKey) {
            return res.json({ success: false, message: 'Key gereklidir.' });
        }

        const foundKey = await KeyModel.findOne({ key: inputKey.trim().toUpperCase() });
        if (!foundKey) {
            return res.json({ success: false, message: 'Geçersiz Key!' });
        }

        if (foundKey.status !== 'Active') {
            return res.json({ success: false, message: 'Bu Key pasif duruma getirilmiştir.' });
        }

        const now = new Date();
        const expires = new Date(foundKey.expires_at);
        if (now > expires) {
            return res.json({ success: false, message: 'Bu Key\'in kullanım süresi dolmuştur.' });
        }

        // HWID Kontrolü: Eğer is_genel TRUE ise HWID eşleşmesi aranmaz!
        if (!foundKey.is_genel) {
            if (foundKey.hwid && foundKey.hwid !== hwid) {
                return res.json({ success: false, message: 'Bu key başka bir cihaza kilitlidir (HWID Uyuşmazlığı).' });
            }
            // İlk kez kullanılıyorsa HWID kilitle
            if (!foundKey.hwid && hwid) {
                foundKey.hwid = hwid;
                await foundKey.save();
            }
        }

        const diffTime = Math.abs(expires - now);
        const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // RaizLoader.exe C# Parsing ile tam uyumlu JSON yanıtı
        res.json({
            success: true,
            message: foundKey.is_genel ? 'Genel Key Doğrulandı! (HWID Kilidi Yok)' : 'HWID Key Doğrulandı!',
            expires_at: foundKey.duration_days >= 999 ? 'Sınırsız' : foundKey.expires_at,
            remainingDays: foundKey.duration_days >= 999 ? 'Sınırsız' : `${remainingDays} Gün`,
            is_genel: foundKey.is_genel
        });
    } catch (err) {
        console.error('Doğrulama hatası:', err);
        res.status(500).json({ success: false, message: 'Sunucu hatası.' });
    }
};

// RaizLoader.exe'nin Tam Olarak İstediği Endpoint: /api/client/verify
const checkRoutes = [
    '/api/client/verify',
    '/api/check-key',
    '/api/check_key',
    '/api/check',
    '/api/verify',
    '/check_key.php',
    '/check.php',
    '/check_key',
    '/check',
    '/verify'
];

app.all(checkRoutes, checkKeyHandler);

// ── KEY SİLME ───────────────────────────────────────────────────────────────
app.delete('/api/keys/:id', async (req, res) => {
    try {
        await KeyModel.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Key silindi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Silme hatası.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 RaizPro Server ${PORT} portunda başarıyla başlatıldı!`);
});
