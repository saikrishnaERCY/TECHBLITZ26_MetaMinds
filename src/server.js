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
  res.json({ status: '🟢 Lead Agent Running', business: process.env.BUSINESS_NAME });
});

initTelegramHandlers();
// Set Telegram webhook for production
if (process.env.RENDER === 'true') {
  const { getBot } = require('./routes/telegram');
  const RENDER_URL = process.env.RENDER_URL || 'https://techblitz26-metaminds.onrender.com';
  getBot().setWebHook(`${RENDER_URL}/telegram-webhook`);
  
  // Receive telegram updates via webhook
  app.post('/telegram-webhook', (req, res) => {
    getBot().processUpdate(req.body);
    res.sendStatus(200);
  });
  console.log('✅ Telegram webhook mode active');
}

setInterval(() => runFollowUps().catch(console.error), 60 * 60 * 1000);
setInterval(() => {
  require('https').get(`https://metamind-lead-agent.onrender.com`);
  console.log('🏓 Keep-alive ping sent');
}, 14 * 60 * 1000); // every 14 minutes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🏢 Business: ${process.env.BUSINESS_NAME}`);
  console.log(`📱 Telegram bot active`);
});
