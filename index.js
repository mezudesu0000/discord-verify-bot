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
require('dotenv').config();
const express = require('express');

// ✅ ExpressでRenderのポート監視（Render対策用）
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
    GatewayIntentBits.GuildMembers
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
      .setCustomId('verify_button')
      .setLabel('✅ 認証する')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: '以下のボタンを押して認証を完了してください。',
      components: [row]
    });

    client.once(Events.InteractionCreate, async i => {
      if (!i.isButton() || i.customId !== 'verify_button') return;

      const member = i.member;
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        await i.reply({ content: '✅ 認証が完了しました！', ephemeral: true });
      } else {
        await i.reply({ content: '🔔 すでに認証されています。', ephemeral: true });
      }
    });
  }

  else if (commandName === 'ban') {
    const user = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(user.id);

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({ content: '❌ BANする権限がありません。', ephemeral: true });
    }

    if (!member) {
      return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });
    }

    try {
      await member.ban();
      await interaction.reply({ content: `✅ ${user.tag} をBANしました。` });
    } catch (error) {
      await interaction.reply({ content: '❌ BANに失敗しました。', ephemeral: true });
    }
  }

  else if (commandName === 'kick') {
    const user = interaction.options.getUser('target');
    const member = interaction.guild.members.cache.get(user.id);

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({ content: '❌ KICKする権限がありません。', ephemeral: true });
    }

    if (!member) {
      return interaction.reply({ content: '❌ ユーザーが見つかりません。', ephemeral: true });
    }

    try {
      await member.kick();
      await interaction.reply({ content: `✅ ${user.tag} をKICKしました。` });
    } catch (error) {
      await interaction.reply({ content: '❌ KICKに失敗しました。', ephemeral: true });
    }
  }
});

// ✅ メッセージコマンド "!del"
client.on(Events.MessageCreate, async message => {
  if (!message.content.startsWith('!del')) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

  const args = message.content.split(' ');
  const amount = parseInt(args[1]);

  if (isNaN(amount) || amount < 1 || amount > 200) {
    return message.reply('❌ 1〜200 の数値を指定してください。例: `!del 10`');
  }

  try {
    const deleted = await message.channel.bulkDelete(amount, true);
    message.channel.send(`🧹 ${deleted.size} 件のメッセージを削除しました。`)
      .then(msg => setTimeout(() => msg.delete(), 5000));
  } catch (error) {
    console.error(error);
    message.reply('❌ メッセージの削除に失敗しました。');
  }
});

// ✅ Discordログイン
client.login(process.env.TOKEN);
