// /api/lib/calc.js
import { sendMessage } from './utils.js';

// === Состояния пользователей ===
const userStates = new Map();

// === EcoPost таблица (DE/UK/ES → Россия) ===
const ECOPOST_PRICES = {
  1: 36.50,
  2: 43.50,
  3: 51.00,
  4: 58.00,
  5: 66.50,
  6: 73.00,
  7: 80.50,
  8: 88.00,
  9: 95.50,
  10: 95.50,
  12: 107.00,
  15: 124.00,
  20: 152.50,
  25: 181.00,
  30: 209.50
};

function getEcoPostPrice(weight) {
  const weights = Object.keys(ECOPOST_PRICES).map(Number).sort((a,b)=>a-b);
  const nearest = weights.find(w => w >= weight) || 30;
  return ECOPOST_PRICES[nearest];
}

// === США тарифы ===
const US_TARIFFS = {
  flash: { name: "⚡ Flash", pricePerKg: 20, days: "7–10" },
  economy: { name: "🌍 Economy", pricePerKg: 15, days: "12–20" },
  air: { name: "✈️ Air", pricePerKg: 25, days: "5–8" },
  smart: { name: "🚀 Smart", pricePerKg: 30, days: "7–14" }
};

// === Китай тарифы ===
const CN_TARIFFS = {
  optima: { name: "🔥 Flash Optima", pricePerKg: 18, days: "10–20" },
  ultra: { name: "💎 Flash Ultra", pricePerKg: 25, days: "7–14" }
};

// === Склады ===
const WAREHOUSES = {
  US: { name: 'США', flag: '🇺🇸' },
  DE: { name: 'Германия', flag: '🇩🇪' },
  UK: { name: 'Великобритания', flag: '🇬🇧' },
  ES: { name: 'Испания', flag: '🇪🇸' },
  CN: { name: 'Китай', flag: '🇨🇳' }
};

// === Страны ===
const COUNTRIES = {
  RU: { name: 'Россия', flag: '🇷🇺' },
  KZ: { name: 'Казахстан', flag: '🇰🇿' },
  BY: { name: 'Беларусь', flag: '🇧🇾' },
  UA: { name: 'Украина', flag: '🇺🇦' }
};

// === Города (топ-5 для России) ===
const CITIES_RU = [
  { name: 'Москва', id: 4050 },
  { name: 'Санкт-Петербург', id: 4079 },
  { name: 'Новосибирск', id: 4051 },
  { name: 'Екатеринбург', id: 4052 },
  { name: 'Казань', id: 4053 }
];

// ========================================
// Шаг 1: Выбор склада
// ========================================
export async function handleCalcCommand(chatId) {
  userStates.set(chatId, { step: 'warehouse' });

  const keyboard = {
    inline_keyboard: [
      [
        { text: `${WAREHOUSES.US.flag} ${WAREHOUSES.US.name}`, callback_data: 'calc_US' },
        { text: `${WAREHOUSES.DE.flag} ${WAREHOUSES.DE.name}`, callback_data: 'calc_DE' }
      ],
      [
        { text: `${WAREHOUSES.UK.flag} ${WAREHOUSES.UK.name}`, callback_data: 'calc_UK' },
        { text: `${WAREHOUSES.ES.flag} ${WAREHOUSES.ES.name}`, callback_data: 'calc_ES' }
      ],
      [
        { text: `${WAREHOUSES.CN.flag} ${WAREHOUSES.CN.name}`, callback_data: 'calc_CN' }
      ],
      [{ text: '🔙 Назад в меню', callback_data: 'back_menu' }]
    ]
  };

  await sendMessage(chatId, '📦 **Выберите склад отправления:**', keyboard);
}

// ========================================
// Обработка callback (кнопки)
// ========================================
export async function handleCalcCallback(chatId, data) {
  const state = userStates.get(chatId) || {};

  // === Выбор склада ===
  if (data.startsWith('calc_')) {
    const warehouse = data.replace('calc_', '');
    state.warehouse = warehouse;
    state.warehouseName = WAREHOUSES[warehouse].name;
    state.step = 'country';
    userStates.set(chatId, state);

    await showCountrySelection(chatId);
  }

  // === Выбор страны ===
  else if (data.startsWith('country_')) {
    const country = data.replace('country_', '');
    state.country = country;
    state.countryName = COUNTRIES[country].name;
    state.step = 'city';
    userStates.set(chatId, state);

    await showCitySelection(chatId, country);
  }

  // === Выбор города (кнопка) ===
  else if (data.startsWith('city_')) {
    const cityId = data.replace('city_', '');
    const city = CITIES_RU.find(c => c.id == cityId);
    state.cityId = cityId;
    state.cityName = city ? city.name : cityId;
    state.step = 'weight';
    userStates.set(chatId, state);

    await sendMessage(chatId, `⚖️ **Введите вес посылки в килограммах:**\n\nПример: \`2.5\` или \`3\``);
  }
}

// ========================================
// Обработка текстовых сообщений (город/вес)
// ========================================
export async function handleCalcText(chatId, text) {
  const state = userStates.get(chatId);
  if (!state) return false; // не в процессе калькулятора

  // === Ввод города вручную ===
  if (state.step === 'city') {
    state.cityName = text;
    state.cityId = 4050; // дефолт Москва (можно потом улучшить)
    state.step = 'weight';
    userStates.set(chatId, state);

    await sendMessage(chatId, `⚖️ **Введите вес посылки в килограммах:**\n\nПример: \`2.5\` или \`3\``);
    return true;
  }

  // === Ввод веса ===
  if (state.step === 'weight') {
    const weight = parseFloat(text.replace(',', '.'));

    if (isNaN(weight) || weight <= 0 || weight > 50) {
      await sendMessage(chatId, '❌ Некорректный вес. Введите число от 0.1 до 50 кг:');
      return true;
    }

    state.weight = weight;
    userStates.set(chatId, state);

    await sendMessage(chatId, '⏳ Рассчитываю стоимость доставки...');
    await calculateAndSend(chatId, state);

    // Очищаем состояние
    userStates.delete(chatId);
    return true;
  }

  return false;
}

// ========================================
// Выбор страны
// ========================================
async function showCountrySelection(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: `${COUNTRIES.RU.flag} ${COUNTRIES.RU.name}`, callback_data: 'country_RU' }],
      [{ text: `${COUNTRIES.KZ.flag} ${COUNTRIES.KZ.name}`, callback_data: 'country_KZ' }],
      [{ text: `${COUNTRIES.BY.flag} ${COUNTRIES.BY.name}`, callback_data: 'country_BY' }],
      [{ text: `${COUNTRIES.UA.flag} ${COUNTRIES.UA.name}`, callback_data: 'country_UA' }],
      [{ text: '🔙 Назад к складам', callback_data: 'calc' }]
    ]
  };

  await sendMessage(chatId, '🌍 **Выберите страну назначения:**', keyboard);
}

// ========================================
// Выбор города
// ========================================
async function showCitySelection(chatId, country) {
  if (country === 'RU') {
    const cityButtons = CITIES_RU.map(c => [{ text: c.name, callback_data: `city_${c.id}` }]);

    const keyboard = {
      inline_keyboard: [
        ...cityButtons,
        [{ text: '🔙 Назад к странам', callback_data: 'calc' }]
      ]
    };

    await sendMessage(chatId, '🏙️ **Выберите город или напишите вручную:**', keyboard);
  } else {
    // Для других стран пока просто запрашиваем ввод
    const state = userStates.get(chatId);
    state.step = 'city';
    userStates.set(chatId, state);

    await sendMessage(chatId, '🏙️ **Введите название города:**');
  }
}

// ========================================
// Расчёт и отправка результата
// ========================================
async function calculateAndSend(chatId, state) {
  const { warehouse, warehouseName, country, countryName, cityName, weight } = state;

  let message = `📦 **Результаты расчета доставки**\n\n`;
  message += `📍 **Маршрут:** ${warehouseName} → ${countryName}, ${cityName}\n`;
  message += `⚖️ **Вес:** ${weight} кг\n\n`;
  message += `💵 **Доступные тарифы:**\n\n`;

  // === EcoPost для Европы (DE/UK/ES) ===
  if (['DE', 'UK', 'ES'].includes(warehouse)) {
    const price = getEcoPostPrice(weight);
    message += `🌍 **EcoPost (Qwintry Economy)**\n`;
    message += `💰 Цена: $${price.toFixed(2)}\n`;
    message += `⏱ Срок: 25–35 дней\n\n`;
    message += `💡 *Страховка $3 считается отдельно (опция на сайте)*\n\n`;
  }

  // === США (4 тарифа) ===
  else if (warehouse === 'US') {
    for (const key in US_TARIFFS) {
      const t = US_TARIFFS[key];
      const price = (t.pricePerKg * weight).toFixed(2);
      message += `${t.name}\n`;
      message += `💰 Цена: ~$${price}\n`;
      message += `⏱ Срок: ${t.days} дней\n\n`;
    }
  }

  // === Китай (2 тарифа) ===
  else if (warehouse === 'CN') {
    for (const key in CN_TARIFFS) {
      const t = CN_TARIFFS[key];
      const price = (t.pricePerKg * weight).toFixed(2);
      message += `${t.name}\n`;
      message += `💰 Цена: ~$${price}\n`;
      message += `⏱ Срок: ${t.days} дней\n\n`;
    }
  }

  message += `🔗 [Подробнее на сайте](https://qwintry.com/ru/calculator)`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔄 Новый расчет', callback_data: 'calc' }],
      [{ text: '🏠 Главное меню', callback_data: 'back_menu' }]
    ]
  };

  await sendMessage(chatId, message, keyboard);
}
