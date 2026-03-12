const express = require('express');
const router = express.Router();
const { handleCustomerMessage, handleCustomerAction } = require('../services/conversationService');

router.post('/message', async (req, res) => {
  try {
    const { leadId, message } = req.body;
    const reply = await handleCustomerMessage(leadId, message);
    res.json({ reply, aiHandled: !!reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/action', async (req, res) => {
  try {
    const { leadId, action } = req.body;
    const reply = await handleCustomerAction(leadId, action);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;