# 그림 출처 (Credits)

## 픽셀 그림 (`img/sprites.png`)

게임 화면의 32×32 픽셀 그림은 두 가지를 섞어서 만들었어요. 만드는 방법: `node tools/sprites-build.mjs`

1. **Dungeon Crawl Stone Soup 타일** — CC0 (퍼블릭 도메인)
   - 출처: https://github.com/crawl/tiles (`releases/Nov-2015`, 저작권자가 CC0으로 공개한 타일만 모은 곳)
   - 바닥·벽·포탈, 플레이어(여러 장을 겹쳐 만든 기사), 무기·방어구·장신구·물약·금화·룬, 몬스터
   - 일부는 색을 바꾸거나(황금 고블린, 나이트메어 벽, 불가사리, 구미호, 이무기, 저승사자, 염라대왕) 직접 그린 장식을 얹었어요
   - CC0이라 표시 의무는 없지만, 고마운 마음으로 출처를 남겨요
2. **직접 그린 그림** (이 저장소, `tools/sprites-build.mjs` 안의 코드로 그림)
   - 계단, 던전 상점, 보물상자, 보석 5가지, 바지
   - 고블린 왕관, 구미호의 아홉 꼬리, 저승사자의 갓, 염라대왕의 면류관

## 3D 화면 (`view3d.js`, dc#109)

- **three.js** r170 — MIT 라이선스 (`vendor/three/three.module.min.js`, 라이선스 전문 `vendor/three/LICENSE`)
  - 출처: https://threejs.org · https://www.npmjs.com/package/three
  - 같이 쓰는 three.js 예제 모듈(MIT): GLTFLoader · BufferGeometryUtils · EffectComposer · RenderPass · UnrealBloomPass · OutputPass (`vendor/three/addons/`, `'three'` 가져오기만 상대 경로로 바꿈)
- 3D 벽·바닥·몬스터·아이템 그림은 위의 픽셀 그림(`img/sprites.png`)을 그대로 씀

## 3D 모델

- **KayKit: Fantasy Weapons Bits 1.0** — Kay Lousberg (www.kaylousberg.com), CC0 (`models/weapons/`, 라이선스 `models/weapons/LICENSE-KayKit-FantasyWeaponsBits.txt`)
  - 1인칭 손에 드는 검·도끼·단검·지팡이·방패 (dc#112)
  - CC0이라 표시 의무는 없지만, 만든 사람이 부탁한 대로 이름을 남겨요
- **KayKit: Dungeon Pack 1.1** — Kay Lousberg (www.kaylousberg.com), CC0 (`models/dungeon/`, 라이선스 `models/dungeon/LICENSE-KayKit-Dungeon.txt`)
  - 3D 던전 벽 모듈 9종: 평범한 벽 · 아치 · 금 간 벽 · 부서진 벽 · 선반 · 닫힌 창 · 기둥 · 쇠창살 (dc#113)
- 바닥·천장 돌 무늬와 벽 횃불은 코드로 그림 (`view3d.js`)

## 소리 (`sound.js`)

- 효과음과 배경 음악은 소리 파일 없이 코드로 합성해요 (Web Audio). 이 저장소에서 만든 것이라 따로 출처가 없어요

## 로고·아이콘

- `img/logo.webp`, `img/banner.png`, `favicon.ico`, `img/*icon*.png` — 이 게임을 위해 만든 그림
