# #64 SQLite 파일 권한 검증

Store가 SQLite를 열기 전에 DB와 기존 WAL/SHM을 0600으로 보호한다. 신규 DB는 `openSync`의 생성 mode 0600으로 준비한다. SQLite Unix VFS는 이 DB mode로 새 WAL/SHM을 생성한다. 서버 진입점의 사후 DB chmod는 제거했다.

근거: [Node 24 파일 API](https://nodejs.org/docs/latest-v24.x/api/fs.html), [SQLite Unix VFS](https://sqlite.org/src/doc/trunk/src/os_unix.c)의 `findCreateFileMode`·`unixOpenSharedMemory`. 공식자료를 `docs/start-context.json`에 추가하고 `gon-workflow implementation-ready .`를 통과한 뒤 구현했다.

## 보호와 보존

- `server/store.ts` 생성자는 파일 디스크립터에 `fchmodSync`를 적용한다. 심볼릭 링크, 다중 하드링크, 일반 파일이 아닌 대상, 현재 사용자 소유가 아닌 파일은 거부한다. 보조 파일 부재만 허용하며 다른 오류는 SQLite 초기화 전에 전파한다.
- 파일 삭제·내용 초기화·마이그레이션·chown과 전역 umask 변경은 없다. 기존 디렉터리0755와 DB inode·uid·gid를 회귀에서 확인했다. `:memory:` 동작을 유지한다.
- 다른 사용자가 쓰기 가능한 상위 경로의 악의적 교체 경쟁, 이미 열린 타 사용자 FD, 과거 노출을 복구하지 않는다. 이 검증은 Linux 로컬 파일시스템과 Node24.22.3 범위이며 Windows ACL·다른 사용자 실제 읽기 시도는 미검증이다.

## 격리 결과

`tests/store-permissions.test.ts`는 KIS 변수를 제거한 자식 프로세스와 임시 경로만 사용한다.

| 검사 | 결과 |
| --- | --- |
| 수정 전 새 회귀16개 + 기존 저장 회귀1개 | 10 실패 / 7 통과. 0644 관측 및 링크 대상 보존 실패 재현 |
| 수정 후 같은 검사 | 17/17 PASS |
| 기존0755 디렉터리 × umask022/077 × 신규/닫힌 기존/비정상 종료 WAL DB | 6 조합에서 DB/WAL/SHM0600, 두 번 열기와 저장 cash 보존 |
| DB/WAL/SHM의 심볼릭 링크·하드링크·디렉터리 | 9 조합 거부, 별도 백업 내용·mode 보존 |
| 읽기 전용 DB 및 메모리 DB | 쓰기 접근 EACCES와 내용 보존, 메모리 정상 |
| 전체 단위 테스트 | 182/182 PASS |
| `npm run build` | PASS, 기존 500kB 번들 경고 유지 |

임시0755 디렉터리·umask022·빈 KIS 환경에서 `server/index.ts`를 port0으로 시작하고 strace로 생성 시점을 확인했다. 최초 DB `openat(O_CREAT,0600)` → `fchmod(0600)` → SQLite가 기존 DB 재열기 → 새 journal/WAL/SHM `openat(O_CREAT,0600)` 순서였다. 열린 DB/WAL/SHM mode도 모두0600이다. SQLite의 기존 DB 재열기 인자0644는 이미 존재하는 파일의 mode를 바꾸지 않는다. 프로세스 종료 후 임시 디렉터리를 제거했다.

실제 원장·보유·백업·다른 worktree·.codex·graphify-out·전역 hook은 변경하지 않았다. 기존 node_modules가 없어 `npm ci --ignore-scripts`로 설치했다. KIS 업무API/WebSocket·인증·주문·취소·예약·외부 알림은 실행하지 않았다. #65는 변경하지 않았고 #25는 Blocked 유지다.

## 지정 검토와 문서 검사

중앙 설정/dry-run은 `claude-opus-5-5/high`로 사용자 지정과 달랐다. 전역 설정을 보존하고 제공 목록의 `gemini-4-argon-high`, effort high를 명시해 이번 변경만 검토했다. [원 응답](assets/sqlite-permissions/review.json)은 PASS·구체적 결함 없음이다. 요청/init 모델 일치와 서버 내부 모델/effort 독립 미검증을 구분한다. 추가 에이전트·다른 이슈 리뷰 재사용은 없었다.

`git diff --check`와 변경 문서 상대 링크 검사는 PASS다. STE는 기존 `docs/conventions/ste100-writing.md` 부재로 exit2이며 통과가 아니다. [초안 PR67](https://github.com/krdn/gon-stock03/pull/67)의 앱 CI에서 브라우저 회귀도 실행한다. 최종 head 결과·실행 링크는 #64 전달 댓글에 남긴다.
