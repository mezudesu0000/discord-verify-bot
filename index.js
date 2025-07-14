const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const authMap = new Map(); // state => user_id

app.use(express.static('public'));

// 認証UIページ
app.get('/auth', (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).send('Missing user_id');

  const state = uuidv4();
  authMap.set(state, userId);

  const filePath = path.join(__dirname, 'public', 'auth.html');
  let html = fs.readFileSync(filePath, 'utf-8');
  html = html
    .replace('{{CLIENT_ID}}', process.env.CLIENT_ID)
    .replace('{{REDIRECT_URI}}', process.env.REDIRECT_URI)
    .replace('{{STATE}}', state);
  res.send(html);
});

// OAuth2 コールバック
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!code || !state || !authMap.has(state)) return res.status(400).send('不正な認証URLです');
  const expectedUserId = authMap.get(state);

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(500).send('トークン取得失敗');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    if (user.id !== expectedUserId) return res.status(403).send('ユーザーIDが一致しません');

    // ロール付与
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(process.env.ROLE_ID);
    if (member && role) {
      await member.roles.add(role);
    }

    // Webhook送信
    await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    res.send('✅ 認証が完了しました。Discordに戻ってください。');
    authMap.delete(state);
  } catch (err) {
    console.error('OAuth2 Error:', err);
    res.status(500).send('内部エラーが発生しました。');
  }
});

// Discord イベント
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'verify') {
    const button = new ButtonBuilder()
      .setLabel('🔐 認証ページを開く')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://${process.env.DOMAIN}/auth?user_id=${interaction.user.id}`);
    const row = new ActionRowBuilder().addComponents(button);

    try {
      await interaction.reply({
        content: '以下のボタンから認証を行ってください。',
        components: [row],
        // flags: 64 → ephemeral にする場合のみ必要
      });
    } catch (err) {
      console.error('リプライ失敗:', err);
    }
  }
});

// スラッシュコマンド登録
(async () => {
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
})();

client.login(process.env.TOKEN);
app.listen(port, () => console.log(`🌐 Web server started on port ${port}`));
