import axios from "axios";

const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

export default async function handler(req, res) {
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

async function sendMessage(chatId, text, replyMarkup = null) {
  await axios.post(`${API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: replyMarkup,
  });
}

// === Главное меню ===
async function sendMainMenu(chatId) {
  const text = `📋 *Главное меню:*

Выберите действие:`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "📦 Калькулятор доставки", callback_data: "menu_calc" },
        { text: "ℹ️ Помощь", callback_data: "menu_help" },
      ],
    ],
  };
  await sendMessage(chatId, text, keyboard);
}

// === Обработка сообщений ===
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text === "/start") {
    await sendMessage(
      chatId,
      "Привет! Я бот службы доставки Banderolka/Qwintry 📦\n\n" +
        "Команды:\n/menu – Главное меню\n/calc – Калькулятор\n/help – Справка"
    );
    await sendMainMenu(chatId);
  } else if (text === "/menu") {
    await sendMainMenu(chatId);
  } else if (text === "/help") {
    await sendMessage(
      chatId,
      "ℹ️ *Справка*\n\n" +
        "Я помогу рассчитать доставку 📦\n\n" +
        "Воспользуйтесь калькулятором в меню."
    );
  } else if (text === "/calc") {
    await startCalc(chatId);
  } else {
    // Ответ на цифры выбора
    await processUserInput(chatId, text);
  }
}

// === Обработка inline-кнопок ===
async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "menu_calc") {
    await startCalc(chatId);
  } else if (data === "menu_help") {
    await sendMessage(
      chatId,
      "ℹ️ *Справка*\n\n" +
        "Я помогу рассчитать доставку 📦\n\n" +
        "Воспользуйтесь калькулятором в меню."
    );
  }
}

// === Калькулятор ===
const sessions = {};

async function startCalc(chatId) {
  sessions[chatId] = { step: "from" };
  const text = `📦 *Калькулятор доставки*

Выберите склад отправления:
1️⃣ США (US1)
2️⃣ Германия (DE1)
3️⃣ Великобритания (UK1)`;

  await sendMessage(chatId, text);
}

async function processUserInput(chatId, text) {
  const session = sessions[chatId];
  if (!session) return;

  if (session.step === "from") {
    if (text === "1") session.from = "US1";
    else if (text === "2") session.from = "DE1";
    else if (text === "3") session.from = "UK1";
    else return sendMessage(chatId, "❌ Введите 1, 2 или 3");

    session.step = "to";
    return sendMessage(
      chatId,
      `✅ Склад: ${session.from}\n\n🌍 Выберите страну назначения:\n1️⃣ Россия (RU)\n2️⃣ Казахстан (KZ)\n3️⃣ Беларусь (BY)\n4️⃣ Украина (UA)`
    );
  }

  if (session.step === "to") {
    if (text === "1") session.to = "RU";
    else if (text === "2") session.to = "KZ";
    else if (text === "3") session.to = "BY";
    else if (text === "4") session.to = "UA";
    else return sendMessage(chatId, "❌ Введите 1, 2, 3 или 4");

    session.step = "weight";
    return sendMessage(
      chatId,
      `✅ Маршрут: ${session.from} → ${session.to}\n\n⚖️ Введите вес посылки в килограммах (например: 2.5)`
    );
  }

  if (session.step === "weight") {
    const weight = parseFloat(text);
    if (isNaN(weight) || weight <= 0) {
      return sendMessage(chatId, "❌ Введите число – вес посылки в кг");
    }
    session.weight = weight;
    session.step = "done";

    await sendMessage(chatId, "⏳ Рассчитываю стоимость доставки...");

    await doCalc(chatId, session.from, session.to, weight);
    delete sessions[chatId];
  }
}

// === Запрос к Qwintry API ===
async function doCalc(chatId, from, to, weight) {
  try {
    const resp = await axios.post("https://qwintry.com/api/calculator-cost", {
      hub: from,
      country: to,
      weight: weight,
      dimensions: "1x1x1",
    });

    let msg = `📦 *Стоимость доставки*\nМаршрут: ${from} → ${to}\nВес: ${weight} кг\n\n`;

    for (const [method, info] of Object.entries(resp.data.costs)) {
      const c = info.cost;
      msg += `*${c.label}*\n` +
             `💰 Доставка: $${c.shippingCost}\n` +
             `💳 Итого: $${c.totalCost.toFixed(2)}\n` +
             `⏰ Срок: ${info.days}\n` +
             `ℹ️ ${info.description.replace(/<[^>]+>/g, '')}\n\n`;
    }

    msg += `---\nℹ️ Таможня: ${resp.data.country_info.customs_limit}\n`;
    msg += `📦 Бесплатное хранение: ${resp.data.hubData.storage.freeStorageDays} дней`;

    await sendMessage(chatId, msg);
  } catch (e) {
    console.error("Calc error:", e.response?.data || e.message);
    await sendMessage(chatId, "⚠️ Ошибка при расчёте. Попробуйте позже.");
  }
}
