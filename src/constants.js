module.exports = {
    MASKS: {
        YALANCI: 'YALANÇI', // İlk info yalan olur
        CASUS: 'CASUS',     // Hər tur kiminsə kart sayını görür
        QORUYUCU: 'QORUYUCU', // İlk hücumdan qorunur
        DEYISEN: 'DƏYİŞƏN'   // Maskasını dəyişə bilər
    },
    ACTIONS: {
        ARASDIR: 'ARAŞDIR',
        LEGV: 'LƏĞV',
        DEYIS: 'DƏYİŞ',
        IFSA: 'İFŞA'
    },
    EVENTS: {
        DUMAN: 'DUMAN',     // İnfo etibarsız
        EDALET: 'ƏDALƏT',   // Ən çox kartı olan itirir
        ZAMAN: 'ZAMAN',     // 10 saniyə limit (sadəcə vizual xəbərdarlıq bu versiyada)
        GERGINLIK: 'GƏRGİNLİK' // Bu tur 2 kart (effekt: draw +1)
    },
    GAME_CONFIG: {
        WIN_SCORE: 3,
        MIN_PLAYERS: 2,
        MAX_PLAYERS: 10,
        HAND_SIZE: 3
    }
};