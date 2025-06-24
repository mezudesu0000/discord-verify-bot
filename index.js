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

const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');

const play = require('play-dl');
const fetch = require('node-fetch');
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`✅ Web server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
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

  new SlashCommandBuilder().setName('neko').setDescription('ランダムな猫の画像を表示'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
  client.user.setActivity('認証を待機中', { type: ActivityType.Playing });
  client.user.setStatus('idle');

  try {
    console.log('⏳ スラッシュコマンドを登録中...');
    // グローバル登録は最大1時間程度反映に時間がかかるため
    // 開発中はギルドIDを指定してテストサーバーに即時登録するのがおすすめです。
    // const GUILD_ID = 'ここにテストサーバーIDを入れてください';
    // await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });

    // グローバル登録（反映には時間がかかる）
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    console.log('✅ スラッシュコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
});

// --- スラッシュコマンド処理 ---
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

    const button = new ButtonBuilder()
      .setCustomId(`verify_${role.id}`)
      .setLabel('✅ 認証する')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);
    await interaction.reply({
      content: '以下のボタンをクリックして認証を完了してください。',
      components: [row],
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
      const res = await fetch('https://api.thecatapi.com/v1/images/search');
      const data = await res.json();
      await interaction.reply({ content: '🐱 にゃーん', files: [data[0].url] });
    } catch (e) {
      console.error(e);
      interaction.reply('❌ 猫画像の取得に失敗しました。');
    }
  }
});

// --- ボタン反応（認証用） ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  if (customId.startsWith('verify_')) {
    const roleId = customId.split('_')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role)
      return interaction.reply({ content: '❌ ロールが見つかりません。', ephemeral: true });

    try {
      await interaction.member.roles.add(role);
      interaction.reply({ content: '✅ 認証完了！ロールが付与されました。', ephemeral: true });
    } catch (error) {
      console.error(error);
      interaction.reply({ content: '❌ ロール付与に失敗しました。', ephemeral: true });
    }
  }
});

// --- 音楽再生用キュー管理 ---
const queue = new Map();

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    serverQueue.player.play(resource);
    serverQueue.connection.subscribe(serverQueue.player);
    serverQueue.textChannel.send(`🎶 再生中: **${song.title}**`);
  } catch (err) {
    console.error(err);
    serverQueue.textChannel.send('❌ 曲の再生に失敗しました。');
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  }
}

// --- メッセージ受信処理（テキストコマンドや自動応答） ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  // 「けんたろう」含むメッセージにランダムで返信
  if (message.content.toLowerCase().includes('けんたろう')) {
    const responses = [
      '📱 QRコードで会話します。',
      '💢 違います。ぶち殺す',
      '⚠️ サイバー犯罪だよ？',
      '🚓 通報した',
    ];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    message.reply(randomResponse);
    return;
  }

  const serverQueue = queue.get(message.guild.id);

  // !play コマンド（YouTube再生・キュー）
  if (message.content.startsWith('!play ')) {
    const query = message.content.slice(6).trim();
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
      return message.reply('❌ 先にボイスチャンネルに入ってください。');

    let songInfo;
    try {
      if (play.yt_validate(query)) {
        const yt_info = await play.video_info(query);
        songInfo = { title: yt_info.video_details.title, url: yt_info.video_details.url };
      } else {
        const searchResult = await play.search(query, { limit: 1 });
        if (searchResult.length === 0)
          return message.reply('❌ 曲が見つかりません。');
        songInfo = { title: searchResult[0].title, url: searchResult[0].url };
      }
    } catch (err) {
      console.error(err);
      return message.reply('❌ 曲の取得に失敗しました。');
    }

    if (!serverQueue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      const player = createAudioPlayer();
      const queueConstruct = {
        textChannel: message.channel,
        voiceChannel,
        connection,
        player,
        songs: [],
      };

      queue.set(message.guild.id, queueConstruct);
      queueConstruct.songs.push(songInfo);
      playSong(message.guild, queueConstruct.songs[0]);

      player.on(AudioPlayerStatus.Idle, () => {
        queueConstruct.songs.shift();
        if (queueConstruct.songs.length > 0) {
          playSong(message.guild, queueConstruct.songs[0]);
        } else {
          queueConstruct.connection.destroy();
          queue.delete(message.guild.id);
          message.channel.send('🎶 再生が終了しました。');
        }
      });
    } else {
      serverQueue.songs.push(songInfo);
      message.reply(`✅ キューに追加: **${songInfo.title}**`);
    }
  }

  // !skip コマンド（曲スキップ）
  else if (message.content === '!skip') {
    if (!serverQueue) return message.reply('❌ スキップできる曲がありません。');
    serverQueue.player.stop();
    message.reply('⏭️ 曲をスキップしました。');
  }

  // !playlist コマンド（キュー表示）
  else if (message.content === '!playlist') {
    if (!serverQueue || serverQueue.songs.length === 0)
      return message.reply('🎶 キューは空です。');
    const list = serverQueue.songs
      .map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.title}`)
      .join('\n');
    message.reply(`📜 キュー一覧:\n${list}`);
  }
});

client.login(process.env.TOKEN);
