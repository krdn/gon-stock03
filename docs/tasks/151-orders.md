# 현재 주문·체결 조회

[이슈 #151](https://github.com/krdn/gon-stock03/issues/151) · [상위 #149](https://github.com/krdn/gon-stock03/issues/149) · [지난 주문 UX 기준](147-orders-ux.md)

기준 main `04434fdb`. DEMO와 현재 KIS의 첫 주문, 취소 가능 여부와 재조회 효과를 격리 예시로 비교한다. 지난 실행은 KODEX 200의 저장 확인 시각 10:20:55 KST, 식별자 상세와 보기·필터 복원을 회귀 확인한다.

첫 측정에서 모바일 DEMO 주문 행은 y=1,222, 취소 버튼은 x=567에 있었다. 현재 KIS 주문별 확인 시각은 y=935, 복구 화면 링크는 y=995였다. PC에서도 DEMO 첫 행은 y=899였다. 지난 주문의 첫 행과 확인 시각은 두 크기 모두 첫 화면에 있었다. [변경 전 캡처](../verification/assets/151-orders)
