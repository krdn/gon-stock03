export interface MorningItem {
  summary?: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;
}
export interface MorningCandidate {
  code: string;
  name: string;
  held: number;
  closes: number[];
  asOf: string;
  reference: number;
  exit: number;
  limit: number;
  sector?: string;
  sectorRoom?: number;
  relativeVolume: number;
}
export interface SourcedView {
  publisher: string;
  title?: string;
  url: string;
  publishedAt: string;
  finding: string;
  quote: string;
  matchedCodes?: string[];
}
export interface MorningAnalysisCoverage {
  attempted: number;
  collected: number;
  failed: number;
  failedPublishers?: string[];
}
export interface MorningAnalysis {
  model: string;
  takeaway: string;
  views: SourcedView[];
  counter: SourcedView | null;
  coverage?: MorningAnalysisCoverage;
}
export interface MorningApprovalState {
  allowed: boolean;
  reasons: string[];
}
export interface MorningReport {
  analysis?: MorningAnalysis;
  analysisCoverage?: MorningAnalysisCoverage;
  id: string;
  day: string;
  createdAt: string;
  cutoff: string;
  cash: number | null;
  equity: number | null;
  holdings: { code: string; name: string; qty: number; value: number | null }[];
  conclusion: string;
  sectors?: { sector: string; held: number; planned: number }[];
  exposureComplete: boolean;
  universe: number;
  evaluated: number;
  watch: Omit<MorningCandidate, 'closes'>[];
  candidates: MorningCandidate[];
  retainedCash: number | null;
  research?: {
    chosen: string;
    verified: boolean;
    observations: number;
    testDays: number;
    source: string;
    fraction: number | null;
  };
  costBps?: { buy: number; sell: number };
  dailyLoss: number;
  indicators: {
    id: string;
    name: string;
    url: string;
    date: string | null;
    latest: number | null;
    previous: number | null;
  }[];
  news: MorningItem[];
  gaps: string[];
  approvalBlocked?: boolean;
  approvalBlockReasons?: string[];
  approvedAt: string | null;
}

export const APPROVAL_BLOCK_TEXT = '당일 승인 불가';
export const AFTER_OPEN_BLOCK_REASON = '장전 마감 후 열람용 보고서 · 당일 승인 불가';
export const MISSING_BALANCE_BLOCK_REASON = '장전 잔고 전체 조회 필요';

/**
 * URL을 기관·문서 비교용 정규 형태로 변환합니다(소문자 origin, 끝 슬래시·해시 제거).
 */
export function canonicalSourceUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * 출처의 기관 식별자(정규화된 URL hostname, 파싱 불가 시 정규화된 발행자명)를 반환합니다.
 */
export function sourceInstitutionId(source: Pick<SourcedView, 'publisher' | 'url'>): string {
  try {
    return new URL(source.url).hostname.toLowerCase();
  } catch {
    return source.publisher.trim().toLowerCase();
  }
}

/**
 * 반대 근거가 기존 근거들과 문서(URL)·기관(hostname)·발행자명 모두 독립인지 검사합니다.
 */
export function isIndependentCounter(
  views: readonly Pick<SourcedView, 'publisher' | 'url'>[],
  counter: Pick<SourcedView, 'publisher' | 'url'>,
): boolean {
  const counterUrl = canonicalSourceUrl(counter.url);
  const counterInstitution = sourceInstitutionId(counter);
  const counterPublisher = counter.publisher.trim().toLowerCase();
  return views.every(
    (view) =>
      canonicalSourceUrl(view.url) !== counterUrl &&
      sourceInstitutionId(view) !== counterInstitution &&
      view.publisher.trim().toLowerCase() !== counterPublisher,
  );
}

/**
 * 보고서 자체에 기록된 당일 승인 차단 여부와 사유를 반환합니다.
 * 신규 보고서(`approvalBlocked` boolean 존재)는 구조화 필드를 우선 사용하며,
 * 구 저장 보고서(`approvalBlocked === undefined`)에만 `gaps` 문자열 폴백을 적용합니다.
 */
export function reportApprovalBlocked(
  report: Pick<MorningReport, 'approvalBlocked' | 'approvalBlockReasons' | 'gaps' | 'equity'>,
): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const pushUnique = (reason: string) => {
    const trimmed = reason.trim();
    if (trimmed && !reasons.includes(trimmed)) reasons.push(trimmed);
  };
  if (typeof report.approvalBlocked === 'boolean') {
    if (report.approvalBlockReasons) {
      for (const reason of report.approvalBlockReasons) pushUnique(reason);
    }
    if (report.equity === null || report.equity <= 0) {
      pushUnique(MISSING_BALANCE_BLOCK_REASON);
    }
    const blocked = report.approvalBlocked || reasons.length > 0;
    return { blocked, reasons };
  }
  for (const gap of report.gaps) {
    if (gap.includes(APPROVAL_BLOCK_TEXT)) pushUnique(gap);
  }
  if (report.equity === null || report.equity <= 0) {
    pushUnique(MISSING_BALANCE_BLOCK_REASON);
  }
  return { blocked: reasons.length > 0, reasons };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KOREAN_PARTICLES =
  '에서는|에서도|에서만|으로는|으로도|으로부터|로부터|에게서|에게는|에게도|부터는|까지는|보다는|처럼은|에는|에도|에만|로는|로도|과의|와의|만의|에서|에게|으로|부터|까지|보다|처럼|조차|마저|이나|이랑|이며|하고|은|는|이|가|을|를|의|와|과|도|만|에|로|나|랑|며';
const TRAILING_BOUNDARY = `(?:(?![가-힣A-Za-z0-9&-])|(?:${KOREAN_PARTICLES})(?![가-힣A-Za-z0-9]))`;

function textMatchesCandidate(text: string, candidate: Pick<MorningCandidate, 'code' | 'name'>): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const code = candidate.code.trim();
  if (/^\d{6}$/.test(code)) {
    const codePattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(code)}(?![A-Za-z0-9])`);
    if (codePattern.test(normalized)) return true;
  }
  const name = candidate.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return false;
  const escaped = escapeRegExp(name);
  if (/^[A-Za-z0-9 .&+-]+$/.test(name)) {
    const tokenPattern = new RegExp(`(?<![가-힣A-Za-z0-9&_-])${escaped}${TRAILING_BOUNDARY}`, 'i');
    return tokenPattern.test(normalized);
  }
  const hangulPattern = new RegExp(`(?<![가-힣A-Za-z0-9])${escaped}${TRAILING_BOUNDARY}`, 'i');
  return hangulPattern.test(normalized);
}

/**
 * 원문 텍스트에서 후보 종목명 또는 6자리 종목코드가 결정론적으로 일치하는 코드 목록을 추출합니다.
 * 복합 회사명(예: 현대차증권·한화에어로스페이스·삼성전자우·KT&G) 오매칭을 막기 위해 앞뒤 경계와 조사만 허용합니다.
 */
export function matchCandidateCodesInText(
  text: string,
  candidates: readonly Pick<MorningCandidate, 'code' | 'name'>[],
): string[] {
  const matched: string[] = [];
  for (const candidate of candidates) {
    if (textMatchesCandidate(text, candidate) && !matched.includes(candidate.code)) {
      matched.push(candidate.code);
    }
  }
  return matched;
}

/**
 * 단일 공개 근거(`SourcedView`)에 연결된 후보 종목코드 목록을 결정론적으로 해석합니다.
 * 서버가 원문 전체로 계산한 `matchedCodes`가 있으면 우선 사용하고,
 * 구 보고서 폴백에서는 LLM 요약(`finding`)을 배제하고 원자료(`title`·검증된 `quote`·동일 정규 URL 뉴스)만 사용합니다.
 */
export function resolveViewCandidateCodes(
  view: SourcedView,
  candidates: readonly Pick<MorningCandidate, 'code' | 'name'>[],
  news: readonly MorningItem[] = [],
): string[] {
  if (!candidates.length) return [];
  const validCodes = new Set(candidates.map((c) => c.code));
  if (Array.isArray(view.matchedCodes)) {
    return [...new Set(view.matchedCodes.filter((code) => validCodes.has(code)))];
  }
  const targetUrl = canonicalSourceUrl(view.url);
  const relatedNews = news.filter((item) => canonicalSourceUrl(item.url) === targetUrl);
  const combined = [
    view.title ?? '',
    view.quote,
    ...relatedNews.flatMap((item) => [item.title, item.summary ?? '']),
  ].join('\n');
  return matchCandidateCodesInText(combined, candidates);
}
