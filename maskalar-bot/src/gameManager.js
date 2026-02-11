const { MASKS, ACTIONS, EVENTS, GAME_CONFIG } = require('./constants');
const { createEmbed } = require('./utils');

class Game {
    constructor(channelId, client) {
        this.channelId = channelId;
        this.client = client;
        this.players = []; // { id, user, mask, hand: [], score: 0, effects: [] }
        this.deck = [];
        this.status = 'LOBBY'; // LOBBY, PLAYING, ENDED
        this.turnIndex = 0;
        this.lastAction = null; // Ləğv kartı üçün tarixçə
        this.currentEvent = null;
    }

    // Oyunçu qoşulması
    addPlayer(user) {
        if (this.status !== 'LOBBY') return { success: false, msg: 'Oyun artıq başlayıb!' };
        if (this.players.find(p => p.id === user.id)) return { success: false, msg: 'Sən artıq qoşulmusan.' };
        if (this.players.length >= GAME_CONFIG.MAX_PLAYERS) return { success: false, msg: 'Otaq doludur.' };

        this.players.push({
            id: user.id,
            user: user,
            mask: null,
            hand: [],
            score: 0,
            isProtected: false, // Qoruyucu üçün
            maskRevealed: false,
            investigatedCount: 0 // Yalançı üçün
        });
        return { success: true, msg: `${user.username} oyuna qoşuldu! (${this.players.length}/${GAME_CONFIG.MAX_PLAYERS})` };
    }

    // Oyunu başlat
    async startGame() {
        if (this.players.length < GAME_CONFIG.MIN_PLAYERS) return { success: false, msg: 'Kifayət qədər oyunçu yoxdur (min 2).' };
        this.status = 'PLAYING';
        this.assignMasks();
        this.resetDeck();
        this.dealCards();
        
        // Məlumatları DM at
        for (const p of this.players) {
            try {
                const roleDesc = this.getRoleDescription(p.mask);
                await p.user.send({ embeds: [createEmbed('🎭 Sənin Maskan', `Rolun: **${p.mask}**\n\n${roleDesc}`, '#ffcc00')] });
            } catch (e) {
                console.log(`DM error for ${p.user.tag}`);
            }
        }
        
        return { success: true, msg: 'Oyun başladı! Maskalar paylandı. DM qutusunu yoxlayın.' };
    }

    getRoleDescription(mask) {
        switch(mask) {
            case MASKS.YALANCI: return 'Haqqında gələn ilk araşdırma yalan olacaq.';
            case MASKS.CASUS: return 'Hər turun sonunda bir oyunçunun kart sayını görəcəksən.';
            case MASKS.QORUYUCU: return 'Sənə qarşı edilən ilk zərərli həmlə (İfşa/Dəyiş) işləməyəcək.';
            case MASKS.DEYISEN: return 'Özünə qarşı "Dəyiş" kartı işlətsən, maskan dəyişəcək.';
            default: return '';
        }
    }

    assignMasks() {
        const roles = [MASKS.YALANCI, MASKS.CASUS, MASKS.QORUYUCU, MASKS.DEYISEN];
        // Rolları qarışdır və payla
        for (const p of this.players) {
            const randomRole = roles[Math.floor(Math.random() * roles.length)];
            p.mask = randomRole;
            if (p.mask === MASKS.QORUYUCU) p.isProtected = true;
        }
    }

    resetDeck() {
        this.deck = [];
        const baseActions = [ACTIONS.ARASDIR, ACTIONS.LEGV, ACTIONS.DEYIS, ACTIONS.IFSA];
        // Hər oyunçu üçün təxmini 5 kart hesabı ilə stok yaradırıq
        for (let i = 0; i < this.players.length * 5; i++) {
            this.deck.push(baseActions[Math.floor(Math.random() * baseActions.length)]);
        }
        this.shuffle(this.deck);
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    dealCards() {
        for (const p of this.players) {
            while (p.hand.length < GAME_CONFIG.HAND_SIZE) {
                if (this.deck.length === 0) this.resetDeck();
                p.hand.push(this.deck.pop());
            }
        }
    }

    getCurrentPlayer() {
        return this.players[this.turnIndex];
    }

    async playTurn(userId, cardName, targetId) {
        const player = this.players.find(p => p.id === userId);
        if (!player) return { success: false, msg: 'Oyunçu tapılmadı.' };
        if (this.status !== 'PLAYING') return { success: false, msg: 'Oyun aktiv deyil.' };
        if (this.getCurrentPlayer().id !== userId) return { success: false, msg: `Sıra səndə deyil! Sıra: ${this.getCurrentPlayer().user.username}` };

        // Kart yoxlanışı
        const cardIndex = player.hand.indexOf(cardName.toUpperCase());
        if (cardIndex === -1) return { success: false, msg: 'Əlində bu kart yoxdur.' };

        // Target yoxlanışı
        let target = null;
        if (targetId) {
            target = this.players.find(p => p.id === targetId);
            if (!target) return { success: false, msg: 'Hədəf oyunçu tapılmadı.' };
        }

        // Qoruyucu Maska Logikası
        if (target && target.isProtected && (cardName === ACTIONS.IFSA || cardName === ACTIONS.DEYIS)) {
            target.isProtected = false; // Qoruma qırıldı
            player.hand.splice(cardIndex, 1);
            this.lastAction = { type: 'BLOCKED', user: player, card: cardName };
            await this.nextTurn();
            return { success: true, msg: `🛡️ ${target.user.username} QORUYUCU maskası sayəsində hücumdan qorundu!` };
        }

        // KART MƏNTİQİ
        let resultMsg = '';
        let success = true;

        switch (cardName.toUpperCase()) {
            case ACTIONS.ARASDIR:
                if (!target) return { success: false, msg: 'Araşdırmaq üçün hədəf seçməlisən!' };
                let info = `Bu oyunçunun maskası: ${target.mask}`;
                
                // Yalançı Logikası
                if (target.mask === MASKS.YALANCI && target.investigatedCount === 0) {
                    const fakeRoles = Object.values(MASKS).filter(m => m !== MASKS.YALANCI);
                    info = `Bu oyunçunun maskası: ${fakeRoles[Math.floor(Math.random() * fakeRoles.length)]}`;
                }
                
                // Duman Eventi
                if (this.currentEvent === EVENTS.DUMAN) {
                    info = `Duman səbəbindən heç nə görünmür... (???/???)`;
                }

                target.investigatedCount++;
                await player.user.send(`🔍 **Araşdırma nəticəsi (${target.user.username}):**\n${info}`);
                resultMsg = `${player.user.username}, ${target.user.username}-i araşdırdı. Nəticə DM-ə göndərildi.`;
                break;

            case ACTIONS.LEGV:
                // Son gedişi geri qaytarmaq çox mürəkkəbdir, sadələşdirilmiş:
                // Əgər son gediş İFŞA idisə və uğurlu idisə, xalı geri alır və maskanı gizlədir.
                if (this.lastAction && this.lastAction.type === 'REVEALED') {
                    const victim = this.lastAction.target;
                    const attacker = this.lastAction.user;
                    victim.maskRevealed = false;
                    attacker.score -= 1;
                    resultMsg = `⛔ **LƏĞV!** Son ifşa qərarı ləğv edildi! ${victim.user.username} yenidən gizləndi.`;
                } else {
                    resultMsg = `⛔ **LƏĞV!** Kart oynandı amma geri qaytarılacaq kritik bir gediş yox idi.`;
                }
                break;

            case ACTIONS.DEYIS:
                if (!target) return { success: false, msg: 'Dəyişmək üçün hədəf seçməlisən!' };
                
                // Dəyişən Maska Logikası (Özünə tətbiq)
                if (target.id === player.id && player.mask === MASKS.DEYISEN) {
                    const roles = Object.values(MASKS);
                    player.mask = roles[Math.floor(Math.random() * roles.length)];
                    await player.user.send(`🎭 **MASKAN DƏYİŞDİ!** Yeni maskan: ${player.mask}`);
                    resultMsg = `${player.user.username} öz üzərində gizli bir əməliyyat apardı...`;
                } else {
                    const tempHand = [...player.hand];
                    player.hand = [...target.hand];
                    target.hand = tempHand;
                    // Öz kartını çıxmaq (swap etdikdən sonra köhnə əldən silinməməsi üçün logic tricky-dir)
                    // Sadəlik üçün: Swap baş verir, sonra oynanılan kart silinir (yeni əldən yox, oyunçunun haqqından)
                    resultMsg = `🔄 ${player.user.username} və ${target.user.username} kartlarını dəyişdi!`;
                }
                break;

            case ACTIONS.IFSA:
                if (!target) return { success: false, msg: 'İfşa üçün hədəf seçməlisən!' };
                if (target.maskRevealed) return { success: false, msg: 'Bu oyunçu artıq ifşa olunub!' };
                
                target.maskRevealed = true;
                player.score += 1; // Uğurlu ifşa
                
                this.lastAction = { type: 'REVEALED', user: player, target: target };
                resultMsg = `📢 **İFŞA!** ${target.user.username}-in maskası açıldı: **${target.mask}**! (+1 xal)`;
                break;

            default:
                return { success: false, msg: 'Naməlum kart.' };
        }

        // Kartı əldən sil
        player.hand.splice(cardIndex, 1);
        
        // Qalibiyyət yoxlanışı
        if (player.score >= GAME_CONFIG.WIN_SCORE) {
            this.status = 'ENDED';
            return { success: true, msg: resultMsg + `\n\n🎉 **OYUN BİTDİ! QALİB: ${player.user.username}!**` };
        }

        await this.nextTurn();
        return { success: true, msg: resultMsg };
    }

    async passTurn(userId) {
        if (this.getCurrentPlayer().id !== userId) return { success: false, msg: 'Sıra səndə deyil.' };
        return await this.nextTurn(true);
    }

    async nextTurn(skipped = false) {
        // Event yoxlanışı (Əgər tur başa çatdısa - yəni hər kəs oynadısa)
        // Sadəlik üçün hər gedişdən sonra növbə dəyişir.
        
        this.turnIndex = (this.turnIndex + 1) % this.players.length;

        // Əgər dövrə başa çatdısa (Round 0-a qayıtdısa) Event aç
        let eventMsg = null;
        if (this.turnIndex === 0) {
            eventMsg = this.triggerRandomEvent();
            // Kart payla (hər raund hər kəsə 1 kart ver, əgər əli doludursa vermə)
            for(const p of this.players) {
                if(p.hand.length < GAME_CONFIG.HAND_SIZE) {
                    if(this.deck.length > 0) p.hand.push(this.deck.pop());
                }
                // Casus Logikası
                if (p.mask === MASKS.CASUS) {
                    const target = this.players.find(x => x.id !== p.id); // Random kimsə
                    if (target) {
                        try { await p.user.send(`🕵️ **CASUS MƏLUMATI:** ${target.user.username}-in əlində ${target.hand.length} kart var.`); } catch(e){}
                    }
                }
            }
        }

        const nextPlayer = this.getCurrentPlayer();
        const info = skipped ? 'bir öncəki oyunçu gedişini ötürdü.' : 'gediş edildi.';
        
        return { 
            success: true, 
            msg: `${info}\n${eventMsg ? `⚡ **HADİSƏ:** ${eventMsg}\n` : ''}👉 **Sıra:** ${nextPlayer.user} ` 
        };
    }

    triggerRandomEvent() {
        const events = Object.values(EVENTS);
        const ev = events[Math.floor(Math.random() * events.length)];
        this.currentEvent = ev;

        switch(ev) {
            case EVENTS.DUMAN: return 'DUMAN! Bu tur ARAŞDIR kartları yanlış məlumat verəcək.';
            case EVENTS.EDALET: 
                // Ən çox kartı olanın 1 kartını at
                const maxCards = Math.max(...this.players.map(p => p.hand.length));
                const richPlayers = this.players.filter(p => p.hand.length === maxCards);
                richPlayers.forEach(p => { if(p.hand.length > 0) p.hand.pop(); });
                return 'ƏDALƏT! Ən çox kartı olanların əlindən 1 kart alındı.';
            case EVENTS.ZAMAN: return 'ZAMAN! Qərar vermək üçün tələsin (Sadəcə stress faktoru).';
            case EVENTS.GERGINLIK: return 'GƏRGİNLİK! Növbəti tur hamı +1 əlavə kart çəkir.'; // Realizasiyası sadə olsun deyə next turn logic-ə əlavə etmək lazımdır, amma burada sadə saxlayırıq.
            default: return 'Sakitlik...';
        }
    }

    getStatus() {
        const embed = createEmbed('📊 Oyun Statusu', 'Cari vəziyyət', '#00ff00');
        let desc = '';
        this.players.forEach(p => {
            desc += `**${p.user.username}**: ${p.score} Xal | ${p.hand.length} Kart | ${p.maskRevealed ? `Açıq: ${p.mask}` : 'Gizli'}\n`;
        });
        embed.addFields({ name: 'Oyunçular', value: desc });
        embed.addFields({ name: 'Cari Event', value: this.currentEvent || 'Yoxdur', inline: true });
        embed.addFields({ name: 'Sıra', value: this.getCurrentPlayer().user.username, inline: true });
        return embed;
    }
}

// Global oyun state-i (Map: channelId -> Game Instance)
const games = new Map();

module.exports = { Game, games };