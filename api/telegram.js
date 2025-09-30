import axios from "axios";

const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

export default async function handler(req, res) {
  console.log(">>> BOT ONLINE ✅ Update received:", JSON.stringify(req.body, null, 2));
  
  if (req.method === "POST") {
    const body = req.body;
    
    if (body.message) {
      await handleMessage(body.message);
    } else if (body.callback_query) {
      await handleCallback(body.callback_query);
    }
    return res.status(200).end("ok");
  }
  res.status(200).send("Bot running");
}

// === Отправка сообщений ===
async function sendMessage(chatId, text, replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    };
    
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    
    const response = await axios.post(`${API}/sendMessage`, payload);
    return response.data;
  } catch (error) {
    console.error("Error sending message:", error.response?.data || error.message);
    throw error;
  }
}

// === Главное меню ===
async function sendMainMenu(chatId) {
  const text = `📋 *Главное меню:*

Выберите действие из меню ниже или используйте команды:
• /calc - Калькулятор доставки
• /help - Справка`;

  const inlineButtons = {
    inline_keyboard: [
      [
        { text: "📦 Калькулятор", callback_data: "menu_calc" },
        { text: "ℹ️ Помощь", callback_data: "menu_help" }
      ]
    ]
  };

  await sendMessage(chatId, text, inlineButtons);
}

// === Обработка сообщений ===
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name || "Unknown";

  console.log(`Message from ${username} (${userId}): ${text}`);

  try {
    // ВАЖНО: Сначала проверяем команды, потом уже калькулятор
    if (text === "/start") {
      // Очищаем сессию при старте
      delete sessions[chatId];
      await sendMessage(
        chatId,
        "Привет! Я бот службы доставки Banderolka/Qwintry 📦\n\n" +
          "Задайте мне любой вопрос о доставке, или воспользуйтесь меню ниже:\n\n" +
          "Команды:\n" +
          "/calc - Калькулятор доставки\n" +
          "/help - Справка\n" +
          "/menu - Показать меню"
      );
      await sendMainMenu(chatId);
      return;
    }
    
    if (text === "/menu") {
      delete sessions[chatId];
      await sendMainMenu(chatId);
      return;
    }
    
    if (text === "/help" || text === "ℹ️ Помощь") {
      delete sessions[chatId];
      await sendHelpMessage(chatId);
      return;
    }
    
    if (text === "/calc" || text === "📦 Калькулятор") {
      await startCalc(chatId);
      return;
    }

    // Только если это НЕ команда - обрабатываем как ввод для калькулятора
    if (!text.startsWith("/")) {
      await processUserInput(chatId, text);
    }
    
  } catch (error) {
    console.error("Error handling message:", error);
    await sendMessage(chatId, "⚠️ Произошла ошибка. Попробуйте позже.");
  }
}

// === Обработка inline-кнопок ===
async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;
  const username = query.from.username || query.from.first_name || "Unknown";

  console.log(`Callback from ${username} (${userId}): ${data}`);

  try {
    // Подтверждаем получение callback
    await axios.post(`${API}/answerCallbackQuery`, {
      callback_query_id: query.id,
    });

    if (data === "menu_calc") {
      await startCalc(chatId);
    } else if (data === "menu_help") {
      await sendHelpMessage(chatId);
    }
  } catch (error) {
    console.error("Error handling callback:", error);
    await sendMessage(chatId, "⚠️ Произошла ошибка. Попробуйте позже.");
  }
}

// === Справка ===
async function sendHelpMessage(chatId) {
  const helpText = `ℹ️ *Справка по боту Banderolka/Qwintry*

🚀 *Основные функции:*
• Расчёт стоимости доставки
• Информация о сроках доставки
• Таможенные лимиты и ограничения

📦 *Доступные склады:*
• США (US1) - Делавэр
• Германия (DE1) - Франкфурт
• Великобритания (UK1) - Лондон

🌍 *Страны доставки:*
• Россия (RU)
• Казахстан (KZ)
• Беларусь (BY)
• Украина (UA)

💡 *Как пользоваться:*
1. Нажмите "Калькулятор" или введите /calc
2. Выберите склад отправления (1-3)
3. Выберите страну назначения (1-4)
4. Введите вес посылки в килограммах
5. Получите расчёт стоимости

🔗 *Полезные ссылки:*
• Сайт: https://qwintry.com
• Личный кабинет: https://qwintry.com/login
• Запрещённые товары: https://qwintry.com/ru/forbidden-goods

❓ *Вопросы?* Обратитесь в службу поддержки через сайт.`;

  await sendMessage(chatId, helpText);
}

// === Калькулятор ===
const sessions = {};

async function startCalc(chatId) {
  sessions[chatId] = { step: "from" };
  
  const text = `📦 *Калькулятор доставки*

Выберите склад отправления:
1️⃣ США (US1)
2️⃣ Германия (DE1)  
3️⃣ Великобритания (UK1)

Введите номер (1, 2 или 3):`;

  await sendMessage(chatId, text);
}

async function processUserInput(chatId, text) {
  const session = sessions[chatId];
  if (!session) {
    // Если нет активной сессии калькулятора, показываем меню
    await sendMessage(chatId, "Для начала работы выберите действие:");
    await sendMainMenu(chatId);
    return;
  }

  if (session.step === "from") {
    if (text === "1") session.from = "US1";
    else if (text === "2") session.from = "DE1";
    else if (text === "3") session.from = "UK1";
    else {
      return sendMessage(chatId, "❌ Введите 1, 2 или 3");
    }

    session.step = "to";
    return sendMessage(
      chatId,
      `✅ Склад: ${session.from}

🌍 Выберите страну назначения:
1️⃣ Россия (RU)
2️⃣ Казахстан (KZ)
3️⃣ Беларусь (BY)
4️⃣ Украина (UA)

Введите номер (1, 2, 3 или 4):`
    );
  }

  if (session.step === "to") {
    if (text === "1") session.to = "RU";
    else if (text === "2") session.to = "KZ";
    else if (text === "3") session.to = "BY";
    else if (text === "4") session.to = "UA";
    else {
      return sendMessage(chatId, "❌ Введите 1, 2, 3 или 4");
    }

    session.step = "weight";
    return sendMessage(
      chatId,
      `✅ Маршрут: ${session.from} → ${session.to}

⚖️ Введите вес посылки в килограммах:

Например: 2.5 или 3`
    );
  }

  if (session.step === "weight") {
    const weight = parseFloat(text.replace(",", "."));
    if (isNaN(weight) || weight <= 0) {
      return sendMessage(chatId, "❌ Введите корректный вес в килограммах (например: 2.5)");
    }
    
    if (weight > 30) {
      return sendMessage(chatId, "❌ Максимальный вес для расчёта: 30 кг");
    }

    session.weight = weight;
    session.step = "done";

    await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

    try {
      await doCalc(chatId, session.from, session.to, weight);
    } catch (error) {
      console.error("Calculation error:", error);
      await sendMessage(chatId, "⚠️ Ошибка при расчёте. Попробуйте позже или обратитесь в поддержку.");
    }
    
    delete sessions[chatId];
  }
}

// === Запрос к Qwintry API ===
async function doCalc(chatId, from, to, weight) {
  try {
    console.log(`Calculating: ${from} → ${to}, weight: ${weight}kg`);
    
    const requestData = {
      hub: from,
      country: to,
      weight: weight.toString(),
      dimensions: "1x1x1",
      dimensionsMeasurement: "cm",
      weightMeasurement: "kg",
      itemsCost: "1",
      city: to === "RU" ? "4050" : null,
      zip: to === "RU" ? "100000" : null,
    };

    console.log("API Request:", JSON.stringify(requestData, null, 2));

    const response = await axios.post("https://qwintry.com/api/calculator-cost", requestData, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TelegramBot/1.0",
      },
      timeout: 15000,
    });

    console.log("API Response received successfully");

    if (!response.data || !response.data.costs) {
      throw new Error("Invalid API response structure");
    }

    await formatAndSendResults(chatId, response.data, from, to, weight);

  } catch (error) {
    console.error("Calculation error:", error.response?.data || error.message);
    
    if (error.code === "ECONNABORTED") {
      await sendMessage(chatId, "⚠️ Превышено время ожидания ответа от сервера. Попробуйте позже.");
    } else if (error.response?.status === 429) {
      await sendMessage(chatId, "⚠️ Слишком много запросов. Подождите немного и попробуйте снова.");
    } else if (error.response?.status >= 500) {
      await sendMessage(chatId, "⚠️ Сервер временно недоступен. Попробуйте позже.");
    } else {
      await sendMessage(chatId, "⚠️ Ошибка при расчёте стоимости. Проверьте данные и попробуйте снова.");
    }
  }
}

// === Форматирование результатов ===
async function formatAndSendResults(chatId, data, from, to, weight) {
  try {
    let message = `📦 *Стоимость доставки*\n`;
    message += `📍 Маршрут: ${from} → ${to}\n`;
    message += `⚖️ Вес: ${weight} кг\n\n`;

    const costs = data.costs || {};
    let methodCount = 1;

    // Обрабатываем каждый метод доставки
    for (const [methodKey, methodData] of Object.entries(costs)) {
      if (!methodData || !methodData.cost) continue;

      const cost = methodData.cost;
      const label = cost.label || methodKey;
      const shippingCost = cost.shippingCost || cost.costWithDiscount || 0;
      const totalCost = cost.totalCost || cost.totalCostWithDiscount || 0;
      const days = methodData.days || "Уточняется";
      
      // Очищаем описание от HTML тегов
      let description = methodData.description || "";
      description = description.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (description.length > 80) {
        description = description.substring(0, 80) + "...";
      }

      message += `${methodCount}. *${label}*\n`;
      message += `💰 Доставка: $${shippingCost}\n`;
      message += `💳 Итого: $${totalCost.toFixed(2)}\n`;
      message += `⏰ Срок: ${days}\n`;
      if (description) {
        message += `ℹ️ ${description}\n`;
      }
      message += `\n`;
      
      methodCount++;
    }

    // Добавляем информацию о таможне
    if (data.country_info && data.country_info.customs_limit) {
      message += `---\n`;
      message += `ℹ️ *Таможня:* ${data.country_info.customs_limit}\n`;
    }

    // Добавляем информацию о хранении
    if (data.hubData && data.hubData.storage) {
      const storage = data.hubData.storage;
      message += `📦 *Склад ${data.hubData.hub}:* бесплатное хранение ${storage.freeStorageDays} дней`;
      if (storage.subscriberFreeStorageDays && storage.subscriberFreeStorageDays > storage.freeStorageDays) {
        message += ` (до ${storage.subscriberFreeStorageDays} для подписчиков)`;
      }
      message += `\n`;
    }

    // Добавляем количество пунктов выдачи
    if (data.pickup_points) {
      message += `📍 Доступно пунктов выдачи: ${data.pickup_points}`;
    }

    await sendMessage(chatId, message);

    // Предлагаем новый расчёт
    const newCalcButton = {
      inline_keyboard: [
        [{ text: "🔄 Новый расчёт", callback_data: "menu_calc" }]
      ]
    };

    await sendMessage(chatId, "Хотите сделать ещё один расчёт?", newCalcButton);

  } catch (error) {
    console.error("Error formatting results:", error);
    await sendMessage(chatId, "⚠️ Ошибка при обработке результатов.");
  }
}
