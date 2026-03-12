const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_WHATSAPP_FROM;

async function sendWhatsApp(to, message) {
  // Format number properly
  let formatted = to.replace(/\s+/g, '').replace(/[^+\d]/g, '');
  if (!formatted.startsWith('+')) formatted = '+91' + formatted;
  const toWhatsApp = `whatsapp:${formatted}`;

  try {
    const msg = await client.messages.create({
      from: FROM,
      to: toWhatsApp,
      body: message
    });
    console.log(`📱 WhatsApp sent to ${formatted} — SID: ${msg.sid}`);
    return msg.sid;
  } catch (err) {
    console.error(`❌ WhatsApp error: ${err.message}`);
  }
}

async function sendApprovalMessage(lead) {
  const message = 
`✦ *Sparkle Jewellery*

Hi ${lead.name}! 👋

Thank you for your interest in *${lead.interest || 'our collection'}*!

Our jewellery expert has reviewed your enquiry and will personally guide you.

${lead.sourcePlatformData?.occasion ? `🎉 Occasion: ${lead.sourcePlatformData.occasion}` : ''}
${lead.sourcePlatformData?.budget ? `💰 Budget: ${lead.sourcePlatformData.budget}` : ''}

Reply to this message anytime and we'll be happy to help!

_Sparkle Jewellery Team_ ✦`;

  await sendWhatsApp(lead.phone, message);
}

async function sendFollowUpWhatsApp(lead, message) {
  await sendWhatsApp(lead.phone, `✦ *Sparkle Jewellery*\n\n${message}`);
}

module.exports = { sendWhatsApp, sendApprovalMessage, sendFollowUpWhatsApp };