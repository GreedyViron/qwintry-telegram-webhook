import fetch from 'node-fetch';

const ABACUS_DEPLOYMENT_URL = 'https://api.abacus.ai/routeLLM/predict/getChatResponse';
const ABACUS_DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return res.status(200).send('OK');

    const chatId = msg.chat.id;
    const userText = msg.text;

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

    const data = await abacusResp.json();
    const botReply =
      data?.responseText ||
      data?.text ||
      data?.choices?.[0]?.message?.content ||
      'Извините, не удалось получить ответ.';

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: botReply,
        parse_mode: 'Markdown'
      })
    });

    return res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(200).send('OK');
  }
}
