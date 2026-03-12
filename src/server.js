require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');
const { initTelegramHandlers } = require('./routes/telegram');
const { runFollowUps } = require('./services/conversationService');

const app = express();
app.use(cors());
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

setInterval(() => runFollowUps().catch(console.error), 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🏢 Business: ${process.env.BUSINESS_NAME}`);
  console.log(`📱 Telegram bot active`);
});
