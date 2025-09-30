// Telegram Bot для расчета доставки через Qwintry
// Финальная версия с полной поддержкой всех тарифов

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

// Кэш для стран и городов
let countriesCache = null;
let citiesCache = {};

// Словарь популярных стран с ID и алиасами
const COUNTRIES_DICT = {
  // Россия
  'россия': { id: 71, name: 'Россия' },
  'russia': { id: 71, name: 'Россия' },
  'ru': { id: 71, name: 'Россия' },
  'рф': { id: 71, name: 'Россия' },
  '71': { id: 71, name: 'Россия' },
  
  // США
  'сша': { id: 92, name: 'США' },
  'usa': { id: 92, name: 'США' },
  'us': { id: 92, name: 'США' },
  'америка': { id: 92, name: 'США' },
  'america': { id: 92, name: 'США' },
  '92': { id: 92, name: 'США' },
  
  // Другие популярные страны
  'украина': { id: 93, name: 'Украина' },
  'ukraine': { id: 93, name: 'Украина' },
  'ua': { id: 93, name: 'Украина' },
  
  'беларусь': { id: 7, name: 'Беларусь' },
  'belarus': { id: 7, name: 'Беларусь' },
  'by': { id: 7, name: 'Беларусь' },
  
  'казахстан': { id: 36, name: 'Казахстан' },
  'kazakhstan': { id: 36, name: 'Казахстан' },
  'kz': { id: 36, name: 'Казахстан' },
  
  'германия': { id: 22, name: 'Германия' },
  'germany': { id: 22, name: 'Германия' },
  'de': { id: 22, name: 'Германия' },
  
  'китай': { id: 14, name: 'Китай' },
  'china': { id: 14, name: 'Китай' },
  'cn': { id: 14, name: 'Китай' }
};

// Словарь популярных городов России
const CITIES_DICT = {
  'москва': { id: 4050, name: 'Москва' },
  'moscow': { id: 4050, name: 'Москва' },
  'спб': { id: 4079, name: 'Санкт-Петербург' },
  'санкт-петербург': { id: 4079, name: 'Санкт-Петербург' },
  'питер': { id: 4079, name: 'Санкт-Петербург' },
  'екатеринбург': { id: 4018, name: 'Екатеринбург' },
  'новосибирск': { id: 4065, name: 'Новосибирск' },
  'казань': { id: 4035, name: 'Казань' },
  'нижний новгород': { id: 4063, name: 'Нижний Новгород' },
  'челябинск': { id: 4090, name: 'Челябинск' },
  'омск': { id: 4067, name: 'Омск' },
  'самара': { id: 4077, name: 'Самара' },
  'ростов-на-дону': { id: 4075, name: 'Ростов-на-Дону' },
  'уфа': { id: 4087, name: 'Уфа' },
  'красноярск': { id: 4044, name: 'Красноярск' },
  'воронеж': { id: 4013, name: 'Воронеж' },
  'пермь': { id: 4070, name: 'Пермь' },
  'волгоград': { id: 4012, name: 'Волгоград' }
};

// Эмодзи для тарифов
const TARIFF_EMOJIS = {
  'qwintry_flash': '⚡',
  'ecopost': '🌍',
  'qwair': '✈️',
  'qwintry_smart': '🚀'
};

// Основная функция обработки webhook
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;
    
    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    console.log(`📨 Получено сообщение от ${chatId}: "${text}"`);

    // Команды бота
    if (text === '/start') {
      await sendMessage(chatId, 
        "🚀 Привет! Я бот для расчета стоимости доставки через Qwintry.\n\n" +
        "📝 Для расчета напишите:\n" +
        "**вес страна город**\n\n" +
        "📋 Примеры:\n" +
        "• `2 россия москва`\n" +
        "• `1.5 russia spb`\n" +
        "• `3 рф екатеринбург`\n\n" +
        "❓ Для помощи: /help"
      );
      return res.status(200).json({ ok: true });
    }

    if (text === '/help') {
      await sendMessage(chatId,
        "📖 **Как пользоваться ботом:**\n\n" +
        "🔢 **Формат:** `вес страна город`\n" +
        "• Вес в килограммах (можно дробный: 1.5, 2.3)\n" +
        "• Страна назначения (россия, russia, рф, ru)\n" +
        "• Город назначения\n\n" +
        "✅ **Примеры:**\n" +
        "• `2 россия москва`\n" +
        "• `1.5 russia санкт-петербург`\n" +
        "• `3.2 рф казань`\n" +
        "• `0.5 ru новосибирск`\n\n" +
        "🌍 **Поддерживаемые страны:**\n" +
        "Россия, США, Украина, Беларусь, Казахстан и другие\n\n" +
        "💡 **Совет:** Пишите названия на русском или английском языке"
      );
      return res.status(200).json({ ok: true });
    }

    // Обработка запроса на расчет доставки
    if (text && !text.startsWith('/')) {
      await handleCalculationRequest(chatId, text);
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ Ошибка в webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Обработка запроса на расчет
async function handleCalculationRequest(chatId, text) {
  try {
    // Парсинг входных данных
    const parts = text.toLowerCase().split(/\s+/).filter(p => p.length > 0);
    
    if (parts.length < 3) {
      await sendMessage(chatId, 
        "❌ **Неверный формат!**\n\n" +
        "📝 Используйте: `вес страна город`\n" +
        "📋 Пример: `2 россия москва`\n\n" +
        "❓ Помощь: /help"
      );
      return;
    }

    const weightStr = parts[0];
    const countryStr = parts[1];
    const cityStr = parts.slice(2).join(' ');

    // Проверка веса
    const weight = parseFloat(weightStr);
    if (isNaN(weight) || weight <= 0 || weight > 50) {
      await sendMessage(chatId, 
        "❌ **Неверный вес!**\n\n" +
        "📏 Укажите вес от 0.1 до 50 кг\n" +
        "📋 Пример: `2.5 россия москва`"
      );
      return;
    }

    console.log(`🔍 Парсинг: вес=${weight}, страна="${countryStr}", город="${cityStr}"`);

    // Поиск страны
    const country = await findCountry(countryStr);
    if (!country) {
      await sendMessage(chatId, 
        `❌ **Страна "${countryStr}" не найдена!**\n\n` +
        "🌍 **Поддерживаемые страны:**\n" +
        "• Россия (россия, russia, рф, ru)\n" +
        "• США (сша, usa, us)\n" +
        "• Украина (украина, ukraine, ua)\n" +
        "• Беларусь (беларусь, belarus, by)\n" +
        "• Казахстан (казахстан, kazakhstan, kz)\n" +
        "• И другие...\n\n" +
        "💡 Попробуйте написать по-другому"
      );
      return;
    }

    // Поиск города
    const city = await findCity(cityStr, country.id);
    if (!city) {
      await sendMessage(chatId, 
        `❌ **Город "${cityStr}" не найден в стране ${country.name}!**\n\n` +
        "🏙️ **Популярные города России:**\n" +
        "• Москва, Санкт-Петербург, Екатеринбург\n" +
        "• Новосибирск, Казань, Челябинск\n" +
        "• Омск, Самара, Ростов-на-Дону\n\n" +
        "💡 Проверьте правильность написания"
      );
      return;
    }

    console.log(`✅ Найдено: ${country.name} (${country.id}), ${city.name} (${city.id})`);

    // Отправка сообщения о начале расчета
    await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

    // Расчет доставки
    const result = await calculateDelivery(weight, country.id, city.id);
    
    if (result.success) {
      const formattedResult = formatDeliveryResult(result.data, country.name, city.name, weight);
      await sendMessage(chatId, formattedResult);
    } else {
      await sendMessage(chatId, 
        `❌ **Ошибка расчета доставки:**\n${result.error}\n\n` +
        "🔄 Попробуйте еще раз или обратитесь в поддержку"
      );
    }

  } catch (error) {
    console.error('❌ Ошибка обработки запроса:', error);
    await sendMessage(chatId, 
      "❌ **Произошла ошибка при обработке запроса**\n\n" +
      "🔄 Попробуйте еще раз через несколько секунд"
    );
  }
}

// Поиск страны
async function findCountry(query) {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Поиск в словаре
  if (COUNTRIES_DICT[normalizedQuery]) {
    console.log(`🎯 Страна найдена в словаре: ${COUNTRIES_DICT[normalizedQuery].name}`);
    return COUNTRIES_DICT[normalizedQuery];
  }

  // Поиск через API
  try {
    if (!countriesCache) {
      console.log('📡 Загружаем список стран из API...');
      const response = await fetch('https://q3-api.qwintry.com/ru/countries');
      if (response.ok) {
        countriesCache = await response.json();
        console.log(`✅ Загружено ${countriesCache.length} стран`);
      }
    }

    if (countriesCache && Array.isArray(countriesCache)) {
      const found = countriesCache.find(country => 
        country.nameRu?.toLowerCase().includes(normalizedQuery) ||
        country.nameEn?.toLowerCase().includes(normalizedQuery) ||
        country.code?.toLowerCase() === normalizedQuery ||
        country.id?.toString() === normalizedQuery
      );

      if (found) {
        console.log(`🎯 Страна найдена через API: ${found.nameRu || found.nameEn}`);
        return { id: found.id, name: found.nameRu || found.nameEn };
      }
    }
  } catch (error) {
    console.error('❌ Ошибка поиска страны через API:', error);
  }

  console.log(`❌ Страна "${query}" не найдена`);
  return null;
}

// Поиск города
async function findCity(query, countryId) {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Поиск в словаре (только для России)
  if (countryId === 71 && CITIES_DICT[normalizedQuery]) {
    console.log(`🎯 Город найден в словаре: ${CITIES_DICT[normalizedQuery].name}`);
    return CITIES_DICT[normalizedQuery];
  }

  // Поиск через API
  try {
    const cacheKey = `${countryId}_${normalizedQuery}`;
    
    if (!citiesCache[cacheKey]) {
      console.log(`📡 Ищем город "${query}" в стране ${countryId}...`);
      
      const response = await fetch(
        `https://q3-api.qwintry.com/ru/cities?country_id=${countryId}&query=${encodeURIComponent(query)}`
      );
      
      if (response.ok) {
        const cities = await response.json();
        citiesCache[cacheKey] = cities;
        console.log(`✅ Найдено ${cities.length} городов`);
      }
    }

    const cities = citiesCache[cacheKey];
    if (cities && Array.isArray(cities) && cities.length > 0) {
      const found = cities.find(city => 
        city.nameRu?.toLowerCase() === normalizedQuery ||
        city.nameEn?.toLowerCase() === normalizedQuery
      ) || cities[0]; // Берем первый найденный город

      if (found) {
        console.log(`🎯 Город найден: ${found.nameRu || found.nameEn}`);
        return { id: found.id, name: found.nameRu || found.nameEn };
      }
    }
  } catch (error) {
    console.error('❌ Ошибка поиска города через API:', error);
  }

  console.log(`❌ Город "${query}" не найден`);
  return null;
}

// Расчет стоимости доставки
async function calculateDelivery(weight, countryId, cityId) {
  try {
    console.log(`📊 Расчет доставки: вес=${weight}кг, страна=${countryId}, город=${cityId}`);

    const params = new URLSearchParams({
      weight: weight.toString(),
      country: countryId.toString(),
      city: cityId.toString(),
      weightMeasurement: 'kg',
      dimensions: '1x1x1',
      dimensionsMeasurement: 'cm'
    });

    const response = await fetch('https://q3-api.qwintry.com/ru/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('📦 Ответ API получен:', JSON.stringify(data, null, 2));

    if (!data.costs || Object.keys(data.costs).length === 0) {
      return {
        success: false,
        error: 'Нет доступных способов доставки для данного маршрута'
      };
    }

    return { success: true, data };

  } catch (error) {
    console.error('❌ Ошибка расчета доставки:', error);
    return {
      success: false,
      error: `Ошибка API: ${error.message}`
    };
  }
}

// Форматирование результата
function formatDeliveryResult(data, countryName, cityName, weight) {
  if (!data.costs || Object.keys(data.costs).length === 0) {
    return "❌ Нет доступных способов доставки для этого маршрута.";
  }

  let message = `📦 **Доставка из США → ${countryName} (${cityName})**\n`;
  message += `⚖️ Вес: ${weight} кг\n\n`;

  // Сортируем тарифы по цене
  const sortedTariffs = Object.entries(data.costs)
    .map(([key, option]) => ({
      key,
      option,
      price: option.cost?.totalCostWithDiscount || option.cost?.totalCost || 0
    }))
    .sort((a, b) => a.price - b.price);

  for (const { key, option } of sortedTariffs) {
    if (!option?.cost) continue;

    const emoji = TARIFF_EMOJIS[key] || '📦';
    const label = option.cost.label || key;
    const price = option.cost.totalCostWithDiscount || option.cost.totalCost;
    const currency = option.cost.currency || '$';
    const days = option.days || '—';

    message += `${emoji} **${label}** — ${currency}${price} (${days} дней)\n`;
  }

  // Добавляем информацию о таможне для России
  if (data.country_info?.customs_limit) {
    message += `\n💡 **Таможня:** ${data.country_info.customs_limit}`;
  }

  message += `\n\n🔗 [Подробнее на сайте](https://qwintry.com/ru/calculator)`;

  return message;
}

// Отправка сообщения в Telegram
async function sendMessage(chatId, text) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Ошибка отправки сообщения:', errorData);
    } else {
      console.log('✅ Сообщение отправлено успешно');
    }
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения:', error);
  }
}

// Функция для получения ответа от Abacus AI (если нужно)
async function getAbacusResponse(message) {
  try {
    const response = await fetch('https://api.abacus.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ABACUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Ты помощник по доставке товаров через сервис Qwintry. Отвечай кратко и по делу.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0]?.message?.content || 'Извините, не могу ответить на этот вопрос.';
    }
  } catch (error) {
    console.error('❌ Ошибка Abacus AI:', error);
  }
  
  return 'Извините, сервис временно недоступен.';
}
