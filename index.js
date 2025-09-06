require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 10000;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const VERIFY_ROLE_ID = process.env.VERIFY_ROLE_ID;
const AUTH_URL = process.env.AUTH_URL;

// --- スラッシュコマンド登録 ---
const commands = [
  { name: 'verify', description: '認証パネルを作成します' }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Refreshing application (/) commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// --- Bot起動時 ---
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --- コマンド受付 ---
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('認証ページへ')
          .setStyle(ButtonStyle.Link)
          .setURL(AUTH_URL)
      );

    await interaction.reply({
      content: '以下のボタンから認証を行ってください。',
      components: [row]
      // ephemeralは削除 → 全員が見える
    });
  }
});

// --- ExpressでHTML配信 ---
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Web server started on port ${PORT}`);
});

client.login(TOKEN);