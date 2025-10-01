// /api/lib/ai.js
import { sendMessage } from './utils.js';

const APPS_GET_CHAT_URL = 'https://apps.abacus.ai/api/getChatResponse';
const DEPLOYMENT_ID = process.env.ABACUS_DEPLOYMENT_ID || '1413dbc596';
const ABACUS_DEPLOYMENT_TOKEN = process.env.ABACUS_DEPLOYMENT_TOKEN;

export async function handleAICommand(chatId, userText) {
  try {
    const url = `${APPS_GET_CHAT_URL}?deploymentToken=${encodeURIComponent(ABACUS_DEPLOYMENT_TOKEN)}&deploymentId=${encodeURIComponent(DEPLOYMENT_ID)}`;

    const body = {
      messages: [{ is_user: true, text: userText }],
      conversationId: String(chatId),
      userId: String(chatId)
    };

    console.log('🔵 Calling Abacus URL:', url);

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

        // Пробуем все возможные поля (как в старом коде)
        reply =
          data?.responseText ||
          data?.text ||
          data?.response ||
          data?.message ||
          data?.choices?.[0]?.message?.content ||
          data?.result?.text ||
          reply;

        // Формат с массивом messages (важно!)
        if (!data?.responseText && data?.result?.messages?.length) {
          const lastAssistant = [...data.result.messages]
            .reverse()
            .find(m => m && m.is_user === false && typeof m.text === 'string');
          if (lastAssistant?.text) reply = lastAssistant.text;
        }

        // Защита от пустой строки
        if (!reply || typeof reply !== 'string' || !reply.trim()) {
          reply = 'Извините, не удалось получить ответ.';
        }
      } catch (e) {
        console.error('❌ JSON parse error:', e);
      }
    } else {
      console.error('❌ Abacus non-OK', resp.status, raw.slice(0, 500));
    }

    await sendMessage(chatId, `🤖 ${reply}`);
  } catch (e) {
    console.error('❌ AI error:', e);
    await sendMessage(chatId, 'Извините, не получилось получить ответ.');
  }
}
