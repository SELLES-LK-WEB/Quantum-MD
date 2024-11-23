const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const fs = require("fs");
const P = require("pino");
const readline = require("readline");
const dotenv = require("dotenv");

dotenv.config();
const logger = P({ level: "info" });
const commands = {};
const ownerNumber = "+94704467936@s.whatsapp.net"; // Owner number in WhatsApp JID format

// Load commands from commands folder
fs.readdirSync("./commands").forEach((file) => {
  if (file.endsWith(".js")) {
    const command = require(`./commands/${file}`);
    commands[command.name] = command;
  }
});

// Setup readline for pairing code input
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      console.log("Connection closed. Reconnecting:", shouldReconnect);
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("Connected to WhatsApp!");

      // Send a message to the bot's number and owner's number
      const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const message = {
        image: { url: "./welcome.jpg" }, // Provide an image file in the project directory
        caption: "🤖 *Bot Connected Successfully!*\n\nNow ready to accept commands.",
      };

      await sock.sendMessage(botNumber, message);
      await sock.sendMessage(ownerNumber, message);
    }
  });

  // Handle pairing code if credentials are not registered
  if (!sock.authState.creds.registered) {
    const phoneNumber = await question("Enter your phone number (including country code): ");
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`Pairing Code: ${code}`);
  }

  sock.ev.on("messages.upsert", async (msg) => {
    const message = msg.messages[0];
    if (!message.message || message.key.fromMe) return;

    const text = message.message.conversation || message.message.extendedTextMessage?.text;
    if (!text?.startsWith(".")) return; // Commands must start with '.'

    const commandName = text.slice(1).split(" ")[0];
    const command = commands[commandName];
    if (command) {
      try {
        await command.execute(sock, message);
        if (command.react) {
          await sock.sendMessage(message.key.remoteJid, {
            react: { text: command.react, key: message.key },
          });
        }
      } catch (error) {
        console.error("Error executing command:", error);
        await sock.sendMessage(message.key.remoteJid, { text: "⚠️ *Error executing the command!*" });
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

startSock();
