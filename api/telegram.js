// api/telegram.js
// Вариант без внешних зависимостей (node-fetch не нужен в Vercel Edge / Node18+)
const ABACUS_DEPLOYMENT_URL = 'https://api.abacus.ai/routeLLM/predict/getChatResponse';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      // Для GET просто показать, что функция жива
      return res.status(200).send('OK: use POST from Telegram webhook');
    }

    const ABACUS_DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!ABACUS_DEPLOYMENT_TOKEN || !TELEGRAM_BOT_TOKEN) {
      console.error('Missing env vars',
        { hasAbacus: !!ABACUS_DEPLOYMENT_TOKEN, hasTg: !!TELEGRAM_BOT_TOKEN });
      return res.status(500).send('Server not configured');
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) {
      return res.status(200).send('OK: no text');
    }

    const chatId = msg.chat.id;
    const userText = msg.text;

    // Запрос к Abacus
    const abacusResp = await fetch(ABACUS_DEPLOYMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ABACUS_DEPLOYMENT_TOKEN}`
      },
      body: JSON.stringify({
        inputText: userText,
        conversationId: String(chatId),
        userId: String(chatId)
      })
    });

    let botReply = 'Извините, не удалось получить ответ.';
    if (abacusResp.ok) {
      const data = await abacusResp.json();
      botReply =
        data?.responseText ||
        data?.text ||
        data?.choices?.[0]?.message?.content ||
        botReply;
    } else {
      console.error('Abacus error', abacusResp.status, await abacusResp.text());
    }

    // Ответ в Telegram
    const tgResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: botReply,
        parse_mode: 'Markdown'
      })
    });

    if (!tgResp.ok) {
      console.error('Telegram sendMessage error', tgResp.status, await tgResp.text());
    }

    return res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(200).send('OK');
  }
}
