// /api/telegram.js
import { sendMessage, answerCallbackQuery } from './lib/utils.js';
import { handleCalcCommand, handleCalcCallback } from './lib/calc.js';
import { handleAICommand } from './lib/ai.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK: use POST');
  }

  try {
    const update = req.body;
    console.log('📨 Update:', JSON.stringify(update, null, 2));

    if (update.message) {
      const chatId = update.message.chat.id;
      const text = (update.message.text || '').trim();

      if (text === '/start') {
        await sendMessage(chatId, '🎉 Привет! Я бот Qwintry. Доступные функции:\n\n📦 Калькулятор\n🤖 AI-консультант\n💰 Скидки (в будущем).');
        return res.status(200).send('OK');
      }

      // AI по-умолчанию: любое сообщение — консультант
      await handleAICommand(chatId, text);
    } 
    else if (update.callback_query) {
      const cq = update.callback_query;
      console.log(`🎯 Callback: ${cq.data}`);
      await answerCallbackQuery(cq.id);

      if (cq.data.startsWith('calc')) {
        await handleCalcCallback(cq.message.chat.id, cq.data);
      }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Error:', e);
    res.status(200).send('OK');
  }
}
