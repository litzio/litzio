# 공정 분석기 (스파이크)

OBCM EOL 시험 CSV를 그래프로 보고 공정 능력(Cp/Cpk 등)을 분석하는 community 플러그인 스파이크입니다. 설계와 한계는 [SPIKE.md](SPIKE.md)를 보세요. 데이터는 합성 데이터입니다.

1. `litzio plugins register community-plugins/process-analyzer --host <origin>`
2. 설정 `dataFolder`에 CSV 폴더의 절대 경로를 저장하고(`litzio plugins settings`), 신뢰·켜기.
3. 사이드바의 "공정 분석기" → "EOL 측정 그래프" 또는 "공정 능력 분석" → CSV 파일 이름 → 불러오기.

`sample/generate-eol-data.py <폴더>`가 합성 CSV·스펙·xlsx를 만듭니다.
