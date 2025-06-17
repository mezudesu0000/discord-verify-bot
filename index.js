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

// Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

// ✅ 認証時に付与したいロールのID（変更してください）
const VERIFIED_ROLE_ID = '1369179226435096606';

// Bot準備完了時
client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);

  // プレイ中のステータスを設定
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
});

// ✅ /verify コマンドを定義
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示します')
    .toJSON()
];

// ✅ コマンドをDiscordに登録
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.on(Events.ClientReady, async () => {
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ /verify コマンド登録完了！');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// ✅ /verify コマンド実行時の処理
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
    const button = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('✅ 認証する')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: '以下のボタンを押して認証を完了してください。',
      components: [row]
    });
  }

  if (interaction.isButton() && interaction.customId === 'verify_button') {
    const member = interaction.member;

    if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
      await interaction.reply({ content: '✅ すでに認証されています！', ephemeral: true });
    } else {
      await member.roles.add(VERIFIED_ROLE_ID);
      await interaction.reply({ content: '🎉 認証が完了しました！', ephemeral: true });
    }
  }
});

// ✅ Discord Botにログイン
client.login(process.env.TOKEN);

// ✅ Express サーバー起動（Renderで常時起動するため）
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// PORTはRenderが自動で指定する
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Express サーバー起動：ポート ${PORT}`);
});
