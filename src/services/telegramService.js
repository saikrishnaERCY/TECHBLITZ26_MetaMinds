const TelegramBot = require('node-telegram-bot-api');

let bot;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: process.env.RENDER !== 'true'
    });
  }
  return bot;
}

const CC_CHAT_ID = () => process.env.TELEGRAM_CC_CHAT_ID;

const intentEmoji = { high: '🔥', medium: '⚡', low: '❄️' };
const sourceEmoji = { instagram: '📸', facebook: '📘', whatsapp: '💬', website: '🌐', youtube: '▶️', manual: '📝' };

async function notifyNewLead(lead, aiScore) {
  const bot = getBot();
  const emoji = intentEmoji[aiScore.intent] || '⚡';
  const src = sourceEmoji[lead.source] || '📩';

  const text = `
🔔 *NEW LEAD* ${src} ${lead.source.toUpperCase()}
━━━━━━━━━━━━━━━
👤 *Name:* ${lead.name || 'Unknown'}
📱 *Phone:* ${lead.phone || 'Not provided'}
💬 *Message:* _${lead.message}_

🎯 *Interest:* ${aiScore.interest}
${emoji} *Score:* ${aiScore.score}/10 (${aiScore.intent.toUpperCase()})
📊 *Reason:* ${aiScore.scoreReason}

🤖 *AI will reply:*
_"${aiScore.suggestedReply}"_
━━━━━━━━━━━━━━━
ID: \`${lead._id}\`
`;

  const keyboard = {
  inline_keyboard: [
    [
      { text: '⏸️ PAUSE AI', callback_data: `pause_${lead._id}` },
      { text: '❌ REJECT', callback_data: `reject_${lead._id}` }
    ],
    [
      { text: '👨‍💼 TAKE OVER', callback_data: `takeover_${lead._id}` },
      { text: '✅ CONVERTED', callback_data: `converted_${lead._id}` }
    ]
  ]
};

  const msg = await bot.sendMessage(CC_CHAT_ID(), text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });

  return msg.message_id;
}

async function notifyKeyEvent(lead, eventType, details) {
  const bot = getBot();

  const events = {
    arrange_call: `📞 *CALL REQUESTED*\n${lead.name} wants a call!\nPhone: ${lead.phone || 'not provided'}`,
    show_pricing: `💰 *PRICING REQUESTED*\n${lead.name} asked for pricing.`,
    transfer_human: `👨‍💼 *HUMAN REQUESTED*\n${lead.name} wants to speak to a human! Take over now.`,
    high_intent_message: `🔥 *HOT LEAD!*\n${lead.name} said:\n_"${details}"_`,
    follow_up_sent: `📨 Follow-up #${lead.followUpCount} sent to ${lead.name}`
  };

  const text = events[eventType] || `📌 Update on ${lead.name}: ${details}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '⏸️ PAUSE AI', callback_data: `pause_${lead._id}` },
        { text: '▶️ RESUME AI', callback_data: `resume_${lead._id}` }
      ],
      [
        { text: '👨‍💼 TAKE OVER', callback_data: `takeover_${lead._id}` },
        { text: '✅ CONVERTED', callback_data: `converted_${lead._id}` }
      ]
    ]
  };

  await bot.sendMessage(CC_CHAT_ID(), text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function sendToCC(text) {
  const bot = getBot();
  await bot.sendMessage(CC_CHAT_ID(), text, { parse_mode: 'Markdown' });
}

async function answerCallback(callbackQueryId, text) {
  const bot = getBot();
  await bot.answerCallbackQuery(callbackQueryId, { text });
}

async function editMessage(messageId, text) {
  const bot = getBot();
  try {
    await bot.editMessageText(text, {
      chat_id: CC_CHAT_ID(),
      message_id: messageId,
      parse_mode: 'Markdown'
    });
  } catch (e) {}
}

module.exports = { getBot, notifyNewLead, notifyKeyEvent, sendToCC, answerCallback, editMessage };