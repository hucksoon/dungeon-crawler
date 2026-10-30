# 던전 크롤러 웹샵 (Xsolla 사이트 빌더) 준비

Xsolla 사이트 빌더(Shop Builder)로 게임 밖에서 쓰는 웹샵을 만들기 위한 설명서예요.
웹샵 조립은 노트북의 Claude Desktop에서 Xsolla AI Kit으로 해요 (Xsolla 안내 문서 "A game web storefront in an hour: AI agent + Shop Builder").
이 폴더의 `brief.json`이 AI Kit(`shop-builder-assembly` 스킬)에 넘기는 설명서예요.

## 무엇을 파나요

| 웹샵 칸 | Xsolla 그룹 | 상품 | 결제 | 받는 곳 |
|---|---|---|---|---|
| 한정 판매 (맨 위, 크게) | `limited_offers` | `ancient_unique_box` 고대 유니크 선택 상자 ($4.99 · ₩6,900 · ¥750, 계정당 1회) | 현금 | 게임 우편함에서 유니크 하나를 골라 고대로 (서버 `market.php` `ubox_collect`가 인벤토리에서 꺼냄) |
| 캐시 충전 | `cash_packs` | `cash_10` · `cash_50` · `cash_100` · `cash_200` (보너스 포함) | 현금 | 계정의 캐시 잔액 (게임 상점과 같은 잔액) |
| 장비 상자 | `equipment_boxes` | `box_equipment_1` · `_10` · `_50` (1회 = 캐시 10) | 캐시 | 게임 우편함 (결제 웹훅 `order_paid` → 서버 `box_grant`) |

- 빼는 그룹: `game_items` (부활권 `revive`, 이벤트 재화 `event_coin`). 게임 안과 게임 상점의 이벤트 칸에서만 써요
- 장비 상자는 확률형 상품 → 웹샵에 확률 안내 문구와 확률표 링크(`https://game.apacimtest.com/shop.html#odds`)를 꼭 넣어요
- 로그인: 게임과 같은 Xsolla 로그인(이메일·휴대폰 코드). 같은 계정이어야 캐시 잔액·우편함이 이어져요. 게스트는 살 수 없어요
- 2026-10-30에 Store API(읽기 전용)로 위 그룹과 SKU가 프로젝트 317991에 있는 것을 확인했어요

## 순서

### 1. 준비 (노트북, 한 번만)
Xsolla 안내 문서의 Step 1대로 Claude Desktop(Code 탭), 빈 폴더(예: `Documents/dungeon-crawler-shop`), Claude in Chrome(같은 브라우저에서 publisher.xsolla.com 로그인)을 준비해요.
이 폴더에 저장소를 받아 두면 그림 파일(`img/logo.webp`, `blog/images/store-cover.jpg`)과 설명서를 바로 쓸 수 있어요.

```
git clone --depth 1 https://github.com/hucksoon/dungeon-crawler.git
```

### 2. AI Kit 설치
안내 문서 Step 2의 Setup prompt를 보내요. `<PASTE THE LINK HERE>` 자리에는 아래 주소를 넣어요.

```
https://publisher.xsolla.com/16851/projects/317991
```

설치가 끝나면 같은 폴더에서 새 대화를 시작해요 (AI Kit은 새 대화에서만 불러와져요).

### 3. 테스트 프로젝트 승인 목록 (저장소 밖에)
AI Kit은 테스트 프로젝트를 승인 기록과 함께 목록에 적어 두어야 작업해요. 저장소 밖(예: 작업 폴더 바로 아래)에 `approved-test-projects.json`을 만들어요.

```json
{
  "version": 1,
  "projects": [
    {
      "merchant_id": 16851,
      "project_id": 317991,
      "approved_by": "프로젝트 소유자",
      "approval_reference": "2026-10-30 소유자가 317991을 웹샵 실험용 테스트 프로젝트로 써도 된다고 확인"
    }
  ]
}
```

### 4. 웹샵 만들기
새 대화에 아래를 보내요.

```
dungeon-crawler/docs/webshop/brief.json 설명서로 Xsolla 사이트 빌더 웹샵을 만들어 줘.
shop-builder-assembly 스킬을 쓰고, 승인 목록은 approved-test-projects.json이야.
- 디자인: 게임처럼 어두운 던전 도트 그림 느낌. 로고 dungeon-crawler/img/logo.webp, 큰 그림 dungeon-crawler/blog/images/store-cover.jpg
  (참고: https://game.apacimtest.com 과 https://game.apacimtest.com/shop.html)
- 판매 칸은 brief.json 순서대로 한정 판매 → 캐시 충전 → 장비 상자. game_items 그룹은 넣지 마
- 장비 상자 칸 근처에 brief.json의 odds_notice(확률 안내와 링크)를 꼭 보여 줘
- 한국어가 기본, 영어·일본어도
- 공개(publish)는 하지 마. 미리 보기 링크만 줘
디자인을 먼저 보여 주고, 내가 ok 하면 만들어 줘.
```

### 5. 확인 (공개 전)
- 웹샵에서 게임과 같은 이메일로 로그인 → 캐시 잔액이 게임 상점과 같은지
- 캐시 패키지 하나를 사고 → 게임 상점·웹샵 잔액이 함께 늘어나는지
- 캐시로 장비 상자 1회 → 게임 우편함에 장비 1개가 오는지 (한 번만)
- 고대 유니크 선택 상자 → 게임 우편함에 상자가 오고 고를 수 있는지, 두 번째 구매는 막히는지
- 확률 안내 링크가 열리는지, 휴대폰 화면에서 보기 좋은지
- 결제 웹훅 기록: `sudo -u www-data php /var/www/html/ranking/admin.php webhooks`

### 6. 공개
확인이 끝나면 Publisher Account의 사이트 빌더에서 직접 공개해요 (AI Kit은 공개하지 않아요).
공개 주소가 정해지면 게임 상점에 "웹샵" 링크를 넣을지 정해요.

## 주의
- 317991은 실제 결제가 켜진 프로젝트예요. 공개하지 않은 웹샵은 게임에 영향이 없지만, 공개하면 웹샵에서도 실제로 결제돼요
- AI가 작업하는 동안 사이트 빌더 편집기를 직접 고치지 마세요 (서로 덮어써요)
- 비밀 키·비밀번호는 대화에 붙여 넣지 마세요. Xsolla 로그인은 `xsolla auth login`이 브라우저로 해요
