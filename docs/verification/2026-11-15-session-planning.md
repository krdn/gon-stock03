# 화면별 세션 계획 검증

대상: [계획](../plans/interface-sessions-2026-11.md), [Project #25](https://github.com/users/krdn/projects/25), [상위 #1](https://github.com/krdn/gon-stock03/issues/1). 분석 코드 기준은 `f81b51c8a8116608f3317b23e9a7f6893830a728`이며 제품 코드는 변경하지 않았다.

## 확인 결과

| 검사 | 결과 |
| --- | --- |
| 대시보드·설계실 | agent-browser로 현재 렌더링 확인. DEMO 표시와 15개 화면 계약 확인. 전체 기능 테스트 재실행은 아님 |
| 화면 누락 | src/specs.ts의 route 15개와 화면 이슈 15개 일치 |
| 실행 계획 | 새 이슈 21개·의존성 52개, 순환 없음. 선행보다 앞선 Stage 없음 |
| 원격 본문 | #5~#25의 제목·본문이 최종 계약과 일치. 모두 OPEN |
| native 계층 | #1 직속 4, #2 직속 4, #3 직속 15: 총 23개 부모 관계 확인 |
| native 의존성 | 21개 이슈의 blocked-by 52개를 개별 재조회해 계획과 대조 |
| Project | 항목 24·저장 보기 6. 화면 15, Ready #5 하나. Blocked 20, 상위 In Progress 3, Done 0 |
| 기존 설정 보존 | Todo·In Progress·Done 옵션 ID와 비공개 설정 유지 |
| 로컬 문서 | 상대 링크·GFM 표·필수 파일 경로·공유 책임·선행 조건 직접 검사 |

## 계획 리뷰

중앙 실행기의 dry-run은 기본 `claude-opus-5-5/high`를 표시했다. 사용자가 지정한 Fable 5.2를 우선해 같은 무도구·비영속 Claude CLI 경로에 `--model claude-fable-5-2 --effort high`를 명시했다. 전역 모델 설정은 바꾸지 않았다.

원 리뷰와 수정분 리뷰 모두 JSON의 `is_error=false`, `subtype=success`, `modelUsage`의 실제 모델 `claude-fable-5-2`를 확인했다. 리뷰어는 제공된 자료만 읽었으며 저장소·GitHub를 직접 검증하지 않았다.

| 원 리뷰의 주요 지적 | 반영 |
| --- | --- |
| Ready·Done·사용자 수용이 모호함 | 선행 completed 종료+main 통합, 초기 화면/화면 변경/장중 통합 수용의 대상 분리 |
| 실제 모의 주문 증거가 마지막에만 있음 | C03에서 승인 범위 안 최소 접수·조회, 미관측 취소/부분체결은 V01로 이관 |
| 실시간 추가 변경의 화면 소유 공백 | C04가 주문·알림·데이터, S07이 대시보드 전략·KIS 위험 경로를 소유 |
| KIS 조작 UI 중복 | /paper가 주문·취소·불명 복구, /trade는 DEMO·이동, /orders는 DEMO 취소·KIS 조회 |
| 미지원 API의 종료 조건 없음 | 공식 대안·범위 변경 결정 전 Blocked, 자동 재전송·실전 fallback 금지 |
| 레지스트리와 변경 목표 충돌 | 이슈는 다음 변경 목표, 같은 구현 PR에서 현재 명세·API 갱신 |

후속 판정은 **P1 없음, P2 2건 부분 해소**였다. C04의 명세·브라우저 검사와 15개 화면의 사용자 수용 답변·SHA 체크를 추가했다. 최종 두 보완은 원격 본문과 파일 목록으로 직접 검사했다. 추가 모델 리뷰는 수행하지 않았다.

특정 KIS API의 모의 미지원 여부에 관한 리뷰어의 기억은 확인된 사실로 채택하지 않았다. 해당 구현 이슈에서 공식 계약과 실제 모의 응답으로 확인한다.

제공 자료 SHA-256: 원 리뷰 `e75634684f979d357d55a7b8da40cafb316f6987f8e439e5707dd00a7f808373`, 수정분 `165988531c82e589ba4bcc6688678967888a91772c0abcdee3409c74cde7c541`.

## 실패와 한계

- GitHub 연결 앱의 이슈 작성은 `403 Resource not accessible by integration`이었다. 기존 gh 인증으로 동일 승인 범위의 이슈·Project를 등록했다.
- `evolve docs ste-lint --strict --changed HEAD --added`는 `docs/conventions/ste100-writing.md`가 없어 종료코드 2로 실패했다. 엄격 문서 린트 통과로 표시하지 않는다.
- Project 보기·필터는 API 재조회로 검증했다. 로그인된 GitHub 화면에서의 시각적 검사는 수행하지 않았다.
- 이번 변경은 관리 문서다. 실제 모의 주문·체결·취소·연속 자동매매와 사용자 결과 수용은 수행하지 않았다. 그 증거는 해당 후속 이슈가 소유한다.
- 문서 커밋의 최신 application/configuration 결과는 [PR #4 Checks](https://github.com/krdn/gon-stock03/pull/4/checks)에서 해당 SHA로 확인한다. 초기 코드의 CI 성공과 구분한다.
