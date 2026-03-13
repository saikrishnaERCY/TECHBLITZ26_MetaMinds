const axios = require('axios');

const PAGE_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const INSTAGRAM_ID = process.env.INSTAGRAM_BUSINESS_ID;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;

// ✅ Reply to Instagram DM
async function replyInstagramDM(recipientId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message }
      },
      { params: { access_token: PAGE_TOKEN } }
    );
    console.log(`📸 Instagram DM reply sent to ${recipientId}`);
  } catch (err) {
    console.error('❌ Instagram DM error:', err.response?.data || err.message);
  }
}

// ✅ Reply to Instagram Comment
async function replyInstagramComment(commentId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${commentId}/replies`,
      { message },
      { params: { access_token: PAGE_TOKEN } }
    );
    console.log(`📸 Instagram comment reply sent`);
  } catch (err) {
    console.error('❌ Instagram comment error:', err.response?.data || err.message);
  }
}

// ✅ Reply to Facebook DM
async function replyFacebookDM(recipientId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message }
      },
      { params: { access_token: PAGE_TOKEN } }
    );
    console.log(`📘 Facebook DM reply sent to ${recipientId}`);
  } catch (err) {
    console.error('❌ Facebook DM error:', err.response?.data || err.message);
  }
}

// ✅ Reply to Facebook Comment
async function replyFacebookComment(commentId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${commentId}/comments`,
      { message },
      { params: { access_token: PAGE_TOKEN } }
    );
    console.log(`📘 Facebook comment reply sent`);
  } catch (err) {
    console.error('❌ Facebook comment error:', err.response?.data || err.message);
  }
}

// ✅ Get Instagram user info
async function getInstagramUserInfo(userId) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/v18.0/${userId}`,
      { params: { fields: 'name,username', access_token: PAGE_TOKEN } }
    );
    return res.data;
  } catch (err) {
    return { name: 'Instagram User', username: 'unknown' };
  }
}

module.exports = {
  replyInstagramDM,
  replyInstagramComment,
  replyFacebookDM,
  replyFacebookComment,
  getInstagramUserInfo
};