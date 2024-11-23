require("dotenv").config();
const fs = require("fs");
const { default: makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");
const readline = require("readline");

// Bot and owner info from .env
const botNumber = process.env.BOT_NUMBER;
const pairingPhone = process.env.PAIRING_PHONE;
const imageUrl = process.env.IMAGE_URL;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const commands = new Map();

// Dynamically load commands from 'commands' folder
fs.readdirSync("./commands").forEach((file) => {
  if (file.endsWith(".js")) {
    const command = require(`./commands/${file}`);
    commands.set(command.use, command);
  }
});

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: "info" }),
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
  });

  if (!sock.authState.creds.registered) {
    console.log("Credentials not registered. Proceeding with pairing code...");
    const code = await sock.requestPairingCode(pairingPhone);
    console.log(`Pairing Code for ${pairingPhone}: ${code}`);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("WhatsApp Web connected successfully!");
      const message = {
        image: { url: imageUrl },
        caption: "🤖 Bot connected successfully!\nReady to serve.",
      };
      sock.sendMessage(botNumber + "@s.whatsapp.net", message);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const command = commands.get(text.split(" ")[0]);

    if (command) {
      try {
        await sock.sendMessage(msg.key.remoteJid, {
          react: { text: command.react, key: msg.key },
        });
        await command.execute(sock, msg);
      } catch (err) {
        console.error(`Error executing command ${command.name}:`, err);
        await sock.sendMessage(msg.key.remoteJid, {
          text: `❌ Error executing command: ${err.message}`,
        });
      }
    }
  });

  return sock;
};

startSock();