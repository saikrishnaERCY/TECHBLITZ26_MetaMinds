const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const { getAuthUrl, getTokens, setTokens, watchGmail, getEmail, sendReply, markAsRead } = require('../services/gmailService');
const { continueConversation } = require('../services/aiService');
const { sendToCC, notifyKeyEvent } = require('../services/telegramService');

// Store tokens in memory (for demo)
let savedTokens = null;

// Step 1 — Visit this URL to authorize Gmail
router.get('/auth', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Step 2 — Google redirects here after auth
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await getTokens(code);
    savedTokens = tokens;
    setTokens(tokens);

    // Start watching Gmail inbox
    await watchGmail();

    console.log('✅ Gmail authorized and watching inbox!');
    res.send(`
      <h2>✅ Gmail Connected!</h2>
      <p>Your Gmail inbox is now being monitored.</p>
      <p>Go back to your app!</p>
    `);
  } catch (err) {
    console.error('Gmail auth error:', err);
    res.status(500).send('Auth failed: ' + err.message);
  }
});

// Step 3 — Google Pub/Sub pushes here when new email arrives
router.post('/pubsub', async (req, res) => {
  console.log('📧 Gmail Pub/Sub notification received!');
  res.sendStatus(200); // Always respond fast

  try {
    if (!savedTokens) {
      console.log('⚠️ Gmail not authorized yet');
      return;
    }
    setTokens(savedTokens);

    // Decode the Pub/Sub message
    const message = req.body?.message;
    if (!message?.data) return;

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    console.log('📧 Gmail notification data:', data);

    // Get the actual email
    const { google } = require('googleapis');
    const { oauth2Client } = require('../services/gmailService');
    const gmail = google.gmail({ version: 'v1', auth: require('../services/gmailService').oauth2Client });

    // Get latest unread emails
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['UNREAD', 'INBOX'],
      maxResults: 1
    });

    const messages = listRes.data.messages;
    if (!messages || messages.length === 0) return;

    for (const msg of messages) {
      const email = await getEmail(msg.id);
      console.log(`📧 New email from: ${email.fromEmail} | Subject: ${email.subject}`);

      // Skip our own emails and notifications
      if (email.fromEmail === process.env.GMAIL_USER) continue;
      if (email.subject.includes('We received your enquiry')) continue;

      // Find matching lead by email
      const lead = await Lead.findOne({
        email: email.fromEmail,
        status: { $in: ['active', 'approved'] }
      });

      if (lead) {
        console.log(`✅ Found lead: ${lead.name} — generating AI reply`);

        // Add to conversation history
        lead.conversationHistory.push({
          role: 'user',
          content: `[Email] ${email.body.substring(0, 500)}`
        });

        // Generate AI reply
        const aiReply = await continueConversation(lead, email.body);
        lead.conversationHistory.push({ role: 'assistant', content: aiReply });
        lead.addActivity('email_reply', `Replied to email from ${email.fromEmail}`);
        await lead.save();

        // Send AI reply
        await sendReply(email.fromEmail, email.subject, aiReply, email.threadId);
        await markAsRead(msg.id);

        // Notify CC on Telegram
        await sendToCC(`📧 *Email reply sent to ${lead.name}*\nThey said: _"${email.body.substring(0, 100)}"_\nAI replied: _"${aiReply.substring(0, 100)}"_`);

      } else {
        // New lead from email!
        console.log(`🆕 New email lead from ${email.fromEmail}`);

        const { scoreLead } = require('../services/aiService');
        const { notifyNewLead } = require('../services/telegramService');

        const leadData = {
          source: 'website',
          name: email.fromName || 'Email User',
          email: email.fromEmail,
          message: email.body.substring(0, 500)
        };

        const newLead = new Lead(leadData);
        newLead.status = 'pending';
        newLead.addActivity('lead_received', 'From Gmail');
        await newLead.save();

        const aiScore = await scoreLead(leadData);
        newLead.score = aiScore.score;
        newLead.intent = aiScore.intent;
        newLead.scoreReason = aiScore.scoreReason;
        newLead.interest = aiScore.interest;
        await newLead.save();

        // Notify Telegram for approval
        await notifyNewLead(newLead, aiScore);
        await markAsRead(msg.id);
      }
    }
  } catch (err) {
    console.error('❌ Gmail Pub/Sub error:', err.message);
  }
});

module.exports = router;