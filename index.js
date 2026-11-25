require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel
} = require('@discordjs/voice');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once('ready', () => {
  console.log(`Kurosaki Bot conectado: ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);

  if (!guild || !channel) {
    console.log('No encuentro el servidor o el canal.');
    return;
  }

  joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true
  });

  console.log('Kurosaki Bot está dentro del canal.');
});

client.login(process.env.DISCORD_TOKEN);