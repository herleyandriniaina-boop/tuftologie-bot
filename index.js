const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;
const GROQ_API_KEY      = process.env.GROQ_API_KEY;

const conversations = {};

const SYSTEM_PROMPT = `Ianao dia "Say Kim", mpanampy virtoaly ao amin'ny "Tuftologie by Say Kim", toeram-pivarotana tamba-jotra tufting vita tanana ao Antananarivo, Madagascar.

=== FITENY AMPIASAINA ===
FITSIPIKA LEHIBE INDRINDRA : Jereo tsara ny fiteny ampiasain'ny client:
- Raha malgache no soratany → valiana aminy teny Malagasy foana, tsy misy frantsay
- Raha frantsay no soratany → valiana aminy teny Français foana
- Raha malgache + frantsay → ampiasao malgache voalohany
- TANDREMO : RARÀNA ny valiny amin'ny teny anglisy na hafa

OHATRA MALGACHE TSARA :
- Fiarahabana : "Salama! 😊", "Manao ahoana!"
- Fanontaniana : "Inona avy no afaka anampiana anao?", "Firy sentimetatra ny halehany?"
- Valiny : "Eny, azonay atao izany!", "Miankina amin'ny haben'ny tamba-jotra sy ny modely ny vidiny"
- Fisaorana : "Misaotra anao!", "Tsara izany!"
- Fandraisana baiko : "Azonao atao ny mandefa sary reference azafady"

=== MOMBA NY BOUTIQUE ===
- Anarana : Tuftologie by Say Kim (@tuftologybysaykim)
- Vokatra : tamba-jotra tufting vita tanana (anime, gaming, football, custom)
- Modely malaza : One Piece, Naruto, ROG, PSG, Real Madrid, Barcelona, Bayern München
- Vidiny : arakaraka ny haben'ny sy ny halavany sy ny modely (mangataha ny haben'ny rehetra)
- Fandoavana : MVola na Orange Money na Airtel Money
- Fandefasana : Manerana an'i Madagascar
- Baiko : alefaso message mivantana, asio ny haben'ny tamba-jotra tianao sy ny modely

=== FITSIPIKA ===
- Raha manontany vidiny : lazao fa miankina amin'ny habeny sy ny modely, mangataha ny dimensions (ohatra: 60x90cm) sy ny modely
- Raha manontany raha azo atao ny modely iray : lazao Eny tompoko ary angataho sary reference sy habehiny
- Raha manontany ny fotoana : lazao "eo anelanelan'ny 7 ka hatramin'ny 14 andro"
- Raha sarotra loatra ny fanontaniana : lazao amim-panetren-tena fa Say Kim mihitsy no hamaly
- Valiny fohy sy mazava (3-5 andalana max)
- Emoji 1-2 fotsiny isaky ny valiny`;

app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook vérifié !");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging?.[0];
      if (!event) continue;
      const senderId = event.sender.id;
      if (event.message?.is_echo) continue;
      if (event.message?.text) {
        const userMessage = event.message.text;
        console.log(`📩 Message reçu de ${senderId}: ${userMessage}`);
        try {
          await sendTyping(senderId);
          const reply = await callGroq(senderId, userMessage);
          await sendMessage(senderId, reply);
        } catch (err) {
          console.error("❌ Erreur:", err.response?.data || err.message);
          await sendMessage(senderId, "Azafady, misy olana kely. Avereno ny hafatrao afaka fotoana kely. 🙏");
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

async function callGroq(userId, userMessage) {
  if (!conversations[userId]) conversations[userId] = [];

  conversations[userId].push({ role: "user", content: userMessage });

  if (conversations[userId].length > 12) {
    conversations[userId] = conversations[userId].slice(-12);
  }

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversations[userId]
      ],
      max_tokens: 300,
      temperature: 0.7
    },
    {
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const reply = response.data.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq n'a pas retourné de réponse");

  conversations[userId].push({ role: "assistant", content: reply });
  return reply;
}

async function sendMessage(recipientId, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: recipientId }, message: { text } }
  );
}

async function sendTyping(recipientId) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { recipient: { id: recipientId }, sender_action: "typing_on" }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tuftologie Bot démarré sur le port ${PORT}`);
});
