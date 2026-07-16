import { readFile, writeFile } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url);

const KEYWORD_STOPWORDS = new Set([
  "속보", "단독", "종합", "업데이트", "오늘", "내일", "전망", "관련", "이슈", "분석", "현황",
  "이번", "지난", "최근", "한편", "이후", "이전", "위해", "통해", "대한", "대해", "것",
  "때문", "보다", "부터", "까지", "에서", "으로", "에게", "한테", "이라며", "라며",
  "이라고", "라고", "한다", "했다", "된다", "됐다", "이다", "였다", "있다", "없다",
  "한다면", "하는", "했던", "하며", "하고", "해서", "같은", "위한", "따라", "새로운",
]);

function extractKeywords(title, max = 3) {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/[…·↓↑]/g, " ")
    .replace(/\.{2,}/g, " ");
  const tokens = cleaned.split(/[\s,\-–—:()]+/).filter(Boolean);
  const seen = new Set();
  const picked = [];
  for (const raw of tokens) {
    const t = raw.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9%]+$/g, "");
    if (t.length < 2 || KEYWORD_STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    picked.push(t);
  }
  return picked.sort((a, b) => b.length - a.length).slice(0, max);
}

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
    return { title, link, source, pubDate, keywords: extractKeywords(title) };
  });
}

async function fetchTopMovers(sosok, market) {
  const url = `https://finance.naver.com/sise/sise_rise.naver?sosok=${sosok}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`movers fetch failed (${market}): ${res.status}`);
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("euc-kr").decode(buf);

  const rowRe =
    /<td class="no">\d+<\/td>\s*<td><a href="\/item\/main\.naver\?code=(\d+)" class="tltle">([^<]+)<\/a><\/td>\s*<td class="number">([\d,]+)<\/td>[\s\S]{0,400}?class="tah p11 (?:red|blue)0\d">\s*([+-]?[\d.]+)%/g;

  const movers = [];
  let m;
  while ((m = rowRe.exec(html)) && movers.length < 5) {
    const [, code, name, price, changePercent] = m;
    movers.push({
      market,
      code,
      name,
      price: Number(price.replace(/,/g, "")),
      changePercent: Number(changePercent),
    });
  }
  return movers;
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

  let movers = [];
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchTopMovers(0, "코스피"),
      fetchTopMovers(1, "코스닥"),
    ]);
    movers = [...kospi, ...kosdaq].sort((a, b) => b.changePercent - a.changePercent).slice(0, 8);
  } catch (err) {
    console.error("top movers fetch failed:", err.message);
    try {
      const prev = JSON.parse(await readFile(new URL("movers.json", DATA_DIR), "utf-8"));
      movers = prev.items || [];
    } catch {
      movers = [];
    }
  }

  await writeFile(new URL("news.json", DATA_DIR), JSON.stringify({ updatedAt, items: news }, null, 2));
  await writeFile(new URL("market.json", DATA_DIR), JSON.stringify({ updatedAt, indices }, null, 2));
  await writeFile(new URL("movers.json", DATA_DIR), JSON.stringify({ updatedAt, items: movers }, null, 2));

  console.log(`Updated: ${news.length} news items, ${indices.length} indices, ${movers.length} movers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
