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

    // Обработка обычных сообщений
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = (update.message.text || '').trim();

      // Команда /start
      if (text === '/start') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '📦 Калькулятор доставки', callback_data: 'calc' }],
            [{ text: '🤖 AI-консультант', callback_data: 'ai' }],
            [{ text: '💰 Скидки и акции', callback_data: 'discounts' }]
          ]
        };

        await sendMessage(
          chatId,
          '🎉 **Добро пожаловать в Qwintry Bot!**\n\nЯ помогу вам:\n📦 Рассчитать стоимость доставки\n💰 Узнать о скидках и акциях\n🤖 Получить ответы на вопросы\n\nВыберите нужную опцию:',
          keyboard
        );
        return res.status(200).send('OK');
      }

      // Все остальные сообщения → AI-консультант
      await handleAICommand(chatId, text);
    }
    // Обработка нажатий на кнопки (callback_query)
    else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const data = cq.data;

      console.log(`🎯 Callback: ${data}`);
      await answerCallbackQuery(cq.id);

      // Калькулятор
      if (data === 'calc') {
        await handleCalcCommand(chatId);
      }
      // Обработка выбора склада и других действий калькулятора
      else if (data.startsWith('calc_')) {
        await handleCalcCallback(chatId, data);
      }
      // AI-консультант
      else if (data === 'ai') {
        await sendMessage(chatId, '🤖 **AI-консультант Qwintry**\n\nЗадайте любой вопрос о доставке, тарифах, сроках или услугах.\n\n💬 Напишите ваш вопрос:');
      }
      // Скидки (пока заглушка)
      else if (data === 'discounts') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '🔙 Назад в меню', callback_data: 'back_menu' }]
          ]
        };
        await sendMessage(
          chatId,
          '💰 **Скидки и акции Qwintry:**\n\n🎯 **Постоянные скидки:**\n• Скидка за объем отправлений\n• Бонусы за регистрацию\n• Специальные тарифы для постоянных клиентов\n\n🔥 **Текущие акции:**\n• Скидка 10% на первую отправку\n• Бесплатная упаковка при заказе от $100\n• Кэшбэк за отзывы\n\n📱 Актуальные промокоды смотрите на сайте Qwintry.com',
          keyboard
        );
      }
      // Возврат в главное меню
      else if (data === 'back_menu') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '📦 Калькулятор доставки', callback_data: 'calc' }],
            [{ text: '🤖 AI-консультант', callback_data: 'ai' }],
            [{ text: '💰 Скидки и акции', callback_data: 'discounts' }]
          ]
        };
        await sendMessage(chatId, '🏠 **Главное меню**\n\nВыберите нужную опцию:', keyboard);
      }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ Error:', e);
    res.status(200).send('OK');
  }
}
