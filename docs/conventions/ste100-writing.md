# 문서 작성 기준과 STE 검사

2026-11-17 사용자가 #71의 STE 검사 복구를 승인했다. 이 문서는 evolve-loop의 작성 규칙을 한국어 프로젝트에 맞게 정리한 수정본이다.

원본은 [evolve-loop 작성 기준](https://github.com/mickeyyaya/evolve-loop/blob/9d4a590373e10d86f9b736dbf71e5c4f8c7d1c60/docs/conventions/ste100-writing.md)이다.
확인 revision은 `9d4a590373e10d86f9b736dbf71e5c4f8c7d1c60`, 기준 파일 blob은 `c9aca331baa93220085dc69b9a4430509f657321`이다.
원본의 [라이선스](evolve-loop-LICENSE.txt)와 [NOTICE](evolve-loop-NOTICE.txt)를 함께 보존한다.

## 적용 범위

프로젝트의 한국어 작성 원칙을 유지한다. 현재 작업에서 추가하거나 수정한 문서에 이 기준을 적용한다.
기존 문서 전체를 일괄 개작하지 않는다. 영어 단어표는 원본과 동일하게 유지한다.

STE 검사는 문장·문단 길이와 영어 단어표를 점검한다. 한국어 문법·의미·사실 여부는 사람이 별도로 검토한다.
검사 통과는 공식 ASD-STE100 적합성 인증을 뜻하지 않는다. 공식 사전은 [ASD-STE100](https://www.asd-ste100.org/)을 따른다.

## 작성 규칙

- 한 문장은 한 가지 주제를 다룬다. 절차는 순서가 있는 목록으로 쓴다.
- 지시문과 번호 항목은 20단어 이하로 쓴다. 설명문은 25단어 이하로 쓴다.
- 한 문단은 하나의 주제를 다루며 6문장 이하로 쓴다.
- 능동태와 단순한 시제를 사용한다. 행위자를 알 수 없는 설명에서만 수동태를 허용한다.
- 영어의 진행형은 기술 명칭에서만 허용한다. 세 단어를 넘는 명사 묶음은 풀어 쓴다.
- 같은 의미에는 같은 용어를 사용한다. 조건을 먼저 쓰고 행동을 이어 쓴다.
- 의무와 가능성을 구분한다. 제안·추정·가정은 확정 사실로 바꾸지 않는다.
- 기술 명칭·제품명·코드 식별자는 원래 의미를 유지한다. 코드 이름과 경로는 백틱으로 표시한다.
- 인용·명령·URL·기계가 읽는 표기·제목은 의미와 정확성을 보존한다.
- 생성 문서는 생성 원본을 수정한다. 사실·수치·링크·결정은 문장을 나눠도 보존한다.

## House list of words to replace

검사기는 아래 원본 단어표를 읽는다. 표의 단어를 대소문자 구분 없이 완전한 단어 단위로 검사한다.
코드·링크·인용 및 이 단어표의 단어는 검사에서 제외한다.

| Do not write | Write |
|---|---|
| utilize | use |
| utilise | use |
| leverage | use |
| ensure | make sure |
| in order to | to |
| prior to | before |
| subsequent to | after |
| subsequently | then, after that |
| via | through, with, by |
| approximately | about |
| additional | more, other |
| numerous | many |
| sufficient | enough |
| commence | start |
| terminate | stop |
| facilitate | help |
| assist | help |
| demonstrate | show |
| indicate | show |
| obtain | get |
| attempt | try |
| modify | change |
| initial | first |
| regarding | about |
| with regard to | about |
| whether | if |
| should | must, can |
| might | can |
| could | can |
| would | will, can |
| shall | must |
| e.g. | for example |
| i.e. | that is |
| etc. | (list all the items) |
| vs. | against, compared with |
| et al. | and others |
| incl. | with |

## 실행과 판정

저장소 루트에서 현재 PR의 변경 문서를 검사한다. 신규 파일도 검사 대상에 포함했는지 결과를 확인한다.

```bash
evolve docs ste-lint --strict --changed refs/remotes/origin/main --added
```

완료 기준은 위반 0건과 종료코드 0이다. 종료코드 1은 strict 검사 위반이고, 종료코드 2는 파일 접근 실패다.
`--strict`를 끄거나 단어표를 축소해 위반을 숨기지 않는다.

검사기는 코드 블록·HTML·frontmatter·생성 영역을 읽지 않는다. 이를 문장 위반을 숨기는 용도로 사용하지 않는다.
코드 구간·경로·URL·인용은 각각 한 단어로 계산한다. 일반 인용 블록은 검사 대상이다.
링크 문구는 길이 계산에 포함하지만 영어 단어표 검사는 하지 않는다. 제목에는 길이 제한을 적용하지 않는다.
