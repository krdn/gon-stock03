import type { MorningItem } from '../shared/morning.ts';

const feeds = [
  { publisher: '삼성전자 뉴스룸', url: 'https://news.samsung.com/kr/feed' },
  { publisher: '엔비디아 뉴스룸', url: 'https://nvidianews.nvidia.com/releases.xml' },
  { publisher: '금융감독원 DART', url: 'https://dart.fss.or.kr/api/todayRSS.xml' },
  { publisher: '한국은행', url: 'https://www.bok.or.kr/portal/bbs/B0000502/news.rss?menuNo=201265' },
  { publisher: '미 연준 연구진', url: 'https://www.federalreserve.gov/feeds/feds_notes.xml' },
  { publisher: '미국 연준', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { publisher: '유럽중앙은행', url: 'https://www.ecb.europa.eu/rss/press.html' },
];

function field(item: string, name: string) {
  return (
    new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'i')
      .exec(item)?.[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim() ?? ''
  );
}

export function parseNews(xml: string, feed: (typeof feeds)[number], cutoff: number) {
  const items: MorningItem[] = [];
  if (!/<rss\b/i.test(xml) || !/<\/rss>/i.test(xml)) throw new Error('공개 자료 형식 오류');
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const title = field(match[1], 'title'),
      link = field(match[1], 'link');
    const published = Date.parse(field(match[1], 'pubDate'));
    if (
      !title ||
      !URL.canParse(link) ||
      new URL(link).origin !== new URL(feed.url).origin ||
      !Number.isFinite(published) ||
      published > cutoff ||
      cutoff - published > 7 * 86400000
    )
      continue;
    const summary = field(match[1], 'description')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    items.push({
      publisher: feed.publisher,
      summary: summary.slice(0, 420),
      title: title.slice(0, 500),
      url: link,
      publishedAt: new Date(published).toISOString(),
    });
  }
  return items;
}
export async function collectNews(cutoff: number, transport = fetch) {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await transport(feed.url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
      if (!res.ok || !res.body) throw new Error('수집 실패');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of res.body) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) throw new Error('자료 크기 초과');
        chunks.push(chunk);
      }
      return parseNews(Buffer.concat(chunks).toString('utf8'), feed, cutoff);
    }),
  );
  const news: MorningItem[] = [],
    gaps: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') news.push(...r.value);
    if (r.status === 'fulfilled' && !r.value.length)
      gaps.push(feeds[i].publisher + ' · 현재 피드에서 기준 시각에 해당하는 항목 없음');
    if (r.status === 'rejected') gaps.push(feeds[i].publisher + ' 자료 수집 실패');
  });
  return { news: news.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), gaps };
}

const series = [
  { id: 'SP500', name: '미국 S&P 500 지수' },
  { id: 'DEXKOUS', name: '달러당 원화 환율' },
  { id: 'DGS10', name: '미국 10년 국채 금리' },
] as const;

export async function collectIndicators(now: number, transport = fetch) {
  const from = new Date(now - 28 * 86400000).toISOString().slice(0, 10);
  return Promise.all(
    series.map(async (s) => {
      const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + s.id + '&cosd=' + from;
      const empty = { ...s, url, date: null, latest: null, previous: null };
      try {
        const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
        if (!response.ok) return empty;
        const text = (await response.text()).trim();
        if (text.length > 16384 || !text.startsWith('observation_date,' + s.id)) return empty;
        const rows = text
          .split(/\r?\n/)
          .slice(1)
          .map((line) => line.split(','))
          .filter(
            ([date, n]) =>
              /^\d{4}-\d{2}-\d{2}$/.test(date) &&
              date >= from &&
              Date.parse(date) <= now &&
              n?.trim() &&
              Number.isFinite(Number(n)),
          );
        if (rows.length < 2 || now - Date.parse(rows.at(-1)![0]) > 10 * 86400000) return empty;
        return {
          ...s,
          url,
          date: rows.at(-1)![0],
          latest: Number(rows.at(-1)![1]),
          previous: Number(rows.at(-2)![1]),
        };
      } catch {
        return empty;
      }
    }),
  );
}
