// HWID-siz Genel Key Yonetimi ve Kontrol Mantigi (Raiz.pro / Render Panel)

const STORAGE_KEY = 'raiz_genel_keys';

// Varsayilan genel key'ler
const defaultKeys = [
    {
        key: "RAIZ-GENEL-98A2-31BF",
        type: "Genel Key (HWID'siz)",
        durationDays: 30,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: "active",
        note: "30 Günlük Standart Genel Lisans"
    },
    {
        key: "RAIZ-LIFETIME-VIP-77",
        type: "Sınırsız Genel Key",
        durationDays: 9999,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 9999 * 24 * 60 * 60 * 1000).toISOString(),
        status: "active",
        note: "Sınırsız VIP Genel Lisans"
    }
];

// LocalStorage'dan key'leri alma
function getStoredKeys() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultKeys));
        return defaultKeys;
    }
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error("Key verisi okuma hatasi:", e);
        return defaultKeys;
    }
}

// LocalStorage'a key'leri kaydetme
function saveKeys(keys) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

// HWID-siz Genel Key Olusturma fonksiyonu
function createGenelKey(durationDays = 30, note = "Genel Lisans Key") {
    const keys = getStoredKeys();
    
    // Random Key formati: RAIZ-GENEL-XXXX-YYYY
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKeyCode = `RAIZ-GENEL-${part1}-${part2}`;
    
    const now = new Date();
    const expires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    
    const newKeyObj = {
        key: newKeyCode,
        type: durationDays >= 999 ? "Sınırsız Genel Key" : `${durationDays} Günlük Genel Key`,
        durationDays: parseInt(durationDays),
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        status: "active",
        note: note || "HWID'siz Genel Lisans"
    };

    keys.unshift(newKeyObj);
    saveKeys(keys);
    return newKeyObj;
}

// Key Sorgulama / Dogrulama fonksiyonu (HWID'siz)
function checkGenelKey(inputKey) {
    if (!inputKey || !inputKey.trim()) {
        return { success: false, message: "Lütfen geçerli bir key anahtarı giriniz." };
    }
    
    const cleanKey = inputKey.trim().toUpperCase();
    const keys = getStoredKeys();
    const foundKey = keys.find(k => k.key.toUpperCase() === cleanKey);

    if (!foundKey) {
        return { 
            success: false, 
            message: "Girdiğiniz key sistemde bulunamadı. Lütfen kontrol edip tekrar deneyin." 
        };
    }

    const now = new Date();
    const expiresAt = new Date(foundKey.expiresAt);

    if (foundKey.status === "disabled") {
        return {
            success: false,
            message: "Bu lisans anahtarı yönetici tarafından devre dışı bırakılmıştır.",
            data: foundKey
        };
    }

    if (now > expiresAt) {
        return {
            success: false,
            message: "Bu genel key'in kullanım süresi dolmuştur.",
            data: {
                ...foundKey,
                isExpired: true,
                remainingDays: 0
            }
        };
    }

    // Kalan gun hesabi
    const diffTime = Math.abs(expiresAt - now);
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
        success: true,
        message: "Key Başarıyla Doğrulandı! (HWID Kilidi Yok)",
        data: {
            ...foundKey,
            isExpired: false,
            remainingDays: foundKey.durationDays >= 999 ? "Sınırsız" : `${remainingDays} Gün`
        }
    };
}

// Key Silme
function deleteGenelKey(keyCode) {
    let keys = getStoredKeys();
    keys = keys.filter(k => k.key !== keyCode);
    saveKeys(keys);
}

// Key Durumu Degistirme (Aktif / Pasif)
function toggleKeyStatus(keyCode) {
    const keys = getStoredKeys();
    const target = keys.find(k => k.key === keyCode);
    if (target) {
        target.status = target.status === "active" ? "disabled" : "active";
        saveKeys(keys);
    }
}
