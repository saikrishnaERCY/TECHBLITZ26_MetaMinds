const Lead = require('../models/Lead');
const { continueConversation, generateFollowUp } = require('./aiService');
const { notifyKeyEvent, sendToCC } = require('./telegramService');

const HIGH_INTENT_KEYWORDS = ['buy', 'purchase', 'price', 'cost', 'how much', 'payment', 'urgent', 'today', 'ready', 'confirm', 'book'];

async function handleCustomerMessage(leadId, customerMessage) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error('Lead not found');

  lead.conversationHistory.push({ role: 'user', content: customerMessage });
  lead.addActivity('customer_message', customerMessage.substring(0, 100));

  if (lead.aiPaused) {
    await sendToCC(`💬 *Message from ${lead.name}* (AI paused):\n_"${customerMessage}"_`);
    await lead.save();
    return null;
  }

  const isHighIntent = HIGH_INTENT_KEYWORDS.some(kw => customerMessage.toLowerCase().includes(kw));
  const aiReply = await continueConversation(lead, customerMessage);
  lead.conversationHistory.push({ role: 'assistant', content: aiReply });
  lead.addActivity('ai_replied', aiReply.substring(0, 100));
  await lead.save();

  if (isHighIntent) await notifyKeyEvent(lead, 'high_intent_message', customerMessage);

  return aiReply;
}

async function handleCustomerAction(leadId, action) {
  const lead = await Lead.findById(leadId);
  if (!lead) throw new Error('Lead not found');

  let reply = '';

  switch (action) {
    case 'arrange_call':
      reply = `📞 I'll let our team know you'd like a call! Someone will reach out shortly. Preferred time — morning or evening?`;
      await notifyKeyEvent(lead, 'arrange_call', '');
      lead.addActivity('call_requested', 'Customer requested a call');
      break;
    case 'show_pricing':
      reply = `💰 Our team will send you a personalized quote for *${lead.interest || 'your interest'}* shortly!`;
      await notifyKeyEvent(lead, 'show_pricing', '');
      lead.addActivity('pricing_requested', 'Customer asked for pricing');
      break;
    case 'transfer_human':
      reply = `👨‍💼 Connecting you with our team now. Please wait a moment!`;
      await notifyKeyEvent(lead, 'transfer_human', '');
      lead.aiPaused = true;
      lead.addActivity('transferred', 'Customer requested human');
      break;
    case 'stop_ai':
      reply = `Got it! I'll pause here. Message us anytime 😊`;
      lead.aiPaused = true;
      lead.addActivity('ai_paused_by_customer', 'Customer paused AI');
      break;
    default:
      reply = `Thanks! Our team will get back to you shortly.`;
  }

  await lead.save();
  return reply;
}

async function runFollowUps() {
  const now = new Date();
  const leads = await Lead.find({
    status: { $in: ['approved', 'active'] },
    aiPaused: false,
    followUpCount: { $lt: 3 },
    $or: [
      { nextFollowUp: { $lte: now } },
      { nextFollowUp: null, updatedAt: { $lte: new Date(now - 24 * 60 * 60 * 1000) } }
    ]
  });

  for (const lead of leads) {
    try {
      const msg = await generateFollowUp(lead);
      lead.followUpCount += 1;
      lead.lastFollowUp = now;
      lead.nextFollowUp = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      lead.conversationHistory.push({ role: 'assistant', content: msg });
      lead.addActivity('follow_up_sent', `Follow-up #${lead.followUpCount}`);
      await lead.save();
      await notifyKeyEvent(lead, 'follow_up_sent', '');
    } catch (err) {
      console.error(`Follow-up error for ${lead._id}:`, err.message);
    }
  }
}

module.exports = { handleCustomerMessage, handleCustomerAction, runFollowUps };