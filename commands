module.exports = {
  name: "ping",
  use: ".ping",
  react: "🏓",
  description: "Replies with 'Pong!'",
  execute: async (sock, message) => {
    await sock.sendMessage(message.key.remoteJid, { text: "Pong! 🏓" });
  },
};
