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

// 環境変数はそのまま使う
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const DOMAIN = process.env.DOMAIN;

// Webhook URLを指定のものに直書き
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1394228598004649984/QOMWArPW1suYbhmMmHdyXURj1obiz130Tzwl4Zijm29fw8M07h8srcygPDdeOg_vMrLO';

const webhookClient = new WebhookClient({ url: WEBHOOK_URL });

const authMap = new Map();

app.use(express.static('public'));

app.get('/auth', (req, res) => {
  try {
    const state = uuidv4();
    authMap.set(state, true);

    const filePath = path.join(__dirname, 'public', 'auth.html');
    let html = fs.readFileSync(filePath, 'utf-8');
    html = html
      .replace('{{CLIENT_ID}}', CLIENT_ID)
      .replace('{{REDIRECT_URI}}', REDIRECT_URI)
      .replace('{{STATE}}', state);
    res.send(html);
  } catch (err) {
    console.error('認証ページ表示エラー:', err);
    res.status(500).send('認証ページの表示に失敗しました。');
  }
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || 'unknown';

  if (!code || !state || !authMap.has(state)) {
    console.warn('不正な認証URLアクセス:', { code, state });
    return res.status(400).send('不正な認証URLです');
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('トークン取得失敗:', tokenData);
      return res.status(500).send('認証に失敗しました。');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

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

    try {
      await webhookClient.send({
        embeds: [
          {
            title: '✅ 認証完了',
            color: 0x00ff00,
            fields: [
              { name: 'ユーザー名', value: `${user.username}#${user.discriminator}` },
              { name: 'ユーザーID', value: user.id },
              { name: 'メールアドレス', value: user.email || '取得失敗' },
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
    res.status(500).send(`内部エラーが発生しました。\n${err.message || err}`);
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
        .setURL(`https://${DOMAIN}/auth`);

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

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
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

client.login(TOKEN);
app.listen(port, () => console.log(`🌐 Web server started on port ${port}`));
