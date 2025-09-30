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

// Маппинг популярных стран для быстрого поиска
const COUNTRY_ALIASES = {
  'россия': ['russia', 'ru', 'russian federation'],
  'казахстан': ['kazakhstan', 'kz'],
  'беларусь': ['belarus', 'by', 'белоруссия'],
  'украина': ['ukraine', 'ua'],
  'германия': ['germany', 'de', 'deutschland'],
  'австралия': ['australia', 'au'],
  'китай': ['china', 'cn'],
  'испания': ['spain', 'es'],
  'великобритания': ['united kingdom', 'uk', 'gb', 'britain'],
  'сша': ['united states', 'us', 'usa', 'america']
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

Можно писать:
• По-русски: Россия, Казахстан, Беларусь
• По-английски: Russia, Kazakhstan, Belarus  
• Код страны: RU, KZ, BY

Напишите страну:`);

  } else if (state.step === 'country') {
    const countryName = text.trim();
    if (countryName.length < 2) {
      await sendTg(chatId, '❌ Введите название страны или код (например: Россия, Russia, RU)');
      return;
    }
    
    await sendTg(chatId, '🔍 Ищу страну в базе данных...');
    
    // Поиск страны через API
    const countryData = await findCountry(countryName);
    if (!countryData) {
      await sendTg(chatId, `❌ Страна "${countryName}" не найдена в базе Qwintry.

Попробуйте:
• Россия / Russia / RU
• Казахстан / Kazakhstan / KZ  
• Беларусь / Belarus / BY
• Украина / Ukraine / UA
• Германия / Germany / DE

Введите название ещё раз:`);
      return;
    }
    
    state.country = countryData;
    state.step = 'city';
    await sendTg(chatId, `✅ Страна: ${countryData.name}

🏙️ Введите название города назначения:

Например: Москва, Алматы, Минск, Киев, Берлин и т.д.

Напишите название города:`);

  } else if (state.step === 'city') {
    const cityName = text.trim();
    if (cityName.length < 2) {
      await sendTg(chatId, '❌ Введите название города (например: Москва, Алматы, Минск)');
      return;
    }
    
    await sendTg(chatId, '🔍 Ищу город в базе данных...');
    
    // Поиск города через API
    const cityData = await findCity(state.country.id, cityName);
    if (!cityData) {
      await sendTg(chatId, `❌ Город "${cityName}" не найден в стране ${state.country.name}.

Попробуйте:
• Проверить правильность написания
• Ввести название на английском языке
• Выбрать крупный город в этой стране

Введите название города ещё раз:`);
      return;
    }
    
    state.city = cityData;
    state.step = 'weight';
    await sendTg(chatId, `✅ Направление: ${state.warehouse.name} → ${state.country.name}, ${cityData.name}

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
    await doCalc(chatId, state.warehouse.code, state.country.id, state.city.id, state.weight, state.country.name, state.city.name);
    delete userStates[chatId];
  }

  userStates[chatId] = state;
}

// Поиск страны через API Qwintry с универсальным поиском
async function findCountry(searchTerm) {
  try {
    const resp = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/countries", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    
    if (!resp.ok) {
      console.error('Countries API failed:', resp.status);
      return null;
    }
    
    const countries = await resp.json();
    if (!Array.isArray(countries)) {
      console.error('Countries API returned non-array:', typeof countries);
      return null;
    }
    
    console.log(`Searching for country: "${searchTerm}" in ${countries.length} countries`);
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Поиск по всем возможным полям
    const found = countries.find(country => {
      if (!country || typeof country !== 'object') return false;
      
      // Проверяем все возможные поля названия
      const fields = [
        country.name,
        country.name_en,
        country.name_ru,
        country.title,
        country.title_en,
        country.title_ru,
        country.code,
        country.alpha2,
        country.iso,
        country.country_code
      ];
      
      return fields.some(field => {
        if (!field || typeof field !== 'string') return false;
        const fieldLower = field.toLowerCase();
        
        // Точное совпадение
        if (fieldLower === searchLower) return true;
        
        // Поиск по вхождению
        if (fieldLower.includes(searchLower) || searchLower.includes(fieldLower)) return true;
        
        return false;
      });
    });
    
    if (found) {
      const displayName = found.name || found.name_ru || found.name_en || found.title || searchTerm;
      console.log(`Found country: ${displayName} (ID: ${found.id})`);
      return { id: found.id, name: displayName };
    }
    
    // Если не найдено через API, попробуем через алиасы
    for (const [ruName, aliases] of Object.entries(COUNTRY_ALIASES)) {
      if (ruName === searchLower || aliases.some(alias => alias === searchLower)) {
        // Ищем в списке стран по алиасам
        const foundByAlias = countries.find(country => {
          const fields = [
            country.name,
            country.name_en,
            country.name_ru,
            country.code,
            country.alpha2
          ];
          
          return fields.some(field => {
            if (!field) return false;
            const fieldLower = field.toLowerCase();
            return aliases.some(alias => fieldLower.includes(alias) || alias.includes(fieldLower));
          });
        });
        
        if (foundByAlias) {
          const displayName = foundByAlias.name || foundByAlias.name_ru || foundByAlias.name_en || ruName;
          console.log(`Found country by alias: ${displayName} (ID: ${foundByAlias.id})`);
          return { id: foundByAlias.id, name: displayName };
        }
      }
    }
    
    console.log(`Country not found: "${searchTerm}"`);
    return null;
    
  } catch (e) {
    console.error('Country search error:', e);
    return null;
  }
}

// Поиск города через API Qwintry
async function findCity(countryId, cityName) {
  try {
    const resp = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: countryId,
        query: cityName
      })
    });
    
    if (!resp.ok) {
      console.error('Cities API failed:', resp.status);
      return null;
    }
    
    const cities = await resp.json();
    if (!Array.isArray(cities) || cities.length === 0) {
      console.log(`No cities found for "${cityName}" in country ${countryId}`);
      return null;
    }
    
    // Берём первый найденный город
    const city = cities[0];
    console.log(`Found city: ${city.name} (ID: ${city.id}) in country ${countryId}`);
    return { id: city.id, name: city.name };
    
  } catch (e) {
    console.error('City search error:', e);
    return null;
  }
}

// Запрос в API калькулятора Qwintry
async function doCalc(chatId, hub, countryId, cityId, weight, countryName, cityName) {
  const body = {
    hub: hub,
    weight: weight.toString(),
    weightMeasurement: "kg",
    dimensions: "1x1x1",
    dimensionsMeasurement: "cm",
    country: countryId,
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
    console.log('Qwintry calc response received, costs count:', Object.keys(data?.costs || {}).length);

    if (data?.costs && Object.keys(data.costs).length > 0) {
      let reply = `📦 Стоимость доставки\n`;
      reply += `📍 Маршрут: ${hub} → ${countryName}, ${cityName}\n`;
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
        `❌ Не удалось рассчитать доставку для маршрута ${hub} → ${countryName}, ${cityName}

Возможные причины:
• Данный маршрут временно недоступен
• Превышены лимиты по весу (максимум 18.1 кг для большинства методов)
• Временные технические проблемы

Попробуйте:
• Другой склад (например, Германия вместо США)
• Меньший вес посылки
• Проверить на официальном сайте: https://qwintry.com/ru/calculator/ru`
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
