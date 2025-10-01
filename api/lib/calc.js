// /api/lib/calc.js
import { sendMessage } from './utils.js';

// === EcoPost таблица для Европы (пример: DE -> Москва) ===
const ECOPост_PRICES = {
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
  const weights = Object.keys(ECOPост_PRICES).map(Number).sort((a,b)=>a-b);
  const nearest = weights.find(w => w >= weight) || 30;
  return ECOPост_PRICES[nearest];
}

// === США тарифы (подставим примерные данные; можно будет расширить) ===
const US_TARIFFS = {
  flash: { name: "Flash", pricePerKg: 20, days: "7–10" },
  economy: { name: "Economy", pricePerKg: 15, days: "12–20" },
  air: { name: "Air", pricePerKg: 25, days: "5–8" },
  smart: { name: "Smart", pricePerKg: 30, days: "7–14" }
};

// === Китай тарифы ===
const CN_TARIFFS = {
  optima: { name: "Flash Optima", pricePerKg: 18, days: "10–20" },
  ultra: { name: "Flash Ultra", pricePerKg: 25, days: "7–14" }
};

export async function handleCalcCommand(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🇺🇸 США', callback_data: 'calc_US' }],
      [{ text: '🇩🇪 Германия', callback_data: 'calc_DE' }],
      [{ text: '🇬🇧 UK', callback_data: 'calc_UK' }],
      [{ text: '🇪🇸 Испания', callback_data: 'calc_ES' }],
      [{ text: '🇨🇳 Китай', callback_data: 'calc_CN' }],
      [{ text: '🔙 Назад в меню', callback_data: 'back_menu' }]
    ]
  };
  await sendMessage(chatId, '📦 Выберите склад:', keyboard);
}

export async function handleCalcCallback(chatId, data) {
  if (data.startsWith('calc_')) {
    const warehouse = data.replace('calc_', '');

    if (warehouse === 'DE' || warehouse === 'UK' || warehouse === 'ES') {
      await sendMessage(
        chatId,
        `🇪🇺 **EcoPost (Qwintry Economy)**\n\nВведите вес посылки в кг (например: \`3\`)`
      );
      // Запоминаем состояние можно сделать позже (мэп users), пока просто вывод пашет
    }

    if (warehouse === 'US') {
      let msg = `🇺🇸 **Тарифы США:**\n\n`;
      for (const key in US_TARIFFS) {
        const t = US_TARIFFS[key];
        msg += `📦 *${t.name}* — ~$${t.pricePerKg}/кг, срок: ${t.days}\n`;
      }
      await sendMessage(chatId, msg);
    }

    if (warehouse === 'CN') {
      let msg = `🇨🇳 **Тарифы Китай:**\n\n`;
      for (const key in CN_TARIFFS) {
        const t = CN_TARIFFS[key];
        msg += `📦 *${t.name}* — ~$${t.pricePerKg}/кг, срок: ${t.days}\n`;
      }
      await sendMessage(chatId, msg);
    }
  }
}
