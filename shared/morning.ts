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
export interface MorningReport {
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
  approvedAt: string | null;
}
