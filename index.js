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

const ipMap = new Map(); // userId => IPアドレス

// Webサーバールート
app.get('/', (req, res) => {
  res.send('<h1>Botは稼働中です。</h1>');
});

// 認証ページ：アクセスするとロール付与・IP記録
app.get('/auth/:guildId/:userId/:roleId', async (req, res) => {
  const { guildId, userId, roleId } = req.params;
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.connection.remoteAddress;

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return res.status(404).send('ギルドが見つかりません。');

    const member = await guild.members.fetch(userId);
    if (!member) return res.status(404).send('ユーザーが見つかりません。');

    const role = guild.roles.cache.get(roleId);
    if (!role) return res.status(404).send('ロールが見つかりません。');

    await member.roles.add(role);
    ipMap.set(userId, ip); // IP記録（上書き）

    res.send(
      `<h1>認証完了しました！</h1>
      <p>ロール「${role.name}」を付与しました。</p>`
    );
  } catch (e) {
    console.error(e);
    res.status(500).send('サーバーエラーが発生しました。');
  }
});

// /user で認証済ユーザー一覧とIP閲覧（管理者用）
app.get('/user', async (req, res) => {
  // 簡易管理者認証（ここは必要に応じて強化してください）
  // 例えば ?admin=secretkey のような簡易認証
  if (req.query.admin !== process.env.ADMIN_KEY) {
    return res.status(403).send('権限がありません。');
  }

  let html = '<h1>認証済ユーザーのIP一覧</h1><ul>';
  for (const [userId, ip] of ipMap.entries()) {
    html += `<li>${userId}: ${ip}</li>`;
  }
  html += '</ul>';
  res.send(html);
});

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
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ スラッシュコマンド登録完了');
  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'verify') {
      const roleName = interaction.options.getString('role');
      const role = interaction.guild.roles.cache.find((r) => r.name === roleName);
      if (!role)
        return interaction.reply({
          content: '❌ 指定されたロールが見つかりません。',
          ephemeral: true,
        });

      // 認証用のリンクボタンを生成
      const authURL = `https://19738c69-d262-4d13-ba33-575cfc1de836-00-31qa5ujgxh372.sisko.replit.dev/auth/${interaction.guild.id}/${interaction.user.id}/${role.id}`;

      const linkButton = new ButtonBuilder()
        .setLabel('✅ 認証ページを開く')
        .setStyle(ButtonStyle.Link)
        .setURL(authURL);

      const row = new ActionRowBuilder().addComponents(linkButton);

      await interaction.reply({
        content: '下のボタンを押して認証を完了させてください。',
        components: [row],
        ephemeral: false,
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
  }

  if (interaction.isButton()) {
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
  }
});

// 音楽再生キュー管理
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

// メッセージ受信（テキストコマンド・自動応答）
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

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

  if (message.content.startsWith('!play ')) {
    const query = message.content.slice(6).trim();
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('❌ 先にボイスチャンネルに入ってください。');

    let songInfo;
    try {
      if (await play.yt_validate(query)) {
        const yt_info = await play.video_info(query);
        songInfo = { title: yt_info.video_details.title, url: yt_info.video_details.url };
      } else {
        const searchResult = await play.search(query, { limit: 1 });
        if (searchResult.length === 0) return message.reply('❌ 曲が見つかりません。');
        songInfo = { title: searchResult[0].title, url: searchResult[0].url };
      }
    } catch (err) {
      console.error('Error getting song info:', err);
      return message.reply('❌ 曲の取得に失敗しました。URLを確認してください。');
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
  } else if (message.content === '!skip') {
    if (!serverQueue) return message.reply('❌ スキップできる曲がありません。');
    serverQueue.player.stop();
    message.reply('⏭️ 曲をスキップしました。');
  } else if (message.content === '!playlist') {
    if (!serverQueue || serverQueue.songs.length === 0)
      return message.reply('🎶 キューは空です。');
    const list = serverQueue.songs
      .map((s, i) => `${i === 0 ? '▶️' : `${i}.`} ${s.title}`)
      .join('\n');
    message.reply(`📜 キュー一覧:\n${list}`);
  }
});

client.login(process.env.TOKEN);
