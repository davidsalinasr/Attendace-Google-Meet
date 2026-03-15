// Insights module — processes chat messages for questions, top keywords, and most active participants.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'about', 'up', 'down', 'what', 'which', 'who',
  'whom', 'this', 'that', 'these', 'those', 'am', 'it', 'its', 'my',
  'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'his',
  'her', 'their', 'i', 'us', 'him', 'also', 'yes', 'no', 'ok', 'okay',
  'thanks', 'thank', 'hi', 'hello', 'hey', 'yeah', 'yep', 'nope',
  'like', 'get', 'got', 'going', 'go', 'know', 'think', 'want', 'need',
  'see', 'say', 'said', 'make', 'right', 'well', 'one', 'two', 'dont',
  "don't", 'im', "i'm", 'thats', "that's", 'its', "it's",
]);

/**
 * Extract questions — messages ending with "?"
 */
function extractQuestions(chatMessages) {
  return chatMessages.filter(m => m.text.trim().endsWith('?'));
}

/**
 * Extract top keywords from chat messages.
 * Returns array of { word, count } sorted by count desc.
 */
function extractTopKeywords(chatMessages, limit = 20) {
  const freq = {};

  chatMessages.forEach(m => {
    const words = m.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });
  });

  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Compute "most active" participants by chat message count + engagement.
 * Returns array of { name, chatCount, spokeCount, reactionCount, total } sorted by total desc.
 */
function computeMostActive(chatMessages, participants) {
  const chatCounts = {};
  chatMessages.forEach(m => {
    chatCounts[m.sender] = (chatCounts[m.sender] || 0) + 1;
  });

  const result = (participants || []).map(p => ({
    name: p.displayName,
    chatCount: chatCounts[p.displayName] || 0,
    spokeCount: p.spokeCount || 0,
    reactionCount: p.reactionCount || 0,
    total: (chatCounts[p.displayName] || 0) + (p.spokeCount || 0) + (p.reactionCount || 0),
  }));

  // Add chat-only participants not in API participant list
  Object.keys(chatCounts).forEach(sender => {
    if (!result.find(r => r.name === sender)) {
      result.push({
        name: sender,
        chatCount: chatCounts[sender],
        spokeCount: 0,
        reactionCount: 0,
        total: chatCounts[sender],
      });
    }
  });

  return result.sort((a, b) => b.total - a.total);
}

// Expose globally for dashboard.js
window.Insights = {
  extractQuestions,
  extractTopKeywords,
  computeMostActive,
};
