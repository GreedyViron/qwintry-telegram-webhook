// api/telegram.js
// Telegram webhook → Abacus.AI + калькулятор доставки Qwintry

const APPS_GET_CHAT_URL = 'https://apps.abacus.ai/api/getChatResponse';
const DEPLOYMENT_ID = '1413dbc596';

// для хранения состояний диалога калькулятора
const userStates = {};

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

    // если есть активное состояние калькулятора
    if (userStates[chatId]?.step) {
      await handleCalcConversation(chatId, userText);
      return res.status(200).send('OK');
    }

    // Команды
    if (userText === '/start') {
      await sendTgWithKeyboard(chatId,
        'Привет! Я бот Banderolka/Qwintry.\n\nЗадай вопрос — я постараюсь помочь.\nДоступные кнопки: «Калькулятор», «Помощь».',
        mainKeyboard()
      );
      return res.status(200).send('OK');
    }

    if (userText === '/help' || userText === 'Помощь') {
      await sendTg(chatId, 'Я помогу с ответами по Banderolka/Qwintry: тарифы, сроки, отслеживание, возвраты.\nСкоро добавим больше опций.\n\nНапишите свой вопрос или воспользуйтесь калькулятором.');
      return res.status(200).send('OK');
    }

    if (userText === 'Калькулятор') {
      userStates[chatId] = { step: 'hub' };
      await sendTg(chatId, 'Введите код склада (например, DE1, US1):');
      return res.status(200).send('OK');
    }

    // --- всё остальное идёт в Abacus ---
    const url = `${APPS_GET_CHAT_URL}?deploymentToken=${encodeURIComponent(ABACUS_DEPLOYMENT_TOKEN)}&deploymentId=${encodeURIComponent(DEPLOYMENT_ID)}`;
    const body = {
      messages: [{ is_user: true, text: userText }],
      conversationId: String(chatId),
      userId: String(chatId)
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const raw = await resp.text();
    let botReply = 'Извините, не удалось получить ответ.';
    if (resp.ok) {
      try {
        const data = JSON.parse(raw || '{}');
        botReply =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          botReply;

        if (!data?.responseText && data?.result?.messages?.length) {
          const lastAssistant = [...data.result.messages].reverse().find(m => m && m.is_user === false && typeof m.text === 'string');
          if (lastAssistant?.text) botReply = lastAssistant.text;
        }

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

// ----------------- helpers -----------------

// Пошаговый калькулятор
async function handleCalcConversation(chatId, text) {
  const state = userStates[chatId] || {};

  if (state.step === 'hub') {
    state.hub = text.toUpperCase();
    state.step = 'country';
    await sendTg(chatId, 'Введите код страны назначения (например, RU):');
  } else if (state.step === 'country') {
    state.country = text.toUpperCase();
    state.step = 'weight';
    await sendTg(chatId, 'Введите вес посылки (в кг):');
  } else if (state.step === 'weight') {
    state.weight = text;
    state.step = null; // сброс
    await doCalc(chatId, state.hub, state.country, state.weight);
    delete userStates[chatId];
  }

  userStates[chatId] = state;
}

// Запрос в API калькулятора Qwintry
async function doCalc(chatId, hub, country, weight) {
  const body = {
    hub: hub,
    weight: weight.toString(),
    weightMeasurement: "kg",
    dimensions: "1x1x1",
    dimensionsMeasurement: "cm",
    country: country,
    city: 4050,
    zip: "100000",
    itemsCost: "1",
    insurance: null,
    advancedMode: false,
    source: "calc"
  };

  try {
    const resp = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (data?.costs) {
      let reply = `📦 Стоимость доставки (вес: ${weight} кг, из склада ${hub} в ${country}):\n\n`;

      for (const [method, details] of Object.entries(data.costs)) {
        const label = details?.cost?.label || method;
        const price = details?.cost?.costWithDiscount || details?.cost?.shippingCost;
        const total = details?.cost?.totalCostWithDiscount || details?.cost?.totalCost;
        const days = details?.days || '?';

        reply += `🔹 ${label}\nЦена: ${price} USD\nИтого: ${total} USD\nСрок: ${days}\n\n`;
      }

      await sendTg(chatId, reply.trim());
    } else {
      await sendTg(chatId, 'Извините, не удалось рассчитать доставку 😔');
    }
  } catch (err) {
    console.error('Calc error', err);
    await sendTg(chatId, 'Ошибка при расчёте доставки.');
  }
}

// Отправка текста
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

// Отправка текста с кнопками
async function sendTgWithKeyboard(chatId, text, keyboard) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    })
  });
  const raw = await resp.text();
  if (!resp.ok) {
    console.error('Telegram sendMessage (keyboard) error', resp.status, raw.slice(0, 300));
  }
  return raw;
}

// Главное меню
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Калькулятор" }, { text: "Помощь" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}
