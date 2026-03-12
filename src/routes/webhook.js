const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { scoreLead } = require('../services/aiService');
const { notifyNewLead } = require('../services/telegramService');

function normalizeLead(source, body) {
  switch (source) {
    case 'instagram':
    case 'facebook':
      return {
        source,
        name: body.entry?.[0]?.messaging?.[0]?.sender?.name || `${source} User`,
        sourceUserId: body.entry?.[0]?.messaging?.[0]?.sender?.id,
        message: body.entry?.[0]?.messaging?.[0]?.message?.text || '',
        sourcePlatformData: body
      };
    case 'website':
      return {
        source: 'website',
        name: body.name || 'Website Visitor',
        phone: body.phone ? body.phone.replace(/\s+/g, '') : undefined,
        email: body.email,
        message: body.message || '',
        interest: body.interest,
        sourcePlatformData: body
      };
    case 'whatsapp':
      return {
        source: 'whatsapp',
        name: body.ProfileName || 'WhatsApp User',
        phone: body.From?.replace('whatsapp:', '') || body.phone,
        message: body.Body || body.message || '',
        sourceUserId: body.From,
        sourcePlatformData: body
      };
    default:
      return {
        source: 'manual',
        name: body.name || 'Unknown',
        phone: body.phone,
        email: body.email,
        message: body.message || '',
        sourcePlatformData: body
      };
  }
}

router.post('/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const normalized = normalizeLead(source, req.body);

    if (!normalized.message && !normalized.email && !normalized.phone) {
      return res.status(200).json({ status: 'ignored' });
    }

    // Prevent duplicate leads from same user within 1 hour
    if (normalized.sourceUserId) {
      const existing = await Lead.findOne({
        sourceUserId: normalized.sourceUserId,
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      });
      if (existing) return res.status(200).json({ status: 'duplicate' });
    }

    const lead = new Lead(normalized);
    lead.addActivity('lead_received', `From ${source}`);
    await lead.save();

    const aiScore = await scoreLead(normalized);
    lead.score = aiScore.score;
    lead.intent = aiScore.intent;
    lead.scoreReason = aiScore.scoreReason;
    lead.interest = aiScore.interest;
    lead.addActivity('ai_scored', `Score: ${aiScore.score}/10`);
    await lead.save();

    const msgId = await notifyNewLead(lead, aiScore);
    lead.telegramMessageId = msgId;
    await lead.save();

    res.status(200).json({ status: 'received', leadId: lead._id });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Meta verification for Instagram/Facebook
router.get('/instagram', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.WEBHOOK_SECRET) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.get('/facebook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.WEBHOOK_SECRET) {
    res.send(req.query['hub.challenge']);
  } else {
    res.status(403).send('Forbidden');
  }
});
// Handle WhatsApp REPLIES from customer
router.post('/whatsapp', async (req, res) => {
  console.log('🔔 WHATSAPP HIT! Body:', JSON.stringify(req.body));
  try {
    const body = req.body;
    const from = body.From?.replace('whatsapp:', '').replace(/\s+/g, '');
    const message = body.Body;

    if (!from || !message) return res.sendStatus(200);

    console.log(`📱 WhatsApp reply from: "${from}" message: "${message}"`);

    // Strip everything and just keep last 10 digits for matching
    const last10 = from.replace(/\D/g, '').slice(-10);
    console.log(`🔍 Looking for lead with last 10 digits: ${last10}`);

    // Find ALL active leads and log them for debugging
    const allLeads = await Lead.find({ status: { $in: ['approved', 'active'] } });
    console.log(`📋 Active leads:`, allLeads.map(l => ({ name: l.name, phone: l.phone, status: l.status })));

    // Match by last 10 digits of phone
    const lead = allLeads.find(l => {
      if (!l.phone) return false;
      const leadLast10 = l.phone.replace(/\D/g, '').slice(-10);
      console.log(`Comparing: ${leadLast10} vs ${last10}`);
      return leadLast10 === last10;
    });

    if (!lead) {
      console.log(`❌ No active lead found for ${from}`);
      // Send a fallback message so customer isn't left hanging
      const { sendWhatsApp } = require('../services/whatsappService');
      await sendWhatsApp(from, `Hi! Thanks for messaging Sparkle Jewellery ✦\nPlease fill our enquiry form and our team will get back to you shortly!`);
      return res.sendStatus(200);
    }

    console.log(`✅ Found lead: ${lead.name} — getting AI reply...`);

    // Update lead status to active
    lead.status = 'active';
    await lead.save();

    // Get AI reply
    const { handleCustomerMessage } = require('../services/conversationService');
    const aiReply = await handleCustomerMessage(lead._id, message);

    if (aiReply) {
      const { sendWhatsApp } = require('../services/whatsappService');
      await sendWhatsApp(from, aiReply);
      console.log(`🤖 AI replied: "${aiReply}"`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ WhatsApp reply error:', error);
    res.sendStatus(200);
  }
});


module.exports = router;