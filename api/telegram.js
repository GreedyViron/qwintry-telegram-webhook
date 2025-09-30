// Telegram Bot для сервиса Qwintry (Бандеролька)
// Полнофункциональный бот с меню, калькулятором и AI-консультантом

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

// Состояния пользователей (в продакшене лучше использовать Redis/Database)
const userStates = new Map();

// Состояния бота
const STATES = {
  IDLE: 'idle',
  CALC_WAREHOUSE: 'calc_warehouse',
  CALC_COUNTRY: 'calc_country',
  CALC_CITY: 'calc_city',
  CALC_WEIGHT: 'calc_weight'
};

// Склады
const WAREHOUSES = {
  'US1': { code: 'US1', name: 'США', emoji: '🇺🇸' },
  'DE1': { code: 'DE1', name: 'Германия', emoji: '🇩🇪' },
  'CN1': { code: 'CN1', name: 'Китай', emoji: '🇨🇳' }
};

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
    const { message, callback_query } = req.body;
    
    // Обработка callback_query (нажатие кнопок)
    if (callback_query) {
      await handleCallbackQuery(callback_query);
      return res.status(200).json({ ok: true });
    }
    
    if (!message || !message.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const userId = message.from.id;

    console.log(`📨 Получено сообщение от ${chatId}: "${text}"`);

    // Получаем текущее состояние пользователя
    const userState = getUserState(userId);

    // Обработка команд
    if (text === '/start') {
      await handleStartCommand(chatId, userId);
    } else if (text === '/calc') {
      await startCalculator(chatId, userId);
    } else if (text === '/help') {
      await handleHelpCommand(chatId);
    } else if (text === '/menu') {
      await showMainMenu(chatId, userId);
    } else {
      // Обработка в зависимости от состояния
      await handleUserInput(chatId, userId, text, userState);
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ Ошибка в webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Обработка нажатий кнопок
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  console.log(`🔘 Нажата кнопка: ${data}`);

  // Подтверждаем получение callback
  await answerCallbackQuery(callbackQuery.id);

  if (data === 'calc') {
    await startCalculator(chatId, userId);
  } else if (data === 'discounts') {
    await showDiscounts(chatId);
  } else if (data === 'faq') {
    await showFAQ(chatId);
  } else if (data === 'back_to_menu') {
    await showMainMenu(chatId, userId);
  } else if (data.startsWith('warehouse_')) {
    const warehouse = data.replace('warehouse_', '');
    await handleWarehouseSelection(chatId, userId, warehouse);
  }
}

// Получение состояния пользователя
function getUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      state: STATES.IDLE,
      data: {}
    });
  }
  return userStates.get(userId);
}

// Установка состояния пользователя
function setUserState(userId, state, data = {}) {
  const currentState = getUserState(userId);
  userStates.set(userId, {
    state: state,
    data: { ...currentState.data, ...data }
  });
}

// Команда /start
async function handleStartCommand(chatId, userId) {
  setUserState(userId, STATES.IDLE);
  
  const welcomeMessage = 
    "👋 Здравствуйте! Я бот-помощник Бандерольки.\n\n" +
    "💬 Вы можете задать мне любой вопрос напрямую или воспользоваться меню ниже.";

  await sendMessage(chatId, welcomeMessage);
  await showMainMenu(chatId, userId);
}

// Показать главное меню
async function showMainMenu(chatId, userId) {
  setUserState(userId, STATES.IDLE);
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '📦 Калькулятор', callback_data: 'calc' },
        { text: '💸 Скидки', callback_data: 'discounts' }
      ],
      [
        { text: 'ℹ️ FAQ', callback_data: 'faq' }
      ]
    ]
  };

  await sendMessage(chatId, "🏠 Главное меню:", keyboard);
}

// Запуск калькулятора
async function startCalculator(chatId, userId) {
  setUserState(userId, STATES.CALC_WAREHOUSE);
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇺🇸 США (US1)', callback_data: 'warehouse_US1' },
        { text: '🇩🇪 Германия (DE1)', callback_data: 'warehouse_DE1' }
      ],
      [
        { text: '🇨🇳 Китай (CN1)', callback_data: 'warehouse_CN1' }
      ],
      [
        { text: '🔙 Назад в меню', callback_data: 'back_to_menu' }
      ]
    ]
  };

  await sendMessage(chatId, 
    "📦 **Калькулятор доставки**\n\n" +
    "Шаг 1/4: Выберите склад отправления:", 
    keyboard
  );
}

// Обработка выбора склада
async function handleWarehouseSelection(chatId, userId, warehouse) {
  if (!WAREHOUSES[warehouse]) {
    await sendMessage(chatId, "❌ Неверный склад!");
    return;
  }

  setUserState(userId, STATES.CALC_COUNTRY, { warehouse });
  
  const warehouseInfo = WAREHOUSES[warehouse];
  await sendMessage(chatId, 
    `✅ Выбран склад: ${warehouseInfo.emoji} ${warehouseInfo.name}\n\n` +
    "Шаг 2/4: Введите страну назначения:\n" +
    "📝 Например: Россия, США, Германия, Украина"
  );
}

// Обработка ввода пользователя в зависимости от состояния
async function handleUserInput(chatId, userId, text, userState) {
  switch (userState.state) {
    case STATES.CALC_COUNTRY:
      await handleCountryInput(chatId, userId, text);
      break;
    
    case STATES.CALC_CITY:
      await handleCityInput(chatId, userId, text);
      break;
    
    case STATES.CALC_WEIGHT:
      await handleWeightInput(chatId, userId, text);
      break;
    
    case STATES.IDLE:
    default:
      // AI-консультант для обычных вопросов
      await handleAIConsultant(chatId, text);
      break;
  }
}

// Обработка ввода страны
async function handleCountryInput(chatId, userId, text) {
  const country = await findCountry(text);
  
  if (!country) {
    await sendMessage(chatId, 
      `❌ Страна "${text}" не найдена!\n\n` +
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

  setUserState(userId, STATES.CALC_CITY, { country });
  
  await sendMessage(chatId, 
    `✅ Выбрана страна: ${country.name}\n\n` +
    "Шаг 3/4: Введите город назначения:\n" +
    "📝 Например: Москва, Санкт-Петербург, Екатеринбург"
  );
}

// Обработка ввода города
async function handleCityInput(chatId, userId, text) {
  const userState = getUserState(userId);
  const country = userState.data.country;
  
  const city = await findCity(text, country.id);
  
  if (!city) {
    await sendMessage(chatId, 
      `❌ Город "${text}" не найден в стране ${country.name}!\n\n` +
      "🏙️ **Популярные города России:**\n" +
      "• Москва, Санкт-Петербург, Екатеринбург\n" +
      "• Новосибирск, Казань, Челябинск\n" +
      "• Омск, Самара, Ростов-на-Дону\n\n" +
      "💡 Проверьте правильность написания"
    );
    return;
  }

  setUserState(userId, STATES.CALC_WEIGHT, { city });
  
  await sendMessage(chatId, 
    `✅ Выбран город: ${city.name}\n\n` +
    "Шаг 4/4: Введите вес посылки в килограммах:\n" +
    "📝 Например: 2, 1.5, 3.2 (от 0.1 до 50 кг)"
  );
}

// Обработка ввода веса
async function handleWeightInput(chatId, userId, text) {
  const weight = parseFloat(text);
  
  if (isNaN(weight) || weight <= 0 || weight > 50) {
    await sendMessage(chatId, 
      "❌ **Неверный вес!**\n\n" +
      "📏 Укажите вес от 0.1 до 50 кг\n" +
      "📋 Пример: 2.5"
    );
    return;
  }

  const userState = getUserState(userId);
  const { warehouse, country, city } = userState.data;

  // Сброс состояния
  setUserState(userId, STATES.IDLE);

  // Отправка сообщения о начале расчета
  await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

  // Определяем правильный hub для России
  let hubCode = warehouse;
  if (country.id === 71) { // Россия
    hubCode = 'DE1'; // Для России всегда используем DE1
  }

  // Расчет доставки
  const result = await calculateDelivery(weight, country.id, city.id, hubCode);
  
  if (result.success) {
    const formattedResult = formatDeliveryResult(
      result.data, 
      WAREHOUSES[warehouse].name, 
      country.name, 
      city.name, 
      weight
    );
    await sendMessage(chatId, formattedResult);
  } else {
    await sendMessage(chatId, 
      "❌ **Не удалось рассчитать доставку для этого маршрута.**\n\n" +
      "Возможные причины:\n" +
      "• Маршрут временно недоступен\n" +
      "• Превышен лимит по весу\n" +
      "• Техническая ошибка\n\n" +
      "👉 Попробуйте другой склад или проверьте: https://qwintry.com/ru/calculator"
    );
  }

  // Показываем меню после расчета
  setTimeout(() => showMainMenu(chatId, userId), 2000);
}

// AI-консультант
async function handleAIConsultant(chatId, text) {
  try {
    await sendMessage(chatId, "🤔 Думаю над вашим вопросом...");
    
    const response = await getAbacusResponse(text);
    await sendMessage(chatId, response);
    
  } catch (error) {
    console.error('❌ Ошибка AI-консультанта:', error);
    await sendMessage(chatId, 
      "Извините, не могу ответить на этот вопрос прямо сейчас. " +
      "Попробуйте воспользоваться калькулятором или обратитесь в поддержку."
    );
  }
}

// Показать скидки
async function showDiscounts(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, 
    "💸 **Актуальные скидки и акции:**\n\n" +
    "🎉 **Новым клиентам** — скидка 10% на первую посылку\n" +
    "📦 **При весе от 5 кг** — скидка 5%\n" +
    "🚀 **Qwintry Smart** — бесплатная упаковка\n" +
    "💎 **VIP-клиентам** — персональные скидки до 15%\n\n" +
    "🔗 Подробности на сайте: https://qwintry.com/ru/discounts",
    keyboard
  );
}

// Показать FAQ
async function showFAQ(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, 
    "ℹ️ **Часто задаваемые вопросы:**\n\n" +
    "❓ **Сколько идет доставка?**\n" +
    "• Flash: 21-30 дней\n" +
    "• Economy: 14-20 дней\n" +
    "• Air: 21-30 дней\n" +
    "• Smart: 15-30 дней\n\n" +
    "❓ **Какие ограничения по весу?**\n" +
    "До 50 кг в одной посылке\n\n" +
    "❓ **Есть ли таможенные ограничения?**\n" +
    "Для России: до €200 без пошлин\n\n" +
    "❓ **Как отследить посылку?**\n" +
    "В личном кабинете на qwintry.com\n\n" +
    "🔗 Больше ответов: https://qwintry.com/ru/faq",
    keyboard
  );
}

// Команда /help
async function handleHelpCommand(chatId) {
  await sendMessage(chatId,
    "📖 **Как пользоваться ботом:**\n\n" +
    "🏠 **Главное меню** — /menu\n" +
    "📦 **Калькулятор** — /calc\n" +
    "❓ **Помощь** — /help\n\n" +
    "💬 **Задавайте вопросы напрямую!**\n" +
    "Я отвечу на любые вопросы о доставке, тарифах, сроках и многом другом.\n\n" +
    "📋 **Примеры вопросов:**\n" +
    "• Сколько стоит доставка в Германию?\n" +
    "• Какие документы нужны для таможни?\n" +
    "• Как упаковать хрупкие товары?\n" +
    "• Что такое консолидация?"
  );
}

// Поиск страны (без изменений)
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

// Поиск города (без изменений)
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

// Расчет стоимости доставки (обновлено для поддержки hubCode)
async function calculateDelivery(weight, countryId, cityId, hubCode = 'US1') {
  try {
    console.log(`📊 Расчет доставки: вес=${weight}кг, страна=${countryId}, город=${cityId}, hub=${hubCode}`);

    const params = new URLSearchParams({
      weight: weight.toString(),
      country: countryId.toString(),
      city: cityId.toString(),
      weightMeasurement: 'kg',
      dimensions: '1x1x1',
      dimensionsMeasurement: 'cm',
      hubCode: hubCode
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

// Форматирование результата (обновлено)
function formatDeliveryResult(data, warehouseName, countryName, cityName, weight) {
  if (!data.costs || Object.keys(data.costs).length === 0) {
    return "❌ Нет доступных способов доставки для этого маршрута.";
  }

  let message = `📦 **Доставка ${warehouseName} → ${countryName}, ${cityName}**\n`;
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
    let label = option.cost.label || key;
    
    // Переводим названия тарифов
    if (key === 'qwintry_flash') label = 'Qwintry Flash';
    if (key === 'ecopost') label = 'Qwintry Economy';
    if (key === 'qwair') label = 'Qwintry Air';
    if (key === 'qwintry_smart') label = 'Qwintry Smart';

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

// Отправка сообщения в Telegram (обновлено для поддержки клавиатуры)
async function sendMessage(chatId, text, keyboard = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    if (keyboard) {
      payload.reply_markup = keyboard;
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

// Подтверждение callback query
async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      }),
    });
  } catch (error) {
    console.error('❌ Ошибка answerCallbackQuery:', error);
  }
}

// Функция для получения ответа от Abacus AI
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
            content: 'Ты помощник по доставке товаров через сервис Qwintry (Бандеролька). Отвечай кратко и по делу на русском языке. Помогай с вопросами о доставке, тарифах, сроках, таможне, упаковке товаров.'
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
  
  return 'Извините, сервис временно недоступен. Попробуйте воспользоваться калькулятором или обратитесь в поддержку.';
}
