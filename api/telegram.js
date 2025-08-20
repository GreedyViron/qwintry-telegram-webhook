// api/telegram.js
// Telegram webhook → Abacus.AI with endpoint auto-fallback (apps.abacus.ai)

const ABACUS_ENDPOINTS = [
  // Основной из твоего curl-примера (хост apps.abacus.ai)
  'https://apps.abacus.ai/api/getChatResponse',
  // Запасные варианты на том же хосте
  'https://apps.abacus.ai/routeLLM/predict/getChatResponse',
  'https://apps.abacus.ai/predict/getChatResponse',
  'https://apps.abacus.ai/llm/predict/getChatResponse',
  'https://apps.abacus.ai/routeLLM/predict',
  'https://apps.abacus.ai/predict'
];

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

    // Попробуем обратиться к Abacus по нескольким эндпоинтам
    let botReply = 'Извините, не удалось получить ответ.';
    for (const baseUrl of ABACUS_ENDPOINTS) {
      try {
        const isUniversalPredict = baseUrl.endsWith('/predict') && !baseUrl.endsWith('/getChatResponse');

        // Особый случай для /api/getChatResponse: добавим query-параметры, как в твоем curl
        const isAppsDirect = baseUrl === 'https://apps.abacus.ai/api/getChatResponse';
        const url = isAppsDirect
          ? `${baseUrl}?deploymentToken=${encodeURIComponent(ABACUS_DEPLOYMENT_TOKEN)}&deploymentId=${encodeURIComponent(DEPLOYMENT_ID)}`
          : baseUrl;

        // Тело запроса: стандартно messages; для universal predict — оборачиваем в methodName/args
        const body = isUniversalPredict
          ? {
              methodName: 'getChatResponse',
              args: {
                deploymentId: DEPLOYMENT_ID,
                messages: [{ is_user: true, text: userText }],
                conversationId: String(chatId),
                userId: String(chatId)
              }
            }
          : {
              deploymentId: DEPLOYMENT_ID,
              messages: [{ is_user: true, text: userText }],
              conversationId: String(chatId),
              userId: String(chatId)
            };

        console.log('Trying Abacus endpoint:', url);

        const headers = {
          'Content-Type': 'application/json'
        };
        // Для первого варианта мы уже передаем токен в query. Для остальных — в Authorization.
        if (!isAppsDirect) {
          headers['Authorization'] = `Bearer ${ABACUS_DEPLOYMENT_TOKEN}`;
        }

        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        const raw = await resp.text();
        console.log('Abacus status for', url, ':', resp.status);

        if (!resp.ok) {
          console.error('Abacus non-OK', resp.status, raw.slice(0, 300));
          continue; // пробуем следующий эндпоинт
        }

        let data = {};
        try {
          data = JSON.parse(raw);
        } catch (e) {
          console.error('Abacus JSON parse error', e, raw.slice(0, 300));
        }

        const extracted =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          '';

        if (extracted) {
          botReply = extracted;
          console.log('Using endpoint OK:', url);
          break;
        } else {
          console.warn('No usable text field in Abacus response for', url, JSON.stringify(data).slice(0, 300));
        }
      } catch (err) {
        console.error('Abacus fetch error for', baseUrl, err);
      }
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
