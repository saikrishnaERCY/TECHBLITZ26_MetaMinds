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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

connectDB();

app.use('/webhook', require('./routes/webhook'));
app.use('/customer', require('./routes/customer'));

app.get('/', (req, res) => {
  res.json({ 
    status: '🟢 Lead Agent Running', 
    business: process.env.BUSINESS_NAME,
    timestamp: new Date().toISOString()
  });
});

app.get('/ping', (req, res) => res.send('pong'));

initTelegramHandlers();

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

// Follow-ups every hour
setInterval(() => runFollowUps().catch(console.error), 60 * 60 * 1000);

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