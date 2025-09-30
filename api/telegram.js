// api/telegram.js
// Telegram webhook → Abacus.AI + калькулятор доставки Qwintry

const APPS_GET_CHAT_URL = 'https://apps.abacus.ai/api/getChatResponse';
const DEPLOYMENT_ID = '1413dbc596';

// для хранения состояний диалога калькулятора
const userStates = {};

// Склады Qwintry
const WAREHOUSES = {
  '1': { code: 'US1', name: 'США' },
  '2': { code: 'DE1', name: 'Германия' },
  '3': { code: 'UK1', name: 'Великобритания' },
  '4': { code: 'CN1', name: 'Китай' },
  '5': { code: 'ES1', name: 'Испания' }
};

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

    // Команда /calc - запускаем пошаговый расчёт
    if (userText === '/calc') {
      userStates[chatId] = { step: 'warehouse' };
      await sendTg(chatId, `📦 Калькулятор доставки

Выберите склад отправления (введите номер):

1️⃣ США
2️⃣ Германия  
3️⃣ Великобритания
4️⃣ Китай
5️⃣ Испания

Например: 1`);
      return res.status(200).send('OK');
    }

    // --- всё остальное идёт в Abacus ---
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

// ----------------- helpers -----------------

// Пошаговый калькулятор
async function handleCalcConversation(chatId, text) {
  const state = userStates[chatId] || {};

  if (state.step === 'warehouse') {
    const warehouseNum = text.trim();
    if (!WAREHOUSES[warehouseNum]) {
      await sendTg(chatId, `❌ Неверный номер склада. Выберите от 1 до 5:

1️⃣ США
2️⃣ Германия  
3️⃣ Великобритания
4️⃣ Китай
5️⃣ Испания

Попробуйте ещё раз:`);
      return;
    }
    
    state.warehouse = WAREHOUSES[warehouseNum];
    state.step = 'country';
    await sendTg(chatId, `✅ Склад: ${state.warehouse.name}

🌍 Введите название страны назначения:

Например: Россия, Казахстан, Беларусь, Украина, Австралия, Германия и т.д.

Напишите полное название страны:`);

  } else if (state.step === 'country') {
    const country = text.trim();
    if (country.length < 2) {
      await sendTg(chatId, '❌ Введите полное название страны (например: Россия, Казахстан, Беларусь)');
      return;
    }
    
    state.country = country;
    state.step = 'city';
    await sendTg(chatId, `✅ Маршрут: ${state.warehouse.name} → ${country}

🏙️ Введите название города назначения:

Например: Москва, Алматы, Минск, Киев и т.д.

Напишите название города:`);

  } else if (state.step === 'city') {
    const city = text.trim();
    if (city.length < 2) {
      await sendTg(chatId, '❌ Введите название города (например: Москва, Алматы, Минск)');
      return;
    }
    
    state.city = city;
    state.step = 'weight';
    await sendTg(chatId, `✅ Направление: ${state.warehouse.name} → ${state.country}, ${city}

⚖️ Введите вес посылки в килограммах:

Например: 2.5 или 3 или 0.5

Введите вес:`);

  } else if (state.step === 'weight') {
    const weight = parseFloat(text.replace(',', '.'));
    if (isNaN(weight) || weight <= 0 || weight > 50) {
      await sendTg(chatId, '❌ Введите корректный вес от 0.1 до 50 кг\n\nНапример: 2.5 или 3');
      return;
    }
    
    state.weight = weight.toString();
    state.step = null; // сброс
    
    await sendTg(chatId, '⏳ Рассчитываю стоимость доставки...');
    await doCalc(chatId, state.warehouse.code, state.country, state.city, state.weight);
    delete userStates[chatId];
  }

  userStates[chatId] = state;
}

// Запрос в API калькулятора Qwintry
async function doCalc(chatId, hub, country, city, weight) {
  // Сначала попробуем найти cityId через поиск городов
  let cityId = null;
  
  try {
    // Поиск города в API Qwintry
    const searchResp = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: country,
        query: city
      })
    });
    
    if (searchResp.ok) {
      const cities = await searchResp.json();
      if (cities && cities.length > 0) {
        cityId = cities[0].id; // берём первый найденный город
        console.log(`Found city: ${city} with ID: ${cityId}`);
      }
    }
  } catch (e) {
    console.log('City search failed, using fallback');
  }

  // Если город не найден, используем дефолтные значения
  if (!cityId) {
    cityId = 4050; // Москва как fallback
  }

  const body = {
    hub: hub,
    weight: weight.toString(),
    weightMeasurement: "kg",
    dimensions: "1x1x1",
    dimensionsMeasurement: "cm",
    country: country,
    city: cityId,
    zip: "100000",
    itemsCost: "1",
    insurance: null,
    advancedMode: false,
    source: "calc"
  };

  try {
    console.log('Sending calc request:', JSON.stringify(body));
    
    const resp = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    console.log('Qwintry calc response:', JSON.stringify(data).slice(0, 1000));

    if (data?.costs && Object.keys(data.costs).length > 0) {
      let reply = `📦 Стоимость доставки\n`;
      reply += `📍 Маршрут: ${hub} → ${country}, ${city}\n`;
      reply += `⚖️ Вес: ${weight} кг\n\n`;

      const methods = Object.entries(data.costs);
      methods.forEach(([method, details], index) => {
        const label = details?.cost?.label || method;
        const price = details?.cost?.costWithDiscount || details?.cost?.shippingCost || 0;
        const total = details?.cost?.totalCostWithDiscount || details?.cost?.totalCost || 0;
        const days = details?.days || '?';

        reply += `${index + 1}. ${label}\n`;
        reply += `💰 Доставка: $${price}\n`;
        reply += `💳 Итого: $${total}\n`;
        reply += `⏰ Срок: ${days}\n\n`;
      });

      reply += `ℹ️ Цены указаны в долларах США\n`;
      reply += `📱 Для нового расчёта используйте /calc`;

      await sendTg(chatId, reply.trim());
    } else {
      await sendTg(chatId, 
        `❌ Не удалось рассчитать доставку для маршрута ${hub} → ${country}, ${city}

Возможные причины:
• Данный маршрут временно недоступен
• Город не найден в базе Qwintry
• Превышены лимиты по весу

Попробуйте:
• Другой склад или город
• Проверить на официальном сайте: https://qwintry.com/ru/calculator/ru
• Обратиться в поддержку Qwintry`
      );
    }
  } catch (err) {
    console.error('Calc error', err);
    await sendTg(chatId, 
      `❌ Произошла ошибка при расчёте доставки.

Попробуйте позже или воспользуйтесь официальным калькулятором:
https://qwintry.com/ru/calculator/ru`
    );
  }
}

// Отправка текста
async function sendTg(chatId, text) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const raw = await resp.text();
  if (!resp.ok) {
    console.error('Telegram sendMessage error', resp.status, raw.slice(0, 300));
  }
  return raw;
}
