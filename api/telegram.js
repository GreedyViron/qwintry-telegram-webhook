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

// 🔥 ЖЁСТКИЙ FALLBACK для популярных стран с реальными ID из Qwintry
const HARDCODED_COUNTRIES = {
  'RU': { id: 236, name: 'Россия', code: 'RU' },
  'KZ': { id: 398, name: 'Казахстан', code: 'KZ' },
  'BY': { id: 112, name: 'Беларусь', code: 'BY' },
  'UA': { id: 804, name: 'Украина', code: 'UA' },
  'DE': { id: 276, name: 'Германия', code: 'DE' },
  'US': { id: 840, name: 'США', code: 'US' },
  'CN': { id: 156, name: 'Китай', code: 'CN' },
  'ES': { id: 724, name: 'Испания', code: 'ES' },
  'GB': { id: 826, name: 'Великобритания', code: 'GB' },
  'AU': { id: 36, name: 'Австралия', code: 'AU' },
  'FR': { id: 250, name: 'Франция', code: 'FR' },
  'IT': { id: 380, name: 'Италия', code: 'IT' },
  'PL': { id: 616, name: 'Польша', code: 'PL' },
  'TR': { id: 792, name: 'Турция', code: 'TR' },
  'JP': { id: 392, name: 'Япония', code: 'JP' }
};

// Алиасы популярных стран: ключи — русские и английские варианты, значения — ISO-код
const COUNTRY_ALIAS_TO_CODE = {
  // Россия
  'россия': 'RU',
  'russia': 'RU',
  'ru': 'RU',
  'russian federation': 'RU',
  '236': 'RU',

  // Казахстан
  'казахстан': 'KZ',
  'kazakhstan': 'KZ',
  'kz': 'KZ',
  '398': 'KZ',

  // Беларусь
  'беларусь': 'BY',
  'белоруссия': 'BY',
  'belarus': 'BY',
  'by': 'BY',
  '112': 'BY',

  // Украина
  'украина': 'UA',
  'ukraine': 'UA',
  'ua': 'UA',
  '804': 'UA',

  // Германия
  'германия': 'DE',
  'germany': 'DE',
  'deutschland': 'DE',
  'de': 'DE',
  '276': 'DE',

  // США
  'сша': 'US',
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'america': 'US',
  'united states of america': 'US',
  '840': 'US',

  // Китай
  'китай': 'CN',
  'china': 'CN',
  'cn': 'CN',
  '156': 'CN',

  // Испания
  'испания': 'ES',
  'spain': 'ES',
  'es': 'ES',
  '724': 'ES',

  // Великобритания
  'великобритания': 'GB',
  'united kingdom': 'GB',
  'great britain': 'GB',
  'britain': 'GB',
  'uk': 'GB',
  'gb': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  '826': 'GB',

  // Австралия
  'австралия': 'AU',
  'australia': 'AU',
  'au': 'AU',
  '36': 'AU',

  // Франция
  'франция': 'FR',
  'france': 'FR',
  'fr': 'FR',
  '250': 'FR',

  // Италия
  'италия': 'IT',
  'italy': 'IT',
  'it': 'IT',
  '380': 'IT',

  // Польша
  'польша': 'PL',
  'poland': 'PL',
  'pl': 'PL',
  '616': 'PL',

  // Турция
  'турция': 'TR',
  'turkey': 'TR',
  'tr': 'TR',
  '792': 'TR',

  // Япония
  'япония': 'JP',
  'japan': 'JP',
  'jp': 'JP',
  '392': 'JP'
};

// Fallback для популярных городов (если API не отвечает)
const HARDCODED_CITIES = {
  236: { // Россия
    'москва': { id: 524901, name: 'Москва' },
    'moscow': { id: 524901, name: 'Москва' },
    'санкт-петербург': { id: 498817, name: 'Санкт-Петербург' },
    'saint petersburg': { id: 498817, name: 'Санкт-Петербург' },
    'спб': { id: 498817, name: 'Санкт-Петербург' },
    'екатеринбург': { id: 1486209, name: 'Екатеринбург' },
    'новосибирск': { id: 1496747, name: 'Новосибирск' }
  },
  398: { // Казахстан
    'алматы': { id: 1526273, name: 'Алматы' },
    'almaty': { id: 1526273, name: 'Алматы' },
    'астана': { id: 1526384, name: 'Нур-Султан' },
    'нур-султан': { id: 1526384, name: 'Нур-Султан' },
    'nur-sultan': { id: 1526384, name: 'Нур-Султан' }
  },
  112: { // Беларусь
    'минск': { id: 625144, name: 'Минск' },
    'minsk': { id: 625144, name: 'Минск' }
  },
  804: { // Украина
    'киев': { id: 703448, name: 'Киев' },
    'kiev': { id: 703448, name: 'Киев' },
    'харьков': { id: 706483, name: 'Харьков' },
    'одесса': { id: 698740, name: 'Одесса' }
  }
};

// Простейший кэш стран на время жизни функции (serverless warm)
let COUNTRY_CACHE = null;
let COUNTRY_CACHE_TS = 0;
const COUNTRY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

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
• Можно даже ID (например, 236 для России)

Напишите страну:`);
  } else if (state.step === 'country') {
    const countryInput = text.trim();
    if (countryInput.length < 2) {
      await sendTg(chatId, '❌ Введите название страны / код / ID (например: Россия, Russia, RU или 236)');
      return;
    }

    await sendTg(chatId, '🔍 Ищу страну в базе данных...');

    const countryData = await findCountry(countryInput);
    if (!countryData) {
      await sendTg(chatId, `❌ Страна "${countryInput}" не найдена в базе Qwintry.

Попробуйте:
• Россия / Russia / RU / 236
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
    state.step = null; // сброс состояния

    await sendTg(chatId, '⏳ Рассчитываю стоимость доставки...');
    await doCalc(chatId, state.warehouse.code, state.country.id, state.city.id, state.weight, state.country.name, state.city.name);
    delete userStates[chatId];
  }

  userStates[chatId] = state;
}

// utils: нормализация строки
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Получение списка стран (с кэшем)
async function getCountries() {
  const now = Date.now();
  if (COUNTRY_CACHE && (now - COUNTRY_CACHE_TS) < COUNTRY_CACHE_TTL_MS) {
    return COUNTRY_CACHE;
  }
  try {
    const resp = await fetch('https://q3-api.qwintry.com/ru/frontend/calculator/countries', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
      console.error('Countries API failed:', resp.status);
      return null;
    }
    const list = await resp.json();
    if (!Array.isArray(list)) {
      console.error('Countries API returned non-array');
      return null;
    }
    COUNTRY_CACHE = list;
    COUNTRY_CACHE_TS = now;
    console.log(`Loaded countries: ${list.length}`);
    return list;
  } catch (e) {
    console.error('Countries fetch error:', e);
    return null;
  }
}

// 🔥 УЛУЧШЕННЫЙ поиск страны с жёстким fallback
async function findCountry(input) {
  const inputRaw = String(input).trim();
  const inputLower = norm(inputRaw);

  console.log(`🔍 Searching country for: "${inputRaw}"`);

  // 1️⃣ ПРИОРИТЕТ: Проверяем алиасы (включая числовые ID)
  const isoFromAlias = COUNTRY_ALIAS_TO_CODE[inputLower];
  if (isoFromAlias) {
    const hardcoded = HARDCODED_COUNTRIES[isoFromAlias];
    if (hardcoded) {
      console.log(`✅ Found via alias: ${inputRaw} → ${isoFromAlias} → ${hardcoded.name} (${hardcoded.id})`);
      return { id: hardcoded.id, name: hardcoded.name };
    }
  }

  // 2️⃣ Прямая проверка ISO-кода в жёстком списке
  if (/^[A-Za-z]{2}$/.test(inputRaw)) {
    const isoUpper = inputRaw.toUpperCase();
    const hardcoded = HARDCODED_COUNTRIES[isoUpper];
    if (hardcoded) {
      console.log(`✅ Found via ISO: ${isoUpper} → ${hardcoded.name} (${hardcoded.id})`);
      return { id: hardcoded.id, name: hardcoded.name };
    }
  }

  // 3️⃣ Числовой ID в жёстком списке
  if (/^\d+$/.test(inputLower)) {
    const idNum = parseInt(inputLower, 10);
    const hardcoded = Object.values(HARDCODED_COUNTRIES).find(c => c.id === idNum);
    if (hardcoded) {
      console.log(`✅ Found via numeric ID: ${idNum} → ${hardcoded.name}`);
      return { id: hardcoded.id, name: hardcoded.name };
    }
  }

  // 4️⃣ Попытка через API (если доступен)
  const countries = await getCountries();
  if (countries && countries.length > 0) {
    // Числовой ID через API
    if (/^\d+$/.test(inputLower)) {
      const idNum = parseInt(inputLower, 10);
      const byId = countries.find(c => Number(c?.id) === idNum);
      if (byId) {
        const name = byId.name || byId.name_en || byId.name_ru || byId.title || `#${byId.id}`;
        console.log(`✅ Found via API numeric ID: ${name} (${byId.id})`);
        return { id: byId.id, name };
      }
    }

    // ISO-код через API
    if (/^[A-Za-z]{2}$/.test(inputRaw)) {
      const isoUpper = inputRaw.toUpperCase();
      const byCode = countries.find(c => {
        const code = (c.code || c.alpha2 || c.iso || c.country_code || '').toUpperCase();
        return code === isoUpper;
      });
      if (byCode) {
        const name = byCode.name || byCode.name_en || byCode.name_ru || byCode.title || isoUpper;
        console.log(`✅ Found via API ISO: ${isoUpper} → ${name} (${byCode.id})`);
        return { id: byCode.id, name };
      }
    }

    // Точное совпадение по названию через API
    const byNameExact = countries.find(c => {
      const fields = [
        c.name, c.name_en, c.name_ru, c.title, c.title_en, c.title_ru
      ].filter(Boolean).map(norm);
      return fields.includes(inputLower);
    });
    if (byNameExact) {
      const name = byNameExact.name || byNameExact.name_en || byNameExact.name_ru || byNameExact.title || inputRaw;
      console.log(`✅ Found via API exact name: ${name} (${byNameExact.id})`);
      return { id: byNameExact.id, name };
    }

    // Частичное совпадение через API
    const byNamePartial = countries.find(c => {
      const fields = [
        c.name, c.name_en, c.name_ru, c.title, c.title_en, c.title_ru
      ].filter(Boolean).map(norm);
      return fields.some(f => f.includes(inputLower) || inputLower.includes(f));
    });
    if (byNamePartial) {
      const name = byNamePartial.name || byNamePartial.name_en || byNamePartial.name_ru || byNamePartial.title || inputRaw;
      console.log(`✅ Found via API partial: ${name} (${byNamePartial.id})`);
      return { id: byNamePartial.id, name };
    }
  } else {
    console.log(`⚠️ API countries not available, using hardcoded only`);
  }

  console.log(`❌ Country not found: "${inputRaw}"`);
  return null;
}

// 🔥 УЛУЧШЕННЫЙ поиск города с fallback
async function findCity(countryId, cityName) {
  const cityNorm = norm(cityName);
  
  console.log(`🔍 Searching city "${cityName}" in country ${countryId}`);

  // 1️⃣ Проверяем жёсткий fallback для популярных городов
  const hardcodedCities = HARDCODED_CITIES[countryId];
  if (hardcodedCities && hardcodedCities[cityNorm]) {
    const city = hardcodedCities[cityNorm];
    console.log(`✅ Found via hardcoded: ${city.name} (${city.id})`);
    return { id: city.id, name: city.name };
  }

  // 2️⃣ Поиск через API
  try {
    const resp = await fetch('https://q3-api.qwintry.com/ru/frontend/calculator/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      console.log(`❌ No cities found via API for "${cityName}" in country ${countryId}`);
      return null;
    }

    // Предпочтительно точное совпадение по названию, иначе первый
    const exact = cities.find(c => norm(c.name) === cityNorm) || cities[0];

    console.log(`✅ Found via API: ${exact.name} (ID: ${exact.id}) in country ${countryId}`);
    return { id: exact.id, name: exact.name };

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
    weightMeasurement: 'kg',
    dimensions: '1x1x1',
    dimensionsMeasurement: 'cm',
    country: countryId,
    city: cityId,
    zip: '100000',
    itemsCost: '1',
    insurance: null,
    advancedMode: false,
    source: 'calc'
  };

  try {
    const resp = await fetch('https://q3-api.qwintry.com/ru/frontend/calculator/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();

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
  try {
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
  } catch (e) {
    console.error('sendTg error:', e);
    return null;
  }
}
