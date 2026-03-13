const axios = require('axios');

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Track replied comments so we don't double reply
const repliedComments = new Set();

// ✅ Get latest comments on all videos
async function getLatestComments() {
  try {
    // Get latest videos first
    const videosRes = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          channelId: CHANNEL_ID,
          order: 'date',
          maxResults: 5,
          type: 'video',
          key: API_KEY
        }
      }
    );

    const videos = videosRes.data.items || [];
    const allComments = [];

    for (const video of videos) {
      const videoId = video.id.videoId;
      const videoTitle = video.snippet.title;

      try {
        const commentsRes = await axios.get(
          'https://www.googleapis.com/youtube/v3/commentThreads',
          {
            params: {
              part: 'snippet',
              videoId,
              order: 'time',
              maxResults: 10,
              key: API_KEY
            }
          }
        );

        const comments = commentsRes.data.items || [];
        comments.forEach(c => {
          const comment = c.snippet.topLevelComment.snippet;
          allComments.push({
            commentId: c.id,
            videoId,
            videoTitle,
            authorName: comment.authorDisplayName,
            authorChannelId: comment.authorChannelId?.value,
            text: comment.textDisplay,
            publishedAt: comment.publishedAt
          });
        });
      } catch (err) {
        console.error(`❌ Error getting comments for video ${videoId}:`, err.message);
      }
    }

    return allComments;
  } catch (err) {
    console.error('❌ YouTube comments error:', err.message);
    return [];
  }
}

// ✅ Reply to YouTube comment (needs OAuth - using API key for reading only)
async function replyToComment(parentId, replyText, accessToken) {
  try {
    await axios.post(
      'https://www.googleapis.com/youtube/v3/comments',
      {
        snippet: {
          parentId,
          textOriginal: replyText
        }
      },
      {
        params: { part: 'snippet', key: API_KEY },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    console.log(`▶️ YouTube comment reply sent`);
  } catch (err) {
    console.error('❌ YouTube reply error:', err.response?.data || err.message);
  }
}

module.exports = { getLatestComments, replyToComment, repliedComments };