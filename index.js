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
const express = require('express');
const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// ✅ 認証用ロールID（必要に応じて変更）
const VERIFIED_ROLE_ID = '1369179226435096606';

// ✅ リアクションロールのデータ保持
const reactionRoles = new Map();

// Bot起動時
client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
});

// ✅ スラッシュコマンド登録
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('認証パネルを表示します'),
  new SlashCommandBuilder()
    .setName('rp')
    .setDescription('リアクションロールメッセージを作成します')
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('リアクションでロールを付与するメッセージを作成')
        .addStringOption(option =>
          option.setName('text').setDescription('表示するメッセージ').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('emoji').setDescription('リアクション絵文字').setRequired(true)
        )
        .addRoleOption(option =>
          option.setName('role').setDescription('付与するロール').setRequired(true)
        )
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.on(Events.ClientReady, async () => {
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ コマンド登録完了');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

// ✅ スラッシュコマンド処理
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
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

  if (interaction.commandName === 'rp' && interaction.options.getSubcommand() === 'create') {
    const text = interaction.options.getString('text');
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');

    const msg = await interaction.channel.send(`${text}\nリアクションでロールを付与できます：${emoji}`);
    await msg.react(emoji);

    reactionRoles.set(msg.id, { emoji, roleId: role.id });

    await interaction.reply({ content: '✅ リアクションロールメッセージを作成しました！', ephemeral: true });
  }
});

// ✅ ボタン認証処理
client.on(Events.InteractionCreate, async interaction => {
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

// ✅ 単語に反応する処理
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content.includes('おはよう')) {
    await message.reply('おはようございます☀️');
  }

  if (message.content.includes('こんにちは')) {
    await message.reply('こんにちは〜👋');
  }
});

// ✅ リアクション追加時にロール付与
client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) await reaction.fetch();

  const data = reactionRoles.get(reaction.message.id);
  if (!data || reaction.emoji.name !== data.emoji) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.add(data.roleId);
});

// ✅ Express（Render用）
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Express サーバー起動：ポート ${PORT}`);
});

// ✅ Botログイン
client.login(process.env.TOKEN);