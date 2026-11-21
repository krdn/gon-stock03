import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, ChevronRight, Database, ExternalLink, Monitor, Network, ShieldCheck } from 'lucide-react';
import { screens, sources } from '../specs';
import { Badge, Panel } from '../components/ui';
import './design-ux.css';

const repository = 'https://github.com/krdn/gon-stock03';
const guideFile = repository + '/blob/fb66f1fbb9343ba8844ec1919e888592b8dd4df0/docs/architecture/figures/v1-guide.html';
const feedbackIssues: Partial<Record<string, number>> = {
  dashboard: 150, market: 161, watchlist: 169, trade: 158, orders: 151,
  portfolio: 174, strategies: 175, backtest: 180, risk: 168, journal: 182,
  alerts: 179, data: 173, settings: 162, design: 185, paper: 166,
};
const tabs = [
  ['overview', '전체 설계'], ['screens', '화면별 상세'], ['architecture', '시스템 구조'],
  ['flow', '주문 흐름'], ['roadmap', '개발 단계'], ['sources', '리서치·API'],
];
const stages = [
  { name: '00 기준선', output: '작업 계약·필수 CI·이슈 의존관계', done: '기준선의 수용·통합 근거를 확인한다.', common: [5] },
  { name: '01 기반', output: '공통 상태·마스터·일봉 기반·일지·설계 추적', done: '저장·실패·추적과 화면 탐색을 검증한다.', common: [6, 7] },
  { name: '02 데이터·조회', output: '마스터·일봉·설정·시세·잔고', done: '출처·시각·페이지 완전성과 실패 복구를 구분한다.', common: [] },
  { name: '03 조회·주문 계약', output: '관심목록·저장 일봉 실험·공통 주문 복구', done: '저장 재현성과 주문의 접수·체결·불명 상태를 구분한다.', common: [9] },
  { name: '04 주문·위험', output: 'DEMO/KIS 화면 분리·위험·원장·이벤트', done: 'KIS 변경 조작은 /paper가 소유한다. 실제 주문은 별도 승인 범위에서 검증한다.', common: [] },
  { name: '05 자동매매', output: '실시간 수신·재연결·KIS 전략', done: 'DEMO 재생과 구분해 장중 신호·차단·중단·복구 근거를 확인한다.', common: [19] },
  { name: '06 장중 실증', output: '통합 흐름·장애 복구·사용자 수용', done: 'fixture·CI와 실제 관측을 분리하고 미관측 항목을 남긴다.', common: [25] },
];
const orderSteps = [
  { name: '입력·확인', detail: '종목코드, 매수·매도, 지정가, 정수 수량, 환경을 고정합니다. 사용자 확인마다 고유 요청 ID를 발급합니다.', fail: '빈 값·소수 수량·범위 초과는 접수하지 않습니다.' },
  { name: '서버 위험 검사', detail: '현금·매도 가능 수량에서 미체결 예약을 반영합니다. 주문·종목·손실 한도와 긴급정지를 공통으로 검사합니다.', fail: '화면 검사를 우회해 직접 API를 호출해도 같은 규칙을 적용합니다.' },
  { name: '접수 기록', detail: '로컬 데모는 SQLite에 주문과 이벤트를 함께 기록합니다. KIS 연결은 증권사 주문번호와 요청 ID를 연결해야 합니다.', fail: '접수는 체결이 아닙니다. 응답 불명확 상태에서 주문을 자동 재전송하지 않습니다.' },
  { name: '체결·취소', detail: '데모는 다음 봉에서 가격 조건을 평가합니다. KIS는 REST 주문·잔고 대조를 사용합니다. 구독 중 체결통보가 도착하면 REST로 원장의 체결 수량을 다시 확인해야 합니다.', fail: '같은 원주문의 부분체결 직후 잔량 취소는 장중 미관측입니다. 근거는 개발 단계의 #25에서 확인하세요.' },
  { name: '잔고·이벤트 반영', detail: '체결한 수량·가격·비용으로 현금과 보유수량을 갱신합니다. 원인 전략과 관련 주문을 추적합니다.', fail: '재시작 시 상태를 복구하고 전략을 정지합니다. KIS는 미확정 주문 대조 전 재개하지 않습니다.' },
];
export function Design() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? (params.has('screen') ? 'screens' : 'overview');
  const tab = tabs.some(([id]) => id === requestedTab) ? requestedTab : 'overview';
  const selected = params.has('screen') ? screens.find(s => s.id === params.get('screen')) : screens[0];
  const feedbackIssue = selected && feedbackIssues[selected.id];
  const screenNav = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const openedFromIndex = useRef(false);
  useEffect(() => {
    const nav = screenNav.current;
    const button = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (nav && button && nav.scrollWidth > nav.clientWidth) {
      const box = button.getBoundingClientRect();
      const list = nav.getBoundingClientRect();
      if (box.left < list.left) nav.scrollLeft += box.left - list.left;
      else if (box.right > list.right) nav.scrollLeft += box.right - list.right;
    }
    if (openedFromIndex.current) {
      openedFromIndex.current = false;
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: 'start' });
    }
  }, [tab, selected?.id]);
  function openFromIndex(id: string) {
    openedFromIndex.current = true;
    setParams({ tab: 'screens', screen: id });
  }
  const rawStep = params.get('step') ?? '0';
  const requestedStep = Number(rawStep);
  const validStep = rawStep.trim() !== '' && Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < orderSteps.length;
  const step = validStep ? requestedStep : 0;
  return <div className="design-workspace">
    <div className="design-tabs tabs" role="group" aria-label="설계 주제">
      {tabs.map(([id, title]) => <button key={id} aria-pressed={tab === id}
        className={tab === id ? 'active' : ''}
        onClick={() => { if (id !== requestedTab || (id === 'screens' && !selected) || (id === 'flow' && !validStep)) setParams({ tab: id }); }}>{title}</button>)}
    </div>
    {requestedTab !== tab && <p className="soft-note" role="status">주소의 주제를 찾을 수 없어 전체 설계를 표시합니다.</p>}
    {tab === 'overview' && <>
      <Panel title="화면 지도" action={<Badge>{screens.length}개 화면</Badge>}>
        <p className="muted prose">화면을 고르면 사용 방법과 검증 범위를 보고, 그 화면의 개선 이슈에 의견을 남길 수 있습니다.</p>
        <div className="screen-map">{['워크스페이스', '매매', '전략 연구', '운영', '프로젝트', 'KIS 연결'].map(group =>
          <div key={group}><h3>{group}</h3>{screens.filter(s => s.group === group).map(s =>
            <button key={s.id} onClick={() => openFromIndex(s.id)}><span>{s.title}</span><ChevronRight size={15} /></button>
          )}</div>
        )}</div>
      </Panel>
      <div className="two-columns top-gap">
        <Panel title="대상과 검증 범위"><p className="prose">개인 PC 한 대에서 국내 주식·ETF를 다룹니다. DEMO에서는 합성 데이터로 연습하고 KIS 모의 환경에서는 증권사 응답을 확인합니다.</p>
          <dl className="definition"><dt>화면 구현</dt><dd>입력·탐색·표시를 검사합니다.</dd><dt>로컬 데모</dt><dd>합성 데이터와 SQLite로 동작을 재현합니다.</dd><dt>KIS 모의 검증</dt><dd>실제 응답과 계좌 변화를 확인한 범위는 각 이슈에 기록합니다.</dd></dl>
        </Panel>
        <Panel title="지도에서 질문 준비하기">
          <p className="prose">이 PC에서 검토 서버가 실행 중이면 16개 카드에서 1차 캡처와 2차 변경을 비교하고 통합 앱의 예시 화면을 열 수 있습니다. 카드에서 의견 이슈를 열거나 Ask에 쓴 질문을 Copy question으로 복사하세요.</p>
          <a className="text-link" href="http://127.0.0.1:4328/guide.html" target="_blank" rel="noreferrer">이 PC에서 검토 지도 열기 (새 탭)<ExternalLink size={14} /></a>
          <p className="prose top-gap">지도를 파일로 보관하려면 GitHub 파일 페이지에서 Download raw file을 누르세요. 모바일에서는 파일 메뉴의 Download를 선택하세요. 내려받은 지도의 예시 주소는 복사해 이 PC의 주소창에서 열 수 있습니다.</p>
          <a className="text-link" href={guideFile} target="_blank" rel="noreferrer">GitHub에서 검토 지도 파일 열기 (새 탭)<ExternalLink size={14} /></a>
          <p className="prose top-gap">프로젝트 단계에 대한 수정 초안은 이 브라우저에 저장합니다.</p>
          <a className="text-link" href="/project-map.html" target="_blank" rel="noreferrer"><Network size={16} />클릭형 프로젝트 지도 (새 탭)</a>
        </Panel>
      </div>
    </>}
    {tab === 'screens' && <div className="spec-layout">
      <div className="spec-nav" ref={screenNav} role="group" aria-label="설계 화면 선택">{screens.map((s, i) =>
        <button key={s.id} onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
          aria-pressed={s.id === selected?.id} className={s.id === selected?.id ? 'active' : ''}
          onClick={() => { if (s.id !== selected?.id) setParams({ tab: 'screens', screen: s.id }); }}>
          <small>{String(i + 1).padStart(2, '0')}</small>{s.title}<ChevronRight size={14} />
        </button>
      )}</div>
      {selected ? <div className="design-screen-detail" ref={detail} tabIndex={-1} role="region" aria-label={selected.title + ' 설계 상세'}>
        <Panel title={selected.title} eyebrow={`${selected.group} · ${screens.indexOf(selected) + 1}/${screens.length}`}
          action={<Link className="button secondary" to={'/' + selected.id}>화면 열기<ArrowRight size={14} /></Link>}>
          <p className="design-purpose">{selected.subtitle}</p>
          {feedbackIssue ? <a className="button secondary design-feedback" href={`${repository}/issues/${feedbackIssue}#issuecomment-new`} target="_blank" rel="noreferrer">
            {selected.title} 의견 남기기 <ExternalLink size={14} /><small>새 탭</small>
          </a> : <p>이 화면의 의견 이슈는 아직 등록되지 않았습니다.</p>}
          {selected.id === 'settings' && <div className="button-row design-trading-settings">
            <Link className="text-link" to="/settings/trading">매매 설정 열기<ArrowRight size={14} /></Link>
            <a className="text-link" href={repository + '/issues/152#issuecomment-new'} target="_blank" rel="noreferrer">매매 설정 의견 남기기 (새 탭)<ExternalLink size={14} /></a>
          </div>}
          <p className="design-record-note">2차 개선 의견은 화면별 이슈에서 받습니다. 아래는 1차 설계와 구현 기록입니다.</p>
          <div className="button-row"><Badge>{selected.work.stage}</Badge>
            <a className="text-link" href={`${repository}/issues/${selected.work.issue}`} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">작업·완료 기준 #{selected.work.issue}<ExternalLink size={14} /></a>
            <a className="text-link" href={`${repository}/blob/main/${selected.work.evidence}`} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">구현 근거<ExternalLink size={14} /></a>
          </div>
          <div className="two-columns top-gap">
            <section className="spec-list"><h3>현재 동작 범위</h3><p className="prose">{selected.work.current}</p></section>
            <section className="spec-list"><h3>후속·검증 경계</h3><p className="prose">{selected.work.boundary}</p></section>
          </div>
          <h3 className="top-gap">목표 계약</h3><p className="spec-purpose">{selected.purpose}</p>
          <div className="two-columns">
            <SpecList title="사용자가 하는 일" icon={<Monitor size={17} />} items={selected.actions} />
            <SpecList title="필요한 데이터·계산" icon={<Database size={17} />} items={selected.data} />
            <SpecList title="실패와 예외 처리" icon={<ShieldCheck size={17} />} items={selected.failure} />
            <SpecList title="완료를 확인하는 기준" icon={<Check size={17} />} items={selected.acceptance} />
          </div>
          <div className="api-chips"><span>연결 계약</span>{selected.api.map(a => <code key={a}>{a}</code>)}</div>
        </Panel>
        <p className="soft-note top-gap">구현 근거는 현재 main의 소스입니다. 이슈에서 검증한 커밋, 병합 여부와 사용자 직접 수용 기록을 각각 확인하세요.</p>
      </div> : <div className="design-invalid" role="status"><Panel title="화면을 찾을 수 없습니다"><p className="prose">목록에서 확인할 화면을 선택하세요.</p></Panel></div>}
    </div>}
    {tab === 'architecture' && <><Panel title="로컬 브라우저에서 증권사까지"><div className="architecture-flow">{[[Monitor, '브라우저', 'React · TypeScript', '화면·입력·출처 표시'], [ShieldCheck, '로컬 API', 'Node.js · 127.0.0.1', '검증·한도·중복 방지'], [Database, '로컬 저장', 'SQLite', '주문·전략·일지·이벤트'], [Network, 'KIS 모의', 'REST / WebSocket', '인증·조회·주문 대조']].map(([Icon, title, stack, detail], i) => { const Component = Icon as typeof Monitor; return <div className="architecture-node" key={i}><Component size={28} /><h3>{String(title)}</h3><strong>{String(stack)}</strong><p>{String(detail)}</p></div>; })}</div><div className="secret-lane"><ShieldCheck size={20} /><strong>Infisical → 서버 프로세스</strong><span>브라우저에는 비밀값·access token을 전달하지 않음</span></div></Panel><div className="two-columns top-gap"><Panel title="왜 이 기술 조합인가"><dl className="definition"><dt>채택: React + Node + SQLite</dt><dd>개인 PC에서 런타임 하나로 UI·서버를 실행하고 DB 파일을 보존한다. SSR·다중 사용자 요구가 없다.</dd><dt>비교: Rust + PostgreSQL</dt><dd>gon-web-engineering 기본안. 별도 컴파일 도구와 DB 운영이 필요하므로 이번 로컬 1인 버전에서는 조정한다.</dd><dt>다시 판단할 조건</dt><dd>서버 배포·여러 사용자·고빈도 병렬 처리 요구가 생기면 Rust·PostgreSQL 전환 비용과 이점을 비교한다.</dd></dl></Panel><Panel title="데이터의 책임"><dl className="definition"><dt>Instrument / Bar</dt><dd>종목코드·시장·가격·시각·출처를 묶고 합성/실제를 분리한다.</dd><dt>Order / Position</dt><dd>요청 ID·환경·상태·수량을 보존한다. 주문·잔고 변경은 함께 저장한다.</dd><dt>Strategy / Risk / Event</dt><dd>파라미터·마지막 평가 봉·차단 이유·이력을 저장해 실행 이유를 설명한다.</dd></dl></Panel></div></>}
    {tab === 'flow' && <Panel title="주문 한 건의 여정" action={<Badge>단계를 클릭하세요</Badge>}>{!validStep && <p className="soft-note" role="status">주소의 주문 단계를 찾을 수 없어 첫 단계를 표시합니다.</p>}<div className="step-buttons" role="group" aria-label="주문 단계 선택">{orderSteps.map((s, i) => <button key={s.name} aria-pressed={i === step} className={i === step ? 'active' : ''} onClick={() => { if (!validStep || step !== i) setParams({ tab: 'flow', step: String(i) }); }}><small>0{i + 1}</small>{s.name}<ArrowRight size={16} /></button>)}</div><div className="step-detail"><span className="eyebrow">STEP 0{step + 1}</span><h3>{orderSteps[step].name}</h3><p>{orderSteps[step].detail}</p><div className="soft-note"><ShieldCheck size={19} />{orderSteps[step].fail}</div></div><div className="status-flow"><code>검증</code><ArrowRight size={15} /><code>접수</code><ArrowRight size={15} /><code>부분체결 / 체결 / 취소</code><ArrowDown size={15} /><code>응답 불명 → 조회·대조 → 재개 판단</code></div></Panel>}
    {tab === 'roadmap' && <div className="roadmap top-gap">{stages.map(s => <Panel key={s.name}><div className="roadmap-heading"><h2>{s.name}</h2></div><div className="two-columns"><div><h3>산출물</h3><p>{s.output}</p></div><div><h3>다음 단계로 넘어가는 근거</h3><p>{s.done}</p></div></div><div className="button-row">{s.common.map(issue => <a key={issue} className="text-link" href={`${repository}/issues/${issue}`} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">공통·실증 #{issue}<ExternalLink size={14} /></a>)}{screens.filter(screen => screen.work.stage === s.name).map(screen => <a key={screen.id} className="text-link" href={`${repository}/issues/${screen.work.issue}`} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">{screen.title} #{screen.work.issue}<ExternalLink size={14} /></a>)}</div></Panel>)}</div>}
    {tab === 'sources' && <><Panel title="조사 → 설계 판단" action={<Badge>공식 자료 · 2026-11-14 확인</Badge>}><p className="muted prose">공식 문서의 사실과 이 프로젝트의 설계 판단을 분리했습니다. 호출 한도·계좌별 수수료·장중 가용성은 실제 계정으로 추가 확인해야 합니다.</p><div className="source-list">{sources.map(s => <article key={s.id}><div className="source-index">{s.id}</div><div><a href={s.url} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림"><h3>{s.title}<ExternalLink size={14} /></h3></a><p><strong>확인한 내용</strong>{s.finding}</p><p><strong>설계에 반영</strong>{s.effect}</p></div></article>)}</div></Panel><Panel title="기능별 API 계약 지도" className="top-gap"><div className="table-scroll"><table><thead><tr><th>화면</th><th>API / 내부 서비스</th><th>핵심 검증</th></tr></thead><tbody>{screens.map(s => <tr key={s.id}><td><button className="text-link" onClick={() => openFromIndex(s.id)}>{s.title}</button></td><td>{s.api.join(' · ')}</td><td>{s.acceptance[0]}</td></tr>)}</tbody></table></div></Panel></>}
    <div className="design-references">
      <span>단계는 설계 당시의 계획입니다. 진행·수용 기록</span>
      <a className="text-link" href="https://github.com/users/krdn/projects/25" target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">현재 진행 상태 · GitHub<ExternalLink size={14} /></a>
      <a className="text-link" href={repository + '/issues/1'} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">상위 이슈 #1<ExternalLink size={14} /></a>
      <a className="text-link" href={repository + '/issues/149'} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">2차 화면 검토 #149<ExternalLink size={14} /></a>
      <a className="text-link" href={repository + '/blob/main/docs/plans/interface-sessions-2026-11.md'} target="_blank" rel="noreferrer" aria-description="새 탭에서 열림">전체 계획·의존관계<ExternalLink size={14} /></a>
    </div>
  </div>;
}
function SpecList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) { return <section className="spec-list"><h3>{icon}{title}</h3><ul>{items.map(x => <li key={x}>{x}</li>)}</ul></section>; }
