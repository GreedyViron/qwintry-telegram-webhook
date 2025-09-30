// Telegram Bot для Qwintry - Полная версия с исправлениями
// Токены и конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

// Маппинг складов на hubCode
const HUB_CODES = {
  US: "US1",   // США: 4 тарифа (Flash, Economy, Air, Smart)
  DE: "EU1",   // Германия: только EcoPost (Qwintry Economy)
  UK: "UK1",   // Великобритания: только EcoPost
  CN: "CN1",   // Китай: свои Optima/Ultra
  ES: "ES1"    // Испания: только EcoPost
};

// Маппинг countryId → ISO код
const COUNTRY_ISO = {
  71: "RU",   // Россия
  84: "KZ",   // Казахстан
  149: "BY",  // Беларусь
  162: "UA",  // Украина
  // Можно расширять по мере необходимости
};

// Эмодзи для тарифов
const TARIFF_EMOJIS = {
  qwintry_flash: '⚡',
  ecopost: '🌍',
  qwair: '✈️',
  qwintry_smart: '🚀',
  flash_optima: '🔥',
  flash_ultra: '💎'
};

// Состояния пользователей
const userStates = new Map();

// Данные складов
const WAREHOUSES = {
  US: { name: 'США', code: 'US1', flag: '🇺🇸' },
  DE: { name: 'Германия', code: 'DE1', flag: '🇩🇪' },
  UK: { name: 'Великобритания', code: 'UK1', flag: '🇬🇧' },
  CN: { name: 'Китай', code: 'CN1', flag: '🇨🇳' },
  ES: { name: 'Испания', code: 'ES1', flag: '🇪🇸' }
};

// Данные стран
const COUNTRIES = {
  71: { name: 'Россия', iso: 'RU' },
  84: { name: 'Казахстан', iso: 'KZ' },
  149: { name: 'Беларусь', iso: 'BY' },
  162: { name: 'Украина', iso: 'UA' }
};

// Данные городов (основные)
const CITIES = {
  71: { // Россия
    4050: 'Москва',
    4079: 'Санкт-Петербург',
    4051: 'Новосибирск',
    4052: 'Екатеринбург',
    4053: 'Казань'
  },
  84: { // Казахстан
    5001: 'Алматы',
    5002: 'Нур-Султан',
    5003: 'Шымкент'
  }
};

// Главный обработчик
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    console.log('📨 Получено обновление:', JSON.stringify(update, null, 2));

    if (update.message) {
      await handleUserInput(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Ошибка обработки:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Обработка пользовательского ввода
async function handleUserInput(message) {
  const chatId = message.chat.id;
  const text = message.text;
  const userId = message.from.id;

  console.log(`📨 Получено сообщение от ${userId}: "${text}"`);

  if (text === '/start') {
    await handleStart(chatId);
    return;
  }

  const userState = userStates.get(userId) || {};

  // Обработка состояний
  switch (userState.state) {
    case 'awaiting_country':
      await handleCountryInput(chatId, userId, text);
      break;
    case 'awaiting_city':
      await handleCityInput(chatId, userId, text);
      break;
    case 'awaiting_weight':
      await handleWeightInput(chatId, userId, text);
      break;
    case 'awaiting_ai_question':
      await handleAIQuestion(chatId, userId, text);
      break;
    default:
      await handleStart(chatId);
  }
}

// Обработка callback запросов
async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  console.log(`🎯 Callback от ${userId}: ${data}`);

  await answerCallbackQuery(callbackQuery.id);

  if (data === 'calculator') {
    await showWarehouseSelection(chatId, userId);
  } else if (data === 'discounts') {
    await showDiscounts(chatId);
  } else if (data === 'faq') {
    await showFAQ(chatId);
  } else if (data === 'ai_consultant') {
    await startAIConsultant(chatId, userId);
  } else if (data === 'back_to_menu') {
    await showMainMenu(chatId);
  } else if (data.startsWith('warehouse_')) {
    const warehouseCode = data.replace('warehouse_', '');
    await handleWarehouseSelection(chatId, userId, warehouseCode);
  } else if (data.startsWith('country_')) {
    const countryId = parseInt(data.replace('country_', ''));
    await handleCountrySelection(chatId, userId, countryId);
  } else if (data.startsWith('city_')) {
    const cityId = parseInt(data.replace('city_', ''));
    await handleCitySelection(chatId, userId, cityId);
  }
}

// Стартовое сообщение
async function handleStart(chatId) {
  const welcomeText = `🎉 **Добро пожаловать в Qwintry Bot!**

Я помогу вам:
📦 Рассчитать стоимость доставки
💰 Узнать о скидках и акциях
❓ Получить ответы на частые вопросы
🤖 Задать вопрос AI-консультанту

Выберите нужную опцию:`;

  await showMainMenu(chatId, welcomeText);
}

// Главное меню
async function showMainMenu(chatId, text = "🏠 **Главное меню**\n\nВыберите нужную опцию:") {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📦 Калькулятор доставки', callback_data: 'calculator' }],
      [{ text: '💰 Скидки и акции', callback_data: 'discounts' }],
      [{ text: '❓ Частые вопросы', callback_data: 'faq' }],
      [{ text: '🤖 AI-консультант', callback_data: 'ai_consultant' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Выбор склада
async function showWarehouseSelection(chatId, userId) {
  userStates.set(userId, { state: 'selecting_warehouse' });

  const text = "📦 **Выберите склад отправления:**";
  const keyboard = {
    inline_keyboard: [
      [
        { text: `${WAREHOUSES.US.flag} ${WAREHOUSES.US.name}`, callback_data: 'warehouse_US' },
        { text: `${WAREHOUSES.DE.flag} ${WAREHOUSES.DE.name}`, callback_data: 'warehouse_DE' }
      ],
      [
        { text: `${WAREHOUSES.UK.flag} ${WAREHOUSES.UK.name}`, callback_data: 'warehouse_UK' },
        { text: `${WAREHOUSES.CN.flag} ${WAREHOUSES.CN.name}`, callback_data: 'warehouse_CN' }
      ],
      [
        { text: `${WAREHOUSES.ES.flag} ${WAREHOUSES.ES.name}`, callback_data: 'warehouse_ES' }
      ],
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Обработка выбора склада
async function handleWarehouseSelection(chatId, userId, warehouseCode) {
  const warehouse = WAREHOUSES[warehouseCode];
  if (!warehouse) {
    await sendMessage(chatId, "❌ Неизвестный склад. Попробуйте еще раз.");
    return;
  }

  userStates.set(userId, {
    state: 'selecting_country',
    warehouse: warehouseCode,
    warehouseName: warehouse.name,
    hubCode: warehouse.code
  });

  await showCountrySelection(chatId, userId);
}

// Выбор страны
async function showCountrySelection(chatId, userId) {
  const text = "🌍 **Выберите страну назначения:**";
  const keyboard = {
    inline_keyboard: [
      [{ text: '🇷🇺 Россия', callback_data: 'country_71' }],
      [{ text: '🇰🇿 Казахстан', callback_data: 'country_84' }],
      [{ text: '🇧🇾 Беларусь', callback_data: 'country_149' }],
      [{ text: '🇺🇦 Украина', callback_data: 'country_162' }],
      [{ text: '🔙 Назад к складам', callback_data: 'calculator' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Обработка выбора страны
async function handleCountrySelection(chatId, userId, countryId) {
  const country = COUNTRIES[countryId];
  if (!country) {
    await sendMessage(chatId, "❌ Неизвестная страна. Попробуйте еще раз.");
    return;
  }

  const userState = userStates.get(userId);
  userState.state = 'selecting_city';
  userState.countryId = countryId;
  userState.countryName = country.name;
  userStates.set(userId, userState);

  await showCitySelection(chatId, userId, countryId);
}

// Выбор города
async function showCitySelection(chatId, userId, countryId) {
  const cities = CITIES[countryId] || {};
  const cityButtons = Object.entries(cities).map(([id, name]) => 
    [{ text: name, callback_data: `city_${id}` }]
  );

  if (cityButtons.length === 0) {
    await sendMessage(chatId, "🏙️ **Введите название города:**");
    const userState = userStates.get(userId);
    userState.state = 'awaiting_city';
    userStates.set(userId, userState);
    return;
  }

  const text = "🏙️ **Выберите город:**";
  const keyboard = {
    inline_keyboard: [
      ...cityButtons,
      [{ text: '🔙 Назад к странам', callback_data: 'calculator' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Обработка выбора города
async function handleCitySelection(chatId, userId, cityId) {
  const userState = userStates.get(userId);
  const cityName = CITIES[userState.countryId]?.[cityId] || `Город ${cityId}`;

  userState.state = 'awaiting_weight';
  userState.cityId = cityId;
  userState.cityName = cityName;
  userStates.set(userId, userState);

  await sendMessage(chatId, `⚖️ **Введите вес посылки в килограммах:**\n\nПример: 2.5 или 3`);
}

// Обработка ввода города (текстом)
async function handleCityInput(chatId, userId, cityName) {
  const userState = userStates.get(userId);
  
  // Для простоты используем Москву как дефолт
  userState.state = 'awaiting_weight';
  userState.cityId = 4050; // Москва
  userState.cityName = cityName;
  userStates.set(userId, userState);

  await sendMessage(chatId, `⚖️ **Введите вес посылки в килограммах:**\n\nПример: 2.5 или 3`);
}

// Обработка ввода веса
async function handleWeightInput(chatId, userId, weightText) {
  const weight = parseFloat(weightText.replace(',', '.'));
  
  if (isNaN(weight) || weight <= 0 || weight > 50) {
    await sendMessage(chatId, "❌ Некорректный вес. Введите число от 0.1 до 50 кг:");
    return;
  }

  const userState = userStates.get(userId);
  
  await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

  console.log(`🎯 Расчет: склад=${userState.warehouse}, hub=${userState.hubCode}, страна=${userState.countryName} (${userState.countryId}), город=${userState.cityName} (${userState.cityId}), вес=${weight}кг`);

  const result = await calculateDelivery(weight, userState.countryId, userState.cityId, userState.warehouse);

  if (result.success) {
    const formattedResult = formatDeliveryResult(
  result.data,
  userState.warehouseName,
  userState.countryName,
  userState.cityName,
  weight,
  userState.warehouse  // ← добавь этот параметр!
);
    await sendMessage(chatId, formattedResult);
  } else {
    await sendMessage(chatId, `❌ Не удалось рассчитать доставку для этого маршрута.\n\nВозможные причины:\n• Маршрут временно недоступен\n• Превышен лимит по весу\n• Техническая ошибка\n\nОшибка: ${result.error}`);
  }

  // Предлагаем новый расчет
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔄 Новый расчет', callback_data: 'calculator' }],
      [{ text: '🏠 Главное меню', callback_data: 'back_to_menu' }]
    ]
  };
  
  await sendMessage(chatId, "Хотите сделать еще один расчет?", keyboard);
  
  // Очищаем состояние
  userStates.delete(userId);
}

// Расчет стоимости доставки (исправленная версия)
async function calculateDelivery(weight, countryId, cityId, warehouseCode) {
  try {
    // Приводим склад к hubCode
    const hubCode = HUB_CODES[warehouseCode] || "US1";
    // Приводим страну к ISO (если нет в словаре → оставляем id строкой)
    const countryIso = COUNTRY_ISO[countryId] || countryId.toString();

    console.log(`📊 Расчет: склад=${warehouseCode}, hub=${hubCode}, страна=${countryIso}, город=${cityId}, вес=${weight}кг`);

    const payload = {
      weight: weight.toString(),
      weightMeasurement: "kg",
      dimensions: "1x1x1",       // именно так на сайте
      dimensionsMeasurement: "cm",
      hubCode,
      country: countryIso,
      city: cityId.toString(),
      zip: "100000",             // дефолт Москва — потом можно подставлять реальный из geoCity
      insurance: null,           // null = без страховки
      itemsCost: "1",            // минимальная стоимость товаров
      itemsCostInUSD: 1
    };

    console.log("👉 Отправляем в API:", payload);

    const response = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("📦 Ответ API:", JSON.stringify(data, null, 2));

    if (!data.costs || Object.keys(data.costs).length === 0) {
      return { success: false, error: "Нет доступных способов доставки" };
    }

    return { success: true, data };
  } catch (error) {
    console.error("❌ Ошибка расчета доставки:", error);
    return { success: false, error: `Ошибка API: ${error.message}` };
  }
}

// Форматирование результата (улучшенная версия)
function formatDeliveryResult(data, warehouseName, countryName, cityName, weight, warehouseCode) {
  if (!data.costs || Object.keys(data.costs).length === 0) {
    return "❌ Нет доступных способов доставки для этого маршрута.";
  }

  let costs = Object.entries(data.costs);

  // 🔑 фильтрация для EU/UK/ES — оставляем только ecopost
  if (["DE", "UK", "ES"].includes(warehouseCode)) {
    costs = costs.filter(([key]) => key === "ecopost");
  }

  let message = `📦 **Доставка ${warehouseName} → ${countryName}, ${cityName}**\n`;
  message += `⚖️ Вес: ${weight} кг\n\n`;

  // Сортируем тарифы по цене (от дешевого к дорогому)
  const sortedTariffs = costs
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

  // Добавляем информацию о составе цены для EU складов
  if (["DE", "UK", "ES"].includes(warehouseCode) && sortedTariffs.length > 0) {
    message += `\n💡 **Состав:** доставка + обработка $10 + комиссия ~3%`;
  }

  // Добавляем информацию о таможне
  if (data.country_info?.customs_limit) {
    message += `\n💡 **Таможня:** ${data.country_info.customs_limit}`;
  }

  message += `\n\n🔗 [Подробнее на сайте](https://qwintry.com/ru/calculator)`;

  return message;
}

// Показать скидки
async function showDiscounts(chatId) {
  const text = `💰 **Скидки и акции Qwintry:**

🎯 **Постоянные скидки:**
• Скидка за объем отправлений
• Бонусы за регистрацию
• Специальные тарифы для постоянных клиентов

🔥 **Текущие акции:**
• Скидка 10% на первую отправку
• Бесплатная упаковка при заказе от \$100
• Кэшбэк за отзывы

📱 Актуальные промокоды и акции смотрите на сайте Qwintry.com`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Показать FAQ
async function showFAQ(chatId) {
  const text = `❓ **Частые вопросы:**

**Q: Сколько времени занимает доставка?**
A: От 4-7 дней (экспресс) до 25-35 дней (эконом), в зависимости от выбранного тарифа.

**Q: Какие товары нельзя отправлять?**
A: Запрещены: оружие, наркотики, скоропортящиеся продукты, жидкости в больших объемах.

**Q: Как рассчитывается таможенная пошлина?**
A: Беспошлинный лимит для России: 200€ и 31кг. Превышение облагается пошлиной 15%.

**Q: Можно ли объединить несколько посылок?**
A: Да, услуга консолидации доступна для большинства тарифов.

**Q: Как отследить посылку?**
A: Трек-номер приходит на email, отслеживание доступно в личном кабинете.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Запуск AI-консультанта
async function startAIConsultant(chatId, userId) {
  userStates.set(userId, { state: 'awaiting_ai_question' });

  const text = `🤖 **AI-консультант Qwintry**

Задайте любой вопрос о доставке, тарифах, сроках, таможне или услугах Qwintry.

Например:
• "Какой тариф лучше для электроники?"
• "Сколько стоит страховка?"
• "Как долго хранятся посылки на складе?"

💬 Напишите ваш вопрос:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, text, keyboard);
}

// Обработка вопроса к AI
async function handleAIQuestion(chatId, userId, question) {
  await sendMessage(chatId, "🤖 Обрабатываю ваш вопрос...");

  const response = await getAbacusResponse(question);
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '❓ Задать еще вопрос', callback_data: 'ai_consultant' }],
      [{ text: '🏠 Главное меню', callback_data: 'back_to_menu' }]
    ]
  };

  await sendMessage(chatId, `🤖 **AI-консультант отвечает:**\n\n${response}`, keyboard);
  
  // Очищаем состояние
  userStates.delete(userId);
}

// Отправка сообщения в Telegram
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
            content: 'Ты помощник по доставке товаров через сервис Qwintry (Бандеролька). Отвечай кратко и по делу на русском языке. Помогай с вопросами о доставке, тарифах, сроках, таможне, упаковке товаров. У Qwintry есть 5 складов: США, Германия, Великобритания, Китай, Испания. Основные тарифы: Flash (экономичный), Economy (для тяжелых посылок), Air (стандартный), Smart (для сложных товаров).'
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
