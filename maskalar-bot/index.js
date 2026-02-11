require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { Game, games } = require('./src/gameManager');
const { createEmbed } = require('./src/utils');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

client.once(Events.ClientReady, c => {
    console.log(`🤖 Bot hazırdır! ${c.user.tag} kimi daxil oldu.`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, channelId, user, guildId } = interaction;

    // Oyunu tap və ya yaratmaq üçün
    let game = games.get(channelId);

    // /maskalar komandaları
    if (commandName === 'maskalar') {
        const sub = options.getSubcommand();

        if (sub === 'start') {
            if (game) return interaction.reply({ content: 'Bu kanalda artıq oyun var!', ephemeral: true });
            
            // Lobby mərhələsi - Oyunçuları yığmaq üçün düymə və ya sadəcə join logic
            // Sadəlik üçün: Start deyən avtomatik qoşulur, sonra başqaları 'join' düyməsi (burada sadəcə text based logic)
            // Lakin promptda "slash commands" deyilir. Gəlin start deyəndə lobby yaradaq, və "/oyna" logicindən əvvəl "/join" əlavə edək. 
            // Amma tələblərdə join command yoxdur.
            // ONA GÖRƏ: "/maskalar start" yazan zaman, bot bir Embed atacaq və "Join" düyməsi qoyacaq.
            
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
            
            game = new Game(channelId, client);
            games.set(channelId, game);
            game.addPlayer(user); // Yaradan qoşulur

            const joinBtn = new ButtonBuilder().setCustomId('join_game').setLabel('Qoşul').setStyle(ButtonStyle.Success);
            const startBtn = new ButtonBuilder().setCustomId('start_game').setLabel('Başla').setStyle(ButtonStyle.Primary);
            const row = new ActionRowBuilder().addComponents(joinBtn, startBtn);

            const embed = createEmbed('🎭 MASKALAR', `Oyun quruldu! Qoşulmaq üçün düyməni sıxın.\nQoşulanlar: ${user.username}`);
            
            const response = await interaction.reply({ embeds: [embed], components: [row] });
            
            // Collector for buttons
            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 * 5 }); // 5 dəqiqə lobby

            collector.on('collect', async i => {
                if (!games.has(channelId)) return;
                const g = games.get(channelId);

                if (i.customId === 'join_game') {
                    const res = g.addPlayer(i.user);
                    const newEmbed = createEmbed('🎭 MASKALAR', `Oyun quruldu! Qoşulmaq üçün düyməni sıxın.\nQoşulanlar: ${g.players.map(p => p.user.username).join(', ')}`);
                    await i.update({ embeds: [newEmbed] });
                    if (!res.success) await i.followUp({ content: res.msg, ephemeral: true });
                }

                if (i.customId === 'start_game') {
                    if (i.user.id !== user.id) return i.reply({ content: 'Oyunu yalnız quran başlada bilər!', ephemeral: true });
                    const res = await g.startGame();
                    if (res.success) {
                        await i.update({ components: [] }); // Düymələri sil
                        await i.channel.send({ embeds: [createEmbed('🎮 Oyun Başladı!', res.msg)] });
                        await i.channel.send(`👉 **Sıra:** ${g.getCurrentPlayer().user}`);
                    } else {
                        await i.reply({ content: res.msg, ephemeral: true });
                    }
                }
            });
            return;
        }

        if (sub === 'status') {
            if (!game) return interaction.reply({ content: 'Aktiv oyun yoxdur.', ephemeral: true });
            return interaction.reply({ embeds: [game.getStatus()] });
        }

        if (sub === 'bitir') {
            if (!game) return interaction.reply({ content: 'Aktiv oyun yoxdur.', ephemeral: true });
            games.delete(channelId);
            return interaction.reply('Oyun məcburi dayandırıldı.');
        }
    }

    // Oyun komandaları
    if (commandName === 'oyna') {
        if (!game) return interaction.reply({ content: 'Oyun yoxdur. /maskalar start', ephemeral: true });
        
        const kart = options.getString('kart');
        const hedef = options.getUser('hedef');
        
        await interaction.deferReply(); // Logic uzun çəkə bilər

        const res = await game.playTurn(user.id, kart, hedef ? hedef.id : null);
        
        if (res.success) {
            await interaction.editReply({ embeds: [createEmbed('🃏 Gediş edildi', res.msg)] });
            if (game.status === 'ENDED') games.delete(channelId);
            else {
                // Növbəti oyunçuya bildiriş
                await interaction.channel.send(`👉 **Sıra:** ${game.getCurrentPlayer().user}`);
            }
        } else {
            await interaction.editReply({ content: `❌ Xəta: ${res.msg}` });
        }
    }

    if (commandName === 'kec') {
        if (!game) return interaction.reply({ content: 'Oyun yoxdur.', ephemeral: true });
        await interaction.deferReply();
        const res = await game.passTurn(user.id);
        if (res.success) {
            await interaction.editReply({ content: res.msg });
        } else {
            await interaction.editReply({ content: `❌ ${res.msg}` });
        }
    }
});

client.login(process.env.TOKEN);

// RENDER ÜÇÜN KEEP-ALIVE SERVER
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Maskalar Botu isleyir! 🤖');
});

server.listen(port, () => {
    console.log(`Web server dinləyir: port ${port}`);
});

// Botu giriş etdiririk
client.login(process.env.TOKEN);