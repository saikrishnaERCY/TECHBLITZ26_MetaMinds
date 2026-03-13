const Lead = require('../models/Lead');
const { getBot, answerCallback, editMessage, sendToCC } = require('../services/telegramService');

const pendingNotes = {};

function initTelegramHandlers() {
  const bot = getBot();

  bot.on('callback_query', async (query) => {
    const parts = query.data.split('_');
    const action = parts[0];
    const leadId = parts.slice(1).join('_');

    try {
      const lead = await Lead.findById(leadId);
      if (!lead) return await answerCallback(query.id, '❌ Lead not found');

      switch (action) {
        case 'approve': {
  const { sendLeadConfirmationEmail } = require('../services/emailService');
  const { sendApprovalMessage } = require('../services/whatsappService');
  lead.status = 'active';
  lead.addActivity('approved', 'CC approved');
  await lead.save();
  await answerCallback(query.id, '✅ Approved! Sending WhatsApp + Email now...');
  await editMessage(query.message.message_id, 
    `✅ *APPROVED* — ${lead.name} (${lead.source})\n📱 WhatsApp + 📧 Email sent!\nAI is handling conversation.`
  );
  // Send AFTER approval
  await Promise.allSettled([
    sendApprovalMessage(lead),
    sendLeadConfirmationEmail(lead)
  ]);
  break;
}

        case 'reject':
          lead.status = 'rejected';
          lead.addActivity('rejected', 'CC rejected');
          await lead.save();
          await answerCallback(query.id, '❌ Rejected.');
          await editMessage(query.message.message_id, `❌ *REJECTED* — ${lead.name} (${lead.source})`);
          break;

        case 'pause':
          lead.aiPaused = true;
          lead.addActivity('ai_paused', 'CC paused AI');
          await lead.save();
          await answerCallback(query.id, '⏸️ AI Paused');
          await sendToCC(`⏸️ AI paused for *${lead.name}*. You are in control.`);
          break;

        case 'resume':
          lead.aiPaused = false;
          lead.addActivity('ai_resumed', 'CC resumed AI');
          await lead.save();
          await answerCallback(query.id, '▶️ AI Resumed');
          await sendToCC(`▶️ AI resumed for *${lead.name}*.`);
          break;

        case 'takeover':
          lead.aiPaused = true;
          lead.addActivity('cc_took_over', 'CC took over');
          await lead.save();
          await answerCallback(query.id, '👨‍💼 You have taken over!');
          await sendToCC(`👨‍💼 You took over *${lead.name}*\nLast message: _"${lead.conversationHistory.slice(-1)[0]?.content || 'none'}"_`);
          break;

        case 'converted':
          lead.status = 'converted';
          lead.addActivity('converted', 'Marked converted');
          await lead.save();
          await answerCallback(query.id, '🎉 Marked as Converted!');
          await editMessage(query.message.message_id, `🎉 *CONVERTED!* — ${lead.name} | Score: ${lead.score}/10`);
          break;

        case 'note':
          pendingNotes[query.from.id] = leadId;
          await answerCallback(query.id, '📝 Type your note now');
          await sendToCC(`📝 Type your note for *${lead.name}* now:`);
          break;
      }
    } catch (err) {
      await answerCallback(query.id, '❌ Error: ' + err.message);
    }
  });

  bot.on('message', async (msg) => {
    if (msg.chat.id.toString() !== process.env.TELEGRAM_CC_CHAT_ID) return;

    // Save note if pending
    if (pendingNotes[msg.from.id]) {
      const leadId = pendingNotes[msg.from.id];
      delete pendingNotes[msg.from.id];
      const lead = await Lead.findById(leadId);
      if (lead) {
        lead.ccNotes.push(msg.text);
        lead.addActivity('note_added', msg.text);
        await lead.save();
        await sendToCC(`✅ Note saved for *${lead.name}*`);
      }
      return;
    }

    if (msg.text === '/pipeline') {
      const counts = await Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
      let text = '📊 *PIPELINE*\n━━━━━━━━━\n';
      counts.forEach(c => { text += `• ${c._id}: ${c.count}\n`; });
      await sendToCC(text);
    }

    if (msg.text === '/leads') {
      const leads = await Lead.find().sort({ createdAt: -1 }).limit(5);
      let text = '📋 *RECENT LEADS*\n━━━━━━━━━\n';
      leads.forEach(l => { text += `• ${l.name} (${l.source}) — ${l.status} — ${l.score}/10\n`; });
      await sendToCC(text);
    }
  });

  console.log('✅ Telegram bot ready');
}

module.exports = { initTelegramHandlers };