# 자동진화 파일럿 총괄·재개

Orca에서 **gon-stock03 → 워크트리 탭 바 → Quick Commands ▾ → 자동진화 파일럿 총괄·재개**를 선택한다. Codex 총괄 탭이 열린다. 작업 탭은 총괄이 필요한 단계에서 하나씩 배정한다. 해당 프로젝트의 명령을 확인하거나 편집할 곳은 **Settings → Quick Commands**다. [Orca 사용 안내](https://orca.dev/docs/terminal#quick-commands)

| 호출 시 확인한 상태 | 총괄이 할 일 |
|---|---|
| 승인된 단계가 미완료이고 인계받을 총괄이 없음 | 현재 스레드에 Goal을 설정하고 첫 미완료 단계의 작업자를 전용 워크트리에 배정한다. |
| 기존 총괄이나 작업자가 진행 중 | 기존 Run·Dispatch와 세션 위치를 확인한다. 소유권이 확인된 기존 총괄에서 계속한다. |
| 세션이 끊김 | 기존 총괄을 복원하고 Goal이 일시정지 상태라면 `/goal resume`을 입력한다. 총괄을 복원할 수 없으면 명령을 다시 열어 원격 기록과 실제 실행을 대조한다. |
| 세 단계의 완료 근거가 있음 | 결과와 근거를 한 번 보고하고 종료한다. 새 실험은 별도로 범위를 정한다. |

**등록 당시 상태(2026-11-21).** 설계 PR #132와 단계별 PR #133·#134·#135는 병합됐고 #129·#130·#131은 닫혔다. 관심종목 최초 503 재생에서 예시 행/시세 요청이 4/4에서 0/0으로 바뀌었다. 거래일지 초안 오류와 관심종목 코드 복사를 전달했다. Astra 후보 B와 기존 A는 모두 6개 과제를 두 번씩 해결해 B를 보류하고 A를 유지했다. 명령은 호출할 때마다 이 상태를 다시 확인한다. [설계](../../plans/agent-evolution.md) · [기준선](../../tasks/129-offline.md) · [제품 변경](../../tasks/130-product.md) · [에이전트 비교](../../tasks/131-agent-comparison.md)

등록 원문은 [agent-evolution.txt](agent-evolution.txt)다. 이 PC의 Orca 프로젝트에 `Agent Prompt` / `Codex` / `Project · gon-stock03`로 저장한다. 고정 ID는 `gon-stock03-agent-evolution`이다. 수정할 때는 원문을 먼저 고치고 같은 명령에 반영한 뒤, Orca에서 다시 읽은 본문의 UTF-8 바이트와 원문을 대조한다. 명령 호출과 편집은 별도 작업이다. [등록 이슈 #190](https://github.com/krdn/gon-stock03/issues/190)
