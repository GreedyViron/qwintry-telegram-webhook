// /api/lib/utils.js 
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Клавиатура с кнопкой "Главное меню"
export const mainMenuKeyboard = {
  keyboard: [
    [{ text: '🏠 Главное меню' }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

export async function sendMessage(chatId, text, keyboard = mainMenuKeyboard) {
  try {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: keyboard  // 🚀 Теперь по умолчанию всегда mainMenuKeyboard
    };

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('❌ sendMessage error:', e);
  }
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (e) {
    console.error('❌ answerCallbackQuery error:', e);
  }
}
