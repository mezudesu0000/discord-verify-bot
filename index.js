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
  PermissionsBitField
} = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
require('dotenv').config();
const express = require('express');

// ✅ Expressサーバー（Render維持用）
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

// ✅ Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.GuildMember]
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
client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });

  try {
    console.log('⏳ スラッシュコマンドを登録中...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ スラッシュコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
});

// ✅ スラッシュコマンド処理
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'verify') {
    const roleName = interaction.options.getString('role');
    const role = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      return interaction.reply({ content: '❌ 指定されたロールが見つかりません。', ephemeral: true });
    }

    const button = new ButtonBuilder()
      .setCustomId(`verify_${role.id}`)
      .setLabel('✅ 認証する')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: '以下のボタンをクリックして認証を完了してください。',
      components: [row]
    });
  }

  if (commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '❌ BANする権限がありません。', ephemeral: true });
    }

    const target = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(target.id);
    if (!member) return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });

    try {
      await member.ban();
      interaction.reply(`✅ ${target.tag} をBANしました。`);
    } catch (error) {
      console.error(error);
      interaction.reply({ content: '❌ BANに失敗しました。', ephemeral: true });
    }
  }

  if (commandName === 'kick') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({ content: '❌ KICKする権限がありません。', ephemeral: true });
    }

    const target = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(target.id);
    if (!member) return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });

    try {
      await member.kick();
      interaction.reply(`✅ ${target.tag} をKICKしました。`);
    } catch (error) {
      console.error(error);
      interaction.reply({ content: '❌ KICKに失敗しました。', ephemeral: true });
    }
  }
});

// ✅ ボタン押下でロール付与
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  if (customId.startsWith('verify_')) {
    const roleId = customId.split('_')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ content: '❌ ロールが見つかりません。', ephemeral: true });
    }

    try {
      await interaction.member.roles.add(role);
      interaction.reply({ content: '✅ 認証完了！ロールが付与されました。', ephemeral: true });
    } catch (error) {
      console.error(error);
      interaction.reply({ content: '❌ ロール付与に失敗しました。', ephemeral: true });
    }
  }
});

// ✅ テキストコマンド処理
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // !del コマンド
  if (message.content.startsWith('!del')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('❌ メッセージを削除する権限がありません。');
    }

    const args = message.content.split(' ');
    const count = parseInt(args[1], 10);

    if (isNaN(count) || count < 1 || count > 200) {
      return message.reply('❌ 1〜200 の数字を指定してください。');
    }

    try {
      await message.channel.bulkDelete(count, true);
      message.channel.send(`✅ ${count}件のメッセージを削除しました。`).then(msg => {
        setTimeout(() => msg.delete(), 5000);
      });
    } catch (error) {
      console.error(error);
      message.reply('❌ メッセージの削除に失敗しました。');
    }
  }

  // !join コマンド
  if (message.content === '!join') {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ ボイスチャンネルに参加してからコマンドを使ってください。');
    }

    try {
      const existingConnection = getVoiceConnection(message.guild.id);
      if (existingConnection) existingConnection.destroy();

      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true
      });

      message.reply(`✅ <#${voiceChannel.id}> に参加しました！Botは退出しません。`);
    } catch (error) {
      console.error('VC参加エラー:', error);
      message.reply('❌ ボイスチャンネルへの参加に失敗しました。');
    }
  }

  // !leave コマンド
  if (message.content === '!leave') {
    const connection = getVoiceConnection(message.guild.id);
    if (!connection) {
      return message.reply('❌ Botは現在どのボイスチャンネルにも参加していません。');
    }

    connection.destroy();
    message.reply('👋 ボイスチャンネルから退出しました。');
  }
});

// ✅ ログイン
client.login(process.env.TOKEN);