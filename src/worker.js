// 정적 자산을 그대로 내보내고, /api/news 만 중계한다.
// 구글 뉴스 RSS 는 access-control-allow-origin 을 주지 않아 브라우저가 직접 받지 못한다.

const FEED = "https://news.google.com/rss/search"
  + "?q=%EC%A0%84%EC%84%B8+%EC%A0%95%EC%B1%85&hl=ko&gl=KR&ceid=KR:ko";
const MAX_ITEMS = 12;

function pick(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return "";
  // 엔티티를 먼저 풀면 &lt;img&gt; 가 살아 있는 태그로 되살아난다. 태그를 먼저 지운다.
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function parseItems(xml) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return blocks.slice(0, MAX_ITEMS).map((block) => ({
    title: pick(block, "title"),
    link: pick(block, "link"),
    source: pick(block, "source"),
    date: pick(block, "pubDate"),
  })).filter((item) => item.title && item.link);
}

function json(body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/news") return env.ASSETS.fetch(request);

    try {
      const upstream = await fetch(FEED, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; jeonse-map/1.0)" },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
      if (!upstream.ok) return json({ items: [], fallback: true }, 300);
      const items = parseItems(await upstream.text());
      if (!items.length) return json({ items: [], fallback: true }, 300);
      return json({ items, fallback: false }, 1800);
    } catch {
      return json({ items: [], fallback: true }, 300);
    }
  },
};
