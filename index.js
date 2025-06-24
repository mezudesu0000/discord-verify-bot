const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ActivityType,
  PermissionsBitField,
} = require('discord.js');

const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');

const play = require('play-dl');
const fetch = require('node-fetch');
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示します')
    .addStringOption((option) =>
      option.setName('role').setDescription('付与するロール名').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('指定したユーザーをBANします')
    .addUserOption((option) =>
      option.setName('target').setDescription('BANするユーザー').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('指定したユーザーをKICKします')
    .addUserOption((option) =>
      option.setName('target').setDescription('KICKするユーザー').setRequired(true)
    ),

  new SlashCommandBuilder().setName('neko').setDescription('ランダムな猫の画像を表示'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
  client.user.setStatus('idle');

  try {
    console.log('⏳ スラッシュコマンドを登録中...');
    // グローバル登録は最大1時間程度反映に時間がかかるため
    // 開発中はギルドIDを指定してテストサーバーに即時登録するのがおすすめです。
    // const GUILD_ID = 'ここにテストサーバーIDを入れてください';
    // await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });

    // グローバル登録（反映には時間がかかる）
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    console.log('✅ スラッシュコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
});

// --- スラッシュコマンド処理 ---
client.on(Events.InteractionCreate, async (interaction)
