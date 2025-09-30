// /api/lib/calc.js
import { sendMessage } from './utils.js';

export async function handleCalcCommand(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '🇺🇸 США', callback_data: 'calc_US' }],
      [{ text: '🇩🇪 Германия', callback_data: 'calc_DE' }],
      [{ text: '🇬🇧 UK', callback_data: 'calc_UK' }],
      [{ text: '🇪🇸 Испания', callback_data: 'calc_ES' }],
      [{ text: '🇨🇳 Китай', callback_data: 'calc_CN' }]
    ]
  };
  await sendMessage(chatId, '📦 Выберите склад:', keyboard);
}

export async function handleCalcCallback(chatId, data) {
  if (data.startsWith('calc_')) {
    const warehouse = data.replace('calc_', '');
    await sendMessage(chatId, `📦 Расчёт для склада: ${warehouse}\n\n(Здесь будет табличка EcoPost / тарифы США)`);
  }
}
