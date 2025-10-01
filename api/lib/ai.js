// /api/lib/ai.js
import { sendMessage } from './utils.js';

const APPS_GET_CHAT_URL = 'https://apps.abacus.ai/api/getChatResponse';
const DEPLOYMENT_ID = process.env.ABACUS_DEPLOYMENT_ID || '1413dbc596';
const ABACUS_DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;

// Хранилище истории диалогов: { chatId: [ {is_user: true, text: "..."}, ... ] }
const sessions = {};
const MAX_HISTORY = 20; // Храним последние 20 сообщений (10 пар вопрос-ответ)

export async function handleAICommand(chatId, userText) {
  try {
    // Инициализируем сессию, если её нет
    if (!sessions[chatId]) {
      sessions[chatId] = [];
    }

    // Добавляем сообщение пользователя в историю
    sessions[chatId].push({ is_user: true, text: userText });

    // Ограничиваем размер истории (чтобы не раздувать запросы)
    if (sessions[chatId].length > MAX_HISTORY) {
      sessions[chatId] = sessions[chatId].slice(-MAX_HISTORY);
    }

    const url = `${APPS_GET_CHAT_URL}?deploymentToken=${encodeURIComponent(ABACUS_DEPLOYMENT_TOKEN)}&deploymentId=${encodeURIComponent(DEPLOYMENT_ID)}`;

    const body = {
      messages: sessions[chatId], // Отправляем всю историю
      conversationId: String(chatId),
      userId: String(chatId)
    };

    console.log('🔵 Calling Abacus with history length:', sessions[chatId].length);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const raw = await resp.text();
    console.log('🔵 Abacus status:', resp.status, raw.slice(0, 400));

    let reply = 'Извините, не удалось получить ответ.';
    
    if (resp.ok) {
      try {
        const data = JSON.parse(raw || '{}');

        reply =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          reply;

        // Формат с массивом messages
        if (!data?.responseText && data?.result?.messages?.length) {
          const lastAssistant = [...data.result.messages]
            .reverse()
            .find(m => m && m.is_user === false && typeof m.text === 'string');
          if (lastAssistant?.text) reply = lastAssistant.text;
        }

        if (!reply || typeof reply !== 'string' || !reply.trim()) {
          reply = 'Извините, не удалось получить ответ.';
        }
      } catch (e) {
        console.error('❌ JSON parse error:', e);
      }
    } else {
      console.error('❌ Abacus non-OK', resp.status, raw.slice(0, 500));
    }

    // Добавляем ответ бота в историю
    sessions[chatId].push({ is_user: false, text: reply });

    // Ограничиваем снова после добавления ответа
    if (sessions[chatId].length > MAX_HISTORY) {
      sessions[chatId] = sessions[chatId].slice(-MAX_HISTORY);
    }

    await sendMessage(chatId, `🤖 ${reply}`);
  } catch (e) {
    console.error('❌ AI error:', e);
    await sendMessage(chatId, 'Извините, не получилось получить ответ.');
  }
}

// Опционально: функция для очистки истории (можно вызывать по команде /clear)
export function clearHistory(chatId) {
  if (sessions[chatId]) {
    delete sessions[chatId];
    console.log(`🗑️ История для chatId ${chatId} очищена`);
  }
}
