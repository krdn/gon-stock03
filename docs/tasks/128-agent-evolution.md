# #128 기능 검증과 Astra 에이전트 자기개선 설계

[설계 이슈 #128](https://github.com/krdn/gon-stock03/issues/128) · [연구·기능별 검증표·단계별 완료 기준](../plans/agent-evolution.md)

- 상태는 설계 검토 대기다. 범위는 연구와 설계이며, 후속 구현 #129 → #130 → #131을 GitHub에서 추적한다.
- 기준 main은 `544bd750d5f853b6c84e4735b623935d9ce1b360`, 문서 브랜치는 `docs/128-agent-evolution`이다.
- 완료 기준은 1차 자료 비교, 저장소 기능과 기존 검사의 연결, 제품 변경·에이전트 채택 절차, 격리·예산·복구·첫 재생 명세를 원격 문서와 이슈에 연결하는 것이다.

## 먼저 읽을 자료

1. [설계의 첫 실험과 도입 순서](../plans/agent-evolution.md#첫-실험과-도입-순서)와 [#129](https://github.com/krdn/gon-stock03/issues/129).
2. [관심종목의 실제 회귀](20-watchlist.md#2026-11-17-후속-화면-수정), [검사 코드](../../tests/browser/market.spec.ts), [기존 CI](../../.github/workflows/application.yml).
3. 거래 실증 상태를 대조할 때만 [#25의 최신 장중 기록](25-validation.md#다음-정규장-재개)을 확인한다.

## 확인과 다음 행동

원격 기준 SHA의 [Application checks](https://github.com/krdn/gon-stock03/actions/runs/44516765531)에서 단위·통합 271건, 브라우저 170건 통과를 확인했다. 화면 ID 15개·추가 경로와 표의 테스트 파일 35개를 소스와 대조했고, 로컬 문서 링크·조사 이력 보존·`gon-workflow implementation-ready .`를 확인했다. 설계의 수치 한도·승급 기준은 파일럿 제안이다. 후보 실행·비교 결과와 비용은 미측정이다.

설계 수용 후 첫 구현은 #129다. 같은 격리 검사로 수정 전 SHA에서 원래 증상이 실패하고 수정 후 SHA에서 통과하는지 확인한다. 제품 코드 수정·새 기능 구현·Astra 세대 선발은 각 후속 이슈의 범위로 둔다.
