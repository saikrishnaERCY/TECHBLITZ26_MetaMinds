const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { scoreLead, continueConversation } = require('../services/aiService');
const { notifyNewLead, sendToCC } = require('../services/telegramService');
const { replyInstagramDM, replyInstagramComment, replyFacebookDM, replyFacebookComment, getInstagramUserInfo } = require('../services/metaService');
const { getLatestComments, repliedComments } = require('../services/youtubeService');

// ✅ Instagram + Facebook Webhook (Meta sends everything here)
router.get('/meta', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.WEBHOOK_SECRET) {
    console.log('✅ Meta webhook verified');
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.post('/meta', async (req, res) => {
  res.sendStatus(200); // Always respond fast to Meta

  try {
    const body = req.body;
    console.log('📩 Meta webhook:', JSON.stringify(body, null, 2));

    if (body.object === 'instagram') {
      for (const entry of body.entry || []) {
        // Instagram DMs
        for (const messaging of entry.messaging || []) {
          if (messaging.message && !messaging.message.is_echo) {
            await handleInstagramDM(messaging);
          }
        }
        // Instagram Comments
        for (const change of entry.changes || []) {
          if (change.field === 'comments') {
            await handleInstagramComment(change.value);
          }
        }
      }
    }

    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        // Facebook DMs
        for (const messaging of entry.messaging || []) {
          if (messaging.message && !messaging.message.is_echo) {
            await handleFacebookDM(messaging);
          }
        }
        // Facebook Comments
        for (const change of entry.changes || []) {
          if (change.field === 'feed' && change.value.item === 'comment') {
            await handleFacebookComment(change.value);
          }
        }
      }
    }

  } catch (err) {
    console.error('❌ Meta webhook error:', err.message);
  }
});

// Handle Instagram DM
async function handleInstagramDM(messaging) {
  const senderId = messaging.sender.id;
  const message = messaging.message.text;
  if (!message) return;

  console.log(`📸 Instagram DM from ${senderId}: ${message}`);

  // Check existing lead
  const existing = await Lead.findOne({
    sourceUserId: senderId,
    status: { $in: ['active', 'approved'] }
  });

  if (existing) {
    const aiReply = await continueConversation(existing, message);
    existing.conversationHistory.push({ role: 'user', content: message });
    existing.conversationHistory.push({ role: 'assistant', content: aiReply });
    await existing.save();
    await replyInstagramDM(senderId, aiReply);
    return;
  }

  // New lead
  const userInfo = await getInstagramUserInfo(senderId);
  const leadData = {
    source: 'instagram',
    name: userInfo.name || userInfo.username || 'Instagram User',
    sourceUserId: senderId,
    message,
    status: 'pending'
  };

  const lead = new Lead(leadData);
  lead.addActivity('lead_received', 'Instagram DM');
  await lead.save();

  const aiScore = await scoreLead(leadData);
  lead.score = aiScore.score;
  lead.intent = aiScore.intent;
  lead.scoreReason = aiScore.scoreReason;
  lead.interest = aiScore.interest;
  await lead.save();

  const msgId = await notifyNewLead(lead, aiScore);
  lead.telegramMessageId = msgId;
  await lead.save();
}

// Handle Instagram Comment
async function handleInstagramComment(value) {
  const commentId = value.id;
  const text = value.text;
  const username = value.from?.username || 'Instagram User';

  if (!text || !commentId) return;
  console.log(`📸 Instagram comment from ${username}: ${text}`);

  // Score and create lead
  const leadData = {
    source: 'instagram',
    name: username,
    sourceUserId: value.from?.id,
    message: text,
    status: 'pending'
  };

  const lead = new Lead(leadData);
  lead.addActivity('lead_received', 'Instagram Comment');
  await lead.save();

  const aiScore = await scoreLead(leadData);
  lead.score = aiScore.score;
  lead.intent = aiScore.intent;
  lead.scoreReason = aiScore.scoreReason;
  lead.interest = aiScore.interest;
  await lead.save();

  // Notify Telegram with comment reply action
  await notifyNewLead(lead, aiScore);
  await sendToCC(`📸 *Instagram Comment*\n@${username} commented:\n_"${text}"_\nAI will reply on Instagram after approval!`);
}

// Handle Facebook DM
async function handleFacebookDM(messaging) {
  const senderId = messaging.sender.id;
  const message = messaging.message.text;
  if (!message) return;

  console.log(`📘 Facebook DM from ${senderId}: ${message}`);

  const existing = await Lead.findOne({
    sourceUserId: senderId,
    status: { $in: ['active', 'approved'] }
  });

  if (existing) {
    const aiReply = await continueConversation(existing, message);
    existing.conversationHistory.push({ role: 'user', content: message });
    existing.conversationHistory.push({ role: 'assistant', content: aiReply });
    await existing.save();
    await replyFacebookDM(senderId, aiReply);
    return;
  }

  const leadData = {
    source: 'facebook',
    name: 'Facebook User',
    sourceUserId: senderId,
    message,
    status: 'pending'
  };

  const lead = new Lead(leadData);
  lead.addActivity('lead_received', 'Facebook DM');
  await lead.save();

  const aiScore = await scoreLead(leadData);
  lead.score = aiScore.score;
  lead.intent = aiScore.intent;
  lead.scoreReason = aiScore.scoreReason;
  lead.interest = aiScore.interest;
  await lead.save();

  const msgId = await notifyNewLead(lead, aiScore);
  lead.telegramMessageId = msgId;
  await lead.save();
}

// Handle Facebook Comment
async function handleFacebookComment(value) {
  const commentId = value.comment_id;
  const text = value.message;
  const name = value.from?.name || 'Facebook User';

  if (!text || !commentId) return;
  console.log(`📘 Facebook comment from ${name}: ${text}`);

  const leadData = {
    source: 'facebook',
    name,
    sourceUserId: value.from?.id,
    message: text,
    status: 'pending'
  };

  const lead = new Lead(leadData);
  lead.addActivity('lead_received', 'Facebook Comment');
  await lead.save();

  const aiScore = await scoreLead(leadData);
  lead.score = aiScore.score;
  lead.intent = aiScore.intent;
  lead.scoreReason = aiScore.scoreReason;
  lead.interest = aiScore.interest;
  await lead.save();

  await notifyNewLead(lead, aiScore);
  await sendToCC(`📘 *Facebook Comment*\n${name} commented:\n_"${text}"_`);
}

module.exports = router;