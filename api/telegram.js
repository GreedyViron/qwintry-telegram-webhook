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

    console.log(`User ${chatId} wrote: "${userText}"`);

    // если есть активное состояние калькулятора
    if (userStates[chatId]?.step) {
      console.log(`User ${chatId} in calc state: ${userStates[chatId].step}`);
      await handleCalcConversation(chatId, userText);
      return res.status(200).send('OK');
    }

    // Команда /start - показываем кнопки
    if (userText === '/start') {
      const welcomeText = `Привет! Я бот службы доставки Banderolka/Qwintry 📦

Задайте мне любой вопрос о доставке, или воспользуйтесь меню ниже:`;
      
      await sendTgWithKeyboard(chatId, welcomeText, getMainKeyboard());
      return res.status(200).send('OK');
    }

    // Кнопка "Калькулятор" - запускаем пошаговый расчёт
    if (userText === 'Калькулятор' || userText === '📦 Калькулятор' || userText === '/calc') {
      console.log(`Starting calc for user ${chatId}`);
      userStates[chatId] = { step: 'hub' };
      await sendTg(chatId, `📦 *Калькулятор доставки*

Введите код склада отправления:
• *DE1* - Германия
• *US1* - США  
• *UK1* - Великобритания

Например: DE1`);
      return res.status(200).send('OK');
    }

    // Кнопка "Помощь"
    if (userText === 'Помощь' || userText === 'ℹ️ Помощь' || userText === '/help') {
      const helpText = `ℹ️ *Справка по боту*

Я помогу с вопросами по Banderolka/Qwintry:

• Тарифы и стоимость доставки
• Сроки доставки по странам
• Отслеживание посылок
• Возвраты и страховка
• Правила и ограничения

Задайте свой вопрос или воспользуйтесь калькулятором для расчёта стоимости.`;
      
      await sendTgWithKeyboard(chatId, helpText, getMainKeyboard());
      return res.status(200).send('OK');
    }

    // --- всё остальное идёт в Abacus ---
    console.log(`Sending to Abacus: "${userText}"`);
    
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
    console.log('Abacus response status:', resp.status);

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

    await sendTgWithKeyboard(chatId, botReply, getMainKeyboard());
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
    const hub = text.toUpperCase().trim();
    if (!['DE1', 'US1', 'UK1'].includes(hub)) {
      await sendTg(chatId, `❌ Неверный код склада. Используйте:
• *DE1* - Германия
• *US1* - США
• *UK1* - Великобритания

Попробуйте ещё раз:`);
      return;
    }
    state.hub = hub;
    state.step = 'country';
    await sendTg(chatId, `✅ Склад: *${hub}*

🌍 Введите код страны назначения:
• *RU* - Россия
• *KZ* - Казахстан  
• *BY* - Беларусь
• *UA* - Украина

Например: RU`);
  } else if (state.step === 'country') {
    const country = text.toUpperCase().trim();
    if (country.length !== 2) {
      await sendTg(chatId, '❌ Введите двухбуквенный код страны (например: RU, KZ, BY, UA)');
      return;
    }
    state.country = country;
    state.step = 'weight';
    await sendTg(chatId, `✅ Маршрут: *${state.hub} → ${country}*

⚖️ Введите вес посылки в килограммах:

Например: *2.5* или *3*`);
  } else if (state.step === 'weight') {
    const weight = parseFloat(text.replace(',', '.'));
    if (isNaN(weight) || weight <= 0 || weight > 50) {
      await sendTg(chatId, '❌ Введите корректный вес от 0.1 до 50 кг\n\nНапример: *2.5* или *3*');
      return;
    }
    state.weight = weight.toString();
    state.step = null; // сброс
    
    await sendTg(chatId, '⏳ Рассчитываю стоимость доставки...');
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
    console.log('Qwintry calc response received');

    if (data?.costs && Object.keys(data.costs).length > 0) {
      let reply = `📦 *Стоимость доставки*\n`;
      reply += `📍 Маршрут: *${hub} → ${country}*\n`;
      reply += `⚖️ Вес: *${weight} кг*\n\n`;

      const methods = Object.entries(data.costs);
      methods.forEach(([method, details], index) => {
        const label = details?.cost?.label || method;
        const price = details?.cost?.costWithDiscount || details?.cost?.shippingCost || 0;
        const total = details?.cost?.totalCostWithDiscount || details?.cost?.totalCost || 0;
        const days = details?.days || '?';

        reply += `${index + 1}. *${label}*\n`;
        reply += `💰 Доставка: $${price}\n`;
        reply += `💳 Итого: $${total}\n`;
        reply += `⏰ Срок: ${days}\n\n`;
      });

      reply += `ℹ️ Цены указаны в долларах США\n`;
      reply += `📱 Для нового расчёта используйте меню ниже`;

      await sendTgWithKeyboard(chatId, reply.trim(), getMainKeyboard());
    } else {
      await sendTgWithKeyboard(chatId, 
        `❌ Не удалось рассчитать доставку для указанных параметров.

*Возможные причины:*
• Неподдерживаемый маршрут
• Превышен лимит веса  
• Временные технические проблемы

Попробуйте другие параметры или обратитесь в поддержку.`,
        getMainKeyboard()
      );
    }
  } catch (err) {
    console.error('Calc error', err);
    await sendTgWithKeyboard(chatId, 
      '❌ Произошла ошибка при расчёте доставки.\n\nПопробуйте позже или обратитесь в поддержку.',
      getMainKeyboard()
    );
  }
}

// Отправка текста
async function sendTg(chatId, text) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'Markdown' 
      })
    });
    
    const result = await resp.text();
    if (!resp.ok) {
      console.error('Telegram sendMessage error', resp.status, result.slice(0, 300));
    }
    return result;
  } catch (error) {
    console.error('sendTg error:', error);
    return null;
  }
}

// Отправка текста с кнопками
async function sendTgWithKeyboard(chatId, text, keyboard) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    };
    
    console.log('Sending keyboard:', JSON.stringify(keyboard));
    
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await resp.text();
    if (!resp.ok) {
      console.error('Telegram sendMessage (keyboard) error', resp.status, result.slice(0, 300));
    } else {
      console.log('Keyboard sent successfully');
    }
    return result;
  } catch (error) {
    console.error('sendTgWithKeyboard error:', error);
    return null;
  }
}

// Главное меню с кнопками
function getMainKeyboard() {
  return {
    keyboard: [
      [
        { text: "Калькулятор" },
        { text: "Помощь" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    persistent: true
  };
}
