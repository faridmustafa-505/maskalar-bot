const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder()
        .setName('maskalar')
        .setDescription('Maskalar oyununu idarə et')
        .addSubcommand(sub => 
            sub.setName('start').setDescription('Oyunu başlat'))
        .addSubcommand(sub => 
            sub.setName('status').setDescription('Oyunun vəziyyətinə bax'))
        .addSubcommand(sub => 
            sub.setName('bitir').setDescription('Oyunu ləğv et')),
    
    new SlashCommandBuilder()
        .setName('oyna')
        .setDescription('Bir kart oyna')
        .addStringOption(option =>
            option.setName('kart')
                .setDescription('Oynamaq istədiyin kart')
                .setRequired(true)
                .addChoices(
                    { name: 'ARAŞDIR', value: 'ARAŞDIR' },
                    { name: 'LƏĞV', value: 'LƏĞV' },
                    { name: 'DƏYİŞ', value: 'DƏYİŞ' },
                    { name: 'İFŞA', value: 'İFŞA' }
                ))
        .addUserOption(option => 
            option.setName('hedef')
                .setDescription('Hədəf oyunçu (lazımdırsa)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('kec')
        .setDescription('Növbəni ötür'),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Slash commands qeydiyyatdan keçir...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Uğurla qeydiyyatdan keçdi!');
    } catch (error) {
        console.error(error);
    }
})();