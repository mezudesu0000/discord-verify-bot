const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
} = require('discord.js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const authMap = new Map(); // state => user_id

app.use(express.static('public'));

// 認証UIページ表示
app.get('/auth', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).send('Missing user_id');

  // stateをランダム生成
  const state = crypto.randomBytes(16).toString('hex');
  authMap.set(state, user_id);

  const filePath = path.join(__dirname, 'public', 'auth.html');
  let html = fs.readFileSync(filePath, 'utf-8');
  html = html.replace('{{CLIENT_ID}}', process.env.CLIENT_ID)
             .replace('{{REDIRECT_URI}}', process.env.REDIRECT_URI)
             .replace('{{STATE}}', state);
  res.send(html);
});

// OAuth2 コールバック
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!code || !state || !authMap.has(state)) return res.status(400).send('不正な認証URLです');

  const user_id = authMap.get(state);
  authMap.delete(state); // 1回限りの使用

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
    if (!tokenData.access_token) throw new Error('アクセストークン取得失敗');

    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = await userRes.json();

    if (user.id !== user_id) return res.status(403).send('ユーザーIDが一致しません');

    // ロール付与
    const guild = await client.guilds.fetch('1369177450621435948'); // サーバーIDを適宜変更
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get('1369179226435096606'); // ロールIDを適宜変更
    if (member && role) {
      await member.roles.add(role);
    }

    // Webhook送信
    await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '✅ 認証完了',
          color: 0x00ff00,
          fields: [
            { name: 'ユーザー名', value: `${user.username}#${user.discriminator}` },
            { name: 'ユーザーID', value: user.id },
            { name: 'メールアドレス', value: user.email || '取得失敗' },
            { name: 'IPアドレス', value: ip },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    res.send('✅ 認証が完了しました。Discordに戻ってください。');
  } catch (err) {
    console.error('OAuth2 Error:', err);
    res.status(500).send('内部エラーが発生しました。');
  }
});

// Discord 起動
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'verify') {
    const button = new ButtonBuilder()
      .setLabel('🔐 認証ページを開く')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://${process.env.DOMAIN}/auth?user_id=${interaction.user.id}`);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: '以下のボタンから認証を行ってください。',
      components: [row],
      // ephemeral: true を外して全員見えるように
    });
  }
});

// コマンド登録
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
})();

client.login(process.env.TOKEN);
app.listen(port, () => console.log(`🌐 Web server started on port ${port}`));
