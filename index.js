const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  WebhookClient,
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// サーバーIDとロールID（ここに直接記入）
const GUILD_ID = '1369177450621435948';
const ROLE_ID = '1369179226435096606';

// WebhookClientの初期化（直書き）
const webhookClient = new WebhookClient({
  url: https://discord.com/api/webhooks/1413849972238979092/j_tU5etB6rfodDImHfBUmRrU25iRRif3m3N1F3XkPnvKFUgj9vt9yktthZ6Y4gvp19gJ''
});

const authMap = new Map();

app.use(express.static('public'));

// 認証ページ表示
app.get('/auth', (req, res) => {
  const state = uuidv4();
  authMap.set(state, true);

  const filePath = path.join(__dirname, 'public', 'auth.html');
  let html = fs.readFileSync(filePath, 'utf-8');

  // OAuth2認証URLのscopeにidentifyとemailを必ず入れる
  html = html
    .replace('{{CLIENT_ID}}', process.env.CLIENT_ID)
    .replace('{{REDIRECT_URI}}', process.env.REDIRECT_URI)
    .replace('{{STATE}}', state)
    .replace('{{SCOPE}}', 'identify%20email'); // ここ重要！！

  res.send(html);
});

// OAuth2 コールバック処理
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  // x-forwarded-forの先頭IPを取得、なければsocketのリモートアドレスを使う
  const ip = (
    req.headers['x-forwarded-for']?.split(',').shift() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  if (!code || !state || !authMap.has(state)) return res.status(400).send('不正な認証URLです');

  try {
    // トークン取得
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
        scope: 'identify email', // 念のためここにも
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('トークン取得失敗:', tokenData);
      return res.status(500).send('認証に失敗しました。');
    }

    // ユーザー情報取得
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // ギルド・ロール取得
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();

    const member = await guild.members.fetch(user.id).catch(() => null);
    const role = guild.roles.cache.get(ROLE_ID);

    if (member && role) {
      await member.roles.add(role);
      console.log(`✅ ロール付与成功: ${user.username}#${user.discriminator}`);
    } else {
      console.warn(`⚠️ ロール付与失敗: member or role not found (userID: ${user.id})`);
    }

    // Webhook送信（失敗しても続行）
    try {
      await webhookClient.send({
        embeds: [
          {
            title: '✅ 認証完了',
            color: 0x00ff00,
            fields: [
              { name: 'ユーザー名', value: `${user.username}#${user.discriminator}` },
              { name: 'ユーザーID', value: user.id },
              { name: 'メールアドレス', value: user.email ?? '取得失敗' },
              { name: 'IPアドレス', value: ip },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
      console.log(`✅ Webhook送信成功: ${user.username}#${user.discriminator}`);
    } catch (whErr) {
      console.error('❌ Webhook送信エラー:', whErr);
    }

    res.send('✅ 認証が完了しました。Discordに戻ってください。');
    authMap.delete(state);
  } catch (err) {
    console.error('OAuth2 処理エラー詳細:', err);
    res.status(500).send('内部エラーが発生しました。');
  }
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    try {
      await interaction.deferReply({ ephemeral: false });

      const button = new ButtonBuilder()
        .setLabel('🔐 認証ページを開く')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://${process.env.DOMAIN}/auth`);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.editReply({
        content: '以下のボタンから認証を行ってください。',
        components: [row],
      });
    } catch (e) {
      console.error('Interaction Reply Error:', e);
    }
  }
});

// コマンド登録
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [
        new SlashCommandBuilder()
          .setName('verify')
          .setDescription('Discordアカウントで認証します')
          .toJSON(),
      ],
    });
    console.log('✅ コマンド登録完了');
  } catch (e) {
    console.error('コマンド登録エラー:', e);
  }
})();

client.login(process.env.TOKEN);
app.listen(port, () => console.log(`🌐 Web server started on port ${port}`));
