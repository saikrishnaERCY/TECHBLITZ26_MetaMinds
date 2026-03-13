const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://techblitz26-metaminds.onrender.com/gmail/callback'
);

// Step 1 — Generate auth URL (visit this once to authorize)
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ]
  });
}

// Step 2 — Exchange code for tokens
async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

// Set tokens (call this on startup after first auth)
function setTokens(tokens) {
  oauth2Client.setCredentials(tokens);
}

// Watch Gmail inbox for new emails
async function watchGmail() {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: process.env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX']
    }
  });
  console.log('👁️ Gmail watch started:', res.data);
  return res.data;
}

// Get email content by message ID
async function getEmail(messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const headers = msg.data.payload.headers;
  const from = headers.find(h => h.name === 'From')?.value || '';
  const subject = headers.find(h => h.name === 'Subject')?.value || '';
  const threadId = msg.data.threadId;

  // Extract body
  let body = '';
  const parts = msg.data.payload.parts;
  if (parts) {
    const textPart = parts.find(p => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  } else if (msg.data.payload.body?.data) {
    body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
  }

  // Extract email address from "Name <email>" format
  const emailMatch = from.match(/<(.+)>/) || [null, from];
  const fromEmail = emailMatch[1];
  const fromName = from.replace(/<.*>/, '').trim().replace(/"/g, '');

  return { from, fromEmail, fromName, subject, body, threadId, messageId };
}

// Send reply email
async function sendReply(to, subject, body, threadId) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const email = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\n');

  const encoded = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId
    }
  });

  console.log(`📧 Gmail reply sent to ${to}`);
}

// Mark email as read
async function markAsRead(messageId) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] }
  });
}

module.exports = { getAuthUrl, getTokens, setTokens, watchGmail, getEmail, sendReply, markAsRead };