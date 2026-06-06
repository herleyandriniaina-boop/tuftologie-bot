const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// ============================================================
//  CONFIG — remplace ces valeurs dans Railway (Variables)
// ============================================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;       // mot de passe que tu choisis toi-même
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
// ============================================================

// Mémoire courte : garde les 6 derniers messages par utilisateur
const conversations = {};

// ── SYSTEM PROMPT ─────────────────────────────────────────────
const SYSTEM_PROMPT = `
Tu es l'assistante virtuelle de "Tuftologie by Say Kim", une boutique artisanale spécialisée dans les tapis tufting faits à la main, basée à Antananarivo, Madagascar.

LANGUE :
- Détecte automatiquement la langue du client (malgache ou français).
- Réponds TOUJOURS dans la même langue que le client.
- Si le client mélange les deux, mélange aussi naturellement.
- Ton malgache doit être naturel, dialecte Merina, sans fautes.

PERSONNALITÉ :
- Chaleureuse, professionnelle, accessible.
- Utilise des emojis avec modération (1-2 max par message).
- Réponses courtes et claires (3-5 lignes max pour un message Messenger).

INFOS SUR LA BOUTIQUE :
- Nom : Tuftologie by Say Kim (@tuftologybysaykim)
- Produits : tapis tufting artisanaux personnalisés (anime, gaming, foot, custom)
- Designs populaires : One Piece, Naruto, ROG, PSG, Real Madrid, Barcelona, Bayern
- Prix : sur devis selon taille et design (demander les dimensions et le motif)
- Paiement : MVola / Orange Money
- Livraison : disponible à Antananarivo
- Commande : via message direct, envoyer dimensions + motif souhaité

RÈGLES :
- Si on demande un prix exact, dis que le prix dépend de la taille et du design, et demande les dimensions (ex: 60x90cm) et le motif.
- Si on demande si un design est possible, dis OUI et invite à envoyer une photo de référence.
- Si on demande le délai, dis "environ 7 à 14 jours selon la complexité".
- Ne jamais donner de prix fixe sans connaître les dimensions.
- Si la question est trop complexe ou hors sujet boutique, dis poliment que Say Kim va répondre personnellement.
`;

// ── WEBHOOK VERIFICATION ──────────────────────────────────────
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

// ── RÉCEPTION DES MESSAGES ────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging?.[0];
      if (!event) continue;

      const senderId = event.sender.id;

      // Ignorer les messages envoyés PAR la page elle-même
      if (event.message?.is_echo) continue;

      if (event.message?.text) {
        const userMessage = event.message.text;
        console.log(`📩 Message reçu de ${senderId}: ${userMessage}`);

        try {
          // Envoyer "typing..." pendant que l'IA réfléchit
          await sendTyping(senderId);

          // Appeler Gemini
          const reply = await callGemini(senderId, userMessage);

          // Envoyer la réponse
          await sendMessage(senderId, reply);
        } catch (err) {
          console.error("❌ Erreur:", err.message);
          await sendMessage(senderId, "Azafady, misy olana kely. Avereno ny hafatrao afaka fotoana kely. 🙏");
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ── APPEL GEMINI API ──────────────────────────────────────────
async function callGemini(userId, userMessage) {
  // Initialiser l'historique si nouveau user
  if (!conversations[userId]) {
    conversations[userId] = [];
  }

  // Ajouter le message de l'utilisateur
  conversations[userId].push({
    role: "user",
    parts: [{ text: userMessage }]
  });

  // Garder seulement les 6 derniers échanges (mémoire courte)
  if (conversations[userId].length > 12) {
    conversations[userId] = conversations[userId].slice(-12);
  }

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: conversations[userId],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.7,
    }
  };

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    payload,
    { headers: { "Content-Type": "application/json" } }
  );

  const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) throw new Error("Gemini n'a pas retourné de réponse");

  // Sauvegarder la réponse dans l'historique
  conversations[userId].push({
    role: "model",
    parts: [{ text: reply }]
  });

  return reply;
}

// ── ENVOYER UN MESSAGE ────────────────────────────────────────
async function sendMessage(recipientId, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      message: { text }
    }
  );
}

// ── ENVOYER "EN TRAIN DE TAPER..." ───────────────────────────
async function sendTyping(recipientId) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      sender_action: "typing_on"
    }
  );
}

// ── DÉMARRER LE SERVEUR ───────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tuftologie Bot démarré sur le port ${PORT}`);
});
