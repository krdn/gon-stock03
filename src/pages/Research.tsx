import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, FlaskConical, Link2, Play, Plus, Square, X } from 'lucide-react';
import { useWorkbench } from '../context';
import { Badge, Chart, Panel, Stat } from '../components/ui';
import { won, type Strategy } from '../../shared/model';
import { codeSchema } from '../../shared/contracts';
import { dailyRunsSchema } from '../../shared/data-inventory';
import { marketDate, masterCodeSchema, type DailyRun } from '../../shared/market-data';
import {
  experimentListSchema,
  experimentSchema,
  backtestResultSchema,
  type Experiment,
} from '../../shared/backtest';
import {
  STRATEGY_CATALOG,
  exitOverlaySchema,
  strategyRuleSchema,
  warmup,
  type ExitOverlay,
  type StrategyRule,
} from '../../shared/strategy-rules';
import { z } from 'zod';

import './Strategies.css';
import './Backtest.css';

type StrategyEnvironment = 'demo' | 'kis-paper';
type RuleKind = StrategyRule['kind'];
type PresetKey = 'conservative' | 'basic' | 'aggressive';

/** v1·v2 백테스트 결과를 모두 수용하는 유연한 결과 스키마. */
const benchmarkSchema = backtestResultSchema.pick({
  returnPct: true,
  maxDrawdown: true,
  finalEquity: true,
});
const flexibleTradeSchema = backtestResultSchema.shape.trades.element.extend({
  reason: z.string().min(1).optional(),
});
const flexibleResultSchema = backtestResultSchema.extend({
  trades: z.array(flexibleTradeSchema),
  benchmark: benchmarkSchema.optional(),
});
type FlexibleBacktestResult = z.infer<typeof flexibleResultSchema>;

/** `/strategies` ↔ `/backtest` 간 이동 시 라우터 state로 주고받는 초안 스키마. */
const evidenceSchema = z.strictObject({
  experimentId: z.string().regex(/^[a-f0-9]{64}$/),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
});
type StrategyEvidence = z.infer<typeof evidenceSchema>;

const strategyTransferSchema = z.object({
  code: masterCodeSchema,
  rule: strategyRuleSchema,
  overlay: exitOverlaySchema.optional(),
  evidence: evidenceSchema.optional(),
});
type StrategyTransferDraft = z.infer<typeof strategyTransferSchema>;

/** 규칙·오버레이 입력 폼 상태 (빈 입력·재편집을 안전하게 유지하기 위해 문자열로 보관). */
interface RuleFormState {
  kind: RuleKind;
  maType: 'sma' | 'ema';
  fast: string;
  slow: string;
  regimePeriod: string;
  minRelativeVolume: string;
  entryLookback: string;
  exitLookback: string;
  volumeMultiplier: string;
  rsiPeriod: string;
  oversoldThreshold: string;
  longTrendMa: string;
  exitShortMa: string;
  maxHoldingDays: string;
  useChandelier: boolean;
  atrPeriod: string;
  atrMultiplier: string;
}

const RULE_KINDS: RuleKind[] = ['ma_crossover', 'donchian_breakout', 'rsi2_pullback'];
const PRESET_ENTRIES: { key: PresetKey; label: string }[] = [
  { key: 'conservative', label: '보수적' },
  { key: 'basic', label: '기본' },
  { key: 'aggressive', label: '공격적' },
];

type HelpTabId = 'workflow' | 'dictionary' | 'results' | 'faq';

interface FieldHelpItem {
  term: string;
  range: string;
  description: string;
}

const HELP_TABS: { id: HelpTabId; label: string }[] = [
  { id: 'workflow', label: '처음부터 따라하기' },
  { id: 'dictionary', label: '전략·입력 항목 사전' },
  { id: 'results', label: '백테스트 결과·비용' },
  { id: 'faq', label: '환경별 차이·FAQ' },
];

/** 규칙별 입력 항목 상세 안내 (상단 도움말 사전과 `RuleConfigSection` 문맥 가이드가 공유). */
const RULE_FIELD_HELP: Record<RuleKind, { summary: string; basicPreset: string; fields: FieldHelpItem[] }> = {
  ma_crossover: {
    summary: '단기 이동평균과 장기 이동평균의 교차(골든·데드크로스)로 추세 전환을 포착합니다.',
    basicPreset: 'SMA, 단기 5 / 장기 20 (추세·거래량 필터 꺼짐)',
    fields: [
      {
        term: '단기 / 장기 평균',
        range: '단기 2-60 · 장기 3-120 (단기 < 장기)',
        description:
          '단기선이 장기선을 위로 뚫을 때(골든크로스) 매수, 아래로 뚫을 때(데드크로스) 매도합니다. 기간 숫자를 줄이면 신호가 빨라지지만 속임수(잦은 매매)가 늘고, 늘리면 큰 추세만 느리게 잡습니다.',
      },
      {
        term: '평균 방식 (SMA vs EMA)',
        range: 'SMA · EMA 선택',
        description:
          'SMA는 기간 내 모든 날을 같은 비중으로 평균 내고, EMA는 최근 가격에 더 큰 비중을 두어 추세 전환에 빠르게 반응합니다.',
      },
      {
        term: '장기 추세 필터 (선택)',
        range: '20-240봉 (비우면 미사용)',
        description:
          '예: 60을 넣으면 오늘 종가가 60일 평균선 위에 있는 상승 추세일 때만 매수해 하락장 매수를 막습니다.',
      },
      {
        term: '최소 상대 거래량 (선택)',
        range: '0-5배 (비우면 미사용)',
        description:
          '예: 1.5를 넣으면 오늘 거래량이 직전 20일 평균 거래량의 1.5배 이상 터진 날에만 매수합니다.',
      },
    ],
  },
  donchian_breakout: {
    summary: '가격 채널 돌파와 거래량 확인을 결합한 터틀 트레이딩 방식입니다.',
    basicPreset: '진입 고가 20봉 / 청산 저가 10봉 / 최소 거래량 1배 초과',
    fields: [
      {
        term: '진입 고가 기간',
        range: '10-120봉',
        description:
          '종가가 직전 N일 최고가 이상(>=)으로 마감하고 거래량 조건을 충족할 때 매수합니다(터틀 트레이딩 방식).',
      },
      {
        term: '청산 저가 기간',
        range: '3-60봉 (진입 기간 미만)',
        description:
          '종가가 직전 M일 최저가 이하(<=)로 내려가 마감하면 매도합니다. 진입 기간보다 짧게 설정해 이익을 지킵니다.',
      },
      {
        term: '최소 거래량 배수',
        range: '입력 허용 범위 0.5-5 (양끝 포함) · 판정 기준: 직전 20봉 평균 × 배수 초과(>)',
        description:
          '입력값은 0.5-5 범위로 설정하며, 실제 진입 판정은 돌파 당일 거래량이 직전 20봉 평균 거래량 × 배수를 초과(>)할 때만 매수해 거래량 없는 가짜 돌파를 거릅니다.',
      },
    ],
  },
  rsi2_pullback: {
    summary: '장기 상승 추세 종목이 단기 과매도로 눌렸을 때 반등을 노립니다.',
    basicPreset: 'RSI 기간 2봉 / 과매도 기준 10 이하 / 장기 추세선 200봉 / 청산 단기선 5봉 / 최대 보유 10봉',
    fields: [
      {
        term: '장기 추세선',
        range: '60-240봉 (기본 200)',
        description: '기본 200일선 위에 있는 장기 상승 종목만 골라 하락 추세 종목을 섣불리 사는 위험을 막습니다.',
      },
      {
        term: 'RSI 기간 & 과매도 기준',
        range: 'RSI 기간 2-5봉 · 기준 2-25 이하',
        description:
          '단기 급락 정도를 재는 민감한 지표입니다. 과매도 기준을 10에서 5로 낮추면 더 극단적으로 떨어진 날에만 신중하게 매수합니다.',
      },
      {
        term: '청산 단기선 & 최대 보유 기간',
        range: '청산선 3-10봉 · 보유 3-20봉',
        description:
          '주가가 단기 평균(예: 5일선)을 회복하거나 RSI가 70 이상이 되거나 최대 보유 기간에 도달하면 매도/청산 신호를 냅니다(현재 수익 여부를 검사하지 않으므로 수익 미보장).',
      },
    ],
  },
};

/** 샹들리에 ATR 청산 오버레이 기본 초기값 및 입력 항목 안내. */
const CHANDELIER_BASIC_PRESET = '기본 꺼짐 (활성화 시 초기값: ATR 기간 14봉 / ATR 배수 3배)';
const CHANDELIER_FIELD_HELP: FieldHelpItem[] = [
  {
    term: '추적 손절 원리',
    range: '선택 오버레이 (고저가 필요 · 저장 일봉 전용)',
    description:
      '매수 후 도달한 최고가에서 하루 평균 변동폭(ATR) × 배수만큼 낮춘 추적 손절선을 계산합니다(한 번 올라간 손절선은 내려가지 않음). 장중 저가 터치가 아니라 저장 일봉에서는 봉의 종가가 추적 손절선 이하(<=)이면 전략 매도 신호보다 먼저 매도 신호를 내고 다음 봉 시가에 체결한다고 가정합니다. DEMO에서는 샹들리에를 사용할 수 없습니다.',
  },
  {
    term: 'ATR 기간 & ATR 배수',
    range: 'ATR 기간 7-30봉 · 배수 1.5-5배',
    description:
      '배수를 줄이면(예: 2.0) 손절선이 촘촘해져 빨리 청산하고, 늘리면(예: 3.0-4.0) 흔들림을 견디며 추세를 길게 탑니다.',
  },
];

/** `/strategies`와 `/backtest` 상단에서 열고 닫는 4탭 상세 사용방법 도움말 패널. */
function ResearchHelpPanel({
  panelId,
  onClose,
}: {
  panelId: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<HelpTabId>('workflow');
  const tabRefs = useRef<Partial<Record<HelpTabId, HTMLButtonElement | null>>>({});

  function moveTab(nextIndex: number) {
    const normalized = (nextIndex + HELP_TABS.length) % HELP_TABS.length;
    const nextTab = HELP_TABS[normalized].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTab(HELP_TABS.length - 1);
    }
  }

  return (
    <section
      id={panelId}
      className="panel research-help"
      role="region"
      aria-label="전략 스튜디오 및 백테스트 사용방법 도움말"
    >
      <div className="research-help-head">
        <div>
          <h2>전략 스튜디오 · 백테스트 사용방법</h2>
          <p className="research-help-sub">
            데이터 준비부터 규칙 선택, 백테스트 비교 검증, 전략 저장까지 순서와 항목 의미를 정리했습니다.
          </p>
        </div>
        <button type="button" className="button secondary small-button" onClick={onClose}>
          <X size={14} aria-hidden="true" />
          닫기
        </button>
      </div>

      <div className="research-help-tabs" role="tablist" aria-label="도움말 주제">
        {HELP_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`${panelId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${panelId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={'research-help-tab' + (selected ? ' active' : '')}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={event => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${panelId}-panel-workflow`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-workflow`}
        tabIndex={activeTab === 'workflow' ? 0 : undefined}
        hidden={activeTab !== 'workflow'}
        className="research-help-body"
      >
        <ol className="research-help-steps">
          <li>
            <span className="research-help-step-no">1단계</span>
            <h3>데이터 준비</h3>
            <p>
              과거 일봉 실험을 위해{' '}
              <Link className="text-link" to="/data#inventory-daily">
                데이터 상태 (/data)
              </Link>
              에서 종목의 KIS 일봉 수집과 달력 대조(<code>passed</code>)가 완료되어 있는지 확인합니다. 합성 봉 연습은
              수집 없이 바로 가능합니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">2단계</span>
            <h3>규칙과 프리셋 선택</h3>
            <p>
              전략 스튜디오나 백테스트에서 전략 규칙(<code>이동평균 교차</code>, <code>돈키안 돌파</code>,{' '}
              <code>RSI 단기 눌림목</code>)을 고르고 <strong>[보수적 / 기본 / 공격적]</strong> 프리셋 버튼으로 시작값을
              채운 뒤 필요하면 <code>샹들리에 ATR 청산</code>을 켭니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">3단계</span>
            <h3>저장 전 백테스트 검증</h3>
            <p>
              바로 저장하지 않고 <strong>이 설정으로 백테스트</strong> 버튼을 눌러 과거 구간 수익률·최대낙폭(MDD)·체결
              횟수를 확인합니다. 다중 전략·EMA·필터·오버레이·장기 101-120(<code>v2</code>) 실행 시에는{' '}
              <strong>단순 보유(저장 일봉은 첫 봉 시가, DEMO는 첫 합성 봉 종가 매수 기준)</strong>와의 비교도 함께
              표시됩니다.
            </p>
          </li>
          <li>
            <span className="research-help-step-no">4단계</span>
            <h3>검증 배지 저장 및 실행</h3>
            <p>
              <strong>KIS 저장 일봉 실험</strong> 결과 화면의 <strong>이 설정으로 전략 만들기</strong> 버튼을 눌러
              돌아오면 <strong>검증 실험 연결</strong> 배지가 자동으로 붙습니다(DEMO 합성 백테스트는 기능 검증 전용으로
              전략 연결·재현 검증 미제공). 이름을 정해 저장한 뒤 DEMO 재생 또는 KIS 모의 계약 연결로 실행합니다.
            </p>
          </li>
        </ol>
      </div>

      <div
        id={`${panelId}-panel-dictionary`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-dictionary`}
        tabIndex={activeTab === 'dictionary' ? 0 : undefined}
        hidden={activeTab !== 'dictionary'}
        className="research-help-body"
      >
        <div className="research-help-grid">
          {RULE_KINDS.map(kind => (
            <article key={kind} className="research-help-card">
              <h3>
                {STRATEGY_CATALOG[kind].title} <code>{kind}</code>
              </h3>
              <p className="research-help-card-note">{RULE_FIELD_HELP[kind].summary}</p>
              <p className="research-help-preset">
                <strong>기본 프리셋 초기값:</strong> {RULE_FIELD_HELP[kind].basicPreset}
              </p>
              <dl className="research-help-dl">
                {RULE_FIELD_HELP[kind].fields.map(item => (
                  <div key={item.term}>
                    <dt>
                      {item.term} <small>{item.range}</small>
                    </dt>
                    <dd>{item.description}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
          <article className="research-help-card">
            <h3>
              샹들리에 ATR 청산 오버레이 <code>chandelier</code>
            </h3>
            <p className="research-help-card-note">
              전략 기본 매도 신호와 별개로 변동성 기반 추적 손절선을 함께 적용하는 보호 장치입니다.
            </p>
            <p className="research-help-preset">
              <strong>초기값:</strong> {CHANDELIER_BASIC_PRESET}
            </p>
            <dl className="research-help-dl">
              {CHANDELIER_FIELD_HELP.map(item => (
                <div key={item.term}>
                  <dt>
                    {item.term} <small>{item.range}</small>
                  </dt>
                  <dd>{item.description}</dd>
                </div>
              ))}
            </dl>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-results`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-results`}
        tabIndex={activeTab === 'results' ? 0 : undefined}
        hidden={activeTab !== 'results'}
        className="research-help-body"
      >
        <div className="research-help-grid">
          <article className="research-help-card">
            <h3>전략 vs 단순 보유(벤치마크) 비교 · 초과 수익률(%p)</h3>
            <p>
              <code>v2</code> 규칙·EMA·필터·오버레이 또는 장기 101-120 실행 시에만 표시됩니다(필터·오버레이가 없는 기본
              SMA 장기 100 이하는 <code>v1</code> 경로라 단순 보유 비교 미표시). 단순 보유 기준가는{' '}
              <strong>KIS 저장 일봉은 첫 봉 시가, DEMO 합성은 첫 합성 봉 종가</strong>이며, 가만히 보유했을 때 대비
              전략의 초과 수익률(%p)을 보여줍니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>최대 낙폭 (MDD)</h3>
            <p>
              실험 기간 중 최고 평가자산 대비 가장 많이 하락했던 폭(%)입니다. 수익률이 비슷하다면 최대 낙폭이 낮은 전략이
              손실 압박이 적어 더 안정적입니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>수수료(bp)와 슬리피지(bp)</h3>
            <p>
              <code>1bp = 0.01%</code>입니다. 슬리피지는 주문 시 호가 차이로 조금 더 비싸게 사고 싸게 팔리는 현실적
              불리함을 반영합니다. 세금·배당·기업행사는 계산에 포함하지 않습니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>고정 입력 재현 검증 (KIS 저장 일봉 전용)</h3>
            <p>
              <strong>KIS 저장 일봉 실험</strong>에서만 제공됩니다(DEMO 합성 백테스트 미제공).{' '}
              <strong>SHA256</strong>은 저장된 입력 스냅샷의 해시를 대조해 입력 위변조 여부를 확인하고,{' '}
              <strong>결과 일치</strong>는 저장된 스냅샷으로 엔진을 다시 실행한 뒤 기존 저장 결과와 동등성을 별도로
              비교해 검증합니다.
            </p>
          </article>
        </div>
      </div>

      <div
        id={`${panelId}-panel-faq`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-faq`}
        tabIndex={activeTab === 'faq' ? 0 : undefined}
        hidden={activeTab !== 'faq'}
        className="research-help-body"
      >
        <div className="research-help-faq">
          <article className="research-help-card">
            <h3>Q. 왜 돈키안 돌파나 샹들리에 청산은 DEMO에서 저장/실행이 안 되나요?</h3>
            <p>
              DEMO 합성 봉은 종가 하나만 생성합니다. 고가·저가·거래량이 꼭 필요한 전략과 샹들리에 청산은 실제 일봉
              데이터가 있는 <strong>KIS 저장 일봉 백테스트</strong>에서만 정확히 계산할 수 있어 DEMO 저장을 차단합니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 왜 새로 만든 다중 전략이나 장기 101-120 SMA가 KIS 모의에서 전략 시작이 잠겨 있나요?</h3>
            <p>
              KIS 모의 계좌에 실제 주문을 내보내는 실시간 장중 평가는 현재 필터·오버레이가 없는 기본 SMA(장기 100 이하)만
              열려 있습니다. 필터·오버레이가 없는 기본 SMA라도 장기 기간이 <code>101-120</code>이면 KIS 모의에서{' '}
              <strong>정지 상태(active=false) 저장과 저장 일봉 백테스트는 가능하지만</strong>, KIS 실시간 시작 계약
              상한(100 이하)에 따라 <strong>전략 시작</strong>은 차단됩니다. 다중 전략·오버레이 역시 백테스트로 검증한 뒤
              후속 장전 레벨 트리거 계약 단계에서 안전하게 열립니다.
            </p>
          </article>
          <article className="research-help-card">
            <h3>Q. 검증 실험 연결 배지가 왜 사라졌나요?</h3>
            <p>
              백테스트에서 넘어온 뒤 종목이나 규칙 숫자를 하나라도 바꾸면 검증받았던 원래 설정과 달라집니다. 허위 검증
              표시를 막기 위해 설정이 바뀌는 즉시 배지가 자동 해제됩니다.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

const evaluationLabels = {
  hold: '관망',
  blocked: '차단',
  sending: '검사·전송 중',
  accepted: '접수 · 체결 미확정',
  unknown: '응답 불명',
  rejected: '거부 · 미전송',
};
const signalLabels = { hold: '관망', buy: '매수', sell: '매도' };
const evaluationTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** 기본 규칙 폼 상태를 생성한다 (기존 E2E 기본값인 SMA 5/20 기준). */
function defaultRuleForm(): RuleFormState {
  const ma = STRATEGY_CATALOG.ma_crossover.presets.basic;
  const donchian = STRATEGY_CATALOG.donchian_breakout.presets.basic;
  const rsi2 = STRATEGY_CATALOG.rsi2_pullback.presets.basic;
  return {
    kind: 'ma_crossover',
    maType: ma.kind === 'ma_crossover' ? ma.maType : 'sma',
    fast: ma.kind === 'ma_crossover' ? String(ma.fast) : '5',
    slow: ma.kind === 'ma_crossover' ? String(ma.slow) : '20',
    regimePeriod: '',
    minRelativeVolume: '',
    entryLookback: donchian.kind === 'donchian_breakout' ? String(donchian.entryLookback) : '20',
    exitLookback: donchian.kind === 'donchian_breakout' ? String(donchian.exitLookback) : '10',
    volumeMultiplier: donchian.kind === 'donchian_breakout' ? String(donchian.volumeMultiplier) : '1',
    rsiPeriod: rsi2.kind === 'rsi2_pullback' ? String(rsi2.rsiPeriod) : '2',
    oversoldThreshold: rsi2.kind === 'rsi2_pullback' ? String(rsi2.oversoldThreshold) : '10',
    longTrendMa: rsi2.kind === 'rsi2_pullback' ? String(rsi2.longTrendMa) : '200',
    exitShortMa: rsi2.kind === 'rsi2_pullback' ? String(rsi2.exitShortMa) : '5',
    maxHoldingDays: rsi2.kind === 'rsi2_pullback' ? String(rsi2.maxHoldingDays) : '10',
    useChandelier: false,
    atrPeriod: '14',
    atrMultiplier: '3',
  };
}

/** 규칙·오버레이 객체를 폼 상태로 변환한다. */
function formFromRule(rule?: StrategyRule, overlay?: ExitOverlay): RuleFormState {
  const base = defaultRuleForm();
  if (overlay?.chandelier) {
    base.useChandelier = true;
    base.atrPeriod = String(overlay.chandelier.atrPeriod);
    base.atrMultiplier = String(overlay.chandelier.atrMultiplier);
  }
  if (!rule) return base;
  base.kind = rule.kind;
  switch (rule.kind) {
    case 'ma_crossover':
      base.maType = rule.maType;
      base.fast = String(rule.fast);
      base.slow = String(rule.slow);
      base.regimePeriod = rule.regimePeriod ? String(rule.regimePeriod) : '';
      base.minRelativeVolume = rule.minRelativeVolume ? String(rule.minRelativeVolume) : '';
      break;
    case 'donchian_breakout':
      base.entryLookback = String(rule.entryLookback);
      base.exitLookback = String(rule.exitLookback);
      base.volumeMultiplier = String(rule.volumeMultiplier);
      break;
    case 'rsi2_pullback':
      base.rsiPeriod = String(rule.rsiPeriod);
      base.oversoldThreshold = String(rule.oversoldThreshold);
      base.longTrendMa = String(rule.longTrendMa);
      base.exitShortMa = String(rule.exitShortMa);
      base.maxHoldingDays = String(rule.maxHoldingDays);
      break;
  }
  return base;
}

/** 현재 폼에 카탈로그 프리셋을 적용한다. */
function applyPreset(form: RuleFormState, presetKey: PresetKey): RuleFormState {
  const preset = STRATEGY_CATALOG[form.kind].presets[presetKey];
  const next = { ...form };
  switch (preset.kind) {
    case 'ma_crossover':
      next.maType = preset.maType;
      next.fast = String(preset.fast);
      next.slow = String(preset.slow);
      next.regimePeriod = '';
      next.minRelativeVolume = '';
      break;
    case 'donchian_breakout':
      next.entryLookback = String(preset.entryLookback);
      next.exitLookback = String(preset.exitLookback);
      next.volumeMultiplier = String(preset.volumeMultiplier);
      break;
    case 'rsi2_pullback':
      next.rsiPeriod = String(preset.rsiPeriod);
      next.oversoldThreshold = String(preset.oversoldThreshold);
      next.longTrendMa = String(preset.longTrendMa);
      next.exitShortMa = String(preset.exitShortMa);
      next.maxHoldingDays = String(preset.maxHoldingDays);
      break;
  }
  return next;
}

/** 현재 폼 값이 일치하는 프리셋 키를 반환한다. */
function matchedPreset(form: RuleFormState): PresetKey | null {
  for (const { key } of PRESET_ENTRIES) {
    const preset = STRATEGY_CATALOG[form.kind].presets[key];
    if (preset.kind === 'ma_crossover' && form.kind === 'ma_crossover') {
      if (
        form.maType === preset.maType &&
        Number(form.fast) === preset.fast &&
        Number(form.slow) === preset.slow &&
        form.regimePeriod.trim() === '' &&
        (form.minRelativeVolume.trim() === '' || Number(form.minRelativeVolume) === 0)
      ) {
        return key;
      }
    } else if (preset.kind === 'donchian_breakout' && form.kind === 'donchian_breakout') {
      if (
        Number(form.entryLookback) === preset.entryLookback &&
        Number(form.exitLookback) === preset.exitLookback &&
        Number(form.volumeMultiplier) === preset.volumeMultiplier
      ) {
        return key;
      }
    } else if (preset.kind === 'rsi2_pullback' && form.kind === 'rsi2_pullback') {
      if (
        Number(form.rsiPeriod) === preset.rsiPeriod &&
        Number(form.oversoldThreshold) === preset.oversoldThreshold &&
        Number(form.longTrendMa) === preset.longTrendMa &&
        Number(form.exitShortMa) === preset.exitShortMa &&
        Number(form.maxHoldingDays) === preset.maxHoldingDays
      ) {
        return key;
      }
    }
  }
  return null;
}

/** `noValidate` 폼에서 불완전 숫자(`1e` 등 `validity.badInput`) 입력 필드를 검출한다. */
function findBadNumberInput(form: HTMLFormElement | null): HTMLInputElement | null {
  if (!form) return null;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
    if (!input.disabled && input.validity.badInput) return input;
  }
  return null;
}

/** 불완전 숫자 입력 필드에 대한 한글 오류 문구를 생성한다. */
function badNumberMessage(input: HTMLInputElement): string {
  const label = input.closest('label')?.childNodes[0]?.textContent?.trim();
  return label ? `${label} 항목에 올바른 숫자를 입력하세요.` : '숫자 입력 형식이 올바르지 않습니다.';
}

/** 폼 상태에서 스키마 검증을 거친 규칙·오버레이를 조립한다. */
function buildRuleAndOverlay(
  form: RuleFormState,
): { ok: true; rule: StrategyRule; overlay?: ExitOverlay } | { ok: false; error: string; focusName?: string } {
  let rawRule: unknown;
  if (form.kind === 'ma_crossover') {
    const fast = Number(form.fast);
    const slow = Number(form.slow);
    if (form.fast.trim() === '' || !Number.isInteger(fast) || fast < 2 || fast > 60) {
      return { ok: false, error: '단기 기간은 2-60 사이의 정수로 입력하세요.', focusName: 'fast' };
    }
    if (form.slow.trim() === '' || !Number.isInteger(slow) || slow < 3 || slow > 120) {
      return { ok: false, error: '장기 기간은 3-120 사이의 정수로 입력하세요.', focusName: 'slow' };
    }
    if (fast >= slow) {
      return { ok: false, error: '단기 기간은 장기 기간보다 작아야 합니다.', focusName: 'fast' };
    }
    const trimmedRegime = form.regimePeriod.trim();
    const trimmedVol = form.minRelativeVolume.trim();
    const maRule: Record<string, unknown> = {
      kind: 'ma_crossover',
      maType: form.maType,
      fast,
      slow,
    };
    if (trimmedRegime !== '') {
      const regime = Number(trimmedRegime);
      if (!Number.isInteger(regime) || regime < 20 || regime > 240) {
        return { ok: false, error: '장기 추세 필터는 20-240 사이의 정수로 입력하세요.', focusName: 'regimePeriod' };
      }
      maRule.regimePeriod = regime;
    }
    if (trimmedVol !== '') {
      const vol = Number(trimmedVol);
      if (!Number.isFinite(vol) || vol < 0 || vol > 5) {
        return { ok: false, error: '최소 상대 거래량은 0-5 범위의 숫자로 입력하세요.', focusName: 'minRelativeVolume' };
      }
      if (vol > 0) maRule.minRelativeVolume = vol;
    }
    rawRule = maRule;
  } else if (form.kind === 'donchian_breakout') {
    const entryLookback = Number(form.entryLookback);
    const exitLookback = Number(form.exitLookback);
    const volumeMultiplier = Number(form.volumeMultiplier);
    if (form.entryLookback.trim() === '' || !Number.isInteger(entryLookback) || entryLookback < 10 || entryLookback > 120) {
      return { ok: false, error: '진입 고가 기간은 10-120 사이의 정수로 입력하세요.', focusName: 'entryLookback' };
    }
    if (form.exitLookback.trim() === '' || !Number.isInteger(exitLookback) || exitLookback < 3 || exitLookback > 60) {
      return { ok: false, error: '청산 저가 기간은 3-60 사이의 정수로 입력하세요.', focusName: 'exitLookback' };
    }
    if (exitLookback >= entryLookback) {
      return { ok: false, error: '청산 기간은 진입 기간보다 작아야 합니다.', focusName: 'exitLookback' };
    }
    if (form.volumeMultiplier.trim() === '' || !Number.isFinite(volumeMultiplier) || volumeMultiplier < 0.5 || volumeMultiplier > 5) {
      return { ok: false, error: '최소 거래량 배수는 0.5-5 범위의 숫자로 입력하세요.', focusName: 'volumeMultiplier' };
    }
    rawRule = { kind: 'donchian_breakout', entryLookback, exitLookback, volumeMultiplier };
  } else {
    const rsiPeriod = Number(form.rsiPeriod);
    const oversoldThreshold = Number(form.oversoldThreshold);
    const longTrendMa = Number(form.longTrendMa);
    const exitShortMa = Number(form.exitShortMa);
    const maxHoldingDays = Number(form.maxHoldingDays);
    if (form.rsiPeriod.trim() === '' || !Number.isInteger(rsiPeriod) || rsiPeriod < 2 || rsiPeriod > 5) {
      return { ok: false, error: 'RSI 기간은 2-5 사이의 정수로 입력하세요.', focusName: 'rsiPeriod' };
    }
    if (form.oversoldThreshold.trim() === '' || !Number.isFinite(oversoldThreshold) || oversoldThreshold < 2 || oversoldThreshold > 25) {
      return { ok: false, error: '과매도 기준은 2-25 범위의 숫자로 입력하세요.', focusName: 'oversoldThreshold' };
    }
    if (form.longTrendMa.trim() === '' || !Number.isInteger(longTrendMa) || longTrendMa < 60 || longTrendMa > 240) {
      return { ok: false, error: '장기 추세선은 60-240 사이의 정수로 입력하세요.', focusName: 'longTrendMa' };
    }
    if (form.exitShortMa.trim() === '' || !Number.isInteger(exitShortMa) || exitShortMa < 3 || exitShortMa > 10) {
      return { ok: false, error: '청산 단기선은 3-10 사이의 정수로 입력하세요.', focusName: 'exitShortMa' };
    }
    if (form.maxHoldingDays.trim() === '' || !Number.isInteger(maxHoldingDays) || maxHoldingDays < 3 || maxHoldingDays > 20) {
      return { ok: false, error: '최대 보유 기간은 3-20 사이의 정수로 입력하세요.', focusName: 'maxHoldingDays' };
    }
    rawRule = {
      kind: 'rsi2_pullback',
      rsiPeriod,
      oversoldThreshold,
      longTrendMa,
      exitShortMa,
      maxHoldingDays,
    };
  }

  const parsedRule = strategyRuleSchema.safeParse(rawRule);
  if (!parsedRule.success) {
    return { ok: false, error: parsedRule.error.issues[0]?.message ?? '전략 규칙 입력값을 확인하세요.' };
  }

  let overlay: ExitOverlay | undefined;
  if (form.useChandelier) {
    const atrPeriod = Number(form.atrPeriod);
    const atrMultiplier = Number(form.atrMultiplier);
    if (form.atrPeriod.trim() === '' || !Number.isInteger(atrPeriod) || atrPeriod < 7 || atrPeriod > 30) {
      return { ok: false, error: '샹들리에 청산 ATR 기간은 7-30 사이의 정수로 입력하세요.', focusName: 'atrPeriod' };
    }
    if (form.atrMultiplier.trim() === '' || !Number.isFinite(atrMultiplier) || atrMultiplier < 1.5 || atrMultiplier > 5) {
      return { ok: false, error: '샹들리에 청산 ATR 배수는 1.5-5 범위의 숫자로 입력하세요.', focusName: 'atrMultiplier' };
    }
    const parsedOverlay = exitOverlaySchema.safeParse({
      chandelier: { atrPeriod, atrMultiplier },
    });
    if (!parsedOverlay.success) {
      return { ok: false, error: '샹들리에 청산은 ATR 기간 7-30, 배수 1.5-5 범위로 입력하세요.', focusName: 'atrPeriod' };
    }
    overlay = parsedOverlay.data;
  }

  return { ok: true, rule: parsedRule.data, overlay };
}

/** v1 기본 SMA 경로(필터·오버레이 없음, 장기 100 이하)인지 판정한다. */
function isLegacySma(
  rule: StrategyRule,
  overlay?: ExitOverlay,
): rule is Extract<StrategyRule, { kind: 'ma_crossover' }> {
  return (
    rule.kind === 'ma_crossover' &&
    rule.maType === 'sma' &&
    rule.slow <= 100 &&
    !rule.regimePeriod &&
    !rule.minRelativeVolume &&
    !overlay?.chandelier
  );
}

/** DEMO(종가 전용) 환경에서 실행·저장 가능한 규칙 조합인지 확인한다. */
function isDemoRuleSupported(form: RuleFormState): boolean {
  if (form.useChandelier) return false;
  if (form.kind === 'donchian_breakout') return false;
  if (form.kind === 'ma_crossover' && form.minRelativeVolume.trim() !== '' && Number(form.minRelativeVolume) > 0) {
    return false;
  }
  return true;
}

/** KIS 모의 실시간 평가 및 계약(`strategyContractSchema`, slow <= 100)에서 즉시 시작 가능한 규칙인지 확인한다. */
function kisRealtimeBlockReason(rule?: StrategyRule, overlay?: ExitOverlay, slow?: number): string {
  if (overlay?.chandelier) {
    return '신규 다중 전략 규칙·오버레이는 장전 레벨 트리거 계약 연결 후 실시간 시작 가능합니다.';
  }
  if (!rule) {
    return (slow ?? 0) > 100 ? 'KIS 모의 기본 SMA 계약은 장기 기간 100 이하만 지원합니다.' : '';
  }
  if (rule.kind !== 'ma_crossover' || rule.maType !== 'sma' || rule.regimePeriod || rule.minRelativeVolume) {
    return '신규 다중 전략 규칙·오버레이는 장전 레벨 트리거 계약 연결 후 실시간 시작 가능합니다.';
  }
  if (rule.slow > 100) {
    return 'KIS 모의 기본 SMA 계약은 장기 기간 100 이하만 지원합니다.';
  }
  return '';
}

/** 폼 상태에서 KIS 모의 기본 SMA 장기 기간 계약 상한(100) 초과 여부를 판정한다. */
function isKisBasicSmaSlowExceeded(form: RuleFormState): boolean {
  return (
    !form.useChandelier &&
    form.kind === 'ma_crossover' &&
    form.maType === 'sma' &&
    form.regimePeriod.trim() === '' &&
    (form.minRelativeVolume.trim() === '' || Number(form.minRelativeVolume) <= 0) &&
    form.slow.trim() !== '' &&
    Number(form.slow) > 100
  );
}

/** 폼 상태에서 KIS 모의 실시간 즉시 시작 가능 여부를 판정한다. */
function isKisRealtimeFormSupported(form: RuleFormState): boolean {
  if (form.useChandelier) return false;
  if (form.kind !== 'ma_crossover') return false;
  if (form.maType !== 'sma') return false;
  if (form.regimePeriod.trim() !== '') return false;
  if (form.minRelativeVolume.trim() !== '' && Number(form.minRelativeVolume) > 0) return false;
  return true;
}

/** 저장된 실험 입력에서 표준 StrategyRule을 추출한다. */
function ruleFromExperimentInput(input: Experiment['snapshot']['input']): StrategyRule {
  if ('rule' in input) return input.rule;
  return { kind: 'ma_crossover', maType: 'sma', fast: input.fast, slow: input.slow };
}

/** 규칙과 오버레이를 한 줄 한글 요약으로 포맷한다. */
function formatRuleSummary(rule: StrategyRule, overlay?: ExitOverlay): string {
  const parts: string[] = [];
  if (rule.kind === 'ma_crossover') {
    parts.push(`${STRATEGY_CATALOG.ma_crossover.title} (${rule.maType.toUpperCase()} ${rule.fast}/${rule.slow})`);
    if (rule.regimePeriod) parts.push(`추세선 ${rule.regimePeriod}봉`);
    if (rule.minRelativeVolume) parts.push(`상대거래량 ${rule.minRelativeVolume}배+`);
  } else if (rule.kind === 'donchian_breakout') {
    parts.push(
      `${STRATEGY_CATALOG.donchian_breakout.title} (진입 ${rule.entryLookback} / 청산 ${rule.exitLookback} · 거래량 ${rule.volumeMultiplier}배 초과)`,
    );
  } else {
    parts.push(
      `${STRATEGY_CATALOG.rsi2_pullback.title} (RSI${rule.rsiPeriod} ≤ ${rule.oversoldThreshold} · 장기 ${rule.longTrendMa} · 청산 ${rule.exitShortMa} · 최대 ${rule.maxHoldingDays}봉)`,
    );
  }
  if (overlay?.chandelier) {
    parts.push(`샹들리에 ATR(${overlay.chandelier.atrPeriod})×${overlay.chandelier.atrMultiplier}`);
  }
  return parts.join(' · ');
}

/** 환경 지원 여부 표시 문자열을 반환한다. */
function environmentAvailabilityText(value: boolean | string): string {
  if (value === true) return '지원';
  if (value === false) return '미지원';
  return value;
}

/** 라우터 state에서 유효한 전략/백테스트 초안을 안전하게 파싱한다. */
function parseTransferDraft(raw: unknown): StrategyTransferDraft | null {
  const parsed = strategyTransferSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 규칙 카탈로그 안내(3줄 설명 + 환경 배지 + 프리셋) 및 규칙별 세부 입력·오버레이 UI. */
function RuleConfigSection({
  form,
  onChange,
  disabled,
  mode,
  unit,
  periodError,
  periodErrorId,
}: {
  form: RuleFormState;
  onChange: (next: RuleFormState) => void;
  disabled?: boolean;
  mode: 'strategy' | 'stored' | 'demo';
  unit: string;
  periodError?: boolean;
  periodErrorId?: string;
}) {
  const catalog = STRATEGY_CATALOG[form.kind];
  const activePreset = matchedPreset(form);
  const fastLabel = mode === 'strategy' ? `단기 평균 (${unit})` : '단기 (봉)';
  const slowLabel = mode === 'strategy' ? `장기 평균 (${unit})` : '장기 (봉)';
  const update = (patch: Partial<RuleFormState>) => onChange({ ...form, ...patch });

  return (
    <div className="rule-config">
      <label className="field">
        전략 규칙
        <select
          value={form.kind}
          disabled={disabled}
          onChange={e => update({ kind: e.target.value as RuleKind })}
        >
          {RULE_KINDS.map(kind => (
            <option key={kind} value={kind}>
              {STRATEGY_CATALOG[kind].title}
            </option>
          ))}
        </select>
      </label>

      <div className="rule-guide" aria-label="규칙 요약 안내">
        <ul className="rule-guide-lines">
          <li>
            <strong>매수</strong>
            <span>{catalog.buyWhen}</span>
          </li>
          <li>
            <strong>매도</strong>
            <span>{catalog.sellWhen}</span>
          </li>
          <li>
            <strong>주의</strong>
            <span>{catalog.cautionRegime}</span>
          </li>
        </ul>
        <div className="rule-env-badges" aria-label="환경별 사용 가능 여부">
          <Badge tone={catalog.environments.daily ? 'teal' : 'neutral'}>
            저장 일봉 · {environmentAvailabilityText(catalog.environments.daily)}
          </Badge>
          <Badge tone={catalog.environments.demo ? 'teal' : 'neutral'}>
            DEMO · {environmentAvailabilityText(catalog.environments.demo)}
          </Badge>
          <Badge tone={catalog.environments.kisPaper ? 'teal' : 'neutral'}>
            KIS 모의 · {environmentAvailabilityText(catalog.environments.kisPaper)}
          </Badge>
        </div>
      </div>

      <div className="rule-presets" role="group" aria-label="규칙 프리셋">
        <span className="rule-presets-label">프리셋</span>
        <div className="rule-preset-buttons">
          {PRESET_ENTRIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={activePreset === key}
              className={'button small-button ' + (activePreset === key ? 'primary' : 'secondary')}
              onClick={() => onChange(applyPreset(form, key))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {form.kind === 'ma_crossover' && (
        <>
          <div className="form-grid">
            <label className="field">
              {fastLabel}
              <input
                name="fast"
                type="number"
                min="2"
                max="60"
                value={form.fast}
                onChange={e => update({ fast: e.target.value })}
                required
                aria-invalid={periodError || undefined}
                aria-describedby={periodError ? periodErrorId : undefined}
              />
            </label>
            <label className="field">
              {slowLabel}
              <input
                name="slow"
                type="number"
                min="3"
                max="120"
                value={form.slow}
                onChange={e => update({ slow: e.target.value })}
                required
                aria-invalid={periodError || undefined}
                aria-describedby={periodError ? periodErrorId : undefined}
              />
            </label>
          </div>
          {periodError && (
            <p className="studio-warning" id={periodErrorId} role="alert">
              단기 평균은 장기 평균보다 작아야 합니다.
            </p>
          )}
          <div className="form-grid">
            <label className="field">
              평균 방식
              <select
                value={form.maType}
                disabled={disabled}
                onChange={e => update({ maType: e.target.value as 'sma' | 'ema' })}
              >
                <option value="sma">SMA (단순 이동평균)</option>
                <option value="ema">EMA (지수 이동평균)</option>
              </select>
            </label>
            <label className="field">
              장기 추세 필터 (봉, 선택)
              <input
                name="regimePeriod"
                type="number"
                min="20"
                max="240"
                placeholder="사용 안 함"
                value={form.regimePeriod}
                onChange={e => update({ regimePeriod: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            최소 상대 거래량 (배, 선택)
            <input
              name="minRelativeVolume"
              type="number"
              min="0"
              max="5"
              step="0.1"
              placeholder="사용 안 함"
              value={form.minRelativeVolume}
              onChange={e => update({ minRelativeVolume: e.target.value })}
            />
          </label>
        </>
      )}

      {form.kind === 'donchian_breakout' && (
        <>
          <div className="form-grid">
            <label className="field">
              진입 고가 기간 (봉)
              <input
                name="entryLookback"
                type="number"
                min="10"
                max="120"
                value={form.entryLookback}
                onChange={e => update({ entryLookback: e.target.value })}
                required
              />
            </label>
            <label className="field">
              청산 저가 기간 (봉)
              <input
                name="exitLookback"
                type="number"
                min="3"
                max="60"
                value={form.exitLookback}
                onChange={e => update({ exitLookback: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            최소 거래량 배수 (초과)
            <input
              name="volumeMultiplier"
              type="number"
              min="0.5"
              max="5"
              step="0.1"
              value={form.volumeMultiplier}
              onChange={e => update({ volumeMultiplier: e.target.value })}
              required
            />
          </label>
        </>
      )}

      {form.kind === 'rsi2_pullback' && (
        <>
          <div className="form-grid">
            <label className="field">
              RSI 기간 (봉)
              <input
                name="rsiPeriod"
                type="number"
                min="2"
                max="5"
                value={form.rsiPeriod}
                onChange={e => update({ rsiPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              과매도 기준 (RSI 이하)
              <input
                name="oversoldThreshold"
                type="number"
                min="2"
                max="25"
                step="0.5"
                value={form.oversoldThreshold}
                onChange={e => update({ oversoldThreshold: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              장기 추세선 (봉)
              <input
                name="longTrendMa"
                type="number"
                min="60"
                max="240"
                value={form.longTrendMa}
                onChange={e => update({ longTrendMa: e.target.value })}
                required
              />
            </label>
            <label className="field">
              청산 단기선 (봉)
              <input
                name="exitShortMa"
                type="number"
                min="3"
                max="10"
                value={form.exitShortMa}
                onChange={e => update({ exitShortMa: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            최대 보유 기간 (봉)
            <input
              name="maxHoldingDays"
              type="number"
              min="3"
              max="20"
              value={form.maxHoldingDays}
              onChange={e => update({ maxHoldingDays: e.target.value })}
              required
            />
          </label>
        </>
      )}

      <div className="rule-overlay-box">
        <label className="rule-checkbox">
          <input
            type="checkbox"
            checked={form.useChandelier}
            disabled={disabled}
            onChange={e => update({ useChandelier: e.target.checked })}
          />
          <span>샹들리에 ATR 청산 오버레이 사용</span>
        </label>
        {form.useChandelier && (
          <div className="form-grid">
            <label className="field">
              ATR 기간 (봉)
              <input
                name="atrPeriod"
                type="number"
                min="7"
                max="30"
                value={form.atrPeriod}
                onChange={e => update({ atrPeriod: e.target.value })}
                required
              />
            </label>
            <label className="field">
              ATR 배수
              <input
                name="atrMultiplier"
                type="number"
                min="1.5"
                max="5"
                step="0.1"
                value={form.atrMultiplier}
                onChange={e => update({ atrMultiplier: e.target.value })}
                required
              />
            </label>
          </div>
        )}
      </div>

      <details className="rule-field-help">
        <summary>현재 선택한 규칙({catalog.title}) 입력 항목 설명 보기</summary>
        <div className="rule-field-help-content">
          <p className="rule-field-help-summary">{RULE_FIELD_HELP[form.kind].summary}</p>
          <p className="rule-field-help-preset">
            <strong>기본 프리셋 초기값:</strong> {RULE_FIELD_HELP[form.kind].basicPreset}
          </p>
          <dl className="rule-field-help-list">
            {RULE_FIELD_HELP[form.kind].fields.map(item => (
              <div key={item.term}>
                <dt>
                  {item.term} <small>{item.range}</small>
                </dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
          <p className="rule-field-help-overlay-title">
            샹들리에 ATR 청산 오버레이 ({form.useChandelier ? '사용 중' : '선택 사항'}) · {CHANDELIER_BASIC_PRESET}
          </p>
          <dl className="rule-field-help-list">
            {CHANDELIER_FIELD_HELP.map(item => (
              <div key={item.term}>
                <dt>
                  {item.term} <small>{item.range}</small>
                </dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}

/** 환경 전환 시에도 편집값과 해제된 evidence 상태를 보존하는 전략 에디터 초안 상태. */
interface StrategyEditorDraft {
  name: string;
  code: string;
  ruleForm: RuleFormState;
  evidence?: StrategyEvidence;
  qty: string;
  attempted: boolean;
  formError: string;
  draftSourceCode?: string;
}

function defaultEditorDraft(): StrategyEditorDraft {
  return {
    name: '나의 이동평균 전략',
    code: '069500',
    ruleForm: defaultRuleForm(),
    evidence: undefined,
    qty: '1',
    attempted: false,
    formError: '',
    draftSourceCode: undefined,
  };
}

function editorDraftFromTransfer(draft: StrategyTransferDraft): StrategyEditorDraft {
  return {
    name: `${STRATEGY_CATALOG[draft.rule.kind].title} 전략`,
    code: draft.code,
    ruleForm: formFromRule(draft.rule, draft.overlay),
    evidence: draft.evidence,
    qty: '1',
    attempted: false,
    formError: '',
    draftSourceCode: draft.code,
  };
}

/** 전략 스튜디오 최상위 페이지 (`/strategies`). */
export function Strategies() {
  const [params, setParams] = useSearchParams();
  const { busy, available } = useWorkbench();
  const environment = params.get('environment') === 'kis-paper' ? 'kis-paper' : 'demo';
  const location = useLocation();
  const routerDraft = parseTransferDraft((location.state as { backtestDraft?: unknown } | null)?.backtestDraft);
  const [editorDraft, setEditorDraft] = useState<StrategyEditorDraft>(() =>
    routerDraft ? editorDraftFromTransfer(routerDraft) : defaultEditorDraft(),
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const consumedDraftKey = useRef(routerDraft ? location.key : '');

  useEffect(() => {
    if (!routerDraft || consumedDraftKey.current === location.key) return;
    consumedDraftKey.current = location.key;
    setEditorDraft(editorDraftFromTransfer(routerDraft));
  }, [routerDraft, location.key]);

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  return (
    <section className="strategy-studio" aria-label="전략 작업">
      <div className="studio-tools">
        <label className="field">
          전략 환경
          <select
            value={environment}
            disabled={!available || busy}
            onChange={e => {
              const next = new URLSearchParams(params);
              next.set('environment', e.target.value);
              setEditorDraft(prev => ({ ...prev, attempted: false, formError: '' }));
              setParams(next);
            }}
          >
            <option value="demo">DEMO 합성 봉</option>
            <option value="kis-paper">KIS 모의 체결가 이벤트</option>
          </select>
        </label>
        <div className="studio-tools-actions">
          <button
            ref={helpToggleRef}
            type="button"
            className={'button ' + (helpOpen ? 'primary' : 'secondary')}
            aria-expanded={helpOpen}
            aria-controls={helpPanelId}
            onClick={() => setHelpOpen(open => !open)}
          >
            <BookOpen size={15} aria-hidden="true" />
            사용방법 도움말
          </button>
          <Link className="button secondary" to={{ search: location.search, hash: '#strategy-editor' }}>
            <Plus size={15} />새 전략 만들기
          </Link>
        </div>
      </div>
      {helpOpen && <ResearchHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
      <StrategyStudio
        key={environment}
        environment={environment}
        editorDraft={editorDraft}
        setEditorDraft={setEditorDraft}
      />
    </section>
  );
}

function StrategyStudio({
  environment,
  editorDraft,
  setEditorDraft,
}: {
  environment: StrategyEnvironment;
  editorDraft: StrategyEditorDraft;
  setEditorDraft: React.Dispatch<React.SetStateAction<StrategyEditorDraft>>;
}) {
  const kis = environment === 'kis-paper';
  const { state, act, busy, available, server, status } = useWorkbench();
  const { search, hash, key } = useLocation();
  const navigate = useNavigate();
  const strategies = server ? state.strategies.filter(s => (s.environment ?? 'demo') === environment) : [];
  const latest = strategies
    .filter(s => s.evaluations?.length)
    .sort((a, b) => Date.parse(b.evaluations![0].at) - Date.parse(a.evaluations![0].at))[0];
  const evaluation = latest?.evaluations?.[0];
  const [savedId, setSavedId] = useState('');
  useEffect(() => {
    if (savedId) {
      setSavedId('');
      navigate({ search, hash: '#strategy-' + savedId }, { replace: true });
    }
  }, [savedId, navigate, search]);
  const loading = status.phase === 'loading';
  const rechecking = loading && Boolean(server);
  let emptyList = '새 규칙을 저장하면 여기에 표시합니다.';
  let evaluationNotice = '';
  let replayStatus = `합성 봉 #${state.tick} · ${state.playing ? '3초마다 자동 평가 중' : state.risk.halted ? '긴급정지로 재생 시작 차단' : '재생 정지'}`;
  if (!available) {
    if (loading) emptyList = rechecking ? '저장 전략 재확인 중 · 마지막 조회는 0건입니다.' : '저장 전략을 불러오는 중입니다.';
    else emptyList = server ? '마지막 조회는 0건입니다. 최신 목록은 미확인입니다.' : '로컬 조회 실패 · 저장 전략 미확인';
    if (server) {
      const previous = evaluation ? '마지막 조회 기록' : '마지막 조회에서 평가 기록 없음';
      evaluationNotice = (rechecking ? '최신 평가 재확인 중' : '최신 평가 미확인') + ' · ' + previous;
    } else {
      evaluationNotice = loading ? '저장된 평가 불러오는 중' : '로컬 조회 실패 · 평가 미확인';
    }
    replayStatus = rechecking ? '재생 상태 재확인 중' : loading ? '재생 상태 조회 중' : '재생 상태 미확인';
  }
  const targetId = hash.slice(1);
  const targetExists =
    targetId === 'strategy-editor' ||
    (kis && targetId === 'strategy-evaluations') ||
    strategies.some(s => targetId === 'strategy-' + s.id);
  useEffect(() => {
    if (!targetExists) return;
    const target = document.getElementById(targetId);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [targetId, targetExists, key]);
  return (
    <div className="studio-grid">
      <div className="studio-results">
        {kis ? (
          <section className="panel studio-recent" aria-labelledby="strategy-evaluations">
            <h2 id="strategy-evaluations" tabIndex={-1}>
              최근 KIS 평가
            </h2>
            {evaluationNotice && <p className={loading ? 'studio-meta' : 'studio-warning'}>{evaluationNotice}</p>}
            {latest && evaluation ? (
              <>
                <div className="studio-result-line">
                  <span className={'studio-outcome ' + evaluation.status}>{evaluationLabels[evaluation.status]}</span>
                  <strong>{evaluation.reason}</strong>
                </div>
                <p className="studio-meta">
                  {latest.name} · revision {evaluation.revision} · {signalLabels[evaluation.signal]}
                </p>
                <p className="studio-meta">
                  <time dateTime={evaluation.at}>{evaluationTime.format(new Date(evaluation.at))} KST</time> · 로컬 저장 기록
                </p>
                <Link className="text-link" to={{ search, hash: '#strategy-' + latest.id }}>
                  해당 전략 보기
                </Link>
              </>
            ) : (
              available && (
                <p>
                  {strategies.length
                    ? '평가 기록 없음 · 시작 후 새 체결가 이벤트가 필요합니다.'
                    : '저장된 KIS 전략이 없습니다.'}
                </p>
              )
            )}
          </section>
        ) : (
          <div className="studio-replay">
            <div>
              <strong>DEMO 봉 재생</strong>
              <p className="studio-meta">{replayStatus}</p>
            </div>
            <button
              className="button secondary"
              disabled={busy || !available || (!state.playing && state.risk.halted)}
              onClick={() => void act('playback').catch(() => {})}
            >
              {!available ? '자동 재생 제어' : state.playing ? '자동 재생 정지' : '자동 재생 시작'}
            </button>
          </div>
        )}
        <div className="studio-list-title">
          <h2>저장 전략</h2>
          <span className="studio-meta">
            {server ? `${strategies.length}개${available ? '' : ' · 이전 조회'}` : loading ? '조회 중' : '미확인'}
          </span>
        </div>
        {!strategies.length && <p className="studio-meta">{emptyList}</p>}
        {strategies.map(strategy => (
          <StrategyCard key={strategy.id} strategy={strategy} kis={kis} />
        ))}
        <details className="panel studio-rules">
          <summary>실행 규칙</summary>
          {kis ? (
            <>
              <p>
                검증된 KRX 체결가 이벤트의 이동평균 교차를 평가합니다. 분봉·일봉 계산과 단위가 다릅니다. 표본 부족과
                교차 없음도 기록합니다.
              </p>
              <p>
                계좌 보유 매도가 계약에서 허용되면 수동 보유분도 매도 가능 수량에 포함됩니다. 공통 금액·종목·손실 한도와
                승인 검사를 거치며, 거절된 주문의 예약 횟수와 금액도 사용량에 남습니다. 응답 불명은 재전송하지 말고
                원장을 대조하세요.
              </p>
              <p>
                정지·재시작·연결 중단 후에는 직접 다시 시작해야 합니다. 시작 전에 받은 이벤트는 다시 실행하지 않습니다.
              </p>
            </>
          ) : (
            <p>
              이동평균의 상향 교차는 매수, 하향 교차는 보유 범위의 매도입니다. 수동 매수 보유분도 포함합니다. 같은 봉을
              두 번 평가하지 않습니다. 신규 주문은 다음 봉에서 체결 여부를 판단하며 미체결분은 그 봉에서 만료됩니다.
              서버 재시작 시 전략은 정지합니다.
            </p>
          )}
        </details>
      </div>
      <StrategyEditor
        environment={environment}
        onSaved={setSavedId}
        draft={editorDraft}
        setDraft={setEditorDraft}
      />
    </div>
  );
}

/** 저장된 전략 1건을 규칙 요약·검증 실험 배지·실행 제어와 함께 표시하는 카드. */
function StrategyCard({ strategy: s, kis }: { strategy: Strategy; kis: boolean }) {
  const { state, realtime, act, available, busy, serverNow, status } = useWorkbench();
  const instrument = state.instruments.find(i => i.code === s.code);
  const quoteAge = realtime?.lastQuoteAt ? serverNow - Date.parse(realtime.lastQuoteAt) : Infinity;
  const freshQuote = quoteAge >= 0 && quoteAge <= (realtime?.quoteSeconds ?? 5) * 1000;
  const kisRuleBlock = kis ? kisRealtimeBlockReason(s.rule, s.overlay, s.slow) : '';
  let blocked = '';
  if (state.risk.halted) blocked = '긴급정지 켜짐';
  else if (kis) {
    if (kisRuleBlock) blocked = kisRuleBlock;
    else if (!realtime?.fresh || !realtime.ordersAllowed) blocked = realtime?.message || '실시간 상태 미확인';
    else if (!freshQuote) blocked = '현재 시세 유효 시간 확인 필요';
    else if (realtime.code !== s.code) blocked = '실시간 대조 종목이 전략과 다릅니다.';
  }
  let controlNote = '';
  const rechecking = status.phase === 'loading';
  if (rechecking) controlNote = '서버 실행 상태 재확인 중 · 시작·정지 대기';
  else if (!available)
    controlNote = status.error
      ? '서버 실행 상태 미확인 · 연결 복구 전 시작·정지 불가'
      : '서버 실행 상태 미확인 · 최신 상태 확인 필요';
  else if (blocked) controlNote = (s.active ? '신규 주문 차단 · ' : '전략 시작 차단 · ') + blocked;
  const evaluations = s.evaluations ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const unit = kis ? '이벤트' : '봉';
  const rule = s.rule;

  return (
    <Panel className="studio-card">
      <div className="studio-card-head">
        <h3 id={'strategy-' + s.id} tabIndex={-1}>
          {s.name}
        </h3>
        <div className="studio-card-badges">
          {s.evidence && (
            <Badge tone="teal">
              검증 실험 연결 · {s.evidence.experimentId.slice(0, 8)}
            </Badge>
          )}
          <Badge tone={available && s.active ? 'teal' : 'neutral'}>
            {rechecking ? '재확인 중' : !available ? '상태 미확인' : s.active ? '실행 중' : '정지'}
          </Badge>
        </div>
      </div>
      <p className="studio-meta">
        {kis ? 'KIS 모의' : 'DEMO'} · revision {s.revision ?? 1} · {instrument?.name ?? s.code}
        {instrument && ' ' + s.code}
        {rule && ` · ${STRATEGY_CATALOG[rule.kind].title}`}
      </p>
      <div className="studio-terms">
        {!rule || rule.kind === 'ma_crossover' ? (
          <>
            {rule && (
              <span>
                평균 <b>{rule.maType.toUpperCase()}</b>
              </span>
            )}
            <span>
              단기{' '}
              <b>
                {rule ? rule.fast : s.fast}
                {unit}
              </b>
            </span>
            <span>
              장기{' '}
              <b>
                {rule ? rule.slow : s.slow}
                {unit}
              </b>
            </span>
            {rule?.regimePeriod && (
              <span>
                추세선 <b>{rule.regimePeriod}봉</b>
              </span>
            )}
            {rule?.minRelativeVolume && (
              <span>
                상대거래량 <b>{rule.minRelativeVolume}배+</b>
              </span>
            )}
          </>
        ) : rule.kind === 'donchian_breakout' ? (
          <>
            <span>
              진입 고가 <b>{rule.entryLookback}봉</b>
            </span>
            <span>
              청산 저가 <b>{rule.exitLookback}봉</b>
            </span>
            <span>
              거래량 <b>{rule.volumeMultiplier}배 초과</b>
            </span>
          </>
        ) : (
          <>
            <span>
              RSI({rule.rsiPeriod}) <b>≤ {rule.oversoldThreshold}</b>
            </span>
            <span>
              장기선 <b>{rule.longTrendMa}봉</b>
            </span>
            <span>
              청산선 <b>{rule.exitShortMa}봉</b>
            </span>
            <span>
              최대보유 <b>{rule.maxHoldingDays}봉</b>
            </span>
          </>
        )}
        {s.overlay?.chandelier && (
          <span>
            샹들리에 <b>ATR({s.overlay.chandelier.atrPeriod})×{s.overlay.chandelier.atrMultiplier}</b>
          </span>
        )}
        <span>
          회당 <b>{s.qty}주</b>
        </span>
      </div>
      {kisRuleBlock && (
        <p className="studio-warning">{kisRuleBlock}</p>
      )}
      {kis && (
        <Link className="text-link" to={`/settings/trading/strategy?strategy=${encodeURIComponent(s.id)}`}>
          다음 계약 준비
        </Link>
      )}
      {kis ? (
        <details className="studio-history" onToggle={e => setHistoryOpen(e.currentTarget.open)}>
          <summary>
            최근 평가 · {evaluations.length}건 (최대 100건){!available && ' · 이전 조회'}
          </summary>
          {evaluations.length ? (
            historyOpen &&
            evaluations.map(e => (
              <div className="strategy-evaluation" key={e.event}>
                <p>
                  <strong>{evaluationLabels[e.status]}</strong> · {signalLabels[e.signal]} · revision {e.revision}
                </p>
                <p>{e.reason}</p>
                <p className="studio-meta">
                  <time dateTime={e.at}>{evaluationTime.format(new Date(e.at))} KST</time> · 이벤트 {e.event}
                </p>
                {e.requestId && (
                  <p>
                    요청 ID: <code>{e.requestId}</code> · 주문번호: {e.brokerId ?? '없음'} ·{' '}
                    <Link to="/paper">원장 대조</Link>
                  </p>
                )}
              </div>
            ))
          ) : (
            <p>{available ? '평가 기록 없음 · 시작 이후 새 체결가 이벤트가 필요합니다.' : '평가 기록 미확인'}</p>
          )}
        </details>
      ) : (
        <p className="studio-meta">
          마지막 신호 · {s.lastTick < 0 ? '평가 기록 없음' : signalLabels[s.lastSignal]}
          {!available && ' · 이전 조회'}
        </p>
      )}
      {!kis && controlNote && <p className={rechecking ? 'studio-meta' : 'studio-warning'}>{controlNote}</p>}
      {kis && (
        <p className="studio-meta">
          {controlNote || '별도 서버 계약과 주문별 승인·위험 검사 적용'} · <Link to="/paper">실시간 연결·대조 확인</Link>
        </p>
      )}
      {kis && (
        <p className="studio-meta">
          시작 후 브라우저를 닫아도 서버는 계속 평가합니다. 전략 정지 후에도 접수된 주문은 유지됩니다.
        </p>
      )}
      <div className="button-row">
        <button
          disabled={!available || (s.active ? stopping : busy || Boolean(blocked))}
          className={'button ' + (!available || s.active ? 'secondary' : 'primary')}
          onClick={() => {
            if (s.active) setStopping(true);
            void act(
              kis ? 'kis/strategies/run' : 'strategies/toggle',
              kis ? { id: s.id, active: !s.active } : { id: s.id },
            )
              .catch(() => {})
              .finally(() => {
                if (s.active) setStopping(false);
              });
          }}
        >
          {available && (s.active ? <Square size={14} /> : <Play size={14} />)}
          {!available ? '전략 실행 제어' : s.active ? '전략 정지' : '전략 시작'}
        </button>
        {!kis && (
          <button
            disabled={!available || busy}
            className="button secondary"
            onClick={() => void act('tick').catch(() => {})}
          >
            다음 데모 봉 재생
          </button>
        )}
      </div>
    </Panel>
  );
}

/** 다중 전략 규칙·프리셋·오버레이 작성 및 `/backtest` 초안 전달 에디터. */
function StrategyEditor({
  environment,
  onSaved,
  draft,
  setDraft,
}: {
  environment: StrategyEnvironment;
  onSaved: (id: string) => void;
  draft: StrategyEditorDraft;
  setDraft: React.Dispatch<React.SetStateAction<StrategyEditorDraft>>;
}) {
  const { state, act, busy, available, server, status } = useWorkbench();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const { name, code, ruleForm, evidence, qty, attempted, formError, draftSourceCode } = draft;

  const instruments = server ? state.instruments : [];
  const noSelection = !available
    ? status.phase === 'loading'
      ? '종목 목록 조회 중'
      : '종목 목록 미확인'
    : instruments.length
      ? '종목을 선택하세요'
      : '저장 가능한 종목 없음';
  const validCode = instruments.some(i => i.code === code);
  const invalidPeriods =
    attempted &&
    ruleForm.kind === 'ma_crossover' &&
    ruleForm.fast !== '' &&
    ruleForm.slow !== '' &&
    Number(ruleForm.fast) >= Number(ruleForm.slow);
  const unit = environment === 'kis-paper' ? '이벤트' : '봉';
  const demoUnsupported = environment === 'demo' && !isDemoRuleSupported(ruleForm);
  const kisUnsupported = environment === 'kis-paper' && !isKisRealtimeFormSupported(ruleForm);
  const kisSlowExceeded = environment === 'kis-paper' && isKisBasicSmaSlowExceeded(ruleForm);
  const alphanumericDraftCode = Boolean(draftSourceCode && !codeSchema.safeParse(draftSourceCode).success);

  function focusField(fieldName?: string) {
    if (!fieldName) return;
    formRef.current?.querySelector<HTMLInputElement>(`[name="${fieldName}"]`)?.focus();
  }

  function handleRuleChange(next: RuleFormState) {
    setDraft(prev => ({ ...prev, ruleForm: next, formError: '', evidence: undefined }));
  }

  function handleCodeChange(nextCode: string) {
    setDraft(prev => ({
      ...prev,
      code: nextCode,
      formError: '',
      evidence: prev.evidence && prev.draftSourceCode !== nextCode ? undefined : prev.evidence,
    }));
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDraft(prev => ({ ...prev, attempted: true, formError: '' }));
    if (!name.trim()) {
      setDraft(prev => ({ ...prev, formError: '전략 이름을 입력하세요.' }));
      focusField('name');
      return;
    }
    const badInput = findBadNumberInput(e.currentTarget);
    if (badInput) {
      setDraft(prev => ({ ...prev, formError: badNumberMessage(badInput) }));
      badInput.focus();
      return;
    }
    if (
      ruleForm.kind === 'ma_crossover' &&
      ruleForm.fast !== '' &&
      ruleForm.slow !== '' &&
      Number(ruleForm.fast) >= Number(ruleForm.slow)
    ) {
      focusField('fast');
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setDraft(prev => ({ ...prev, formError: built.error }));
      focusField(built.focusName);
      return;
    }
    const parsedQty = Number(qty);
    if (qty.trim() === '' || !Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 10000) {
      setDraft(prev => ({ ...prev, formError: '회당 수량은 1-10000 사이의 정수로 입력하세요.' }));
      focusField('qty');
      return;
    }
    const compatFast = built.rule.kind === 'ma_crossover' ? built.rule.fast : 5;
    const compatSlow = built.rule.kind === 'ma_crossover' ? built.rule.slow : 20;
    const payload: Record<string, unknown> = {
      name,
      code,
      fast: compatFast,
      slow: compatSlow,
      qty: parsedQty,
      environment,
      rule: built.rule,
    };
    if (built.overlay) payload.overlay = built.overlay;
    if (evidence) payload.evidence = evidence;
    try {
      const saved = await act<{ id: string }>('strategies', payload);
      setDraft(prev => ({
        ...prev,
        evidence: undefined,
        draftSourceCode: undefined,
        attempted: false,
        formError: '',
      }));
      onSaved(saved.id);
    } catch {
      /* 워크스페이스 상단 알림이 서버 오류를 표시하고 초안을 유지합니다. */
    }
  }

  function openInBacktest() {
    setDraft(prev => ({ ...prev, attempted: true, formError: '' }));
    const badInput = findBadNumberInput(formRef.current);
    if (badInput) {
      setDraft(prev => ({ ...prev, formError: badNumberMessage(badInput) }));
      badInput.focus();
      return;
    }
    if (
      ruleForm.kind === 'ma_crossover' &&
      ruleForm.fast !== '' &&
      ruleForm.slow !== '' &&
      Number(ruleForm.fast) >= Number(ruleForm.slow)
    ) {
      focusField('fast');
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setDraft(prev => ({ ...prev, formError: built.error }));
      focusField(built.focusName);
      return;
    }
    const targetCode = validCode
      ? code
      : masterCodeSchema.safeParse(code).success
        ? code
        : instruments[0]?.code ?? code;
    const strategyDraft: StrategyTransferDraft = {
      code: targetCode,
      rule: built.rule,
      ...(built.overlay ? { overlay: built.overlay } : {}),
      ...(evidence ? { evidence } : {}),
    };
    navigate('/backtest', { state: { strategyDraft } });
  }

  return (
    <Panel className="studio-editor">
      <h2 id="strategy-editor" tabIndex={-1}>
        새 전략 만들기
      </h2>
      <p className="studio-meta">
        {environment === 'kis-paper' ? 'KIS 모의' : 'DEMO'} · 새 전략은 revision 1, 정지 상태로 저장됩니다.
      </p>
      <form ref={formRef} onSubmit={save} noValidate>
        <label className="field">
          전략 이름
          <input
            name="name"
            value={name}
            onChange={e => setDraft(prev => ({ ...prev, name: e.target.value, formError: '' }))}
            required
            maxLength={60}
          />
        </label>
        <label className="field">
          대상 종목
          <select
            required
            disabled={!available || busy}
            value={validCode ? code : ''}
            onChange={e => handleCodeChange(e.target.value)}
          >
            {!validCode && <option value="">{noSelection}</option>}
            {instruments.map(i => (
              <option key={i.code} value={i.code}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        {available && draftSourceCode && !validCode && (
          <p className="studio-warning" role="status">
            {alphanumericDraftCode
              ? `백테스트 종목(${draftSourceCode})은 영숫자 코드로 전략 저장(숫자 6자리 종목) 대상이 아닙니다. 규칙·오버레이 설정은 유지되므로 대상 종목을 선택해 저장하세요.`
              : `백테스트 종목(${draftSourceCode})이 현재 전략 목록에 없어 대상 종목을 다시 선택해야 합니다.`}
          </p>
        )}

        <RuleConfigSection
          form={ruleForm}
          onChange={handleRuleChange}
          disabled={busy}
          mode="strategy"
          unit={unit}
          periodError={invalidPeriods}
          periodErrorId="strategy-period-error"
        />

        {evidence && (
          <div className="studio-evidence" role="status">
            <Link2 size={14} />
            <span>
              <strong>검증 실험 연결</strong> · <code>{evidence.experimentId.slice(0, 8)}</code>
            </span>
            <button
              type="button"
              className="text-link"
              onClick={() => setDraft(prev => ({ ...prev, evidence: undefined }))}
            >
              연결 해제
            </button>
          </div>
        )}

        {demoUnsupported && (
          <p className="studio-warning" role="status">
            DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙이나 샹들리에 청산은 DEMO에 저장할 수 없으며, 아래
            버튼으로 저장 일봉 백테스트에서 검증할 수 있습니다.
          </p>
        )}
        {kisUnsupported && (
          <p className="studio-warning" role="status">
            신규 다중 전략 규칙과 샹들리에 청산은 KIS 모의 저장은 가능하지만, 장중 실시간 평가는 장전 레벨 트리거 계약
            연결 후 활성화됩니다.
          </p>
        )}
        {kisSlowExceeded && (
          <p className="studio-warning" role="status">
            KIS 모의 기본 SMA 계약은 장기 기간 100 이하만 실시간 시작을 지원합니다. 101-120 구간은 정지 상태로 저장하거나
            저장 일봉 백테스트로 검증할 수 있습니다.
          </p>
        )}
        {formError && !invalidPeriods && (
          <p className="studio-warning" role="alert">
            {formError}
          </p>
        )}

        <label className="field">
          회당 수량 (주)
          <input
            name="qty"
            type="number"
            min="1"
            max="10000"
            value={qty}
            onChange={e => setDraft(prev => ({ ...prev, qty: e.target.value, formError: '' }))}
            required
          />
        </label>

        <button disabled={!available || busy || !validCode} className="button primary wide">
          전략 저장
        </button>
        <button type="button" disabled={busy} className="button secondary wide" onClick={openInBacktest}>
          <FlaskConical size={15} />이 설정으로 백테스트
        </button>
      </form>
    </Panel>
  );
}

interface CostAssumptions {
  capital: number;
  feeBps: number;
  slippageBps: number;
}
const defaultCosts: CostAssumptions = { capital: 10000000, feeBps: 1.5, slippageBps: 5 };
const dateInput = (value?: string) => (value ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : '');
const pricePolicy = (value: string) => (value === 'raw' ? '원주가' : '수정주가');

function costsOf({ capital, feeBps, slippageBps }: CostAssumptions): CostAssumptions {
  return { capital, feeBps, slippageBps };
}

function validateCosts(costs: CostAssumptions): string | null {
  if (!Number.isInteger(costs.capital) || costs.capital < 100000 || costs.capital > 100000000) {
    return '초기 자금은 100,000원 이상 100,000,000원 이하의 정수로 입력하세요.';
  }
  if (!Number.isFinite(costs.feeBps) || costs.feeBps < 0 || costs.feeBps > 100) {
    return '수수료는 0-100bp 범위로 입력하세요.';
  }
  if (!Number.isFinite(costs.slippageBps) || costs.slippageBps < 0 || costs.slippageBps > 100) {
    return '슬리피지는 0-100bp 범위로 입력하세요.';
  }
  return null;
}

function CostFields({ values, change }: { values: CostAssumptions; change: (values: CostAssumptions) => void }) {
  function field(key: keyof CostAssumptions, label: string, min: number, max: number, step = 1) {
    return (
      <label className="field">
        {label}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          required
          value={Number.isNaN(values[key]) ? '' : values[key]}
          onChange={event => change({ ...values, [key]: event.target.valueAsNumber })}
        />
      </label>
    );
  }
  return (
    <>
      {field('capital', '초기 자금 (원)', 100000, 100000000)}
      <div className="form-grid">
        {field('feeBps', '수수료 (bp, 1bp = 0.01%)', 0, 100, 0.1)}
        {field('slippageBps', '슬리피지 (bp)', 0, 100, 0.1)}
      </div>
    </>
  );
}

/** 전략 성과와 단순 보유(benchmark) 성과를 나란히 비교하는 요약 컴포넌트. */
function ResultSummary({ result, label }: { result: FlexibleBacktestResult; label: string }) {
  const benchmark = result.benchmark;
  const excessReturn = benchmark ? result.returnPct - benchmark.returnPct : null;
  return (
    <>
      <div className="stats-grid three">
        <Stat label={label} value={`${result.returnPct.toFixed(2)}%`} />
        <Stat label="최대 낙폭" value={`${result.maxDrawdown.toFixed(2)}%`} />
        <Stat label="체결 횟수" value={`${result.trades.length}회`} />
      </div>
      <p>
        최종 평가자산 <strong>{won(result.finalEquity)}원</strong> · 누적 수수료 {won(result.fees)}원 · 체결가에 포함된
        슬리피지 {won(result.slippageCost)}원
      </p>
      {benchmark && (
        <div className="bt-benchmark" aria-label="단순 보유 벤치마크 비교">
          <div className="bt-benchmark-head">
            <strong>전략 vs 단순 보유 비교</strong>
            <span className="bt-note">
              초과 수익률 {excessReturn !== null && (excessReturn >= 0 ? '+' : '')}
              {excessReturn?.toFixed(2)}%p
            </span>
          </div>
          <div className="bt-benchmark-grid">
            <div className="bt-benchmark-col">
              <span className="bt-benchmark-label">전략 성과</span>
              <dl>
                <div>
                  <dt>수익률</dt>
                  <dd>{result.returnPct.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최대 낙폭</dt>
                  <dd>{result.maxDrawdown.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최종 자산</dt>
                  <dd>{won(result.finalEquity)}원</dd>
                </div>
              </dl>
            </div>
            <div className="bt-benchmark-col">
              <span className="bt-benchmark-label">단순 보유 (벤치마크)</span>
              <dl>
                <div>
                  <dt>수익률</dt>
                  <dd>{benchmark.returnPct.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최대 낙폭</dt>
                  <dd>{benchmark.maxDrawdown.toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>최종 자산</dt>
                  <dd>{won(benchmark.finalEquity)}원</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 백테스트 거래 내역 테이블 (v2 매매 사유 `reason`이 있으면 사유 열을 함께 표시). */
function Trades({ result, daily }: { result: FlexibleBacktestResult; daily?: boolean }) {
  const hasReason = result.trades.some(t => Boolean(t.reason));
  return (
    <Panel title="백테스트 거래 내역">
      {result.trades.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{daily ? '신호일 → 체결일' : '봉 번호'}</th>
                <th>방향</th>
                <th>체결가 (원)</th>
                <th>수량 (주)</th>
                <th>수수료 (원)</th>
                {hasReason && <th>매매 사유</th>}
              </tr>
            </thead>
            <tbody>
              {result.trades.map(t => (
                <tr key={t.bar}>
                  <td>{daily ? `${dateInput(t.signalDate) || '미확인'} → ${dateInput(t.date) || '미확인'}` : t.bar}</td>
                  <td>{t.side === 'buy' ? '매수' : '매도'}</td>
                  <td>{t.price.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}</td>
                  <td>{t.qty}</td>
                  <td>{won(t.fee)}</td>
                  {hasReason && <td>{t.reason ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>이 구간에는 체결된 거래가 없습니다.</p>
      )}
    </Panel>
  );
}

function useResultFocus(result: unknown) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (result && ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'start' });
    }
  }, [result]);
  return ref;
}

/** DEMO 합성 봉 백테스트 패널 (v1 SMA 및 v2 종가 기반 다중 규칙 지원). */
function DemoBacktest({ strategyDraft }: { strategyDraft: StrategyTransferDraft | null }) {
  const { state, act, available, busy } = useWorkbench();
  const [selection, setSelection] = useState<string | null>(() => strategyDraft?.code ?? null);
  const [costs, setCosts] = useState<CostAssumptions>(defaultCosts);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() =>
    strategyDraft ? formFromRule(strategyDraft.rule, strategyDraft.overlay) : defaultRuleForm(),
  );
  const [calculation, setCalculation] = useState<{
    code: string;
    summary: string;
    result: FlexibleBacktestResult;
  } | null>(null);
  const [error, setError] = useState('');
  const instrument =
    selection === null
      ? state.instruments.find(row => row.code === '069500') ?? state.instruments[0]
      : state.instruments.find(row => row.code === selection);
  const code = instrument?.code ?? '';
  const result = calculation?.code === code ? calculation : null;
  const resultRef = useResultFocus(result);
  const demoUnsupported = !isDemoRuleSupported(ruleForm);

  function clearCalc() {
    setCalculation(null);
    setError('');
  }

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearCalc();
    if (!code || busy || !available) return;
    const badInput = findBadNumberInput(event.currentTarget);
    if (badInput) {
      setError(badNumberMessage(badInput));
      badInput.focus();
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setError(built.error);
      if (built.focusName) {
        event.currentTarget.querySelector<HTMLInputElement>(`[name="${built.focusName}"]`)?.focus();
      }
      return;
    }
    const costError = validateCosts(costs);
    if (costError) {
      setError(costError);
      return;
    }
    try {
      const { rule, overlay } = built;
      const legacy = isLegacySma(rule, overlay);
      const body = legacy
        ? { code, fast: rule.fast, slow: rule.slow, ...costs }
        : { code, ...costs, rule, ...(overlay ? { overlay } : {}) };
      const response = await act<{ result: unknown }>('backtest', body);
      const parsed = flexibleResultSchema.parse(response.result);
      const summary = legacy
        ? `단기 ${rule.fast} / 장기 ${rule.slow} · 초기 ${won(costs.capital)}원 · 수수료 ${costs.feeBps}bp · 슬리피지 ${costs.slippageBps}bp`
        : `${formatRuleSummary(rule, overlay)} · 초기 ${won(costs.capital)}원 · 수수료 ${costs.feeBps}bp · 슬리피지 ${costs.slippageBps}bp`;
      setCalculation({ code, summary, result: parsed });
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? '실험 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '합성 실험 계산 실패',
      );
    }
  }

  return (
    <div className="bt-grid">
      <Panel title="합성 실험 설정">
        <p className="bt-note">
          현재 저장된 합성 봉으로 계산하는 기능 검증입니다. 다음 봉 종가에 체결한다고 가정합니다. 실제 과거 성과는
          미측정입니다.
        </p>
        {strategyDraft && (
          <p className="bt-draft-banner" role="status">
            전략 스튜디오 초안 적용 · {formatRuleSummary(strategyDraft.rule, strategyDraft.overlay)}
          </p>
        )}
        <form onSubmit={run} onChange={clearCalc} noValidate>
          <fieldset className="backtest-fields" disabled={busy}>
            <label className="field">
              대상
              <select value={code} onChange={event => setSelection(event.target.value)}>
                {!code && (
                  <option value="" disabled>
                    {state.instruments.length ? '종목을 다시 선택하세요' : '합성 종목 없음'}
                  </option>
                )}
                {state.instruments.map(item => (
                  <option value={item.code} key={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {!code && (
              <p role="status">
                {state.instruments.length
                  ? '선택한 합성 종목을 찾을 수 없습니다. 대상을 다시 선택하세요.'
                  : '계산할 합성 종목이 없습니다.'}
              </p>
            )}
            <RuleConfigSection
              form={ruleForm}
              onChange={next => {
                setRuleForm(next);
                clearCalc();
              }}
              disabled={busy}
              mode="demo"
              unit="봉"
            />
            <CostFields values={costs} change={setCosts} />
            {demoUnsupported && (
              <p className="bt-warning" role="status">
                DEMO는 종가만 제공합니다. 고저가·거래량이 필요한 규칙이나 샹들리에 청산은 저장 일봉 백테스트에서
                사용하세요.
              </p>
            )}
            <p className="bt-note">비용은 검증용 가정이며 세금은 포함하지 않습니다. 결과는 이 화면에서 확인합니다.</p>
            {error && (
              <p role="alert" className="bt-warning">
                합성 실험 입력·계산 확인 · {error}
              </p>
            )}
            <button className="button primary wide" disabled={!available || !code}>
              <Play size={15} />백테스트 실행
            </button>
          </fieldset>
        </form>
      </Panel>
      {result && (
        <section aria-label="합성 실험 결과" ref={resultRef} tabIndex={-1} className="bt-result">
          <Panel title="합성 실험 결과">
            <strong>
              {code} · {result.result.source}
            </strong>
            <p>{result.summary}</p>
            <ResultSummary result={result.result} label="합성 구간 수익률" />
          </Panel>
          <Panel title="자산 곡선">
            <Chart values={result.result.equity} height={230} label="합성 데이터 백테스트 평가자산 곡선" />
            <p className="bt-note">마지막 보유분은 평가하며 강제 청산하지 않습니다.</p>
          </Panel>
          <Trades result={result.result} />
        </section>
      )}
    </div>
  );
}

type BacktestSelection =
  | { costs: CostAssumptions; ruleForm: RuleFormState; focus: 'policy' | 'run' }
  | { saved: Experiment };

/** 백테스트 최상위 페이지 (`/backtest`). */
export function Backtest() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const transfer = useRef<{ key: string; selection: BacktestSelection } | null>(null);
  const { busy } = useWorkbench();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPanelId = useId();
  const helpToggleRef = useRef<HTMLButtonElement>(null);
  const source = params.get('source') ?? 'stored';
  const runId = params.get('run');
  const valid =
    params.getAll('source').length <= 1 &&
    params.getAll('run').length <= 1 &&
    (source === 'stored' || source === 'demo') &&
    (runId === null || (params.get('source') === 'stored' && z.uuid().safeParse(runId).success));
  const locState = location.state as { backtestSelection?: string; strategyDraft?: unknown } | null;
  const strategyDraft = parseTransferDraft(locState?.strategyDraft);

  function select(nextSource: string, nextRun?: string, selection?: BacktestSelection) {
    if (valid && nextSource === source && nextRun === undefined && !selection) return;
    const next = new URLSearchParams(params);
    next.set('source', nextSource);
    next.delete('run');
    if (nextRun) next.set('run', nextRun);
    transfer.current = selection ? { key: crypto.randomUUID(), selection } : null;
    const nextState: Record<string, unknown> = { backtestSelection: transfer.current?.key };
    if (strategyDraft) nextState.strategyDraft = strategyDraft;
    setParams(next, { state: nextState });
  }

  function closeHelp() {
    setHelpOpen(false);
    helpToggleRef.current?.focus();
  }

  const initial =
    transfer.current && transfer.current.key === locState?.backtestSelection ? transfer.current.selection : null;

  return (
    <div className="bt-page">
      <div className="bt-toolbar">
        <label className="field bt-source">
          데이터 출처
          <select disabled={busy} value={valid ? source : ''} onChange={event => select(event.target.value)}>
            {!valid && (
              <option value="" disabled>
                출처를 다시 선택하세요
              </option>
            )}
            <option value="stored">KIS 저장 일봉 · 과거 구간 실험</option>
            <option value="demo">DEMO 합성 · 기능 검증</option>
          </select>
        </label>
        <button
          ref={helpToggleRef}
          type="button"
          className={'button ' + (helpOpen ? 'primary' : 'secondary')}
          aria-expanded={helpOpen}
          aria-controls={helpPanelId}
          onClick={() => setHelpOpen(open => !open)}
        >
          <BookOpen size={15} aria-hidden="true" />
          사용방법 도움말
        </button>
      </div>
      {helpOpen && <ResearchHelpPanel panelId={helpPanelId} onClose={closeHelp} />}
      {!valid ? (
        <p className="bt-warning" role="alert">
          백테스트 주소의 출처 또는 수집 ID가 올바르지 않습니다. 데이터 출처를 직접 선택하세요.
        </p>
      ) : source === 'demo' ? (
        <DemoBacktest strategyDraft={strategyDraft} />
      ) : (
        <StoredBacktest
          key={runId ?? 'default'}
          requested={runId}
          initial={initial}
          strategyDraft={strategyDraft}
          select={(id, selection) => select('stored', id, selection)}
        />
      )}
    </div>
  );
}

/** KIS 저장 일봉 백테스트 패널 (v1 하위 호환 + v2 다중 규칙·벤치마크·전략 연결). */
function StoredBacktest({
  requested,
  initial,
  strategyDraft,
  select,
}: {
  requested: string | null;
  initial: BacktestSelection | null;
  strategyDraft: StrategyTransferDraft | null;
  select: (id: string, selection: BacktestSelection) => void;
}) {
  const { act, available, busy } = useWorkbench();
  const navigate = useNavigate();
  const saved = initial && 'saved' in initial ? initial.saved : null;
  const draft = initial && 'costs' in initial ? initial : null;
  const input = saved?.snapshot.input;
  const [runs, setRuns] = useState<DailyRun[] | null>(null);
  const [experiments, setExperiments] = useState<z.infer<typeof experimentListSchema>['experiments']>([]);
  const [selected, setSelected] = useState<string | null>(requested);
  const [savedId, setSavedId] = useState(saved?.id ?? '');
  const [from, setFrom] = useState(input?.from ?? '');
  const [to, setTo] = useState(input?.to ?? '');
  const [costs, setCosts] = useState<CostAssumptions>(() => costsOf(input ?? draft?.costs ?? defaultCosts));
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() => {
    if (input) {
      return formFromRule(ruleFromExperimentInput(input), 'overlay' in input ? input.overlay : undefined);
    }
    if (draft) return draft.ruleForm;
    if (strategyDraft) return formFromRule(strategyDraft.rule, strategyDraft.overlay);
    return defaultRuleForm();
  });
  const [experiment, setExperiment] = useState<Experiment | null>(saved);
  const [replay, setReplay] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [replayError, setReplayError] = useState('');
  const loader = useRef<AbortController | null>(null);
  const resultRef = useResultFocus(experiment);
  const policySelect = useRef<HTMLSelectElement>(null);
  const runSelect = useRef<HTMLSelectElement>(null);
  const focusAfterSelection = useRef(draft?.focus);

  useEffect(() => {
    if (!loading && !listError && focusAfterSelection.current) {
      (focusAfterSelection.current === 'policy' ? policySelect : runSelect).current?.focus();
      focusAfterSelection.current = undefined;
    }
  }, [loading, listError]);
  useEffect(() => () => loader.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    setLoadError('');
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
    void (async () => {
      try {
        const [dailyResponse, savedResponse] = await Promise.all([
          fetch('/api/data/daily', { signal }),
          fetch('/api/backtest/experiments', { signal }),
        ]);
        if (!dailyResponse.ok || !savedResponse.ok) throw new Error();
        const daily = dailyRunsSchema.parse(await dailyResponse.json());
        const savedList = experimentListSchema.parse(await savedResponse.json());
        if (controller.signal.aborted) return;
        const preferredRun =
          selected === null && strategyDraft
            ? daily.runs.find(row => row.code === strategyDraft.code) ?? daily.runs[0]
            : undefined;
        const id = selected ?? preferredRun?.id ?? daily.runs[0]?.id;
        const match = daily.runs.find(row => row.id === id);
        setRuns(daily.runs);
        setExperiments(savedList.experiments);
        setSavedId(previous =>
          savedList.experiments.some(row => row.id === previous)
            ? previous
            : (savedList.experiments.find(row => row.input.runId === id) ??
                (requested === null ? savedList.experiments[0] : undefined))?.id ?? '',
        );
        if (match && (!runs || selected === null)) {
          setSelected(match.id);
          setFrom(input?.from ?? match.from);
          setTo(input?.to ?? match.to);
        }
      } catch {
        if (!controller.signal.aborted) {
          setListError(
            runs === null
              ? '실험 목록 조회 실패 · 저장 일봉과 실험 목록을 확인하지 못했습니다.'
              : '실험 목록 조회 실패 · 이전 목록은 최신 확인값이 아닙니다.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [revision]);

  const run = runs?.find(row => row.id === selected);
  const policy = run?.adjustment ?? runs?.[0]?.adjustment ?? 'adjusted';
  const eligible =
    run?.coverageComplete &&
    run.nextDate === null &&
    run.status.complete &&
    !run.status.error &&
    run.quality.state === 'passed' &&
    !!run.calendar;
  const locked = busy || pending || loading;

  const previewRule = buildRuleAndOverlay(ruleForm);
  const minBarsHint =
    previewRule.ok && !isLegacySma(previewRule.rule, previewRule.overlay)
      ? `선택 기간에 판정·체결용 최소 ${warmup(previewRule.rule, previewRule.overlay) + 1}봉 이상이 필요합니다. 실행하면 규칙·비용 가정과 결과를 함께 저장합니다.`
      : '선택 기간에 장기 기간 + 2봉 이상이 필요합니다. 실행하면 입력·비용 가정과 결과를 함께 저장합니다.';

  function chooseRun(id: string | undefined, focus: 'policy' | 'run') {
    if (id && id !== selected) select(id, { costs, ruleForm, focus });
  }
  function clearResult() {
    setExperiment(null);
    setReplay('');
    setReplayError('');
    setError('');
  }

  async function execute(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!run || !eligible || locked || listError || !available) return;
    clearResult();
    const fromInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="from"]');
    const toInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="to"]');
    if (fromInput?.validity.badInput || !marketDate.safeParse(from).success) {
      setError('시작일을 올바르게 입력하세요.');
      fromInput?.focus();
      return;
    }
    if (toInput?.validity.badInput || !marketDate.safeParse(to).success) {
      setError('종료일을 올바르게 입력하세요.');
      toInput?.focus();
      return;
    }
    if (from < run.from || from > run.to) {
      setError(`시작일은 수집 구간(${dateInput(run.from)} ~ ${dateInput(run.to)}) 안에서 선택하세요.`);
      fromInput?.focus();
      return;
    }
    if (to < run.from || to > run.to) {
      setError(`종료일은 수집 구간(${dateInput(run.from)} ~ ${dateInput(run.to)}) 안에서 선택하세요.`);
      toInput?.focus();
      return;
    }
    if (from > to) {
      setError('시작일은 종료일보다 늦을 수 없습니다.');
      fromInput?.focus();
      return;
    }
    const badInput = findBadNumberInput(event.currentTarget);
    if (badInput) {
      setError(badNumberMessage(badInput));
      badInput.focus();
      return;
    }
    const built = buildRuleAndOverlay(ruleForm);
    if (!built.ok) {
      setError(built.error);
      if (built.focusName) {
        event.currentTarget.querySelector<HTMLInputElement>(`[name="${built.focusName}"]`)?.focus();
      }
      return;
    }
    const costError = validateCosts(costs);
    if (costError) {
      setError(costError);
      return;
    }
    try {
      const { rule, overlay } = built;
      const body = isLegacySma(rule, overlay)
        ? {
            ...costs,
            fast: rule.fast,
            slow: rule.slow,
            runId: run.id,
            source: run.source,
            code: run.code,
            from,
            to,
            adjustment: policy,
          }
        : {
            ...costs,
            runId: run.id,
            source: run.source,
            code: run.code,
            from,
            to,
            adjustment: policy,
            rule,
            ...(overlay ? { overlay } : {}),
          };
      const response = await act<{ experiment: unknown }>('backtest/daily', body);
      const created = experimentSchema.parse(response.experiment);
      setExperiment(created);
      setSavedId(created.id);
      setExperiments(items =>
        items.some(item => item.id === created.id)
          ? items
          : [
              {
                id: created.id,
                createdAt: created.createdAt,
                input: created.snapshot.input,
                bars: created.snapshot.bars.length,
              },
              ...items,
            ],
      );
    } catch (err) {
      setError(
        err instanceof z.ZodError
          ? '실험 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '실험 실행 실패',
      );
    }
  }

  async function load() {
    setPending(true);
    setLoadError('');
    clearResult();
    const controller = new AbortController();
    loader.current = controller;
    try {
      const response = await fetch(`/api/backtest/experiments/${savedId}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error();
      const loaded = experimentSchema.parse((await response.json()).experiment);
      if (controller.signal.aborted) return;
      if (loaded.id !== savedId) throw new Error();
      const fixed = loaded.snapshot.input;
      if (fixed.runId !== selected) {
        select(fixed.runId, { saved: loaded });
        return;
      }
      setFrom(fixed.from);
      setTo(fixed.to);
      setCosts(costsOf(fixed));
      setRuleForm(formFromRule(ruleFromExperimentInput(fixed), 'overlay' in fixed ? fixed.overlay : undefined));
      setExperiment(loaded);
    } catch {
      if (!controller.signal.aborted) setLoadError('저장 실험 조회 실패 · 다시 불러오세요.');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  async function verify() {
    if (!experiment) return;
    setReplay('');
    setReplayError('');
    try {
      const response = z
        .object({ result: flexibleResultSchema, matches: z.boolean(), inputHash: z.string() })
        .parse(await act('backtest/replay', { id: experiment.id }));
      if (response.inputHash !== experiment.inputHash) throw new Error('실험 입력이 일치하지 않습니다.');
      if (response.matches) setReplay('재현 일치 · 고정 입력과 저장 결과가 같습니다.');
      else setReplayError('재현 불일치 · 엔진·저장 결과를 점검하세요.');
    } catch (err) {
      setReplayError(
        err instanceof z.ZodError
          ? '재현 응답 형식이 올바르지 않습니다.'
          : err instanceof Error
            ? err.message
            : '재현 결과를 확인하지 못했습니다.',
      );
    }
  }

  function createStrategyFromExperiment() {
    if (!experiment) return;
    const expInput = experiment.snapshot.input;
    const backtestDraft: StrategyTransferDraft = {
      code: expInput.code,
      rule: ruleFromExperimentInput(expInput),
      ...('overlay' in expInput && expInput.overlay ? { overlay: expInput.overlay } : {}),
      evidence: { experimentId: experiment.id, inputHash: experiment.inputHash },
    };
    navigate('/strategies#strategy-editor', { state: { backtestDraft } });
  }

  return (
    <>
      <div className="bt-nav">
        <span>KIS 저장 일봉 · 종가 신호 → 다음 봉 시가 체결</span>
        <a className="text-link" href="#backtest-history">
          저장된 실험으로 이동 ↓
        </a>
      </div>
      {loading && <p role="status">저장 일봉·실험 목록 조회 중</p>}
      {listError && (
        <p className="bt-warning" role="alert">
          {listError}{' '}
          <button className="text-link" onClick={() => setRevision(v => v + 1)}>
            다시 조회
          </button>
        </p>
      )}
      <div className="bt-grid">
        <Panel title="저장 일봉 실험 설정">
          {strategyDraft && (
            <p className="bt-draft-banner" role="status">
              전략 스튜디오 초안 적용 · {formatRuleSummary(strategyDraft.rule, strategyDraft.overlay)}
              {run && run.code !== strategyDraft.code && ` · 저장 일봉에 ${strategyDraft.code}가 없어 ${run.code} 선택`}
            </p>
          )}
          <form
            onSubmit={execute}
            noValidate
            onChange={event => {
              const control = event.nativeEvent.target;
              if (control !== runSelect.current && control !== policySelect.current) clearResult();
            }}
          >
            <fieldset className="backtest-fields" disabled={locked || !!listError}>
              {!loading && !listError && selected && !run && (
                <p className="bt-warning" role="alert">
                  요청한 수집 기록을 찾을 수 없습니다. 데이터 상태를 확인하거나 기록을 직접 선택하세요.
                </p>
              )}
              {!loading && !listError && !runs?.length && <p>저장된 KIS 일봉이 없습니다</p>}
              <div className="bt-pickers">
                <label className="field">
                  수정주가 정책
                  <select
                    ref={policySelect}
                    value={policy}
                    onChange={event => {
                      if (run?.adjustment !== event.target.value) {
                        chooseRun(
                          runs?.find(row => row.adjustment === event.target.value)?.id,
                          'policy',
                        );
                      }
                    }}
                  >
                    <option value="adjusted" disabled={!runs?.some(row => row.adjustment === 'adjusted')}>
                      수정주가 · 수집 시점 기준
                    </option>
                    <option value="raw" disabled={!runs?.some(row => row.adjustment === 'raw')}>
                      원주가 · 기업행사 미반영
                    </option>
                  </select>
                </label>
                <label className="field">
                  일봉 수집 기록
                  <select
                    ref={runSelect}
                    value={run?.id ?? ''}
                    onChange={event => chooseRun(event.target.value, 'run')}
                  >
                    <option value="" disabled>
                      수집 기록 선택
                    </option>
                    {runs
                      ?.filter(row => row.adjustment === policy)
                      .map(row => (
                        <option key={row.id} value={row.id}>
                          {row.code} · {dateInput(row.from)} ~ {dateInput(row.to)} · {row.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {run && (
                <p className={eligible ? 'bt-note' : 'bt-warning'}>
                  {eligible
                    ? `입력 달력 대조 통과 · 수집 기준일 ${dateInput(run.captureDate)}`
                    : !run.coverageComplete || run.nextDate
                      ? '부분 수집 · 수집 구간이 끝나지 않아 실행할 수 없습니다.'
                      : !run.calendar || run.quality.state === 'unverified'
                        ? '입력 달력 미대조 · 실행할 수 없습니다.'
                        : '수집 상태·품질 확인 필요 · 실행할 수 없습니다.'}
                </p>
              )}
              <div className="form-grid">
                <label className="field">
                  시작일
                  <input
                    name="from"
                    type="date"
                    required
                    value={dateInput(from)}
                    min={run && dateInput(run.from)}
                    max={run && dateInput(run.to)}
                    onChange={event => setFrom(event.target.value.replaceAll('-', ''))}
                  />
                </label>
                <label className="field">
                  종료일
                  <input
                    name="to"
                    type="date"
                    required
                    value={dateInput(to)}
                    min={run && dateInput(run.from)}
                    max={run && dateInput(run.to)}
                    onChange={event => setTo(event.target.value.replaceAll('-', ''))}
                  />
                </label>
              </div>
              <RuleConfigSection
                form={ruleForm}
                onChange={next => {
                  setRuleForm(next);
                  clearResult();
                }}
                disabled={locked || !!listError}
                mode="stored"
                unit="봉"
              />
              <CostFields values={costs} change={setCosts} />
              <p className="bt-note">{minBarsHint}</p>
              {error && (
                <p className="bt-warning" role="alert">
                  저장 일봉 실험 실패 · {error}
                </p>
              )}
              <button className="button primary wide" disabled={!available || !eligible}>
                <Play size={15} />저장 일봉 실험 실행
              </button>
            </fieldset>
          </form>
          <Link className="text-link" to={run ? `/data?run=${run.id}#inventory-daily` : '/data#inventory-daily'}>
            데이터 상태 확인 →
          </Link>
        </Panel>
        <div className="bt-output">
          {experiment && (
            <section ref={resultRef} tabIndex={-1} className="bt-result" aria-label="저장 일봉 실험 결과">
              <Panel title="저장 일봉 실험 결과">
                <strong>
                  {experiment.snapshot.input.code} · {pricePolicy(experiment.snapshot.input.adjustment)} ·{' '}
                  {experiment.snapshot.bars.length}봉
                </strong>
                <p>
                  {dateInput(experiment.snapshot.input.from)} ~ {dateInput(experiment.snapshot.input.to)} · 수집 기준일{' '}
                  {dateInput(experiment.snapshot.collection.captureDate)}
                </p>
                <p>
                  {'rule' in experiment.snapshot.input
                    ? formatRuleSummary(experiment.snapshot.input.rule, experiment.snapshot.input.overlay)
                    : `단기 ${experiment.snapshot.input.fast} / 장기 ${experiment.snapshot.input.slow}`}{' '}
                  · 초기 {won(experiment.snapshot.input.capital)}원 · 수수료 {experiment.snapshot.input.feeBps}bp ·
                  슬리피지 {experiment.snapshot.input.slippageBps}bp
                </p>
                <ResultSummary result={experiment.result} label="저장 구간 수익률" />
                <div className="button-row bt-actions">
                  <button className="button secondary" disabled={locked || !available} onClick={() => void verify()}>
                    고정 입력으로 재현 검증
                  </button>
                  <button type="button" className="button primary" onClick={createStrategyFromExperiment}>
                    <Plus size={15} />이 설정으로 전략 만들기
                  </button>
                </div>
                {replay && <p role="status">{replay}</p>}
                {replayError && (
                  <p role="alert" className="bt-warning">
                    재현 검증 실패 · {replayError}
                  </p>
                )}
                <details>
                  <summary>재현 입력·출처 확인</summary>
                  <p>
                    실험 입력 SHA256 <code data-testid="experiment-hash">{experiment.inputHash}</code>
                  </p>
                  <p>
                    엔진 {experiment.snapshot.engineVersion} · 저장 {experiment.createdAt}
                  </p>
                  <p>
                    수집 ID {experiment.snapshot.collection.id} · 출처 {experiment.snapshot.collection.endpoint}
                  </p>
                  <p>입력 달력 {experiment.snapshot.collection.calendar?.source ?? '미기록'} · 공식 출처 진위 미검증</p>
                  <a
                    className="text-link"
                    href={`/api/backtest/experiments/${experiment.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    고정 입력·결과 JSON 보기 ↗
                  </a>
                </details>
              </Panel>
              <Panel title="자산 곡선">
                <Chart values={experiment.result.equity} height={230} label="저장 일봉 백테스트 평가자산 곡선" />
                <p>{experiment.result.source}</p>
              </Panel>
              <Trades result={experiment.result} daily />
            </section>
          )}
          <section id="backtest-history" tabIndex={-1}>
            <Panel
              title="저장된 실험"
              action={
                <button className="button secondary" disabled={locked} onClick={() => setRevision(v => v + 1)}>
                  실험 목록 새로고침
                </button>
              }
            >
              {!loading && !listError && experiments.length === 0 ? (
                <p>저장된 실험이 없습니다. 실행에 성공하면 입력과 결과가 함께 보존됩니다.</p>
              ) : (
                <>
                  <label className="field">
                    저장 실험
                    <select
                      value={savedId}
                      disabled={locked || !!listError}
                      onChange={event => {
                        setSavedId(event.target.value);
                        setLoadError('');
                      }}
                    >
                      <option value="">실험 선택</option>
                      {experiments.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.input.code}
                          {'rule' in item.input ? ` · ${STRATEGY_CATALOG[item.input.rule.kind].title}` : ''} ·{' '}
                          {dateInput(item.input.from)} ~ {dateInput(item.input.to)} ·{' '}
                          {pricePolicy(item.input.adjustment)} · {item.bars}봉 · {item.id.slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={!savedId || locked || !!listError}
                    onClick={() => void load()}
                  >
                    저장 실험 불러오기
                  </button>
                </>
              )}
              {loadError && (
                <p role="alert" className="bt-warning">
                  {loadError}
                </p>
              )}
            </Panel>
          </section>
          <Panel title="계산 가정과 한계">
            <p>
              세금·배당·기업행사를 반영하지 않습니다. 입력 달력의 공식성·가격 정확성·과거 시점 정보(PIT)와 실제 수익성은
              미검증입니다.
            </p>
            <details>
              <summary>체결·비용·평가 방식</summary>
              <p>
                종가 신호 후 다음 봉 시가에 전액 매수·전량 매도합니다. 수수료는 체결금액 × bp / 10,000을 원 단위
                올림합니다. 슬리피지는 매수 시 더하고 매도 시 뺍니다.
              </p>
              <p>
                낙폭은 초기자금을 포함한 최고 평가자산 대비 하락률입니다. 마지막 보유분은 종가로 평가합니다. 원주가
                분할·병합과 수정주가 사후 조정에 유의하세요. 호가단위·유동성·가격제한·미체결은 모델링하지 않습니다.
              </p>
            </details>
          </Panel>
        </div>
      </div>
    </>
  );
}
