const {  
  default: makeWASocket,  
  useMultiFileAuthState,  
  DisconnectReason,  
} = require("@whiskeysockets/baileys");  
const qrcode = require("qrcode-terminal");  
const http = require("http");  
const fs = require("fs");  
const path = require("path");

// ============================================  
// RAILWAY: Keep-alive HTTP server  
// Railway kills processes that don't bind to PORT  
// ============================================  
const PORT = process.env.PORT || 3000;  
http  
  .createServer((req, res) => {  
    res.writeHead(200, { "Content-Type": "text/plain" });  
    res.end("WhatsApp Bot is running! ✅");  
  })  
  .listen(PORT, () => {  
    console.log(`🌐 Health server running on port ${PORT}`);  
  });  
  
// ============================================  
// AUTH DIRECTORY (Railway persistent storage)  
// ============================================  
const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";  
  
// Ensure auth directory exists  
if (!fs.existsSync(AUTH_DIR)) {  
  fs.mkdirSync(AUTH_DIR, { recursive: true });  
}  
  
// ============================================  
// TRACKING  
// ============================================  
const repliedMessages = new Set();  
let botStartTime = Date.now();  
  
// ============================================  
// KEYWORD REPLIES  
// ============================================  
const keywordReplies = [  
  {  
    keywords: ["hi", "hello", "hey", "hii", "hiii", "helo"],  
    reply: "Hi! 👋 How can we help you today?",  
  },  
  {  
    keywords: [  
      "what is dholera",  
      "dholera kya hai",  
      "about dholera",  
      "dholera",  
    ],  
    reply: `🏙️ *Dholera* is an upcoming Greenfield Smart City — a dream project of Honorable PM Narendra Modi.  
  
It is India's first smart city being built from scratch under the DMIC (Delhi-Mumbai Industrial Corridor) project.  
  
Would you like to know about our plot offerings? Type *"price"* to know more!`,  
  },  
  {  
    keywords: ["price", "rate", "cost", "kitna", "amount", "plot"],  
    reply: `💰 *Our Offering:*  
  
✅ Residential Plots under *₹10 Lakh*  
📍 0 KM from SIR (Special Investment Region)  
🛣️ 5 min from Dholera-Ahmedabad Expressway  
📐 Multiple sizes available  
  
Would you like to schedule a *free site visit*? 🚗  
Type *"visit"* to book now!`,  
  },  
  {  
    keywords: ["visit", "site visit", "book", "dekhna hai"],  
    reply: `🚗 *Site Visit Booking*  
  
We offer *FREE pickup & drop* for site visits!  
  
📞 Please share:  
1️⃣ Your Name  
2️⃣ Preferred Date  
3️⃣ Number of People  
  
Our team will confirm your visit shortly! ✅`,  
  },  
  {  
    keywords: ["location", "kahan hai", "where", "map"],  
    reply: `📍 *Location:*  
  
Dholera Smart City, Gujarat  
🛣️ 100 KM from Ahmedabad  
✈️ Near upcoming Dholera International Airport  
🚄 On Delhi-Mumbai Industrial Corridor  
  
Google Maps: https://maps.google.com/?q=Dholera+Smart+City`,  
  },  
  {  
    keywords: ["thank", "thanks", "dhanyawad", "shukriya"],  
    reply:  
      "You're welcome! 😊 Feel free to ask anything anytime. We're here to help! 🙏",  
  },  
];  
  
const DEFAULT_REPLY = `Thanks for your message! 🙏  
  
Here's what I can help you with:  
1️⃣ Type *"Dholera"* — Know about Dholera Smart City  
2️⃣ Type *"Price"* — Get plot pricing details  
3️⃣ Type *"Visit"* — Book a free site visit  
4️⃣ Type *"Location"* — Get location details  
  
Or just ask your question and our team will respond shortly! 😊`;  
  
function getReply(text) {  
  const lowerText = text.toLowerCase().trim();  
  for (const entry of keywordReplies) {  
    for (const keyword of entry.keywords) {  
      if (lowerText.includes(keyword.toLowerCase())) {  
        return entry.reply;  
      }  
    }  
  }  
  return DEFAULT_REPLY;  
}  
  
// ============================================  
// BOT START  
// ============================================  
async function startBot() {  
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);  
  
  const sock = makeWASocket({  
    auth: state,  
    printQRInTerminal: true,  
    syncFullHistory: false,  
    // Reduce logs in production  
    logger: require("@whiskeysockets/baileys").default  
      ? undefined  
      : undefined,  
  });  
  
  sock.ev.on("creds.update", saveCreds);  
  
  sock.ev.on("connection.update", (update) => {  
    const { connection, lastDisconnect, qr } = update;  
  
    if (qr) {  
      console.log("\n📱 SCAN THIS QR CODE WITH WHATSAPP:\n");  
      qrcode.generate(qr, { small: true });  
      console.log("\n⏳ Waiting for QR scan...\n");  
    }  
  
    if (connection === "close") {  
      const statusCode = lastDisconnect?.error?.output?.statusCode;  
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;  
  
      console.log(  
        `❌ Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`  
      );  
  
      if (shouldReconnect) {  
        // Add delay before reconnecting to avoid rapid loops  
        setTimeout(() => {  
          startBot();  
        }, 5000);  
      } else {  
        console.log("🚫 Logged out. Delete auth_info folder and restart.");  
      }  
    } else if (connection === "open") {  
      botStartTime = Date.now();  
      console.log("═══════════════════════════════════");  
      console.log("✅ Bot is ONLINE and ready!");  
      console.log(`📋 Loaded ${keywordReplies.length} keyword groups`);  
      console.log(`⏰ Started at: ${new Date().toISOString()}`);  
      console.log("═══════════════════════════════════");  
    }  
  });  
  
  sock.ev.on("messages.upsert", async ({ messages, type }) => {  
    if (type !== "notify") return;  
    for (const msg of messages) {  
      await handleMessage(sock, msg);  
    }  
  });  
}  
  
async function handleMessage(sock, msg) {  
  if (!msg.message) return;  
  if (msg.key.remoteJid === "status@broadcast") return;  
  
  const sender = msg.key.remoteJid;  
  if (sender.endsWith("@g.us")) return;  
  if (msg.key.fromMe) return;  
  
  const msgTime = (msg.messageTimestamp || 0) * 1000;  
  if (msgTime < botStartTime) {  
    console.log(`⏩ Skipping old message from ${sender}`);  
    return;  
  }  
  
  const messageId = msg.key.id;  
  if (repliedMessages.has(messageId)) {  
    console.log(`⏩ Duplicate message ${messageId}, skipping`);  
    return;  
  }  
  
  const messageType = Object.keys(msg.message)[0];  
  if (  
    messageType === "protocolMessage" ||  
    messageType === "senderKeyDistributionMessage" ||  
    messageType === "messageContextInfo"  
  ) {  
    return;  
  }  
  
  const text =  
    msg.message.conversation ||  
    msg.message.extendedTextMessage?.text ||  
    "";  
  
  const displayText = text || `[${messageType}]`;  
  console.log(`📩 Message from ${sender}: ${displayText}`);  
  
  const reply = text ? getReply(text) : DEFAULT_REPLY;  
  
  try {  
    await new Promise((resolve) => setTimeout(resolve, 500));  
    await sock.sendMessage(sender, { text: reply });  
    repliedMessages.add(messageId);  
    console.log(`✅ Replied to ${sender}`);  
  } catch (error) {  
    console.error(`❌ Failed to reply to ${sender}:`, error.message);  
  }  
  
  if (repliedMessages.size > 10000) {  
    const idsArray = [...repliedMessages];  
    idsArray.slice(0, 5000).forEach((id) => repliedMessages.delete(id));  
  }  
}  
  
// Handle process crashes gracefully  
process.on("uncaughtException", (err) => {  
  console.error("Uncaught Exception:", err);  
});  
  
process.on("unhandledRejection", (err) => {  
  console.error("Unhandled Rejection:", err);  
});  
  
startBot();