# Orca 명령 만들기 · 화면 시각화 문서 생성·갱신

이 명령은 **사용자가 화면을 가리켜 질문할 수 있는 지도**를 만든다. 기준은 gon-stock03의 1차 지도와 이를 2차 미리보기에 연결한 작성 방식이다. Graphify로 코드의 근거를 찾고, Archify 원본에 조작·결과·캡처를 기록하고, 브라우저에서 검증한 단일 HTML을 전달한다. [기준 지도와 검증 기록](https://github.com/krdn/gon-stock03/blob/209ea1b291a4b8a18964464e47c84aff05e3e911/docs/tasks/143-v1-guide.md)

## 등록할 값

| Orca 항목 | 값 |
| --- | --- |
| Label | **화면 시각화 문서 생성·갱신** |
| Action / Agent | **Agent Prompt / Codex** |
| Scope / Project | **Project / gon-stock03** |
| 고정 ID | `gon-stock03-screen-guide` |
| Prompt | [screen-guide.txt 전문](screen-guide.txt) |
| 등록용 도구 | [screen-guide-settings.cjs](screen-guide-settings.cjs) |

**사용 위치**는 Orca에서 **gon-stock03 선택 → 워크트리의 Quick Commands → 화면 시각화 문서 생성·갱신**이다. 명령 자체를 편집하려면 **Settings → Quick Commands**로 간다. 기존 ‘2차 UI/UX 업그레이드 총괄’은 제품 개선·작업자 배정을 담당하고, 이 명령은 문서 원본·캡처·검증·문서 PR을 담당한다. [Orca 공식 설정 안내](https://orca.dev/docs/settings#quick-commands)

## 같은 명령을 재생성하는 방법

**이 PC에서 같은 ID로 등록하거나 검증할 때**는 위의 TXT와 CJS를 같은 폴더에 둔다. 두 파일이 있는 checkout의 루트에서 다음 명령을 실행한다. 마지막 인자는 Orca에 등록된 기본 저장소 경로다. 여기서 `create`는 프리셋을 저장하며 Codex 작업을 시작하지 않는다.

```sh
ELECTRON_RUN_AS_NODE=1 /opt/Orca/orca-ide \
  docs/operations/orca-commands/screen-guide-settings.cjs create \
  /home/gon/llm-projects/gon-stock03

ELECTRON_RUN_AS_NODE=1 /opt/Orca/orca-ide \
  docs/operations/orca-commands/screen-guide-settings.cjs verify \
  /home/gon/llm-projects/gon-stock03
```

`verify`는 쓰기 없이 이름·ID·Agent·프로젝트 범위와 본문을 다시 읽어 파일과 대조한다. 같은 설정으로 `create`를 반복하면 기존 명령을 그대로 확인한다. 같은 이름·ID가 다른 설정에 쓰이고 있거나 기존 본문이 다르면 중단한다.

**화면으로 등록할 때**는 Settings → Quick Commands에서 동일 프로젝트의 기존 항목부터 찾는다. 기존 항목은 Edit, 없으면 Add command를 선택한다. 표의 값을 입력하고 Prompt에 TXT 전문을 붙여넣은 뒤 Save한다. 다른 호스트에 UI로 새로 만들면 Orca가 자체 ID를 부여할 수 있다. 고정 ID가 필요한 경우 위의 등록 도구를 사용한다. 이 도구는 Linux Orca 1.4.268의 설치된 설정 클라이언트에서 확인했다. 다른 설치 경로나 버전에서는 UI를 사용하거나 해당 버전의 클라이언트·스키마를 확인한다.

## 호출했을 때 무엇을 만드는가

| 입력 상황 | 명령의 행동 | 확인할 산출물 |
| --- | --- | --- |
| 별도 지시 없이 호출 | 실제 메뉴·라우트와 기존 카드를 대조한다. 바뀐 내용이 없으면 기존 지도와 점검 결과를 안내한다. | 누락·변경된 카드 목록 또는 기존 지도 링크 |
| 특정 화면 갱신. 예를 들어 “주문·체결에서 원장을 다시 읽으면 무엇이 바뀌는지 반영해” | 해당 카드·연결만 수정한다. 1차 캡처, 현재 앱, 2차 후보를 각각의 근거에 연결한다. | 기존 카드 주소를 유지한 HTML과 해당 화면의 피드백 이슈 |
| 별도 주제 문서. 예를 들어 “일봉 수집부터 백테스트 결과까지 별도 그림으로 만들어” | 기존 지도와 겹치는지 확인하고 고유한 원본·HTML 경로를 쓴다. 기존 지도 전용 생성기는 경로가 고정되어 있다. | 새 Archify 원본·HTML, 재생성 명령, 검증 결과 |
| 같은 주제의 후속 PR이 이미 열려 있음 | 작업 소유권과 원격 head를 대조한다. 자기 작업은 재사용하고 다른 작업자가 수정 중이면 위치와 상태를 보고한다. | 기존 PR 갱신 또는 인계 위치 |

## 문서 생성 절차

1. **근거 고정.** 문서 원본·제품 main·해당 2차 후보의 SHA를 각각 기록한다. 라우트·화면·버튼·API·원장 관계를 Graphify로 찾고 원문에서 실제 동작을 확인한다. 그래프가 오래됐으면 해당 버전의 소스와 검사 기록으로 보완한다.
2. **카드 작성.** ‘사용자 질문 → 캡처와 촬영 시점 → 조작·결과 → 다음 화면·근거·의견 이슈’ 순서로 쓴다. 전체 지도에서는 메뉴 15개와 별도 매매 설정, 사용자 흐름도와 시스템 구조도를 출발점으로 삼는다. 신규 캡처는 KIS 자격값·실제 원장이 없는 격리 앱에서 만든다.
3. **자기 작업 폴더에서 생성.** `docs/v1-guide.archify.md`를 수정한다. 원본이 main에 없으면 [지도 PR #144](https://github.com/krdn/gon-stock03/pull/144)의 실제 head를 확인하고 자신이 소유하는 별도 브랜치에서 작업한다. 기존 지도는 아래 명령으로 생성한다. 예시 경로는 이 PC 기준이다.

   ```sh
   python docs/architecture/render-v1-guide.py /home/gon/.agents/skills/archify/bin/archify.mjs
   ```

   Python/Pillow가 캡처를 WebP로 경량화하고, Archify가 explainer를 생성·검사한다. 최종 파일은 `docs/architecture/figures/v1-guide.html`이다. [편집 원본](https://github.com/krdn/gon-stock03/blob/209ea1b291a4b8a18964464e47c84aff05e3e911/docs/v1-guide.archify.md) · [생성기](https://github.com/krdn/gon-stock03/blob/209ea1b291a4b8a18964464e47c84aff05e3e911/docs/architecture/render-v1-guide.py)

4. **검증·전달.** 로컬 파일에서는 이미지·그림 표시를, 임시 루프백 서버에서는 PC 1440×900·모바일 390×844의 카드 탐색·고유 주소·질문 복사·키보드·가로 넘침·가독성을 확인한다. 예시 링크와 의견 이슈의 목적지도 대조한다. 원본 head와 소유권을 push 직전에 다시 확인하고 자기 PR에 결과를 기록한다. 실제 서비스 교체·제품 병합이나 실행은 별도 작업이다.

## 변경·복구와 기준선

호스트에서 등록을 검증한 후 이전 [본문](screen-guide.txt)을 Git 커밋과 SHA-256로 보존한다. 새 후보를 수정·리뷰한 뒤 `create` 대신 아래처럼 현재 등록된 이전 해시를 지정한다. 복구는 이전 Git 본문으로 파일을 되돌리고, 교체 대상인 **현재 등록본**의 해시로 같은 `update`를 수행한다. 예시의 셸 변수 `previous_sha256`에 검증된 현재 해시를 먼저 넣는다. 두 경우 모두 마지막에 `verify`를 실행한다. 동시에 같은 항목을 편집하는 사람이 있으면 먼저 소유권을 확인한다.

```sh
ELECTRON_RUN_AS_NODE=1 /opt/Orca/orca-ide \
  docs/operations/orca-commands/screen-guide-settings.cjs update \
  /home/gon/llm-projects/gon-stock03 "$previous_sha256"
```

기준선은 UTF-8 7,013바이트, SHA-256 `311b957904f19e004636fd9a0c92dedb52ec9c58c607ffc40d3dd76b6fa31b7a`다. 끝 개행도 본문 해시에 영향을 준다. 검사에는 Orca 호스트의 repo ID를 동적으로 사용한다. 설정 DB를 직접 편집하지 않는다.

**2026-11-21 제작 기록.** AGY Gemini Neon은 기존 브랜치·배포 경계와 파일 열기·클립보드 검증 방식의 분리를 지적했다. Claude Opus 5.5의 첫 검토에서 재호출 시 중복 PR, 생성기 실행 폴더, 원본 head와 PR base 처리 문제를 확인했다. 이를 반영한 최종 문구와 등록 보조 도구에 대해 Opus 재검토 PASS를 받았다. 검토용 복제본에서 기존 지도를 실제 재생성했고 두 화면 크기에서 16개 카드 왕복·이미지 16개·그림 2개·질문 복사·가로 넘침 없음을 확인했다. Orca에 최종 명령을 저장하고 별도 프로세스로 재조회했다. 명령을 눌러 별도의 Codex 세션이 작업을 마치는 것까지 검증한 기록은 없다. [등록·검증 이슈 #192](https://github.com/krdn/gon-stock03/issues/192)
