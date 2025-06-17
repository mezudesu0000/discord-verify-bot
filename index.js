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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
});

// ✅ スラッシュコマンド定義（ロール名の引数を追加）
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示します')
    .addStringOption(option =>
      option.setName('role')
        .setDescription('付与するロール名')
        .setRequired(true)
    )
    .toJSON()
];

// ✅ スラッシュコマンド登録
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
client.on(Events.ClientReady, async () => {
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ /verify コマンド登録完了！');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// ✅ コマンドとボタン処理
const verifyMap = new Map(); // ← コマンド発行者ごとのロール名を一時保存するMap

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
    const roleName = interaction.options.getString('role');
    verifyMap.set(interaction.user.id, roleName); // 発行者のIDとロール名を保存

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

  if (interaction.isButton() && interaction.customId === 'verify_button') {
    const guild = interaction.guild;
    const member = interaction.member;

    // スラッシュコマンドを発行した人のIDからロール名を取得
    const roleName = verifyMap.get(interaction.user.id);
    if (!roleName) {
      await interaction.reply({ content: '❌ ロール情報が見つかりません。', ephemeral: true });
      return;
    }

    const role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      await interaction.reply({ content: `❌ ロール「${roleName}」が見つかりません。`, ephemeral: true });
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await interaction.reply({ content: '✅ すでに認証されています！', ephemeral: true });
    } else {
      await member.roles.add(role);
      await interaction.reply({ content: `🎉 認証が完了しました！ ロール「${role.name}」が付与されました！`, ephemeral: true });
    }
  }
});

// ✅ Express（Render用）
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Express サーバー起動：ポート ${PORT}`);
});

client.login(process.env.TOKEN);