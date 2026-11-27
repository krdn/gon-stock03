# #240 저장 일봉 돌파와 변동성 사이징

[이슈 #240](https://github.com/krdn/gon-stock03/issues/240) · [PR 3A-2 입력 계약](../plans/strategy-rules.md#pr-3a-입력-계약)

Item #93의 PR 3A-1은 기준 6979809에서 스키마·카탈로그·일봉 체결과 수량 계산을 추가한다. PR 3A-2에서 폼, 상세 도움말과 브라우저 시나리오를 연결한다. 기존 폼은 신규 입력이 있는 초안의 실행을 차단한다. 3A-2에서 지원 필드를 연결한 후 호환 가드를 제거한다.

기준 코드에서 먼저 산출한 v1·기존 v2 10종·샹들리에 실험 ID/결과 결합 SHA-256은 `df416d735fd533651079a02a844b7b93be85d5772a245dd0d883bcee3a62df2a`다. 격리 SQLite 재생을 포함한 단위 361건이 통과했다. implementation-ready 통과, Graphify CLI 부재. 초기 미추적 pnpm-lock.yaml은 보존했다.

독립 리뷰 실제 반환 모델은 `claude-opus-5-5`(요청 high)이며 확정 코어 결함은 없었다. 기존 규칙에 패리티가 붙은 초안의 필드 보존을 보완했다. 저장·재생 호출은 동일 일봉 시가를 사용하고 UI 선택 목록은 RULE_KINDS로 제한됨을 확인했다.
