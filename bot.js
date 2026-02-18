const {  
  default: makeWASocket,  
  useMultiFileAuthState,  
  DisconnectReason,  
} = require("@whiskeysockets/baileys");  
const qrcode = require("qrcode-terminal");  
  
// ============================================  
// TRACKING (only prevent duplicate message replies)  
// ============================================  
const repliedMessages = new Set();  
  
// Bot start time — ignore messages received BEFORE this  
let botStartTime = Date.now();  
  
// ============================================  
// KEYWORD REPLIES — Add/edit your replies here  
// ============================================  
const keywordReplies = [  
  {  
    // Array of keywords that trigger this reply  
    keywords: ["hi", "hello", "hey", "hii", "hiii", "helo"],  
    reply: "Hi! 👋 How can we help you today?",  
  },  
  {  
    keywords: ["what is dholera", "dholera kya hai", "about dholera", "dholera"],  
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
    reply: "You're welcome! 😊 Feel free to ask anything anytime. We're here to help! 🙏",  
  },  
];  
  
// Default reply when no keyword matches  
const DEFAULT_REPLY = `Thanks for your message! 🙏  
  
Here's what I can help you with:  
1️⃣ Type *"Dholera"* — Know about Dholera Smart City  
2️⃣ Type *"Price"* — Get plot pricing details  
3️⃣ Type *"Visit"* — Book a free site visit  
4️⃣ Type *"Location"* — Get location details  
  
Or just ask your question and our team will respond shortly! 😊`;  
  
// ============================================  
// FIND MATCHING REPLY  
// ============================================  
function getReply(text) {  
  const lowerText = text.toLowerCase().trim();  
  
  // Check each keyword group  
  for (const entry of keywordReplies) {  
    for (const keyword of entry.keywords) {  
      // Check if the message CONTAINS the keyword  
      if (lowerText.includes(keyword.toLowerCase())) {  
        return entry.reply;  
      }  
    }  
  }  
  
  // No keyword matched → send default  
  return DEFAULT_REPLY;  
}  

// ============================================  
// BOT START  
// ============================================  
async function startBot() {  
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");  
  
  const sock = makeWASocket({  
    auth: state,  
    syncFullHistory: false,  
  });  
  
  sock.ev.on("creds.update", saveCreds);  
  
  sock.ev.on("connection.update", (update) => {  
    const { connection, lastDisconnect, qr } = update;  
  
    if (qr) {  
      qrcode.generate(qr, { small: true });  
    }  
  
    if (connection === "close") {  
      const shouldReconnect =  
        lastDisconnect?.error?.output?.statusCode !==  
        DisconnectReason.loggedOut;  
      if (shouldReconnect) {  
        console.log("🔄 Reconnecting...");  
        startBot();  
      }  
    } else if (connection === "open") {  
      botStartTime = Date.now();  
      console.log("✅ Bot is online and ready!");  
      console.log(`📋 Loaded ${keywordReplies.length} keyword groups`);  
    }  
  });  
  
  // MAIN LISTENER  
  sock.ev.on("messages.upsert", async ({ messages, type }) => {  
    // Only real-time messages, NOT history sync  
    if (type !== "notify") return;  
  
    for (const msg of messages) {  
      await handleMessage(sock, msg);  
    }  
  });  
}  

// ============================================  
// HANDLE EACH MESSAGE  
// ============================================  
async function handleMessage(sock, msg) {  
  // CHECK 1: No empty messages  
  if (!msg.message) return;  
  
  // CHECK 2: Skip status broadcasts  
  if (msg.key.remoteJid === "status@broadcast") return;  
  
  const sender = msg.key.remoteJid;  
  
  // CHECK 3: Skip groups  
  if (sender.endsWith("@g.us")) return;  
  
  // CHECK 4: Skip bot's OWN messages (prevents infinite loop)  
  if (msg.key.fromMe) return;  
  
  // CHECK 5: Skip old messages (before bot started)  
  const msgTime = (msg.messageTimestamp || 0) * 1000;  
  if (msgTime < botStartTime) {  
    console.log(`⏩ Skipping old message from ${sender}`);  
    return;  
  }  
  
  // CHECK 6: Skip if already replied to THIS EXACT message  
  const messageId = msg.key.id;  
  if (repliedMessages.has(messageId)) {  
    console.log(`⏩ Duplicate message ${messageId}, skipping`);  
    return;  
  }  
  
  // CHECK 7: Protocol/system messages — skip  
  const messageType = Object.keys(msg.message)[0];  
  if (  
    messageType === "protocolMessage" ||  
    messageType === "senderKeyDistributionMessage" ||  
    messageType === "messageContextInfo"  
  ) {  
    return;  
  }  
  
  // ---- EXTRACT TEXT ----  
  const text =  
    msg.message.conversation ||  
    msg.message.extendedTextMessage?.text ||  
    "";  
  
  // For media messages without text  
  const displayText = text || `[${messageType}]`;  
  
  console.log(`📩 Message from ${sender}: ${displayText}`);  
  
  // ---- GET KEYWORD-BASED REPLY ----  
  const reply = text ? getReply(text) : DEFAULT_REPLY;  
  
  // ---- SEND REPLY ----  
  try {  
    // Small delay to look natural (500ms instead of 2000ms)  
    await new Promise((resolve) => setTimeout(resolve, 500));  
  
    await sock.sendMessage(sender, { text: reply });  
  
    // Mark this message ID as replied  
    repliedMessages.add(messageId);  
  
    console.log(`✅ Replied to ${sender}`);  
  } catch (error) {  
    console.error(`❌ Failed to reply to ${sender}:`, error.message);  
  }  
  
  // ---- MEMORY CLEANUP ----  
  if (repliedMessages.size > 10000) {  
    const idsArray = [...repliedMessages];  
    idsArray.slice(0, 5000).forEach((id) => repliedMessages.delete(id));  
  }  
}  
  
startBot();  