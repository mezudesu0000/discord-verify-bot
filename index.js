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
  ActivityType
} = require('discord.js');
require('dotenv').config();
const express = require('express');

// ✅ Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
});

// ✅ スラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示します')
    .addStringOption(option =>
      option.setName('role')
        .setDescription('付与するロール名')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('指定したユーザーをBANします')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('BANするユーザー')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('指定したユーザーをKICKします')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('KICKするユーザー')
        .setRequired(true)
    )
].map(command => command.toJSON());

// ✅ スラッシュコマンド登録
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
client.on(Events.ClientReady, async () => {
