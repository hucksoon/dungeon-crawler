<?php
// 거래소와 우편함. api.php가 불러서 씀.
//
//   GET  api.php?r=market       &slot=&rarity=&sort=new|cash|gold   지금 팔고 있는 아이템
//   POST api.php?r=market_list  { item: {seed, src, lvl, v, enh, id, tries}, gold, cash, stage }  아이템 등록
//   POST api.php?r=market_cancel { id }   내 등록 취소 → 우편함으로
//   POST api.php?r=market_buy   { id, adTicket? }  구매: 캐시(가격 + 수수료)를 Xsolla에서 차감, 아이템은 내 우편함으로
//                                       adTicket(광고 티켓, ads.php)이 있으면 수수료 면제 (하루 AD_CAPS['fee']회)
//   GET  api.php?r=market_mine            내 등록, 지난 거래, 우편함
//   POST api.php?r=mail_claim   { id }    우편 받기: 아이템 참조·골드를 돌려주고, 캐시는 Xsolla로 지급
//                               { id, pick }  고대 유니크 선택 상자: 고른 유니크(pick = 유니크 키)를 고대로 만들어 돌려줌
//   POST api.php?r=ubox_collect           현금으로 산 고대 유니크 선택 상자를 Xsolla 인벤토리에서 꺼내(소모) 우편함으로
//                                       (우편함을 열 때 market_mine도 같은 일을 함)
//   GET  api.php?r=box_order&order=<주문 번호>  캐시로 산 장비 상자의 결과 (웹훅이 처리했으면 아이템 참조 목록)
//   (운영자 선물은 서버에서 gift.php로 우편함에 넣음, 장비 상자는 webhook.php가 order_paid를 받으면 우편함에 넣음)
//
// 원칙
//   - 거래(등록·구매·우편)는 로그인 사용자만. 모든 거래에 캐시 수수료(MARKET_FEE_CASH)가 있어서 Xsolla 계정이 필요함
//   - 수수료는 구매자가 가격에 더해 냄. 판매자는 정한 가격을 그대로 받음 (우편함으로)
//   - 레전더리·세트 아이템은 캐시 가격이 1 이상이어야 함
//   - 아이템은 서버가 rules.php로 다시 만들어 검증. 아이템 ID별 주인(item_owner)을 기록해서
//     남에게 넘어간 아이템(복사본)은 다시 등록할 수 없음
//   - 등록 후 MARKET_HOURS 시간이 지나면 판매자 우편함으로 돌아감
//   - 등록·구매·가격·시간은 전부 listings 표에, 아이템·골드·캐시 전달은 mail 표에 남음
//   - 저장하는 사람 정보는 내부 키(HMAC)와 가린 이름뿐. Xsolla 사용자 ID는 요청한 토큰에서 그때그때 읽고 저장하지 않음
//
// 골드는 게임(브라우저)에 저장되는 값이라 서버가 잔액을 확인할 수 없음. 캐시는 Xsolla가 확인함.

const MARKET_FEE_CASH = 1;
const MARKET_HOURS = 24;
const MARKET_MAX_ACTIVE = 10;
const MARKET_MAX_GOLD = 10000000;
const MARKET_MAX_CASH = 100000;
const MARKET_CASH_REQUIRED = ['legendary', 'set', 'unique'];

function market_tables(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS listings (
        id             VARCHAR(32) PRIMARY KEY,
        item_id        VARCHAR(32) NOT NULL,
        item_ref       TEXT NOT NULL,
        item_view      TEXT NOT NULL,
        item_name      VARCHAR(64) NOT NULL,
        rarity         VARCHAR(16) NOT NULL,
        slot           VARCHAR(16) NOT NULL,
        seller_key     VARCHAR(64) NOT NULL,
        seller_display VARCHAR(80) NOT NULL,
        price_gold     INTEGER NOT NULL,
        price_cash     INTEGER NOT NULL,
        fee_cash       INTEGER NOT NULL,
        state          VARCHAR(12) NOT NULL,
        created_at     BIGINT NOT NULL,
        expires_at     BIGINT NOT NULL,
        ended_at       BIGINT,
        buyer_key      VARCHAR(64),
        buyer_display  VARCHAR(80),
        buying_at      BIGINT,
        sold_at        BIGINT
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS mail (
        id          VARCHAR(32) PRIMARY KEY,
        owner_key   VARCHAR(64) NOT NULL,
        kind        VARCHAR(12) NOT NULL,
        listing_id  VARCHAR(32),
        item_id     VARCHAR(32),
        item_ref    TEXT,
        item_name   VARCHAR(64),
        rarity      VARCHAR(16),
        gold        INTEGER NOT NULL DEFAULT 0,
        cash        INTEGER NOT NULL DEFAULT 0,
        note        VARCHAR(120),
        state       VARCHAR(12) NOT NULL,
        created_at  BIGINT NOT NULL,
        claimed_at  BIGINT
    )');
    // 고대 유니크 선택 상자에서 고른 유니크의 시드 (buy|m우편 번호|유니크). 여기 있는 시드만 아이템으로 인정 (seed_origin_ok)
    $pdo->exec('CREATE TABLE IF NOT EXISTS bought_items (
        seed        VARCHAR(64) PRIMARY KEY,
        mail_id     VARCHAR(32) NOT NULL,
        owner_key   VARCHAR(64) NOT NULL,
        uq          VARCHAR(24) NOT NULL,
        created_at  BIGINT NOT NULL
    )');
    // 장비 상자 (캐시로 산 상자를 웹훅 order_paid로 서버가 열어 우편함에 넣은 아이템). 시드 box|o주문 번호|순번
    // state: granted | revoked (환불 order_canceled → 그 시드는 랭킹·거래소에서 인정하지 않음)
    //        | legacy (웹훅 전에 상점이 브라우저에서 연 상자. admin.php boxes legacy --apply로 서버에 있던 것을 등록)
    $pdo->exec('CREATE TABLE IF NOT EXISTS box_items (
        seed        VARCHAR(64) PRIMARY KEY,
        order_id    VARCHAR(32) NOT NULL,
        owner_key   VARCHAR(64) NOT NULL,
        mail_id     VARCHAR(32) NOT NULL,
        item_id     VARCHAR(32) NOT NULL,
        sku         VARCHAR(64) NOT NULL,
        state       VARCHAR(12) NOT NULL,
        created_at  BIGINT NOT NULL
    )');
    // 서버 설정 값 (admin.php로 바꿈). box_strict = 1: 서버 기록(box_items)이 있는 상자 시드만 인정
    $pdo->exec('CREATE TABLE IF NOT EXISTS server_flags (
        name        VARCHAR(32) PRIMARY KEY,
        value       VARCHAR(64) NOT NULL,
        updated_at  BIGINT NOT NULL
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS item_owner (
        item_id     VARCHAR(32) PRIMARY KEY,
        owner_key   VARCHAR(64) NOT NULL,
        updated_at  BIGINT NOT NULL
    )');
    // 나중에 추가된 칸: 캐시를 지급한 시각(우편), 캐시를 받은 시각(구매). 다음 단계가 실패해도 다시 지급·결제하지 않게
    // fee_by: 수수료를 무엇으로 냈는지 (cash | ad), notes: 운영자 선물 메모의 다른 언어 {"en": "...", "ja": "..."} (JSON)
    foreach ([['mail', 'granted_at BIGINT'], ['listings', 'paid_at BIGINT'], ['listings', 'fee_by VARCHAR(8)'], ['mail', 'notes TEXT']] as [$table, $col]) {
        try { $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$col}"); } catch (PDOException $e) { /* 이미 있음 */ }
    }
    foreach ([
        'CREATE INDEX idx_listings_state ON listings (state, expires_at)',
        'CREATE INDEX idx_listings_seller ON listings (seller_key, state)',
        'CREATE INDEX idx_listings_item ON listings (item_id, state)',
        'CREATE INDEX idx_mail_owner ON mail (owner_key, state)',
        'CREATE INDEX idx_mail_item ON mail (item_id, state)',
        'CREATE INDEX idx_box_items_order ON box_items (order_id)',
    ] as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) { /* 이미 있음 */ }
    }
}

function new_id(): string { return bin2hex(random_bytes(8)); }

function read_body(int $max): array {
    $raw = file_get_contents('php://input');
    if (strlen((string)$raw) > $max) throw new HttpError(413, 'too_large');
    $body = json_decode((string)$raw, true);
    if (!is_array($body)) throw new HttpError(400, 'bad_json');
    return $body;
}

function require_user(): array {
    $who = identify();
    if ($who['kind'] !== 'user') throw new HttpError(403, 'login_required');
    return $who;
}

// 다른 사람이 주인으로 기록된 아이템인지 (남에게 판 아이템의 복사본)
function owned_by_other(string $itemId, string $key): bool {
    $owner = q_val('SELECT owner_key FROM item_owner WHERE item_id = ?', [$itemId]);
    return $owner !== false && $owner !== $key;
}

function set_owner(string $itemId, string $key, int $now): void {
    $up = db()->prepare('UPDATE item_owner SET owner_key = ?, updated_at = ? WHERE item_id = ?');
    $up->execute([$key, $now, $itemId]);
    if ($up->rowCount() === 0) {
        db()->prepare('INSERT INTO item_owner (item_id, owner_key, updated_at) VALUES (?, ?, ?)')->execute([$itemId, $key, $now]);
    }
}

function add_mail(string $owner, string $kind, array $f, int $now): string {
    $id = new_id();
    db()->prepare('INSERT INTO mail (id, owner_key, kind, listing_id, item_id, item_ref, item_name, rarity, gold, cash, note, notes, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
        $id, $owner, $kind, $f['listing_id'] ?? null, $f['item_id'] ?? null, $f['item_ref'] ?? null, $f['item_name'] ?? null, $f['rarity'] ?? null,
        $f['gold'] ?? 0, $f['cash'] ?? 0, $f['note'] ?? null, !empty($f['notes']) ? json_encode($f['notes'], JSON_UNESCAPED_UNICODE) : null, 'new', $now,
    ]);
    return $id;
}

// 등록 시간이 지난 아이템은 판매자 우편함으로
function market_expire(): void {
    $now = now_ms();
    $st = db()->prepare("SELECT * FROM listings WHERE state = 'active' AND expires_at <= ? LIMIT 200");
    $st->execute([$now]);
    foreach ($st->fetchAll() as $l) {
        tx(function (PDO $pdo) use ($l, $now) {
            $up = $pdo->prepare("UPDATE listings SET state = 'expired', ended_at = ? WHERE id = ? AND state = 'active'");
            $up->execute([$now, $l['id']]);
            if ($up->rowCount() === 1) {
                add_mail($l['seller_key'], 'returned', [
                    'listing_id' => $l['id'], 'item_id' => $l['item_id'], 'item_ref' => $l['item_ref'], 'item_name' => $l['item_name'],
                    'rarity' => $l['rarity'], 'note' => MARKET_HOURS . '시간이 지나 돌아온 아이템',
                ], $now);
            }
        });
    }
    // 결제 중에 멈춘 구매: 캐시를 받았으면(paid_at) 1분 뒤 거래를 마무리, 못 받았으면 2분 뒤 다시 판매 중으로
    $st = db()->prepare("SELECT * FROM listings WHERE state = 'buying' AND buying_at < ? LIMIT 50");
    $st->execute([$now - 60000]);
    foreach ($st->fetchAll() as $l) {
        if ($l['paid_at'] !== null) {
            try { finish_sale($l); } catch (HttpError $e) { /* 다른 요청이 먼저 마무리 */ }
        } elseif ((int)$l['buying_at'] < $now - 120000) {
            error_log("[market] listing {$l['id']} stuck in buying without payment, back to active");
            db()->prepare("UPDATE listings SET state = 'active', buyer_key = NULL, buyer_display = NULL, buying_at = NULL WHERE id = ? AND state = 'buying' AND paid_at IS NULL")->execute([$l['id']]);
        }
    }
}

function listing_out(array $l, ?string $me): array {
    return [
        'id' => $l['id'],
        'item' => json_decode($l['item_view'], true),
        'ref' => json_decode($l['item_ref'], true),
        'seller' => $l['seller_display'],
        'mine' => $me !== null && $l['seller_key'] === $me,
        'gold' => (int)$l['price_gold'],
        'cash' => (int)$l['price_cash'],
        'fee' => (int)$l['fee_cash'],
        'feeBy' => $l['fee_by'] ?? null,
        'state' => $l['state'],
        'createdAt' => (int)$l['created_at'],
        'expiresAt' => (int)$l['expires_at'],
        'endedAt' => $l['ended_at'] !== null ? (int)$l['ended_at'] : ($l['sold_at'] !== null ? (int)$l['sold_at'] : null),
        'buyer' => $l['buyer_display'],
    ];
}

function mail_out(array $m): array {
    return [
        'id' => $m['id'], 'kind' => $m['kind'], 'itemName' => $m['item_name'], 'rarity' => $m['rarity'],
        'ref' => $m['item_ref'] ? json_decode($m['item_ref'], true) : null,
        'gold' => (int)$m['gold'], 'cash' => (int)$m['cash'], 'note' => $m['note'], 'createdAt' => (int)$m['created_at'],
        // 메모의 다른 언어 (운영자 선물): 게임이 고른 언어로 보여주고, 없으면 note(한국어)
        'notes' => !empty($m['notes']) && is_array($n = json_decode($m['notes'], true)) ? $n : null,
    ];
}

function market_settings(): array {
    return ['fee' => MARKET_FEE_CASH, 'hours' => MARKET_HOURS, 'maxActive' => MARKET_MAX_ACTIVE, 'cashRequired' => MARKET_CASH_REQUIRED];
}

// 누구나 볼 수 있음 (로그인하지 않았으면 내 것 표시만 없음)
function market_browse(): array {
    market_expire();
    $me = null;
    try { $me = identify()['key']; } catch (HttpError $e) { /* 손님 */ }
    $where = ["state = 'active'"];
    $args = [];
    if (in_array($_GET['slot'] ?? '', R_SLOTS_R7, true)) { $where[] = 'slot = ?'; $args[] = $_GET['slot']; }
    if (isset(RARITY_RANK[$_GET['rarity'] ?? ''])) { $where[] = 'rarity = ?'; $args[] = $_GET['rarity']; }
    $order = ['cash' => 'price_cash ASC, price_gold ASC', 'gold' => 'price_gold ASC, price_cash ASC'][$_GET['sort'] ?? ''] ?? 'created_at DESC';
    $st = db()->prepare('SELECT * FROM listings WHERE ' . implode(' AND ', $where) . " ORDER BY {$order} LIMIT 100");
    $st->execute($args);
    $total = (int)q_val("SELECT COUNT(*) FROM listings WHERE state = 'active'");
    return array_merge(market_settings(), [
        'now' => now_ms(), 'total' => $total,
        'rows' => array_map(function ($l) use ($me) { return listing_out($l, $me); }, $st->fetchAll()),
    ]);
}

function market_list(): array {
    $who = require_user();
    $body = read_body(4096);
    $gold = $body['gold'] ?? null;
    $cash = $body['cash'] ?? null;
    if (!is_int($gold) || !is_int($cash) || $gold < 0 || $cash < 0 || $gold > MARKET_MAX_GOLD || $cash > MARKET_MAX_CASH || $gold + $cash <= 0) {
        throw new HttpError(400, 'bad_price');
    }
    $ref = $body['item'] ?? null;
    if (!is_array($ref) || !in_array($ref['v'] ?? null, [2, 3, 4], true)) throw new HttpError(400, 'old_item');  // v1 아이템만 거래 불가
    // 아이템 레벨은 최고 층보다 높을 수 없음 (랭킹과 같은 기준). 개발자는 랭킹 기록이 없어서 제한 없음
    $stage = is_int($body['stage'] ?? null) ? min(MAX_STAGE, max(0, $body['stage'])) : 0;
    $maxLvl = $who['developer'] ? MAX_STAGE : max(best_level_any($who['key']), $stage);
    $item = verify_item($ref, $maxLvl, $who['unlimited']);   // 운영자 기기에서 테스트로 만든 아이템 (고대 굴림 20번 초과 등)
    if (!$item) throw new HttpError(400, 'bad_item');
    if (in_array($item['rarity'], MARKET_CASH_REQUIRED, true) && $cash < 1) throw new HttpError(400, 'cash_required');
    $tries = is_int($ref['tries'] ?? null) ? max(0, min(1000, $ref['tries'])) : 0;
    $cleanRef = ['seed' => $item['seed'], 'src' => $item['src'], 'lvl' => $item['lvl'], 'v' => $item['v'], 'enh' => $item['enh'], 'r' => $item['r'] ?? 0, 'id' => $item['id'], 'tries' => $tries, 'ar' => (int)($item['ar'] ?? 0)];
    if (!empty($item['rf'])) $cleanRef['rf'] = $item['rf'];   // 대장간 옵션 재련

    $now = now_ms();
    $id = tx(function (PDO $pdo) use ($who, $item, $cleanRef, $gold, $cash, $now) {
        $count = function (string $sql, array $args): int { return (int)q_val($sql, $args); };
        if ($count("SELECT COUNT(*) FROM listings WHERE seller_key = ? AND state IN ('active', 'buying')", [$who['key']]) >= MARKET_MAX_ACTIVE) throw new HttpError(409, 'too_many');
        if ($count("SELECT COUNT(*) FROM listings WHERE item_id = ? AND state IN ('active', 'buying')", [$item['id']]) > 0) throw new HttpError(409, 'already_listed');
        if ($count("SELECT COUNT(*) FROM mail WHERE item_id = ? AND state <> 'claimed'", [$item['id']]) > 0) throw new HttpError(409, 'in_mail');
        if (owned_by_other($item['id'], $who['key'])) throw new HttpError(403, 'not_owner');
        set_owner($item['id'], $who['key'], $now);
        $id = new_id();
        $pdo->prepare('INSERT INTO listings (id, item_id, item_ref, item_view, item_name, rarity, slot, seller_key, seller_display,
            price_gold, price_cash, fee_cash, state, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
            $id, $item['id'], json_encode($cleanRef), json_encode(item_view($item), JSON_UNESCAPED_UNICODE), r_item_name($item), $item['rarity'], $item['slot'],
            $who['key'], $who['display'], $gold, $cash, MARKET_FEE_CASH, 'active', $now, $now + MARKET_HOURS * 3600 * 1000,
        ]);
        return $id;
    });
    return ['ok' => true, 'listing' => listing_out(q_row('SELECT * FROM listings WHERE id = ?', [$id]), $who['key'])];
}

function market_cancel(): array {
    $who = require_user();
    $id = (string)(read_body(512)['id'] ?? '');
    $now = now_ms();
    $mail = tx(function (PDO $pdo) use ($who, $id, $now) {
        $l = q_row('SELECT * FROM listings WHERE id = ? AND seller_key = ?', [$id, $who['key']]);
        $up = $pdo->prepare("UPDATE listings SET state = 'cancelled', ended_at = ? WHERE id = ? AND seller_key = ? AND state = 'active'");
        $up->execute([$now, $id, $who['key']]);
        if (!$l || $up->rowCount() !== 1) throw new HttpError(409, 'gone');
        return add_mail($who['key'], 'returned', [
            'listing_id' => $id, 'item_id' => $l['item_id'], 'item_ref' => $l['item_ref'], 'item_name' => $l['item_name'],
            'rarity' => $l['rarity'], 'note' => '등록을 취소한 아이템',
        ], $now);
    });
    return ['ok' => true, 'mail' => $mail];
}

// ---- Xsolla Store (캐시) ----

// 게임의 Xsolla Store 프로젝트 (공개 값. config.php에서 바꿀 수 있음)
const DEFAULT_STORE_PROJECT = 317991;

function store_project(): string { return (string)(config()['xsolla_project_id'] ?? DEFAULT_STORE_PROJECT); }

function store_url(string $path): string {
    $cfg = config();
    $pid = store_project();
    return rtrim((string)($cfg['xsolla_store_url'] ?? 'https://store.xsolla.com/api'), '/') . "/v2/project/{$pid}{$path}";
}
function cash_sku(): string { return (string)(config()['cash_sku'] ?? 'cash'); }

// 구매자 토큰으로: 캐시 잔액
function cash_balance(string $token): ?int {
    [$status, $text] = http_request('GET', store_url('/user/virtual_currency_balance'), null, ["Authorization: Bearer {$token}"]);
    if ($status !== 200) return null;
    foreach ((json_decode($text, true)['items'] ?? []) as $vc) if (($vc['sku'] ?? '') === cash_sku()) return (int)$vc['amount'];
    return 0;
}

// 구매자 토큰으로: 캐시 차감 (Xsolla 인벤토리의 가상 화폐 사용)
function cash_consume(string $token, int $amount): array {
    $body = json_encode(['sku' => cash_sku(), 'quantity' => $amount, 'instance_id' => null]);
    return http_request('POST', store_url('/user/inventory/item/consume'), $body, ["Authorization: Bearer {$token}"]);
}

// 프로젝트 API 키로: 판매 대금 캐시 지급
function cash_grant(string $userId, int $amount, string $comment): array {
    $cfg = config();
    $key = (string)($cfg['xsolla_api_key'] ?? '');
    if ($key === '') throw new HttpError(503, 'market_not_configured');
    $auth = base64_encode(store_project() . ':' . $key);
    $body = json_encode([['user' => ['id' => $userId], 'platform' => 'xsolla', 'items' => [['sku' => cash_sku(), 'quantity' => $amount]], 'comment' => $comment]]);
    return http_request('POST', store_url('/inventory/reward'), $body, ["Authorization: Basic {$auth}"]);
}

function market_buy(): array {
    $who = require_user();
    $body = read_body(512);
    $id = (string)($body['id'] ?? '');
    market_expire();
    $pdo = db();
    $l = q_row('SELECT * FROM listings WHERE id = ?', [$id]);
    if (!$l) throw new HttpError(409, 'gone');
    // 캐시는 이미 받았는데 기록이 안 끝난 내 구매면 결제 없이 마무리만
    $resume = $l['state'] === 'buying' && $l['buyer_key'] === $who['key'] && $l['paid_at'] !== null;
    $ticket = null;
    if (!$resume && !empty($body['adTicket'])) $ticket = check_ticket($who, $body['adTicket'], 'fee');  // 광고로 수수료 면제
    $byAd = $resume ? ($l['fee_by'] === 'ad') : $ticket !== null;
    $total = (int)$l['price_cash'] + ($byAd ? 0 : (int)$l['fee_cash']);
    if (!$resume) {
        if ($l['state'] !== 'active') throw new HttpError(409, 'gone');
        if ($l['seller_key'] === $who['key']) throw new HttpError(400, 'own');
        // 다른 사람이 동시에 사지 못하게 먼저 잡아 둠
        $now = now_ms();
        $hold = $pdo->prepare("UPDATE listings SET state = 'buying', buyer_key = ?, buyer_display = ?, buying_at = ?, paid_at = NULL WHERE id = ? AND state = 'active' AND expires_at > ?");
        $hold->execute([$who['key'], $who['display'], $now, $id, $now]);
        if ($hold->rowCount() !== 1) throw new HttpError(409, 'gone');
        $release = function () use ($pdo, $id) {
            $pdo->prepare("UPDATE listings SET state = 'active', buyer_key = NULL, buyer_display = NULL, buying_at = NULL WHERE id = ? AND state = 'buying' AND paid_at IS NULL")->execute([$id]);
        };
        try {
            if ($ticket) use_ticket($ticket['id']);
        } catch (Throwable $e) { $release(); throw $e; }
        try {
            // 광고로 수수료를 면제받고 캐시 가격이 0이면 Xsolla를 부르지 않음
            if ($total > 0) {
                $balance = cash_balance($who['token']);
                if ($balance === null) throw new HttpError(502, 'payment_failed');
                if ($balance < $total) throw new HttpError(402, 'not_enough_cash');
                [$status, $text] = cash_consume($who['token'], $total);
                if ($status < 200 || $status >= 300) {
                    error_log("[market] consume {$total} failed for listing {$id}: {$status} " . substr($text, 0, 200));
                    throw new HttpError($status === 422 ? 402 : 502, $status === 422 ? 'not_enough_cash' : 'payment_failed');
                }
            }
        } catch (Throwable $e) {
            $release();
            // 결제가 안 됐으면 광고 티켓은 돌려줌 (다시 광고를 보지 않아도 되게)
            if ($ticket) $pdo->prepare('UPDATE ad_tickets SET used_at = NULL WHERE id = ?')->execute([$ticket['id']]);
            throw $e;
        }
        // 캐시를 받았다는 것부터 바로 기록 (아래 마무리가 실패해도 다시 결제하지 않고, 1분 뒤 자동으로 마무리됨)
        $pdo->prepare('UPDATE listings SET paid_at = ?, fee_by = ? WHERE id = ?')->execute([now_ms(), $byAd ? 'ad' : 'cash', $id]);
        $l = q_row('SELECT * FROM listings WHERE id = ?', [$id]);
    }
    try {
        $mail = finish_sale($l);
    } catch (Throwable $e) {
        error_log("[market] listing {$id} paid ({$total} cash) but not recorded yet (will retry): " . $e->getMessage());
        throw $e;
    }
    return ['ok' => true, 'mail' => $mail, 'gold' => (int)$l['price_gold'], 'cash' => $total, 'feeBy' => $byAd ? 'ad' : 'cash'];
}

// 캐시를 받은 구매를 마무리: 판매 완료 기록, 구매자에게 아이템, 판매자에게 대금. 구매자 우편 ID를 돌려줌
function finish_sale(array $l): string {
    return tx(function (PDO $pdo) use ($l) {
        $now = now_ms();
        $up = $pdo->prepare("UPDATE listings SET state = 'sold', sold_at = ?, ended_at = ? WHERE id = ? AND state = 'buying' AND paid_at IS NOT NULL");
        $up->execute([$now, $now, $l['id']]);
        if ($up->rowCount() !== 1) throw new HttpError(409, 'gone');
        $mail = add_mail($l['buyer_key'], 'bought', [
            'listing_id' => $l['id'], 'item_id' => $l['item_id'], 'item_ref' => $l['item_ref'], 'item_name' => $l['item_name'], 'rarity' => $l['rarity'],
            'note' => "{$l['seller_display']}에게서 산 아이템",
        ], $now);
        add_mail($l['seller_key'], 'sale', [
            'listing_id' => $l['id'], 'item_name' => $l['item_name'], 'rarity' => $l['rarity'],
            'gold' => (int)$l['price_gold'], 'cash' => (int)$l['price_cash'], 'note' => "{$l['buyer_display']}에게 판매",
        ], $now);
        set_owner($l['item_id'], $l['buyer_key'], $now);
        return $mail;
    });
}

function market_mine(): array {
    $who = require_user();
    market_expire();
    try { ubox_collect_for($who); } catch (Throwable $e) { /* 상자는 다음에 다시 */ }
    $pdo = db();
    $q = function (string $sql, array $args) use ($pdo): array { $st = $pdo->prepare($sql); $st->execute($args); return $st->fetchAll(); };
    $active = $q("SELECT * FROM listings WHERE seller_key = ? AND state IN ('active', 'buying') ORDER BY created_at DESC", [$who['key']]);
    $history = $q("SELECT * FROM listings WHERE (seller_key = ? OR buyer_key = ?) AND state IN ('sold', 'expired', 'cancelled') ORDER BY COALESCE(sold_at, ended_at) DESC LIMIT 30", [$who['key'], $who['key']]);
    $mail = $q("SELECT * FROM mail WHERE owner_key = ? AND state IN ('new', 'claiming') ORDER BY created_at ASC LIMIT 100", [$who['key']]);
    $hist = array_map(function ($l) use ($who) {
        $o = listing_out($l, $who['key']);
        $o['role'] = $l['seller_key'] === $who['key'] ? 'seller' : 'buyer';
        return $o;
    }, $history);
    return array_merge(market_settings(), [
        'now' => now_ms(),
        'active' => array_map(function ($l) use ($who) { return listing_out($l, $who['key']); }, $active),
        'history' => $hist,
        'mail' => array_map('mail_out', $mail),
    ]);
}

function mail_claim(): array {
    $who = require_user();
    $body = read_body(512);
    $id = (string)($body['id'] ?? '');
    $pdo = db();
    $m = q_row('SELECT * FROM mail WHERE id = ? AND owner_key = ?', [$id, $who['key']]);
    if ($m && $m['kind'] === 'ubox') return ubox_open($who, $m, (string)($body['pick'] ?? ''));
    // 새 우편, 또는 캐시는 이미 지급했는데 마무리가 안 된 우편(이어서 받기: 다시 지급하지 않음)
    $resume = $m && $m['state'] === 'claiming' && $m['granted_at'] !== null;
    if (!$m || ($m['state'] !== 'new' && !$resume)) throw new HttpError(404, 'not_found');
    if (!$resume) {
        // 먼저 "받는 중"으로 잡아서 같은 우편을 두 번 받지 못하게
        $hold = $pdo->prepare("UPDATE mail SET state = 'claiming' WHERE id = ? AND state = 'new'");
        $hold->execute([$id]);
        if ($hold->rowCount() !== 1) throw new HttpError(404, 'not_found');
    }
    $cashNow = (int)$m['cash'] > 0 && $m['granted_at'] === null;  // 이번 요청에서 캐시를 지급하는지
    if ($cashNow) {
        try {
            $comment = $m['kind'] === 'gift' ? "gift {$id}" : "market sale {$m['listing_id']}";
            [$status, $text] = cash_grant($who['sub'], (int)$m['cash'], $comment);
        } catch (Throwable $e) {
            $pdo->prepare("UPDATE mail SET state = 'new' WHERE id = ?")->execute([$id]);
            throw $e;
        }
        if ($status < 200 || $status >= 300) {
            error_log("[market] grant {$m['cash']} failed for mail {$id}: {$status} " . substr($text, 0, 200));
            $pdo->prepare("UPDATE mail SET state = 'new' WHERE id = ?")->execute([$id]);
            throw new HttpError(502, 'grant_failed');
        }
        // 지급했다는 것부터 바로 기록 (아래가 실패해도 다음 "받기"에서 다시 지급하지 않음)
        $pdo->prepare('UPDATE mail SET granted_at = ? WHERE id = ?')->execute([now_ms(), $id]);
    }
    $done = $pdo->prepare("UPDATE mail SET state = 'claimed', claimed_at = ? WHERE id = ? AND state = 'claiming'");
    $done->execute([now_ms(), $id]);
    if ($done->rowCount() !== 1) throw new HttpError(404, 'not_found');
    return ['ok' => true, 'mail' => mail_out($m), 'cashPaid' => $cashNow ? (int)$m['cash'] : 0];
}

// ---- 고대 유니크 선택 상자 (현금, 계정당 1회: Xsolla 카탈로그의 구매 제한) ----
// 결제가 끝나면 Xsolla가 사용자 인벤토리에 상자를 넣음 → 서버가 사용자 토큰으로 꺼내(소모) 우편함에 넣음
// → 우편함에서 유니크 하나를 고르면 서버가 시드(buy|m우편 번호|유니크)를 기록하고 아이템을 돌려줌
const UBOX_NAME = '고대 유니크 선택 상자';
const UBOX_REV = 8;   // 고른 유니크를 만드는 규칙 개정 (items.js RULES_REV)
function ubox_sku(): string { return (string)(config()['ubox_sku'] ?? 'ancient_unique_box'); }

// 인벤토리에 있는 상자를 우편함으로. 넣은 개수 (Xsolla 오류면 0 → 다음에 다시)
function ubox_collect_for(array $who): int {
    $auth = ["Authorization: Bearer {$who['token']}"];
    [$status, $text] = http_request('GET', store_url('/user/inventory/items?limit=50'), null, $auth);
    if ($status !== 200) return 0;
    $have = 0;
    foreach ((json_decode($text, true)['items'] ?? []) as $it) if (($it['sku'] ?? '') === ubox_sku()) $have += (int)($it['quantity'] ?? 0);
    $got = 0;
    for ($i = 0; $i < min($have, 5); $i++) {
        // 소모가 성공한 만큼만 우편으로 (동시에 두 번 요청해도 Xsolla가 있는 개수만큼만 소모해 줌)
        [$st] = http_request('POST', store_url('/user/inventory/item/consume'), json_encode(['sku' => ubox_sku(), 'quantity' => 1, 'instance_id' => null]), $auth);
        if ($st < 200 || $st >= 300) break;
        try {
            add_mail($who['key'], 'ubox', ['item_name' => UBOX_NAME, 'rarity' => 'unique', 'note' => '현금 구매'], now_ms());
        } catch (Throwable $e) {
            error_log("[ubox] consumed but mail failed for {$who['key']}: " . $e->getMessage());   // 운영자가 gift로 다시 넣어 줘야 함
            throw $e;
        }
        $got++;
    }
    return $got;
}

function ubox_collect(): array {
    $who = require_user();
    return ['ok' => true, 'added' => ubox_collect_for($who), 'mail' => mail_count($who['key'])];
}

// 상자 열기: 고른 유니크를 고대로 만들어 우편을 받은 것으로 바꿈 (한 번만)
function ubox_open(array $who, array $m, string $pick): array {
    if ($m['state'] !== 'new') throw new HttpError(404, 'not_found');
    if (!isset(R_UNIQUE['items'][$pick])) throw new HttpError(400, 'bad_pick');
    $seed = "buy|m{$m['id']}|{$pick}";
    $item = r_generate(4, $seed, 'unique', r_bought_level($pick), UBOX_REV);
    $ref = ['seed' => $seed, 'src' => 'unique', 'lvl' => $item['lvl'], 'v' => 4, 'enh' => 0, 'r' => UBOX_REV, 'id' => $item['id']];
    $now = now_ms();
    tx(function (PDO $pdo) use ($who, $m, $pick, $seed, $item, $ref, $now) {
        $up = $pdo->prepare("UPDATE mail SET state = 'claimed', claimed_at = ?, item_id = ?, item_ref = ?, item_name = ? WHERE id = ? AND owner_key = ? AND state = 'new'");
        $up->execute([$now, $item['id'], json_encode($ref), r_item_name($item), $m['id'], $who['key']]);
        if ($up->rowCount() !== 1) throw new HttpError(404, 'not_found');
        $pdo->prepare('INSERT INTO bought_items (seed, mail_id, owner_key, uq, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$seed, $m['id'], $who['key'], $pick, $now]);
        set_owner($item['id'], $who['key'], $now);
    });
    return ['ok' => true, 'mail' => mail_out(q_row('SELECT * FROM mail WHERE id = ?', [$m['id']])), 'cashPaid' => 0];
}

function bought_seed_ok(string $seed): bool {
    return q_val('SELECT COUNT(*) FROM bought_items WHERE seed = ?', [$seed]) > 0;
}

function mail_count(string $key): int {
    return (int)q_val("SELECT COUNT(*) FROM mail WHERE owner_key = ? AND state = 'new'", [$key]);
}

// ---- 장비 상자 (캐시): 웹훅 order_paid → 서버가 열어서 우편함으로 ----
// 결과는 주문 번호로 정해짐 (box|o주문 번호|순번, 상점이 예전에 브라우저에서 열던 것과 같은 시드). 레벨은 계정 저장본의 최고 층
const BOX_REV = 8;          // 상자 아이템을 만드는 규칙 개정 (items.js RULES_REV)
const BOX_MAX_DRAWS = 50;   // seed_origin_ok: 순번 50 미만
const BOX_MAX_QTY = 10;
const BOX_SKU_RE = '/^box_equipment_(\d{1,2})$/';

function box_draws(string $sku): int {
    return preg_match(BOX_SKU_RE, $sku, $m) && (int)$m[1] >= 1 && (int)$m[1] <= BOX_MAX_DRAWS ? (int)$m[1] : 0;
}
// 상점이 쓰던 레벨: 이 계정의 최고 층 (rl_save.best). 저장본이 없으면 1
function box_level(string $owner): int {
    $data = q_val('SELECT data FROM profiles WHERE pkey = ?', [$owner]);
    $best = $data ? (json_decode((string)$data, true)['save']['best'] ?? 1) : 1;
    return max(1, min(CLEAR_STAGE, is_int($best) ? $best : 1));
}

// 주문의 상자를 열어 우편함에 넣음 (트랜잭션 안에서 부름). 넣은 아이템 수. 같은 시드가 이미 있으면 건너뜀
function box_grant(PDO $pdo, string $owner, string $orderId, array $items, int $now): int {
    $lvl = box_level($owner);
    $n = 0;
    foreach ($items as $it) {
        $draws = box_draws((string)($it['sku'] ?? ''));
        if (!$draws) continue;
        $qty = max(1, min(BOX_MAX_QTY, (int)($it['quantity'] ?? 1)));
        for ($k = 0; $k < $qty; $k++) {
            $oid = $k === 0 ? $orderId : "{$orderId}q{$k}";   // 같은 주문에 상자가 여러 개면 서로 다른 시드
            for ($i = 0; $i < $draws; $i++) {
                $seed = "box|o{$oid}|{$i}";
                if (q_val('SELECT 1 FROM box_items WHERE seed = ?', [$seed])) continue;
                $item = r_generate(4, $seed, 'box', $lvl, BOX_REV);
                $mailId = add_mail($owner, 'box', ['item_id' => $item['id'], 'item_ref' => json_encode(item_ref($item)), 'item_name' => r_item_name($item), 'rarity' => $item['rarity']], $now);
                $pdo->prepare('INSERT INTO box_items (seed, order_id, owner_key, mail_id, item_id, sku, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$seed, $orderId, $owner, $mailId, $item['id'], (string)$it['sku'], 'granted', $now]);
                set_owner($item['id'], $owner, $now);
                $n++;
            }
        }
    }
    return $n;
}

// 환불: 아직 받지 않은 우편은 회수, 시드는 revoked (이미 받은 아이템은 랭킹·거래소에서 인정하지 않음). 회수한 우편 수
function box_revoke(PDO $pdo, string $orderId): int {
    $st = $pdo->prepare("SELECT mail_id FROM box_items WHERE order_id = ? AND state = 'granted'");
    $st->execute([$orderId]);
    $mails = $st->fetchAll(PDO::FETCH_COLUMN);
    $taken = 0;
    foreach ($mails as $id) {
        $up = $pdo->prepare("UPDATE mail SET state = 'revoked' WHERE id = ? AND state = 'new'");
        $up->execute([$id]);
        $taken += $up->rowCount();
    }
    $pdo->prepare("UPDATE box_items SET state = 'revoked' WHERE order_id = ?")->execute([$orderId]);
    return $taken;
}

function box_seed_revoked(string $seed): bool {
    return q_val("SELECT 1 FROM box_items WHERE seed = ? AND state = 'revoked'", [$seed]) !== false;
}

// 좁힌 뒤(box_strict): 서버가 지급했거나(granted) 예전 것으로 등록한(legacy) 상자 시드만 인정.
// 좁히기 전: 환불된 것만 빼고 인정 (예전에 브라우저에서 연 상자는 서버 기록이 없어서)
function box_seed_ok(string $seed): bool {
    if (!box_strict()) return !box_seed_revoked($seed);
    return q_val("SELECT 1 FROM box_items WHERE seed = ? AND state IN ('granted', 'legacy')", [$seed]) !== false;
}
function box_strict(): bool {
    return q_val("SELECT value FROM server_flags WHERE name = 'box_strict'") === '1';
}
function set_flag(string $name, string $value): void {
    $up = db()->prepare('UPDATE server_flags SET value = ?, updated_at = ? WHERE name = ?');
    $up->execute([$value, now_ms(), $name]);
    if ($up->rowCount() === 0) db()->prepare('INSERT INTO server_flags (name, value, updated_at) VALUES (?, ?, ?)')->execute([$name, $value, now_ms()]);
}

// 서버에 남아 있는 예전 상자 아이템 찾기: 계정 저장본(가방·장착·상자 보관함), 랭킹 장비, 거래소 등록, 우편.
// 결과 [시드 => [주인 키, 아이템 ID, 어디서]]. 같은 시드는 처음 찾은 것만
const BOX_SEED_RE = '/^box\|o([0-9A-Za-z]{1,48})\|\d{1,2}$/';
function box_legacy_scan(): array {
    $found = [];
    $walk = function ($v, string $owner, string $where) use (&$walk, &$found) {
        if (!is_array($v)) return;
        if (is_string($v['seed'] ?? null) && ($v['src'] ?? '') === 'box' && preg_match(BOX_SEED_RE, $v['seed']) && !isset($found[$v['seed']])) {
            $found[$v['seed']] = [$owner, is_string($v['id'] ?? null) ? $v['id'] : '', $where];
        }
        foreach ($v as $x) if (is_array($x)) $walk($x, $owner, $where);
    };
    $each = function (string $sql, string $where, array $cols) use ($walk) {
        $st = db()->query($sql);
        while ($r = $st->fetch()) foreach ($cols as $c) if ($r[$c] !== null) $walk(json_decode((string)$r[$c], true), (string)$r['owner'], $where);
        $st->closeCursor();
    };
    $each('SELECT pkey AS owner, data FROM profiles', 'profile', ['data']);
    foreach (SEASONS as $s) $each("SELECT pkey AS owner, stage_gear, item_json FROM {$s['table']}", 'ranking', ['stage_gear', 'item_json']);
    $each('SELECT seller_key AS owner, item_ref FROM listings', 'market', ['item_ref']);
    $each("SELECT owner_key AS owner, item_ref FROM mail WHERE kind <> 'box'", 'mail', ['item_ref']);
    return $found;
}

// 찾은 예전 상자 시드를 box_items에 legacy로 (이미 있는 시드는 그대로). 넣은 수
function box_legacy_register(array $found): int {
    $now = now_ms();
    return tx(function (PDO $pdo) use ($found, $now) {
        $n = 0;
        foreach ($found as $seed => [$owner, $itemId, $where]) {
            if (q_val('SELECT 1 FROM box_items WHERE seed = ?', [$seed])) continue;
            preg_match(BOX_SEED_RE, $seed, $m);
            $pdo->prepare('INSERT INTO box_items (seed, order_id, owner_key, mail_id, item_id, sku, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$seed, mb_substr($m[1], 0, 32), $owner, '', mb_substr($itemId, 0, 32), "legacy:{$where}", 'legacy', $now]);
            $n++;
        }
        return $n;
    });
}

// 상점: 방금 산 상자의 결과. 웹훅이 아직 안 왔으면 ready=false (상점이 잠시 뒤 다시 물음)
function box_order(): array {
    $who = require_user();
    $order = (string)($_GET['order'] ?? '');
    if (!preg_match('/^[0-9A-Za-z_-]{1,32}$/', $order)) throw new HttpError(400, 'bad_order');
    $st = db()->prepare("SELECT b.state, m.item_ref, m.state AS mail_state FROM box_items b JOIN mail m ON m.id = b.mail_id WHERE b.order_id = ? AND b.owner_key = ? ORDER BY b.created_at, b.seed");
    $st->execute([$order, $who['key']]);
    $rows = $st->fetchAll();
    return [
        'ready' => (bool)$rows,
        'revoked' => $rows && $rows[0]['state'] === 'revoked',
        'items' => array_map(function ($r) { return json_decode($r['item_ref'], true); }, $rows),
        'mail' => mail_count($who['key']),
    ];
}
