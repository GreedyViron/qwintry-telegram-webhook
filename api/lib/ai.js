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

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    let reply = 'Извините, сервис временно недоступен.';
    if (resp.ok) {
      const data = await resp.json();
      reply =
        data?.responseText ||
        data?.text ||
        data?.response ||
        data?.choices?.[0]?.message?.content ||
        reply;
    }

    await sendMessage(chatId, `🤖 ${reply}`);
  } catch (e) {
    console.error('❌ AI error:', e);
    await sendMessage(chatId, 'Извините, не получилось получить ответ.');
  }
}
