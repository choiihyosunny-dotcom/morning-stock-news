import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "");
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")).trim();
}

function parseRss(xml, limit = 8) {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  return items.slice(0, limit).map((block) => {
    const rawTitle = extractTag(block, "title");
    const title = rawTitle.replace(/\s+-\s+[^-]+$/, "").trim();
    const link = extractTag(block, "link");
    const pubDateRaw = extractTag(block, "pubDate");
    const source = extractTag(block, "source") || "Google 뉴스";
    let pubDate = "";
    if (pubDateRaw) {
      const d = new Date(pubDateRaw);
      if (!isNaN(d)) {
        pubDate = `${d.getMonth() + 1}.${d.getDate()}`;
      }
    }
    return { title, link, source, pubDate };
  });
}

async function fetchMarketNews() {
  const query = encodeURIComponent("코스피 OR 코스닥 OR 국내증시");
  const url = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`news rss failed: ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, 8);
}

async function fetchIndices() {
  const url = "https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.naver.com/" } });
  if (!res.ok) throw new Error(`index api failed: ${res.status}`);
  const json = await res.json();
  const items = json?.datas || [];
  return items.map((d) => ({
    name: d.stockName || d.itemCode,
    value: Number(d.closePriceRaw),
    change: Number(d.compareToPreviousClosePriceRaw),
    changePercent: Number(d.fluctuationsRatioRaw),
  }));
}

async function main() {
  const updatedAt = new Date().toISOString();

  let news = [];
  try {
    news = await fetchMarketNews();
  } catch (err) {
    console.error("market news fetch failed:", err.message);
    try {
      const prev = JSON.parse(await readFile(new URL("news.json", DATA_DIR), "utf-8"));
      news = prev.items || [];
    } catch {
      news = [];
    }
  }

  let indices = [];
  try {
    indices = await fetchIndices();
  } catch (err) {
    console.error("index fetch failed:", err.message);
    try {
      const prev = JSON.parse(await readFile(new URL("market.json", DATA_DIR), "utf-8"));
      indices = prev.indices || [];
    } catch {
      indices = [];
    }
  }

  await writeFile(new URL("news.json", DATA_DIR), JSON.stringify({ updatedAt, items: news }, null, 2));
  await writeFile(new URL("market.json", DATA_DIR), JSON.stringify({ updatedAt, indices }, null, 2));

  console.log(`Updated: ${news.length} news items, ${indices.length} indices`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
