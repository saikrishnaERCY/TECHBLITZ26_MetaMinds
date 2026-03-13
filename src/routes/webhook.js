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
        phone: body.From?.replace('whatsapp:', '').replace(/\s+/g, '') || body.phone,
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

// ✅ Meta verification - MUST be before /:source route
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

// ✅ WhatsApp replies - MUST be before /:source route
router.post('/whatsapp', async (req, res) => {
  console.log('🔔 WHATSAPP HIT! Body:', JSON.stringify(req.body));

  // Twilio needs XML response - NOT sendStatus(200) or it sends "OK" as message!
  const twilioResponse = () => {
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  };

  try {
    const body = req.body;
    const from = body.From?.replace('whatsapp:', '').replace(/\s+/g, '');
    const message = body.Body;

    if (!from || !message) return twilioResponse();

    const last10 = from.replace(/\D/g, '').slice(-10);
    console.log(`🔍 Incoming from: ${from}, last10: ${last10}`);

    // Find ALL leads and log for debugging
    const allLeads = await Lead.find({});
    console.log(`📋 Total leads in DB: ${allLeads.length}`);
    allLeads.forEach(l => {
      console.log(`  - ${l.name} | phone: ${l.phone} | status: ${l.status}`);
    });

    const matchingLeads = allLeads.filter(l => {
  if (!l.phone) return false;
  const stored = l.phone.replace(/\D/g, '').slice(-10);
  return stored === last10;
});

console.log(`📋 Matching leads for ${last10}:`, matchingLeads.map(l => `${l.name} - ${l.status}`));

// Prioritize active leads first, then approved, then most recent
const existingLead = 
  matchingLeads.find(l => l.status === 'active') ||
  matchingLeads.find(l => l.status === 'approved') ||
  matchingLeads[matchingLeads.length - 1];

    if (existingLead) {
      console.log(`✅ Found lead: ${existingLead.name} | status: ${existingLead.status}`);

      // Only AI reply if active or approved
      if (!['approved', 'active'].includes(existingLead.status)) {
        console.log(`⚠️ Lead status is ${existingLead.status} - not replying yet`);
        return twilioResponse();
      }

      // Continue conversation directly - NO telegram interruption
      const { handleCustomerMessage } = require('../services/conversationService');
      const aiReply = await handleCustomerMessage(existingLead._id, message);

      if (aiReply) {
        const { sendWhatsApp } = require('../services/whatsappService');
        await sendWhatsApp(from, aiReply);
        console.log(`🤖 AI replied: ${aiReply}`);
      } else {
        console.log('⚠️ AI returned no reply');
      }

      return twilioResponse();
    }

    // Brand new number - create lead and ask CC on Telegram
    console.log(`🆕 New WhatsApp lead from ${from}`);
    const normalized = {
      source: 'whatsapp',
      name: body.ProfileName || 'WhatsApp User',
      phone: from,
      message: message,
      sourceUserId: from,
      sourcePlatformData: body
    };

    const lead = new Lead(normalized);
    lead.addActivity('lead_received', 'From WhatsApp');
    lead.status = 'pending';
    await lead.save();

    const aiScore = await scoreLead(normalized);
    lead.score = aiScore.score;
    lead.intent = aiScore.intent;
    lead.scoreReason = aiScore.scoreReason;
    lead.interest = aiScore.interest;
    await lead.save();

    const msgId = await notifyNewLead(lead, aiScore);
    lead.telegramMessageId = msgId;
    await lead.save();

    console.log(`📱 Telegram notified for new WhatsApp lead: ${lead.name}`);
    return twilioResponse();

  } catch (error) {
    console.error('❌ WhatsApp error:', error);
    return twilioResponse();
  }
});

// ✅ Generic lead receiver - website, instagram, facebook etc
router.post('/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const normalized = normalizeLead(source, req.body);

    if (!normalized.message && !normalized.email && !normalized.phone) {
      return res.status(200).json({ status: 'ignored' });
    }

    // Prevent duplicate leads within 1 hour
    if (normalized.sourceUserId) {
      const existing = await Lead.findOne({
        sourceUserId: normalized.sourceUserId,
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      });
      if (existing) return res.status(200).json({ status: 'duplicate' });
    }

    // Save lead as pending - wait for CC approval
    const lead = new Lead(normalized);
    lead.status = 'pending';
    lead.addActivity('lead_received', `From ${source}`);
    await lead.save();

    // AI score
    const aiScore = await scoreLead(normalized);
    lead.score = aiScore.score;
    lead.intent = aiScore.intent;
    lead.scoreReason = aiScore.scoreReason;
    lead.interest = aiScore.interest;
    lead.addActivity('ai_scored', `Score: ${aiScore.score}/10`);
    await lead.save();

    // Notify Telegram - WhatsApp + Email sent ONLY after CC approves
    const msgId = await notifyNewLead(lead, aiScore);
    lead.telegramMessageId = msgId;
    await lead.save();

    console.log(`📩 New lead from ${source} - waiting for CC approval`);
    res.status(200).json({ status: 'received', leadId: lead._id });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;