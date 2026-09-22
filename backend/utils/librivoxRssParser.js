// Pulls a chapter list (title + playable mp3 URL) out of a LibriVox RSS
// feed. Not a general-purpose RSS parser - LibriVox's feed is a simple,
// predictable podcast-style RSS 2.0 document (one <item> per chapter, each
// with a <title> and an <enclosure url="...mp3">), so a couple of regexes
// cover it without pulling in a full XML parsing dependency for something
// this small.
function decodeXmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanTitle(rawTitle) {
  return decodeXmlEntities(rawTitle.replace('<![CDATA[', '').replace(']]>', '')).trim();
}

function parseLibrivoxChapters(rssXml) {
  const itemBlocks = rssXml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return itemBlocks
    .map((itemXml, index) => {
      const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"/);
      if (!enclosureMatch) return null; // an item with no playable file isn't a chapter

      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);

      return {
        index: index + 1,
        title: titleMatch ? cleanTitle(titleMatch[1]) : `Chapter ${index + 1}`,
        url: enclosureMatch[1],
      };
    })
    .filter(Boolean);
}

module.exports = { parseLibrivoxChapters };
