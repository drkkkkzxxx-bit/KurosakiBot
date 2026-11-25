require('dotenv').config();

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const { DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID } = process.env;

if (!DISCORD_TOKEN || !GUILD_ID || !VOICE_CHANNEL_ID) {
  console.error('Faltan variables en .env (DISCORD_TOKEN, GUILD_ID, VOICE_CHANNEL_ID).');
  process.exit(1);
}

const CHECK_INTERVAL_MS = 60_000; // revisión periódica
const RETRY_DELAY_MS = 5_000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

let connecting = false;
let retryTimer = null;

// Agenda un único reintento (evita reconexiones duplicadas)
function scheduleReconnect(delay = RETRY_DELAY_MS) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

// Hora en cada log
for (const m of ['log', 'warn', 'error']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => orig(`[${new Date().toLocaleString()}]`, ...a);
}

async function connect() {
  if (connecting) return;
  connecting = true;

  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      console.error('No encuentro el servidor. Revisa GUILD_ID y que el bot esté invitado.');
      return;
    }

    const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
    if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
      console.error('No encuentro el canal de voz. Revisa VOICE_CHANNEL_ID.');
      return;
    }

    const old = getVoiceConnection(guild.id);
    if (old) old.destroy();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Puede ser un cambio de región/canal: esperar a que se recupere solo
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
      } catch {
        console.warn('Desconectado del canal de voz. Reconectando...');
        connection.destroy();
        scheduleReconnect();
      }
    });

    connection.on('error', (err) => console.error('Error de voz:', err.message));

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`Kurosaki Bot está dentro de: ${channel.name}`);
  } catch (err) {
    console.error('No se pudo conectar al canal:', err.message);
    getVoiceConnection(GUILD_ID)?.destroy();
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

client.once('clientReady', () => {
  console.log(`Kurosaki Bot conectado: ${client.user.tag}`);
  connect();

  // Revisión periódica: si no está en el canal correcto, vuelve a entrar
  setInterval(() => {
    const me = client.guilds.cache.get(GUILD_ID)?.members.me;
    if (me?.voice.channelId !== VOICE_CHANNEL_ID) {
      console.warn('El bot no está en el canal. Volviendo a entrar...');
      connect();
    }
  }, CHECK_INTERVAL_MS);
});

// Si alguien lo saca o lo mueve, vuelve al canal
client.on('voiceStateUpdate', (oldState, newState) => {
  if (newState.id !== client.user.id || newState.guild.id !== GUILD_ID) return;
  if (newState.channelId !== VOICE_CHANNEL_ID) {
    console.warn('Me sacaron/movieron del canal. Volviendo...');
    scheduleReconnect();
  }
});

process.on('unhandledRejection', (err) => console.error('Error no manejado:', err));
process.on('uncaughtException', (err) => console.error('Excepción:', err));

client.login(DISCORD_TOKEN);
