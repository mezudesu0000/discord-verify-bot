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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ipMap = new Map(); // userId => IPアドレス

// Webサーバールート
app.get('/', (req, res) => {
  res.send('<h1>Botは稼働中です。</h1>');
});

// 認証ページ：アクセスするとロール付与・IP記録
app.get('/auth/:guildId/:userId/:roleId', async (req, res) => {
  const { guildId, userId, roleId } = req.params;
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.connection.remoteAddress;

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return res.status(404).send('ギルドが見つかりません。');

    const member = await guild.members.fetch(userId);
    if (!member) return res.status(404).send('ユーザーが見つかりません。');

    const role = guild.roles.cache.get(roleId);
    if (!role) return res.status(404).send('ロールが見つかりません。');

    await member.roles.add(role);
    ipMap.set(userId, ip); // IP記録（上書き）

    res.send(
      `<h1>認証完了しました！</h1>
      <p>ロール「${role.name}」を付与しました。</p>`
    );
  } catch (e) {
    console.error(e);
    res.status(500).send('サーバーエラーが発生しました。');
  }
});

app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
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

  new SlashCommandBuilder()
    .setName('neko')
    .setDescription('ランダムな猫の画像を表示'),

  new SlashCommandBuilder()
    .setName('user')
    .setDescription('認証済みユーザーのIP一覧を表示します（管理者専用）'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
  client.user.setStatus('idle');

  try {
    console.log('⏳ スラッシュコマンドを登録中...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ スラッシュコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'verify') {
    const roleName = interaction.options.getString('role');
    const role = interaction.guild.roles.cache.find((r) => r.name === roleName);
    if (!role)
      return interaction.reply({
        content: '❌ 指定されたロールが見つかりません。',
        ephemeral: true,
      });

    // **ここを必ずあなたのRenderのURLに置き換えてください！！**
    const authURL = `https://discord-verify-bot-rb6b.onrender.com/auth/${interaction.guild.id}/${interaction.user.id}/${role.id}`;

    const linkButton = new ButtonBuilder()
      .setLabel('✅ 認証ページを開く')
      .setStyle(ButtonStyle.Link)
      .setURL(authURL);

    const row = new ActionRowBuilder().addComponents(linkButton);

    await interaction.reply({
      content: '下のボタンを押して認証を完了させてください。',
      components: [row],
      ephemeral: false, // ここで全員に見えるようにする
    });

  } else if (commandName === 'ban' || commandName === 'kick') {
    const permission =
      commandName === 'ban'
        ? PermissionsBitField.Flags.BanMembers
        : PermissionsBitField.Flags.KickMembers;

    if (!interaction.member.permissions.has(permission))
      return interaction.reply({
        content: `❌ ${commandName.toUpperCase()}する権限がありません。`,
        ephemeral: true,
      });

    const target = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(target.id);
    if (!member)
      return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });

    try {
      await member[commandName]();
      interaction.reply(`✅ ${target.tag} を${commandName.toUpperCase()}しました。`);
    } catch (error) {
      console.error(error);
      interaction.reply({
        content: `❌ ${commandName.toUpperCase()}に失敗しました。`,
        ephemeral: true,
      });
    }

  } else if (commandName === 'neko') {
    try {
      const fetch = require('node-fetch');
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const data = await res.json();
      await interaction.reply({ content: '🐱 にゃーん', files: [data[0].url] });
    } catch (e) {
      console.error(e);
      interaction.reply('❌ 猫画像の取得に失敗しました。');
    }

  } else if (commandName === 'user') {
    // 管理者チェック
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ 管理者のみ使用可能です。', ephemeral: true });
    }

    if (ipMap.size === 0) {
      return interaction.reply({ content: '認証済みユーザーはいません。', ephemeral: true });
    }

    let content = '認証済みユーザーとIP一覧:\n';
    for (const [userId, ip] of ipMap.entries()) {
      content += `<@${userId}> : ${ip}\n`;
    }
    interaction.reply({ content, ephemeral: true });
  }
});

client.login(process.env.TOKEN);
