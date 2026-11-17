# /trade 후속 점검

[작업 #12](https://github.com/krdn/gon-stock03/issues/12)의 사용자 요청으로 `0ab9da1`에서 분석했다. 최초 4303은 원본 `/home/gon/llm-projects/gon-stock03`에서 실행 중이었다. 이 기록의 이미지는 별도 메모리 DB 서버 4316의 DEMO 화면이다.

| 문제 | 변경·근거 |
| --- | --- |
| 미지원 코드가 삼성전자로 대체되고 빈 종목 배열에서 오류 발생 | 명시한 코드만 선택하고 미지원·빈 목록 안내. 정상 6자리 코드는 KIS 화면 이동 시 보존 |
| 최초 연결 실패에도 예시 자산·주문폼 표시 | 서버 스냅샷 확인 전 로딩/실패 안내만 표시. 연결 후 실패는 기존 값과 접수 차단 유지 |
| 한도·현금·매도 예약량 문제를 접수 후에만 안내 | 1회·종목별·손실 한도, 수수료 포함 현금, 예약 제외 매도량을 입력·확인창에서 검사. 서버 검사는 유지 |
| 요청 저장소 읽기·파싱 실패를 무시하거나 삭제 실패가 화면 오류 유발 | 읽기·파싱·쓰기·삭제 오류를 처리하고 새 주문 차단. 쓰기 실패 POST0, 삭제 실패 원 요청 보존 |
| 대비 부족6곳·잘못된 ARIA 라벨·선택 상태 누락 | 페이지 범위에서 대비 보완, 라벨과 수량을 group으로 연결, 방향·차트 aria-pressed 제공 |
| 320px 화면에서 가로 넘침 | 종목 선택·grid 최소 너비와 차트 도구 줄바꿈 수정. 수정 전 테스트 scrollWidth357 >320 재현 |

검증: 추가 오류 회귀8건과 손실 한도는 수정 전 assertion 실패를 확인했다. 종목별 한도 테스트의 최초 fixture는 스키마 하한을 벗어나 실패했으므로 유효값10,000원으로 바로잡았다. 전체 회귀에서 기존 최초 실패 시 비활성 주문폼 기대1건은 새 숨김 계약으로 갱신했다. 버튼 제거·가격 입력 제거·연결 복구·이후 실패 시 접수 차단을 함께 검사한다.

- 단위/API: `npm test` 216/216 PASS.
- 빌드: `npm run build` PASS. 기존 500kB 번들 경고 유지.
- 브라우저: 최종 `npx playwright test` 137/137 PASS(트레이딩21건 포함).
- axe 4.12.1: PC1440·모바일320 초기 화면 위반0, 불확정0. 확인창도 위반0을 확인했다. 스크린리더 실제 음성 수용은 미검증.
- [PC 화면](assets/trade/desktop.png) · [320px 화면](assets/trade/mobile-320.png).
- `PYTHONHASHSEED=0 graphify update .` 성공. 생성된 핵심 그래프를 함께 전달한다.

외부 리뷰는 중앙 설정의 `claude-opus-5-5/high`, 실제 `modelUsage`도 같은 모델이다. 최초 P0–P2 없음, P3 다섯 건 중 수수료식·한도·live region·수량 라벨을 반영했다. 수수료식1원 차이는 1~1천만원 검색에서 재현하지 못했으므로 확정 결함으로 주장하지 않는다. 미지원/최초 연결 화면에는 주문 입력이 없고, 보존 요청은 유효 종목 진입 후 다시 대조하는 범위를 유지한다. 저장값이 손상됐을 때 자동 삭제·새 요청 발급은 제공하지 않는다.

공식 근거: [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)의 저장소 정책 예외와 [W3C 대비 기준](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)을 확인했다. 실제 KIS 주문·취소·예약·계좌 변경은 실행하지 않았다. 격리 테스트와 사용자 장중 수용은 별개다.

수정분 외부 재검토도 같은 모델로 P0–P2 없음. P3 저장소 오류 상태의 재시도 권유 문구1건을 조건부 대조 안내로 바꾸고 직접 회귀로 확인한다. 재검토는 live region을 RealtimeStatus로 오해하여 확인하지 못했으나 `.trade-validation:empty`의 display:none 삭제는 직접 diff와 axe로 확인했다.

4303 반영: 원본의 세 소스 파일을 기준 `0ab9da1`과 바이트 대조한 뒤 백업(`/tmp/gon-stock03-trade-before-20261117`)하고 수정본을 적용했다. 실제 URL에서 예상 수수료·선택 상태·scrollWidth320=viewport320·axe 위반0/불확정0 확인. 원본에는 `src/pages/Trading.tsx`, `src/styles.css`, `src/specs.ts`의 로컬 변경만 있다. PR main 통합과 별개이며 서버 재시작·원장 변경은 하지 않았다.
