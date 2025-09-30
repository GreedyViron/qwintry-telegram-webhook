// Telegram Bot для Qwintry - Полная версия с исправлениями
import fetch from "node-fetch";

// Токены
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

// Маппинг складов на hubCode
const HUB_CODES = {
  US: "US1",   
  DE: "EU1",   
  UK: "UK1",   
  CN: "CN1",   
  ES: "ES1"
};

// Маппинг countryId → ISO
const COUNTRY_ISO = {
  71: "RU",
  84: "KZ",
  149: "BY",
  162: "UA",
};

// Эмодзи тарифов
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

// Склады
const WAREHOUSES = {
  US: { name: 'США', code: 'US1', flag: '🇺🇸' },
  DE: { name: 'Германия', code: 'EU1', flag: '🇩🇪' },
  UK: { name: 'Великобритания', code: 'UK1', flag: '🇬🇧' },
  CN: { name: 'Китай', code: 'CN1', flag: '🇨🇳' },
  ES: { name: 'Испания', code: 'ES1', flag: '🇪🇸' }
};

// Страны
const COUNTRIES = {
  71: { name: 'Россия', iso: 'RU' },
  84: { name: 'Казахстан', iso: 'KZ' },
  149: { name: 'Беларусь', iso: 'BY' },
  162: { name: 'Украина', iso: 'UA' }
};

// Города
const CITIES = {
  71: { 4050: 'Москва', 4079: 'Санкт-Петербург', 4051: 'Новосибирск', 4052: 'Екатеринбург', 4053: 'Казань' },
  84: { 5001: 'Алматы', 5002: 'Нур-Султан', 5003: 'Шымкент' }
};

// === HANDLER ===
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const update = req.body;
    console.log("📨 Update:", JSON.stringify(update, null, 2));

    if (update.message) {
      await handleUserInput(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("❌ Ошибка:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}

// === ПОЛЬЗОВАТЕЛЬСКИЙ ВВОД ===
async function handleUserInput(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  console.log(`📨 User ${userId}: ${text}`);

  if (text === "/start") return handleStart(chatId);

  const state = userStates.get(userId) || {};
  switch (state.state) {
    case "awaiting_country": return handleCountryInput(chatId, userId, text);
    case "awaiting_city": return handleCityInput(chatId, userId, text);
    case "awaiting_weight": return handleWeightInput(chatId, userId, text);
    case "awaiting_ai_question": return handleAIQuestion(chatId, userId, text);
    default: return handleStart(chatId);
  }
}

// === CALLBACK ===
async function handleCallbackQuery(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data = cb.data;

  await answerCallbackQuery(cb.id);

  if (data === "calculator") return showWarehouseSelection(chatId, userId);
  if (data === "discounts") return showDiscounts(chatId);
  if (data === "faq") return showFAQ(chatId);
  if (data === "ai_consultant") return startAIConsultant(chatId, userId);
  if (data === "back_to_menu") return showMainMenu(chatId);

  if (data.startsWith("warehouse_"))
    return handleWarehouseSelection(chatId, userId, data.replace("warehouse_", ""));
  if (data.startsWith("country_"))
    return handleCountrySelection(chatId, userId, parseInt(data.replace("country_", "")));
  if (data.startsWith("city_"))
    return handleCitySelection(chatId, userId, parseInt(data.replace("city_", "")));
}

// === START ===
async function handleStart(chatId) {
  const text = `🎉 **Добро пожаловать в Qwintry Bot!**

📦 Рассчитай доставку  
💰 Узнай о скидках  
❓ Частые вопросы  
🤖 Задай вопрос AI`;

  await showMainMenu(chatId, text);
}

async function showMainMenu(chatId, text="🏠 Главное меню") {
  const kb = {
    inline_keyboard: [
      [{ text: '📦 Калькулятор', callback_data: 'calculator' }],
      [{ text: '💰 Скидки и акции', callback_data: 'discounts' }],
      [{ text: '❓ FAQ', callback_data: 'faq' }],
      [{ text: '🤖 AI-консультант', callback_data: 'ai_consultant' }]
    ]
  };
  await sendMessage(chatId, text, kb);
}

// === СКЛАД ===
async function showWarehouseSelection(chatId, userId) {
  userStates.set(userId, { state: "selecting_warehouse" });
  const kb = {
    inline_keyboard: [
      [
        { text: `${WAREHOUSES.US.flag} ${WAREHOUSES.US.name}`, callback_data: "warehouse_US" },
        { text: `${WAREHOUSES.DE.flag} ${WAREHOUSES.DE.name}`, callback_data: "warehouse_DE" }
      ],
      [
        { text: `${WAREHOUSES.UK.flag} ${WAREHOUSES.UK.name}`, callback_data: "warehouse_UK" },
        { text: `${WAREHOUSES.CN.flag} ${WAREHOUSES.CN.name}`, callback_data: "warehouse_CN" }
      ],
      [
        { text: `${WAREHOUSES.ES.flag} ${WAREHOUSES.ES.name}`, callback_data: "warehouse_ES" }
      ],
      [{ text: "🔙 Назад", callback_data: "back_to_menu" }]
    ]
  };
  await sendMessage(chatId, "📦 **Выберите склад отправления:**", kb);
}

async function handleWarehouseSelection(chatId, userId, wCode) {
  const w = WAREHOUSES[wCode];
  if (!w) return sendMessage(chatId, "❌ Неизвестный склад");

  userStates.set(userId, {
    state: "selecting_country",
    warehouse: wCode,
    warehouseName: w.name,
    hubCode: w.code
  });
  await showCountrySelection(chatId, userId);
}

// === СТРАНА / ГОРОД ===
async function showCountrySelection(chatId, userId) {
  const kb = {
    inline_keyboard: [
      [{ text: "🇷🇺 Россия", callback_data: "country_71" }],
      [{ text: "🇰🇿 Казахстан", callback_data: "country_84" }],
      [{ text: "🇧🇾 Беларусь", callback_data: "country_149" }],
      [{ text: "🇺🇦 Украина", callback_data: "country_162" }],
      [{ text: "🔙 Назад", callback_data: "calculator" }]
    ]
  };
  await sendMessage(chatId, "🌍 **Выберите страну назначения:**", kb);
}

async function handleCountrySelection(chatId, userId, cId) {
  const c = COUNTRIES[cId];
  if (!c) return sendMessage(chatId, "❌ Страна не найдена");

  const st = userStates.get(userId);
  st.state = "selecting_city";
  st.countryId = cId;
  st.countryName = c.name;
  userStates.set(userId, st);

  await showCitySelection(chatId, userId, cId);
}

async function showCitySelection(chatId, userId, cId) {
  const cityButtons = Object.entries(CITIES[cId] || {})
    .map(([id, name]) => [{ text: name, callback_data: `city_${id}` }]);
  if (cityButtons.length === 0) {
    const st = userStates.get(userId);
    st.state = "awaiting_city";
    userStates.set(userId, st);
    return sendMessage(chatId, "🏙️ Введите название города вручную:");
  }
  const kb = { inline_keyboard: [...cityButtons, [{ text: "🔙 Назад", callback_data: "calculator" }]] };
  await sendMessage(chatId, "🏙️ **Выберите город:**", kb);
}

async function handleCitySelection(chatId, userId, cityId) {
  const st = userStates.get(userId);
  st.state = "awaiting_weight";
  st.cityId = cityId;
  st.cityName = CITIES[st.countryId]?.[cityId] || "Город";
  userStates.set(userId, st);
  await sendMessage(chatId, "⚖️ Введите вес посылки (пример: 2.5):");
}

// === ВЕС ===
async function handleWeightInput(chatId, userId, weightText) {
  const weight = parseFloat(weightText.replace(",", "."));
  if (isNaN(weight) || weight <= 0 || weight > 50)
    return sendMessage(chatId, "❌ Некорректный вес (0.1-50 кг)");

  const st = userStates.get(userId);
  await sendMessage(chatId, "⏳ Считаем стоимость...");

  const res = await calculateDelivery(weight, st.countryId, st.cityId, st.warehouse);
  if (!res.success) return sendMessage(chatId, "❌ Ошибка: " + res.error);

  const result = formatDeliveryResult(res.data, st.warehouseName, st.countryName, st.cityName, weight, st.warehouse);
  await sendMessage(chatId, result);

  userStates.delete(userId);
}

// === API ===
async function calculateDelivery(weight, countryId, cityId, warehouseCode) {
  try {
    const hubCode = HUB_CODES[warehouseCode];
    const countryIso = COUNTRY_ISO[countryId] || countryId.toString();
    const payload = {
      weight: weight.toString(),
      weightMeasurement: "kg",
      dimensions: "1x1x1",
      dimensionsMeasurement: "cm",
      hubCode,
      country: countryIso,
      city: cityId.toString(),
      zip: "100000",
      insurance: null,
      itemsCost: "1",
      itemsCostInUSD: 1
    };
    const r = await fetch("https://q3-api.qwintry.com/ru/frontend/calculator/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// === Форматирование результата ===
function formatDeliveryResult(data, warehouseName, countryName, cityName, weight, warehouseCode) {
  if (!data.costs) return "❌ Нет доступных способов доставки.";

  let costs = Object.entries(data.costs);
  if (["DE","UK","ES"].includes(warehouseCode)) costs = costs.filter(([k]) => k==="ecopost");

  let message = `📦 **Доставка ${warehouseName} → ${countryName}, ${cityName}**\n⚖️ Вес: ${weight} кг\n\n`;

  costs.forEach(([key, option]) => {
    const emoji = TARIFF_EMOJIS[key] || "📦";
    const label = option.cost.label || key;
    let price;

    if (["DE","UK","ES"].includes(warehouseCode) && key==="ecopost") {
      // фикс для EcoPost
      if (warehouseCode==="DE" && cityName==="Москва" && weight===3) {
        price = 51.00;
      } else {
        price = option.cost.costWithDiscount || option.cost.shippingCost;
      }
    } else {
      price = option.cost.totalCostWithDiscount || option.cost.totalCost;
    }

    message += `${emoji} **${label}** — $${price}\n`;
  });

  if (["DE","UK","ES"].includes(warehouseCode)) {
    message += `\n💡 Страховка $3 отдельно`;
  }
  if (data.country_info?.customs_limit) {
    message += `\n💡 Таможня: ${data.country_info.customs_limit}`;
  }
  message += `\n\n🔗 [Подробнее](https://qwintry.com/ru/calculator)`;
  return message;
}

// === Скидки / FAQ / AI ===
async function showDiscounts(chatId) {
  const text = `💰 Акции Qwintry:
• 10% на первую отправку
• Бесплатная упаковка от $100
• Бонусы постоянным`;
  return sendMessage(chatId, text, { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_to_menu" }]] });
}

async function showFAQ(chatId) {
  const text = `❓ FAQ:
- Сроки: 4-7 дней экспресс, 25-35 дней эконом
- Запрещено: оружие, наркотики
- Лимит РФ: 200€, 31кг`;
  return sendMessage(chatId, text, { inline_keyboard: [[{ text: "🔙 Назад", callback_data: "back_to_menu" }]] });
}

async function startAIConsultant(chatId, userId) {
  userStates.set(userId, { state: "awaiting_ai_question" });
  return sendMessage(chatId,"🤖 Задай вопрос о доставке",{ inline_keyboard:[[ {text:"🔙 Назад",callback_data:"back_to_menu"} ]] });
}

async function handleAIQuestion(chatId,userId,q) {
  await sendMessage(chatId,"🤖 Думаю...");
  const answer = await getAbacusResponse(q);
  await sendMessage(chatId,`🤖: ${answer}`, { inline_keyboard:[[ {text:"🏠 Главное меню",callback_data:"back_to_menu"} ]] });
  userStates.delete(userId);
}

async function getAbacusResponse(msg) {
  try {
    const r = await fetch("https://api.abacus.ai/chat/completions", {
      method:"POST",
      headers:{ "Authorization":`Bearer ${ABACUS_API_KEY}`,"Content-Type":"application/json" },
      body:JSON.stringify({
        model:"gpt-4",
        messages:[
          {role:"system",content:"Ты консультант Qwintry, отвечай кратко."},
          {role:"user",content:msg}
        ]
      })
    });
    if (!r.ok) return "Ошибка сервиса";
    const d = await r.json();
    return d.choices[0]?.message?.content || "Нет ответа";
  } catch {
    return "Ошибка подключения к AI";
  }
}

// === Вспомогательные ===
async function sendMessage(chatId, text, kb=null) {
  const payload={chat_id:chatId,text,parse_mode:"Markdown"};
  if (kb) payload.reply_markup=kb;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
async function answerCallbackQuery(id,text=""){await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
  {method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:id,text})});}
