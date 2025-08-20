// api/telegram.js
// Telegram webhook → Abacus.AI (strict apps.abacus.ai/api/getChatResponse with query params)

const APPS_GET_CHAT_URL = 'https://apps.abacus.ai/api/getChatResponse';
const DEPLOYMENT_ID = '1413dbc596';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(200).send('OK: use POST from Telegram webhook');
    }

    const ABACUS_DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!ABACUS_DEPLOYMENT_TOKEN || !TELEGRAM_BOT_TOKEN) {
      console.error('Missing env vars', {
        hasAbacus: !!ABACUS_DEPLOYMENT_TOKEN,
        hasTg: !!TELEGRAM_BOT_TOKEN
      });
      return res.status(500).send('Server not configured');
    }

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg || (!msg.text && !msg.caption)) {
      console.log('No text in update:', JSON.stringify(update).slice(0, 500));
      return res.status(200).send('OK: no text');
    }

    const chatId = msg.chat.id;
    const userText = (msg.text || msg.caption || '').trim();

    // Команды
    if (userText === '/start') {
      await sendTg(chatId, 'Привет! Я бот Banderolka/Qwintry. Задай вопрос — я постараюсь помочь. Доступные команды: /help, /calc (скоро).');
      return res.status(200).send('OK');
    }
    if (userText === '/help') {
      await sendTg(chatId, 'Я помогу с ответами по Banderolka/Qwintry: тарифы, сроки, отслеживание, возвраты. Скоро добавим /calc для расчёта доставки. Напишите ваш вопрос.');
      return res.status(200).send('OK');
    }

    // Формируем URL строго как в curl
    const url = `${APPS_GET_CHAT_URL}?deploymentToken=${encodeURIComponent(ABACUS_DEPLOYMENT_TOKEN)}&deploymentId=${encodeURIComponent(DEPLOYMENT_ID)}`;

    const body = {
      messages: [{ is_user: true, text: userText }],
      conversationId: String(chatId),
      userId: String(chatId)
    };

    console.log('Calling Abacus URL:', url);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const raw = await resp.text();
    console.log('Abacus status:', resp.status, raw.slice(0, 400));

    let botReply = 'Извините, не удалось получить ответ.';
    if (resp.ok) {
      try {
        const data = JSON.parse(raw || '{}');

        // Попробуем извлечь текст из разных возможных полей
        botReply =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          botReply;

        // Доп. случай: формат {"success": true, "result": {"messages": [{is_user: true, text: "..."}, {is_user: false, text: "..."}]}}
        if (!data?.responseText && data?.result?.messages?.length) {
          const lastAssistant = [...data.result.messages].reverse().find(m => m && m.is_user === false && typeof m.text === 'string');
          if (lastAssistant?.text) botReply = lastAssistant.text;
        }

        // Небольшая защита на случай пустой строки
        if (!botReply || typeof botReply !== 'string' || !botReply.trim()) {
          botReply = 'Извините, не удалось получить ответ.';
        }
      } catch (e) {
        console.error('JSON parse error:', e);
      }
    } else {
      console.error('Abacus non-OK', resp.status, raw.slice(0, 500));
    }

    await sendTg(chatId, botReply);
    return res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(200).send('OK');
  }
}

async function sendTg(chatId, text) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
  const raw = await resp.text();
  if (!resp.ok) {
    console.error('Telegram sendMessage error', resp.status, raw.slice(0, 300));
  }
  return raw;
}
