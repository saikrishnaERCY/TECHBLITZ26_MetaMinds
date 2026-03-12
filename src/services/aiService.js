const axios = require('axios');

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Our Business';
const BUSINESS_TYPE = process.env.BUSINESS_TYPE || 'store';

async function callAI(prompt) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'google/gemini-2.5-flash-lite-preview-09-2025',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.choices[0].message.content;
}

async function scoreLead(leadData) {
  const prompt = `You are a lead scoring AI for ${BUSINESS_NAME}, a ${BUSINESS_TYPE}.
Analyze this lead and return ONLY valid JSON, no extra text, no markdown:

Source: ${leadData.source}
Message: "${leadData.message}"
Name: ${leadData.name || 'Unknown'}
Phone: ${leadData.phone || 'Not provided'}
Interest: ${leadData.interest || 'Unknown'}
Budget: ${leadData.budget || 'Not specified'}
Occasion: ${leadData.occasion || 'Not specified'}

Return exactly this JSON:
{
  "score": 7,
  "intent": "high",
  "scoreReason": "one line reason here",
  "interest": "what they want",
  "suggestedReply": "warm first reply to customer"
}`;

  try {
    const text = await callAI(prompt);
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    const jsonStr = clean.substring(start, end + 1);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('AI scoring error:', err.message);
    return {
      score: 5,
      intent: 'medium',
      scoreReason: 'Auto scored',
      interest: leadData.interest || 'Unknown',
      suggestedReply: `Hi ${leadData.name || 'there'}! Thanks for reaching out to ${BUSINESS_NAME}. How can we help you today?`
    };
  }
}

async function continueConversation(lead, newMessage) {
  const history = lead.conversationHistory.map(m =>
    `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`
  ).join('\n');

  const prompt = `You are a friendly sales assistant for ${BUSINESS_NAME}, a ${BUSINESS_TYPE}.
Customer name: ${lead.name || 'there'}
Interest: ${lead.interest || 'general enquiry'}
Budget: ${lead.budget || 'not specified'}
Occasion: ${lead.occasion || 'not specified'}

Conversation so far:
${history}

Customer just said: "${newMessage}"

Reply in 2-4 lines. Be warm and helpful. Never make up prices.`;

  try {
    return await callAI(prompt);
  } catch (err) {
    return `Thanks for your message! Our team will get back to you shortly.`;
  }
}

async function generateFollowUp(lead) {
  const prompt = `Write a short follow-up message for a customer of ${BUSINESS_NAME}.
Customer: ${lead.name || 'there'}
Interested in: ${lead.interest || 'our products'}
Follow-up number: ${lead.followUpCount + 1}
Keep it under 3 lines. Friendly, not pushy. Offer a next step.`;

  try {
    return await callAI(prompt);
  } catch (err) {
    return `Hi ${lead.name || 'there'}! Just checking in — are you still interested in ${lead.interest || 'our collection'}? We'd love to help! 😊`;
  }
}

module.exports = { scoreLead, continueConversation, generateFollowUp };
