// api/telegram.js
// Телеграм-вебхук с проксированием в Abacus.AI (getChatResponse)

const ABACUS_DEPLOYMENT_URL = 'ttps://api.abacus.ai/predict/getChatResponse';

export default async function handler(req, res) {
  try {
    // Быстрый пинг для проверки, что функция жива
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
      await sendTg(chatId, 'Я помогу с ответами по Banderolka/Qwintry: тарифы, сроки, отслеживание, возвраты. Также скоро смогу посчитать доставку через /calc. Напишите ваш вопрос или используйте команду.');
      return res.status(200).send('OK');
    }

    // Запрос к Abacus (метод getChatResponse из Predictions API)
    let botReply = 'Извините, не удалось получить ответ.';
    try {
      console.log('Sending to Abacus:', { userText, chatId });
      
      const abacusResp = await fetch(ABACUS_DEPLOYMENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ABACUS_DEPLOYMENT_TOKEN}`
        },
        body: JSON.stringify({
          deploymentId: '1413dbc596',
          messages: [{ is_user: true, text: userText }],
          conversationId: String(chatId),
          userId: String(chatId)
        })
      });

      const rawText = await abacusResp.text();
      console.log('Abacus response status:', abacusResp.status);
      console.log('Abacus response body:', rawText.slice(0, 500));
      
      if (!abacusResp.ok) {
        console.error('Abacus non-OK', abacusResp.status, rawText);
      } else {
        let data = {};
        try { 
          data = JSON.parse(rawText); 
          console.log('Parsed Abacus data:', JSON.stringify(data).slice(0, 300));
        } catch (e) {
          console.error('Abacus JSON parse error', e, rawText);
        }
        
        // Пробуем разные поля ответа
        botReply =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          botReply;
      }
    } catch (err) {
      console.error('Abacus fetch error', err);
    }

    await sendTg(chatId, botReply);
    return res.status(200).send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    // Всегда отвечаем 200, чтобы Telegram не ретрайл 100 раз
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
    console.error('Telegram sendMessage error', resp.status, raw);
  }
  return raw;
}
