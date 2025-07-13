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

const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.set('trust proxy', true); // リバースプロキシ環境で正しいIPを取得するため

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://discord-verify-bot-rb6b.onrender.com'; // 必ず環境変数かここを書き換え
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const ipMap = new Map(); // userId => IP

// サーバー確認用
app.get('/', (req, res) => {
  res.send('<h1>Botは稼働中です。</h1>');
});

// 認証処理：IP取得 + ロール付与 + Webhook送信
app.get('/auth/:guildId/:userId/:roleId', async (req, res) => {
  const { guildId, userId, roleId } = req.params;

  // IPv6/IPv4対応でIPを取得
  let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'IP不明';

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const role = guild.roles.cache.get(roleId);

    if (!role) return res.status(404).send('指定されたロールが見つかりません。');

    await member.roles.add(role);
    ipMap.set(userId, ip);

    // Webhookに送信
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `✅ 認証成功！ <@${userId}>（${member.user.tag}） IP: \`${ip}\``,
        }),
      });
    }

    res.send(`<h1>認証完了！</h1><p>ロール「${role.name}」を付与しました。</p>`);
  } catch (error) {
    console.error(error);
    res.status(500).send('サーバーエラーが発生しました。');
  }
});

app.listen(PORT, () => console.log(`✅ Webサーバー起動: PORT ${PORT}`));

// Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

// スラッシュコマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示')
    .addStringOption(option =>
      option.setName('role').setDescription('付与するロール名').setRequired(true)),
  new SlashCommandBuilder()
    .setName('user')
    .setDescription('認証済みユーザーのIP一覧（管理者専用）'),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('指定ユーザーをBAN')
    .addUserOption(option =>
      option.setName('target').setDescription('BANするユーザー').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('指定ユーザーをKICK')
    .addUserOption(option =>
      option.setName('target').setDescription('KICKするユーザー').setRequired(true)),
  new SlashCommandBuilder()
    .setName('neko')
    .setDescription('ランダムな猫の画像を表示'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// Bot準備完了イベント
client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });

  try {
    console.log('⏳ コマンド登録中...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ コマンド登録完了');
  } catch (err) {
    console.error(err);
  }
});

// スラッシュコマンド処理
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'verify') {
    const roleName = interaction.options.getString('role');
    const role = interaction.guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
      return interaction.reply({ content: '❌ 指定されたロールが見つかりません。', ephemeral: true });
    }

    const authURL = `${BASE_URL}/auth/${interaction.guild.id}/${interaction.user.id}/${role.id}`;
    const button = new ButtonBuilder()
      .setLabel('✅ 認証ページを開く')
      .setStyle(ButtonStyle.Link)
      .setURL(authURL);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: '以下のボタンを押して認証を完了してください。',
      components: [row],
      ephemeral: true,
    });

  } else if (commandName === 'user') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ 管理者専用コマンドです。', ephemeral: true });
    }

    if (ipMap.size === 0) {
      return interaction.reply({ content: '📭 認証済みユーザーはいません。', ephemeral: true });
    }

    let list = '📝 認証済みユーザー一覧:\n';
    for (const [userId, ip] of ipMap.entries()) {
      list += `<@${userId}> : \`${ip}\`\n`;
    }

    interaction.reply({ content: list, ephemeral: true });

  } else if (commandName === 'ban' || commandName === 'kick') {
    const perm = commandName === 'ban'
      ? PermissionsBitField.Flags.BanMembers
      : PermissionsBitField.Flags.KickMembers;

    if (!interaction.member.permissions.has(perm)) {
      return interaction.reply({ content: `❌ ${commandName.toUpperCase()}の権限がありません。`, ephemeral: true });
    }

    const target = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(target.id);
    if (!member) {
      return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });
    }

    try {
      await member[commandName]();
      interaction.reply(`✅ ${target.tag} を${commandName.toUpperCase()}しました。`);
    } catch (err) {
      console.error(err);
      interaction.reply({ content: `❌ ${commandName.toUpperCase()} に失敗しました。`, ephemeral: true });
    }

  } else if (commandName === 'neko') {
    try {
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const data = await res.json();
      await interaction.reply({ content: '🐱 にゃーん！', files: [data[0].url] });
    } catch (err) {
      console.error(err);
      interaction.reply('❌ 猫画像の取得に失敗しました。');
    }
  }
});

client.login(process.env.TOKEN);
