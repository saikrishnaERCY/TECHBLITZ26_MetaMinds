const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: { type: String, default: 'Unknown' },
  phone: String,
  email: String,
  source: {
    type: String,
    enum: ['instagram', 'facebook', 'website', 'whatsapp', 'youtube', 'manual'],
    required: true
  },
  sourceUserId: String,
  message: String,
  interest: String,
  score: { type: Number, default: 0 },
  scoreReason: String,
  intent: { type: String, default: 'medium' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'converted', 'lost', 'paused'],
    default: 'pending'
  },
  conversationHistory: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  aiPaused: { type: Boolean, default: false },
  followUpCount: { type: Number, default: 0 },
  lastFollowUp: Date,
  nextFollowUp: Date,
  ccNotes: [String],
  telegramMessageId: Number,
  activityLog: [{
    action: String,
    note: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

leadSchema.methods.addActivity = function(action, note) {
  this.activityLog.push({ action, note });
};

module.exports = mongoose.model('Lead', leadSchema);