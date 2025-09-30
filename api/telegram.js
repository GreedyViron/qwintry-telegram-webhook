// === QWINTRY TELEGRAM BOT ===
// Финальная версия с меню + калькулятором (state-machine)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

const userStates = {}; // сохраняем состояние диалога по chatId

// Главное меню
function mainMenu() {
  return {
    keyboard: [
      [{ text: "📦 Калькулятор" }],
      [{ text: "💸 Скидки" }, { text: "ℹ️ FAQ" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// Webhook обработчик
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body;

  if (!body.message) return res.status(200).end();

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  console.log("📩 Incoming:", chatId, text);

  // Команда старт
  if (text === "/start") {
    await sendMessage(
      chatId,
      "👋 Здравствуйте! Я бот‑помощник Бандерольки.\n\n" +
        "💬 Вы можете задать мне любой вопрос напрямую или воспользоваться меню ниже.",
      mainMenu()
    );
    return res.status(200).end();
  }

  // Команда помощи
  if (text === "/help") {
    await sendMessage(
      chatId,
      "📖 Помощь:\n\n" +
        "Вы можете:\n" +
        "• Использовать меню (калькулятор, скидки, FAQ)\n" +
        "• Спросить напрямую — я попробую ответить 😉"
    );
    return res.status(200).end();
  }

  // Проверяем состояние юзера
  const state = userStates[chatId]?.state;

  // Запуск калькулятора
  if (text === "📦 Калькулятор" || text === "/calc") {
    userStates[chatId] = { state: "awaiting_hub" };
    await sendMessage(
      chatId,
      "🏢 Выберите склад отправления:",
      {
        keyboard: [
          [{ text: "🇺🇸 США" }, { text: "🇩🇪 Германия" }, { text: "🇨🇳 Китай" }],
          [{ text: "❌ Отмена" }]
        ],
        resize_keyboard: true
      }
    );
    return res.status(200).end();
  }

  // === State machine для калькулятора ===
  if (state === "awaiting_hub") {
    let hubCode = null;
    if (/сша|usa/i.test(text)) hubCode = "US1";
    if (/герм|germ/i.test(text)) hubCode = "DE1";
    if (/кит/i.test(text)) hubCode = "CN1";

    if (!hubCode) {
      await sendMessage(chatId, "❌ Пожалуйста, выберите склад: США, Германия или Китай");
      return res.status(200).end();
    }

    userStates[chatId] = { state: "awaiting_country", hubCode };
    await sendMessage(chatId, "🌍 Введите страну назначения (например: Россия)");
    return res.status(200).end();
  }

  if (state === "awaiting_country") {
    const country = text.trim();
    userStates[chatId].country = country;
    userStates[chatId].state = "awaiting_city";
    await sendMessage(chatId, "🏙 Введите город назначения (например: Москва)");
    return res.status(200).end();
  }

  if (state === "awaiting_city") {
    const city = text.trim();
    userStates[chatId].city = city;
    userStates[chatId].state = "awaiting_weight";
    await sendMessage(chatId, "⚖️ Введите вес посылки в кг (например: 2.5)");
    return res.status(200).end();
  }

  if (state === "awaiting_weight") {
    const weight = parseFloat(text.replace(",", "."));
    if (isNaN(weight) || weight <= 0) {
      await sendMessage(chatId, "❌ Укажите корректный вес (например: 1.5)");
      return res.status(200).end();
    }

    const { hubCode, country, city } = userStates[chatId];
    delete userStates[chatId]; // сброс стейта

    await sendMessage(chatId, "⏳ Считаю стоимость доставки...");

    // Вызов калькулятора
    const result = await calculateDelivery(hubCode, country, city, weight);

    if (result.success) {
      await sendMessage(chatId, formatResult(result.data, country, city, weight));
    } else {
      await sendMessage(
        chatId,
        "❌ Не удалось рассчитать доставку.\n" +
          "Причина: " +
          result.error +
          "\n\n👉 Попробуйте на сайте: https://qwintry.com/ru/calculator"
      );
    }
    return res.status(200).end();
  }

  // Если не калькулятор → отвечаем через Abacus AI
  if (text && !text.startsWith("/")) {
    const reply = await getAbacusAnswer(text);
    await sendMessage(chatId, reply, mainMenu());
  }

  return res.status(200).end();
}

// === Расчет доставки через Qwintry API ===
async function calculateDelivery(hubCode, country, city, weight) {
  try {
    const params = new URLSearchParams({
      hubCode,
      weight: weight.toString(),
      weightMeasurement: "kg",
      country,
      city,
      dimensions: "1x1x1",
      dimensionsMeasurement: "cm"
    });

    const res = await fetch("https://q3-api.qwintry.com/ru/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.costs) throw new Error("Нет доступных тарифов");

    return { success: true, data };
  } catch (err) {
    console.error("❌ API error:", err);
    return { success: false, error: err.message };
  }
}

// === Форматирование результата ===
function formatResult(data, country, city, weight) {
  let msg = `📦 Доставка → ${country}, ${city}\n⚖️ Вес: ${weight} кг\n\n`;

  for (const [key, opt] of Object.entries(data.costs)) {
    if (!opt.cost) continue;
    const name = opt.cost.label || key;
    const price = opt.cost.totalCostWithDiscount || opt.cost.totalCost;
    const cur = opt.cost.currency || "$";
    const days = opt.days || "-";
    msg += `• ${name} — ${cur}${price} (${days} дней)\n`;
  }
  return msg;
}

// === Abacus AI ответы ===
async function getAbacusAnswer(message) {
  try {
    const res = await fetch("https://api.abacus.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ABACUS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "Ты консультант Qwintry." },
          { role: "user", content: message }
        ]
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices[0].message.content || "Извините, ответа нет 😔";
    }
  } catch (err) {
    console.error("❌ Abacus error:", err);
  }
  return "Извините, сервис временно недоступен.";
}

// === Отправка сообщения в Telegram ===
async function sendMessage(chatId, text, keyboard = null) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: keyboard
      })
    });
  } catch (err) {
    console.error("❌ Telegram send error:", err);
  }
}
