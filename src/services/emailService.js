const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendLeadConfirmationEmail(lead) {
  if (!lead.email) return;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
      .container { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #1a1a1a, #2d2d2d); padding: 40px 30px; text-align: center; }
      .header h1 { color: #d4af37; font-size: 28px; margin: 0; letter-spacing: 2px; }
      .header p { color: #aaa; margin: 8px 0 0; font-size: 14px; }
      .body { padding: 36px 30px; }
      .greeting { font-size: 20px; color: #1a1a1a; font-weight: 600; margin-bottom: 12px; }
      .message { color: #555; line-height: 1.7; font-size: 15px; margin-bottom: 24px; }
      .details-box { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
      .details-box h3 { color: #d4af37; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px; }
      .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
      .detail-row:last-child { border-bottom: none; }
      .detail-label { color: #999; }
      .detail-value { color: #1a1a1a; font-weight: 500; }
      .cta { text-align: center; margin: 28px 0; }
      .cta-btn { background: linear-gradient(135deg, #d4af37, #b8941e); color: #000; text-decoration: none; padding: 14px 36px; border-radius: 50px; font-weight: 700; font-size: 15px; display: inline-block; }
      .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #aaa; font-size: 12px; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>✦ Sparkle Jewellery</h1>
        <p>Your enquiry has been received</p>
      </div>
      <div class="body">
        <div class="greeting">Hi ${lead.name}! 👋</div>
        <div class="message">
          Thank you for reaching out to us! We've received your enquiry and our jewellery expert will get back to you personally within the next few minutes.<br/><br/>
          Here's a summary of what you shared with us:
        </div>
        <div class="details-box">
          <h3>Your Enquiry Details</h3>
          <div class="detail-row">
            <span class="detail-label">Looking for</span>
            <span class="detail-value">${lead.interest || 'Not specified'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Occasion</span>
            <span class="detail-value">${lead.sourcePlatformData?.occasion || 'Not specified'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Budget</span>
            <span class="detail-value">${lead.sourcePlatformData?.budget || 'Not specified'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${lead.phone || 'Not provided'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Reference ID</span>
            <span class="detail-value">#${lead._id.toString().slice(-6).toUpperCase()}</span>
          </div>
        </div>
        <div class="message">
          Our expert will reach out to you on <strong>${lead.phone}</strong> shortly. In the meantime, feel free to reply to this email with any questions!
        </div>
      </div>
      <div class="footer">
        © 2026 Sparkle Jewellery · This email was sent because you submitted an enquiry on our website.
      </div>
    </div>
  </body>
  </html>
  `;

  await transporter.sendMail({
    from: `"Sparkle Jewellery ✦" <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: `✦ We received your enquiry, ${lead.name}!`,
    html
  });

  console.log(`📧 Email sent to ${lead.email}`);
}

async function sendFollowUpEmail(lead, message) {
  if (!lead.email) return;

  await transporter.sendMail({
    from: `"Sparkle Jewellery ✦" <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: `Following up on your jewellery enquiry ✦`,
    html: `
    <div style="font-family: Segoe UI, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
      <h2 style="color: #d4af37;">✦ Sparkle Jewellery</h2>
      <p style="color: #333; line-height: 1.7;">Hi ${lead.name},</p>
      <p style="color: #333; line-height: 1.7;">${message}</p>
      <p style="color: #999; font-size: 13px; margin-top: 30px;">Sparkle Jewellery Team</p>
    </div>
    `
  });

  console.log(`📧 Follow-up email sent to ${lead.email}`);
}

module.exports = { sendLeadConfirmationEmail, sendFollowUpEmail };