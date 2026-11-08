# Roadmap 후보

아래는 검토 후보이며 버전·일정·구현 약속이 아닙니다. 현재 기준은 [Changelog](CHANGELOG.md)와 [README의 공개 SDK 대조표](README.md#보관-표현-정책sidecar와-현재-공개-sdk의-대조)입니다. 공개 SDK에 없는 기능을 내부 import나 직접 문서/asset 쓰기로 우회하지 않습니다.

| 후보 | 목표 | 필요한 Litzio 선행 작업 |
| --- | --- | --- |
| 0.0.2 변환 기능 확대 | 그림, 캡션 번호, 목록, 큰 문서. | README SDK 대조표의 한도·figure asset·Figure/Table 번호/표 캡션·inline/중첩 목록·미주 검토. 공식 문서 생성 한도 확대와 asset 저장·캡션 번호 API가 우선 필요 |
| 0.0.3 대시보드 | 플러그인 화면에서 여러 PDF 변환과 작업 목록 | 플러그인이 공용 작업을 시작·관찰할 작업 패널과 다중 파일 입력 SDK. Host 범용 큐를 선제 도입하지 않음 |
| 0.0.4 대조뷰 | `.docling` 내부 이미지 표시와 결과 문서 대응표 | ZIP 내부 이미지의 Host 공식 read/ref 공급, 원본·문서 revision/hash에 묶인 대응표와 필요한 target/provenance/sidecar 계약 |
| 이후 | 교정 기록과 재변환 | Core 중립 변경·공식 승인/Undo와 원본·결과 revision 보호, 교정 기록 저장·재생 정책 검토 |

0.0.1은 SDK 0.2.0의 일반 파일 결과로 PDF 보관을 연결합니다. 로컬 상시 컨테이너의 고정 프로필 시험은 모델 설치 후 성공했습니다. 이 파일은 새 제품 계약이나 구현 완료 선언이 아닙니다.
