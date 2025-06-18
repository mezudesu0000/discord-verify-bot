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
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ スラッシュコマンド登録完了！');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// ✅ 認証処理
const verifyMap = new Map();

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // /verify
    if (commandName === 'verify') {
      const roleName = interaction.options.getString('role');
      verifyMap.set(interaction.user.id, roleName);

      const button = new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('✅ 認証する')
        .setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(button);

      await interaction.reply({
        content: `以下のボタンを押して認証を完了してください。\n※付与ロール名: **${roleName}**`,
        components: [row]
      });
    }

    // /ban
    if (commandName === 'ban') {
      if (!interaction.member.permissions.has('BanMembers')) {
        return interaction.reply({ content: '❌ BANする権限がありません。', ephemeral: true });
      }

      const target = interaction.options.getUser('target');
      const member = interaction.guild.members.cache.get(target.id);
      if (!member || !member.bannable) {
        return interaction.reply({ content: '❌ このユーザーはBANできません。', ephemeral: true });
      }

      await member.ban();
      await interaction.reply(`✅ ${target.tag} をBANしました。`);
    }

    // /kick
    if (commandName === 'kick') {
      if (!interaction.member.permissions.has('KickMembers')) {
        return interaction.reply({ content: '❌ KICKする権限がありません。', ephemeral: true });
      }

      const target = interaction.options.getUser('target');
      const member = interaction.guild.members.cache.get(target.id);
      if (!member || !member.kickable) {
        return interaction.reply({ content: '❌ このユーザーはKICKできません。', ephemeral: true });
      }

      await member.kick();
      await interaction.reply(`✅ ${target.tag} をKICKしました。`);
    }
  }

  // 認証ボタン処理
  if (interaction.isButton(
