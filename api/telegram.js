// === QWINTRY TELEGRAM BOT ===
// Финальная версия: меню + калькулятор (state-machine) + Abacus AI ответы

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ABACUS_API_KEY = process.env.ABACUS_API_KEY;

const userStates = {}; // сохраняем состояние пользователя

// Главное меню
function mainMenu() {
  return {
    keyboard: [
      [{ text: "📦 Калькулятор" }],
      [{ text: "💸 Скидки" }, { text: "ℹ️ FAQ" }]
    ],
    resize_keyboard: true
  };
}

// Webhook обработчик
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = req.body;

  if (!body.message) return res.status(200).end();

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  console.log("📩 Сообщение:", chatId, text);

  // === Команды ===
  if (text === "/start") {
    await sendMessage(
      chatId,
      "👋 Здравствуйте! Я бот‑помощник Бандерольки.\n\n" +
        "💬 Вы можете задать мне любой вопрос напрямую или воспользоваться меню ниже.",
      mainMenu()
    );
    return res.status(200).end();
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      "📖 Помощь:\n\n" +
        "• `📦 Калькулятор` — расчёт доставки\n" +
        "• `💸 Скидки` — спец. предложения\n" +
        "• `ℹ️ FAQ` — часто задаваемые вопросы\n\n" +
        "Или просто задайте вопрос в чат 😉",
      mainMenu()
    );
    return res.status(200).end();
  }

  // === Запуск калькулятора ===
  if (text === "📦 Калькулятор" || text === "/calc") {
    userStates[chatId] = { state: "awaiting_hub" };
    await sendMessage(
      chatId,
      "🏢 Выберите склад отправления:\n\n1️⃣ США (US1)\n2️⃣ Германия (DE1)\n3️⃣ Китай (CN1)",
      {
        keyboard: [
          [{ text: "1️⃣ США" }, { text: "2️⃣ Германия" }, { text: "3️⃣ Китай" }],
          [{ text: "❌ Отмена" }]
        ],
        resize_keyboard: true
      }
    );
    return res.status(200).end();
  }

  // === Обработка состояний калькулятора ===
  const state = userStates[chatId]?.state;

  if (state === "awaiting_hub") {
    let hub = null;
    if (text.includes("1") || /сша/i.test(text)) hub = "US1";
    else if (text.includes("2") || /герм/i.test(text)) hub = "DE1";
    else if (text.includes("3") || /кит/i.test(text)) hub = "CN1";

    if (!hub) {
      await sendMessage(chatId, "❌ Выберите склад: 1️⃣ США, 2️⃣ Германия, 3️⃣ Китай");
      return res.status(200).end();
    }
    userStates[chatId] = { state: "awaiting_country", hubCode: hub };
    await sendMessage(chatId, "🌍 Введите страну назначения (например: Россия)");
    return res.status(200).end();
  }

  if (state === "awaiting_country") {
    userStates[chatId].country = text;
    userStates[chatId].state = "awaiting_city";
    await sendMessage(chatId, "🏙 Введите город назначения (например: Москва)");
    return res.status(200).end();
  }

  if (state === "awaiting_city") {
    userStates[chatId].city = text;
    userStates[chatId].state = "awaiting_weight";
    await sendMessage(chatId, "⚖️ Введите вес посылки (например: 2.5)");
    return res.status(200).end();
  }

  if (state === "awaiting_weight") {
    const weight = parseFloat(text.replace(",", "."));
    if (isNaN(weight) || weight <= 0) {
      await sendMessage(chatId, "❌ Укажите корректный вес (например: 1.5)");
      return res.status(200).end();
    }

    const { hubCode, country, city } = userStates[chatId];
    delete userStates[chatId]; // очищаем state

    await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

    const result = await calculateDelivery(hubCode, country, city, weight);

    if (result.success) {
      await sendMessage(
        chatId,
        formatResult(result.data, country, city, weight),
        mainMenu()
      );
    } else {
      await sendMessage(
        chatId,
        "❌ Не удалось рассчитать доставку.\nПричина: " +
          result.error +
          "\n\n👉 Попробуйте здесь: https://qwintry.com/ru/calculator",
        mainMenu()
      );
    }
    return res.status(200).end();
  }

  // === Если не калькулятор → Abacus AI ===
  if (text && !text.startsWith("/")) {
    const reply = await getAbacusAnswer(text);
    await sendMessage(chatId, reply, mainMenu());
  }

  return res.status(200).end();
}

// === Вызов API Qwintry ===
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

// === Форматируем результат ===
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

// === Abacus AI ===
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

// === Telegram Send ===
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
