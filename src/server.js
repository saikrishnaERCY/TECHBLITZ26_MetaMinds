require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const { initTelegramHandlers } = require('./routes/telegram');
const { runFollowUps } = require('./services/conversationService');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.static('public'));
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

connectDB();

app.use('/webhook', require('./routes/webhook'));
app.use('/customer', require('./routes/customer'));
app.use('/gmail', require('./routes/gmail'));
app.use('/social', require('./routes/social'));
app.get('/', (req, res) => {
  res.json({ 
    status: '🟢 Lead Agent Running', 
    business: process.env.BUSINESS_NAME,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => res.send('pong'));

initTelegramHandlers();
// YouTube comment polling every 10 minutes
const { getLatestComments, repliedComments } = require('./services/youtubeService');
const { scoreLead: scoreLeadYT } = require('./services/aiService');

async function pollYouTubeComments() {
  try {
    const comments = await getLatestComments();
    console.log(`▶️ YouTube: checking ${comments.length} comments`);

    for (const comment of comments) {
      if (repliedComments.has(comment.commentId)) continue;

      // Create lead for each new comment
      const Lead = require('./models/Lead');
      const existing = await Lead.findOne({ sourceUserId: comment.authorChannelId });
      if (existing) continue;

      const leadData = {
        source: 'youtube',
        name: comment.authorName,
        sourceUserId: comment.authorChannelId,
        message: comment.text,
        interest: comment.videoTitle,
        status: 'pending'
      };

      const lead = new Lead(leadData);
      lead.addActivity('lead_received', `YouTube comment on: ${comment.videoTitle}`);
      await lead.save();

      const aiScore = await scoreLeadYT(leadData);
      lead.score = aiScore.score;
      lead.intent = aiScore.intent;
      lead.scoreReason = aiScore.scoreReason;
      lead.interest = aiScore.interest;
      await lead.save();

      const { notifyNewLead, sendToCC } = require('./services/telegramService');
      await notifyNewLead(lead, aiScore);
      await sendToCC(`▶️ *YouTube Comment*\n${comment.authorName} on _"${comment.videoTitle}"_:\n_"${comment.text}"_`);

      repliedComments.add(comment.commentId);
      console.log(`▶️ New YouTube lead: ${comment.authorName}`);
    }
  } catch (err) {
    console.error('❌ YouTube polling error:', err.message);
  }
}

// Poll YouTube every 10 minutes
setInterval(() => pollYouTubeComments().catch(console.error), 10 * 60 * 1000);
setTimeout(() => pollYouTubeComments().catch(console.error), 5000);

// Telegram webhook for production (Render)
if (process.env.RENDER === 'true') {
  const { getBot } = require('./services/telegramService');
  const RENDER_URL = 'https://techblitz26-metaminds.onrender.com';

  setTimeout(async () => {
    try {
      await getBot().setWebHook(`${RENDER_URL}/telegram-webhook`);
      console.log('✅ Telegram webhook mode active');
    } catch (err) {
      console.error('❌ Telegram webhook error:', err.message);
    }
  }, 3000);

  app.post('/telegram-webhook', (req, res) => {
    console.log('📩 Telegram update received:', JSON.stringify(req.body));
    getBot().processUpdate(req.body);
    res.sendStatus(200);
  });
}

app.get('/privacy', (req, res) => {
  res.send('<h1>Privacy Policy</h1><p>MetaMinds Lead Agent - We collect lead data to help businesses respond to customers. Data is stored securely in MongoDB Atlas.</p>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>Terms of Service</h1><p>MetaMinds Lead Agent - By using this service you agree to our terms.</p>');
});

// Follow-ups every hour
setInterval(() => pollYouTubeComments().catch(console.error), 60 * 1000); // every 1 min

// Keep Render awake every 14 minutes
setInterval(() => {
  require('https').get('https://techblitz26-metaminds.onrender.com/ping', (res) => {
    console.log('🏓 Keep-alive ping sent');
  }).on('error', () => {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🏢 Business: ${process.env.BUSINESS_NAME}`);
  console.log(`📱 Telegram bot active`);
});