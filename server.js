const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'keys.json');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Yardımcı Fonksiyon: Keyleri Oku
function readKeys() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify([]));
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Veritabanı okuma hatası:", err);
        return [];
    }
}

// Yardımcı Fonksiyon: Keyleri Yaz
function writeKeys(keys) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(keys, null, 2));
    } catch (err) {
        console.error("Veritabanı yazma hatası:", err);
    }
}

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
app.get('/api/keys', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }
    res.json(readKeys());
});

// Yeni key oluşturma
app.post('/api/keys/create', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const { durationDays } = req.body;
    const keys = readKeys();
    
    // Rastgele formatta key üret: RAIZ-XXXX-XXXX
    const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const keyString = `RAIZ-${randomPart1}-${randomPart2}`;

    const newKey = {
        key: keyString,
        created_at: new Date().toISOString(),
        duration_days: parseInt(durationDays) || 30,
        expires_at: durationDays === -1 ? 'Sınırsız' : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        hwid: null, // İlk girişte eşleşecek
        status: 'Active' // Active, Banned, Expired
    };

    keys.push(newKey);
    writeKeys(keys);

    res.json({ success: true, key: newKey });
});

// Key silme
app.delete('/api/keys/:key', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const keyToDelete = req.params.key;
    let keys = readKeys();
    const initialLength = keys.length;
    keys = keys.filter(k => k.key !== keyToDelete);

    if (keys.length < initialLength) {
        writeKeys(keys);
        res.json({ success: true, message: 'Key silindi.' });
    } else {
        res.status(404).json({ success: false, message: 'Key bulunamadı!' });
    }
});

// HWID Sıfırlama
app.post('/api/keys/reset-hwid', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const { key } = req.body;
    const keys = readKeys();
    const target = keys.find(k => k.key === key);

    if (target) {
        target.hwid = null;
        writeKeys(keys);
        res.json({ success: true, message: 'HWID başarıyla sıfırlandı.' });
    } else {
        res.status(404).json({ success: false, message: 'Key bulunamadı!' });
    }
});

// Key Durumu Değiştirme (Banlama / Açma)
app.post('/api/keys/toggle-status', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'session_raiz_pro_auth_token_9988') {
        return res.status(403).json({ error: 'Yetkisiz erişim!' });
    }

    const { key, status } = req.body;
    const keys = readKeys();
    const target = keys.find(k => k.key === key);

    if (target) {
        target.status = status; // Active, Banned
        writeKeys(keys);
        res.json({ success: true, key: target });
    } else {
        res.status(404).json({ success: false, message: 'Key bulunamadı!' });
    }
});


// ── CLIENT (MINECRAFT HİLE) API'Sİ ─────────────────────────────────────────

// Client Key Doğrulama & HWID Kilitleme
app.post('/api/client/verify', (req, res) => {
    const { key, hwid } = req.body;
    console.log(`[Verify Request] Key: "${key}", HWID: "${hwid}"`);

    if (!key || !hwid) {
        console.log(`[Verify Failed] Missing parameter: key="${key}", hwid="${hwid}"`);
        return res.json({ success: false, message: 'Eksik parametre!' });
    }

    const keys = readKeys();
    const target = keys.find(k => k.key.toLowerCase() === key.toLowerCase());

    if (!target) {
        console.log(`[Verify Failed] Key "${key}" not found in DB! Existing keys:`, keys.map(k => k.key));
        return res.json({ success: false, message: 'Gecersiz anahtar!' });
    }

    if (target.status === 'Banned') {
        return res.json({ success: false, message: 'Bu anahtar yasaklanmistir!' });
    }

    // Süre kontrolü
    if (target.expires_at !== 'Sınırsız') {
        const expiresDate = new Date(target.expires_at);
        if (new Date() > expiresDate) {
            target.status = 'Expired';
            writeKeys(keys);
            return res.json({ success: false, message: 'Anahtarinizin suresi dolmustur!' });
        }
    }

    // HWID Kontrolü ve Kilitleme
    if (!target.hwid) {
        // İlk kez giriyor, HWID kilitle
        target.hwid = hwid;
        writeKeys(keys);
        return res.json({ success: true, message: 'Giris basarili, HWID kilitlendi.', expires_at: target.expires_at });
    } else {
        // HWID eşleşiyor mu?
        if (target.hwid === hwid) {
            return res.json({ success: true, message: 'Giris basarili.', expires_at: target.expires_at });
        } else {
            return res.json({ success: false, message: 'HWID uyusmuyor! Baska PCden giris engellendi.' });
        }
    }
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`RaizPro Key API sunucusu çalışıyor: http://localhost:${PORT}`);
});
