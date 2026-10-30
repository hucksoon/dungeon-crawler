<?php
// 이벤트 (dc#130): 기간 동안 상점에서 하루 한 번 이벤트 재화를 무료로 받고, 모아서 스킨이나 캐시로 바꿈. api.php가 불러서 씀.
//
//   GET  api.php?r=event_status              지금 이벤트, 오늘 받았는지, 가진 재화·스킨 (로그인 안 하면 이벤트 정보만)
//   POST api.php?r=event_claim  {}           오늘의 무료 재화 받기: Xsolla 인벤토리의 이벤트 재화 아이템(event_coin_sku)을 꺼내(소모)
//                                            하나마다 그날 받는 개수(EVENT_DAILY + 기념일 bonus)를 더함. 없으면 아무것도 안 함
//   POST api.php?r=event_skin   { skin }     재화 EVENT_SKIN_PRICE개 → 스킨 (계정에 영구, 한 번만)
//   POST api.php?r=event_cash   { amount }   남은 재화 → 캐시 1:1. 캐시는 우편함으로 (받으면 Xsolla 계정에 들어감)
//
// 하루 한 번 (dc#131): 같은 날 두 번 받지 못하게 하는 건 Xsolla 구매 제한 (무료 아이템 event_coin, 1인당 1개,
//   매일 한국 시간 오전 10시에 초기화, tools/xsolla-catalog.mjs). 상점이 그 아이템을 무료 주문 → 인벤토리에 들어가면 여기서 꺼냄
//   그래서 "하루"는 오전 10시에 바뀜 (event_xday: 한국 시간 - 10시간의 날짜). 받기 기간·기념일도 이 하루로 셈
// - 재화·스킨·캐시가 걸려 있어서 모두 로그인 사용자만 (게스트는 이벤트 정보만)
// - 교환(스킨·캐시)은 이벤트가 끝나고 EVENT_EXCHANGE_DAYS일까지. 그 뒤에 남은 재화는 자동으로 캐시 1:1로 바꿔 우편함에 넣음
//   (event_settle: 그 사람이 다음에 접속할 때 — 이벤트 상태·로비·우편함. 모두 한 번에는 admin.php event-settle)
// - 일정은 events.js와 같음 (event-api-test가 비교). 내용을 만든 이벤트만 ready
// - 운영자 기기(unlimited)는 시험용: 시작 EVENT_PREVIEW_DAYS일 전부터 미리 열기 (하루 한 번은 Xsolla 구매 제한 그대로)

const EVENT_DAILY = 1;
const EVENT_SKIN_PRICE = 6;   // dc#131: 10 → 6 (14일 동안 매일 받으면 스킨 2개를 다 살 수 있게)
const EVENT_EXCHANGE_DAYS = 7;
const EVENT_PREVIEW_DAYS = 7;
const EVENT_MAX_CASH = 1000;
const EVENT_THEMES = [
    'halloween' => ['skins' => ['pumpkin_head', 'reaper_scythe'],
        'coin' => ['ko' => '호박 사탕', 'en' => 'Pumpkin Candy', 'ja' => 'かぼちゃキャンディ']],
];
const EVENTS = [
    ['id' => 'halloween-2026', 'theme' => 'halloween', 'ready' => true, 'start' => '2026-10-31', 'end' => '2026-11-13', 'days' => ['2026-11-11' => 1],
        'name' => ['ko' => '할로윈', 'en' => 'Halloween', 'ja' => 'ハロウィン']],
    ['id' => 'exam-2026', 'theme' => null, 'ready' => false, 'start' => '2026-11-19', 'end' => '2026-12-02', 'days' => []],
    ['id' => 'winter-2026', 'theme' => null, 'ready' => false, 'start' => '2026-12-21', 'end' => '2027-01-03', 'days' => []],
    ['id' => 'seollal-2027', 'theme' => null, 'ready' => false, 'start' => '2027-02-01', 'end' => '2027-02-14', 'days' => ['2027-02-14' => 1]],
    ['id' => 'whiteday-2027', 'theme' => null, 'ready' => false, 'start' => '2027-03-08', 'end' => '2027-03-21', 'days' => []],
    ['id' => 'golden-2027', 'theme' => null, 'ready' => false, 'start' => '2027-04-25', 'end' => '2027-05-08', 'days' => []],
    ['id' => 'summer-2027', 'theme' => null, 'ready' => false, 'start' => '2027-08-03', 'end' => '2027-08-16', 'days' => []],
    ['id' => 'chuseok-2027', 'theme' => null, 'ready' => false, 'start' => '2027-09-08', 'end' => '2027-09-21', 'days' => []],
    ['id' => 'halloween-2027', 'theme' => 'halloween', 'ready' => false, 'start' => '2027-10-31', 'end' => '2027-11-13', 'days' => []],
];

function event_tables(PDO $pdo): void {
    // 이벤트마다 가진 재화 (balance: 지금 남은 것, earned: 지금까지 받은 것)
    $pdo->exec('CREATE TABLE IF NOT EXISTS event_wallet (
        pkey        VARCHAR(64) NOT NULL,
        event_id    VARCHAR(24) NOT NULL,
        balance     INTEGER NOT NULL DEFAULT 0,
        earned      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (pkey, event_id)
    )');
    // 하루 받기 기록 (기본 키라 같은 날 두 번 못 받음)
    $pdo->exec('CREATE TABLE IF NOT EXISTS event_claims (
        pkey        VARCHAR(64) NOT NULL,
        event_id    VARCHAR(24) NOT NULL,
        day         VARCHAR(32) NOT NULL,
        amount      INTEGER NOT NULL,
        created_at  BIGINT NOT NULL,
        PRIMARY KEY (pkey, event_id, day)
    )');
    // 쓴 기록 (kind: skin | cash, ref: 스킨 이름 또는 우편 번호)
    $pdo->exec('CREATE TABLE IF NOT EXISTS event_spends (
        id          VARCHAR(32) PRIMARY KEY,
        pkey        VARCHAR(64) NOT NULL,
        event_id    VARCHAR(24) NOT NULL,
        kind        VARCHAR(8) NOT NULL,
        ref         VARCHAR(40) NOT NULL,
        amount      INTEGER NOT NULL,
        created_at  BIGINT NOT NULL
    )');
    // 가진 스킨 (계정에 영구)
    $pdo->exec('CREATE TABLE IF NOT EXISTS event_skins (
        pkey        VARCHAR(64) NOT NULL,
        skin        VARCHAR(24) NOT NULL,
        event_id    VARCHAR(24) NOT NULL,
        created_at  BIGINT NOT NULL,
        PRIMARY KEY (pkey, skin)
    )');
}

// 오늘 (한국 시간). 테스트는 설정의 event_today로 날짜를 정함
function event_today(): string { return (string)(config()['event_today'] ?? today_kst()); }
// 받기의 "하루": Xsolla 구매 제한이 초기화되는 한국 시간 오전 10시에 바뀜. 테스트는 event_today 그대로
function event_xday(): string {
    if (isset(config()['event_today'])) return (string)config()['event_today'];
    return (new DateTime('now', new DateTimeZone('Asia/Seoul')))->modify('-10 hours')->format('Y-m-d');
}
// 다음 오전 10시 (한국 시간, ms)
function event_next_reset(): int {
    $t = new DateTime('now', new DateTimeZone('Asia/Seoul'));
    $r = (clone $t)->setTime(10, 0);
    if ($r <= $t) $r->modify('+1 day');
    return $r->getTimestamp() * 1000;
}
function event_coin_sku(): string { return (string)(config()['event_coin_sku'] ?? 'event_coin'); }
function event_add_days(string $day, int $n): string { return (new DateTime($day . ' 00:00:00', new DateTimeZone('UTC')))->modify("{$n} day")->format('Y-m-d'); }
// 그날 받을 수 있는 이벤트 / 교환할 수 있는 이벤트 (운영자 기기는 미리 열림)
function event_find(string $day, int $after, bool $preview): ?array {
    foreach (EVENTS as $e) {
        if (!$e['ready']) continue;
        $from = $preview ? event_add_days($e['start'], -EVENT_PREVIEW_DAYS) : $e['start'];
        if ($from <= $day && $day <= event_add_days($e['end'], $after)) return $e;
    }
    return null;
}
function event_daily_amount(array $e, string $day): int { return EVENT_DAILY + (int)($e['days'][$day] ?? 0); }

function event_skins_of(string $key): array {
    $st = db()->prepare('SELECT skin FROM event_skins WHERE pkey = ? ORDER BY created_at');
    $st->execute([$key]);
    return array_column($st->fetchAll(), 'skin');
}
function event_wallet_of(string $key, string $id): array {
    $r = q_row('SELECT balance, earned FROM event_wallet WHERE pkey = ? AND event_id = ?', [$key, $id]);
    return ['balance' => (int)($r['balance'] ?? 0), 'earned' => (int)($r['earned'] ?? 0)];
}

function event_status_for(array $who): array {
    $day = event_today(); $xday = event_xday();
    $preview = !empty($who['unlimited']);
    $ex = event_find($day, EVENT_EXCHANGE_DAYS, $preview);
    $out = ['day' => $xday, 'login' => $who['kind'] === 'user', 'price' => EVENT_SKIN_PRICE, 'sku' => event_coin_sku(), 'nextReset' => event_next_reset(),
        'event' => null, 'skins' => [], 'balance' => 0, 'earned' => 0, 'claimed' => false];
    if ($who['kind'] === 'user') $out['skins'] = event_skins_of($who['key']);
    if (!$ex) return $out;
    $claim = event_find($xday, 0, $preview);   // 받기는 이벤트 기간에만 (오전 10시 기준 하루)
    $open = $claim !== null && $claim['id'] === $ex['id'];
    $out['event'] = [
        'id' => $ex['id'], 'theme' => $ex['theme'], 'start' => $ex['start'], 'end' => $ex['end'],
        'exchangeUntil' => event_add_days($ex['end'], EVENT_EXCHANGE_DAYS), 'open' => $open,
        'today' => $open ? event_daily_amount($ex, $xday) : 0, 'skins' => EVENT_THEMES[$ex['theme']]['skins'],
    ];
    if ($who['kind'] === 'user') {
        $out = array_merge($out, event_wallet_of($who['key'], $ex['id']));
        $out['claimed'] = (int)q_val('SELECT COUNT(*) FROM event_claims WHERE pkey = ? AND event_id = ? AND day = ?', [$who['key'], $ex['id'], $xday]) > 0;
    }
    return $out;
}
function event_status(): array {
    $who = identify();
    if ($who['kind'] === 'user') event_settle($who['key']);
    return event_status_for($who);
}

// 교환 기간이 끝난 이벤트의 남은 재화 → 캐시 1:1로 우편함에 (자동, 한 번만). 넣은 우편 수
function event_settle(string $key): int {
    $today = event_today(); $n = 0;
    $st = db()->prepare('SELECT event_id, balance FROM event_wallet WHERE pkey = ? AND balance > 0');
    $st->execute([$key]);
    foreach ($st->fetchAll() as $w) {
        $e = null; foreach (EVENTS as $x) if ($x['id'] === $w['event_id']) $e = $x;
        if (!$e || $today <= event_add_days($e['end'], EVENT_EXCHANGE_DAYS)) continue;
        $amount = (int)$w['balance'];
        $coin = EVENT_THEMES[$e['theme']]['coin'];
        $name = $e['name'] ?? ['ko' => $e['id'], 'en' => $e['id'], 'ja' => $e['id']];
        try {
            tx(function (PDO $pdo) use ($key, $e, $amount, $coin, $name) {
                // 그사이 다른 요청이 바꾸지 않았을 때만 (같은 재화를 두 번 캐시로 바꾸지 않게)
                $up = $pdo->prepare('UPDATE event_wallet SET balance = 0 WHERE pkey = ? AND event_id = ? AND balance = ?');
                $up->execute([$key, $e['id'], $amount]);
                if ($up->rowCount() !== 1) return;
                $now = now_ms();
                $mail = add_mail($key, 'gift', ['cash' => $amount, 'note' => "{$name['ko']} 이벤트가 끝나서 남은 {$coin['ko']} {$amount}개를 캐시로 바꿨어요",
                    'notes' => ['en' => "{$name['en']} event ended: {$amount} leftover {$coin['en']} exchanged for Cash", 'ja' => "{$name['ja']}イベント終了: 残った{$coin['ja']} {$amount}個をキャッシュに交換"]], $now);
                $pdo->prepare('INSERT INTO event_spends (id, pkey, event_id, kind, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    ->execute([new_id(), $key, $e['id'], 'auto', $mail, $amount, $now]);
            });
            $n++;
        } catch (Throwable $ex) { error_log('[event] settle failed: ' . $ex->getMessage()); }
    }
    return $n;
}

// 재화를 더하거나(+) 쓰기(-). 쓸 때 모자라면 402 (남은 것보다 많이 쓰지 못하게 조건부로 한 번에)
function event_wallet_add(PDO $pdo, string $key, string $id, int $n): void {
    if ($n < 0) {
        $st = $pdo->prepare('UPDATE event_wallet SET balance = balance - ? WHERE pkey = ? AND event_id = ? AND balance >= ?');
        $st->execute([-$n, $key, $id, -$n]);
        if ($st->rowCount() !== 1) throw new HttpError(402, 'not_enough_coins');
        return;
    }
    $st = $pdo->prepare('UPDATE event_wallet SET balance = balance + ?, earned = earned + ? WHERE pkey = ? AND event_id = ?');
    $st->execute([$n, $n, $key, $id]);
    if ($st->rowCount() === 0) $pdo->prepare('INSERT INTO event_wallet (pkey, event_id, balance, earned) VALUES (?, ?, ?, ?)')->execute([$key, $id, $n, $n]);
}

// Xsolla 인벤토리의 이벤트 재화 아이템을 꺼내(소모) 재화로. 하루 한 번은 Xsolla 구매 제한이 막음 (여기서는 꺼낸 만큼만 더함)
function event_claim(): array {
    $who = require_user();
    $xday = event_xday();
    $e = event_find($xday, 0, !empty($who['unlimited']));
    if (!$e) throw new HttpError(409, 'event_closed');   // 기간 밖이면 꺼내지 않음 (아이템은 인벤토리에 그대로)
    $auth = ["Authorization: Bearer {$who['token']}"];
    [$status, $text] = http_request('GET', store_url('/user/inventory/items?limit=50'), null, $auth);
    if ($status !== 200) throw new HttpError(502, 'store_failed');
    $have = 0;
    foreach ((json_decode($text, true)['items'] ?? []) as $it) if (($it['sku'] ?? '') === event_coin_sku()) $have += (int)($it['quantity'] ?? 0);
    $n = event_daily_amount($e, $xday); $got = 0;
    for ($i = 0; $i < min($have, 3); $i++) {
        // 소모가 성공한 만큼만 (동시에 두 번 요청해도 Xsolla가 있는 개수만큼만 소모해 줌)
        [$st] = http_request('POST', store_url('/user/inventory/item/consume'), json_encode(['sku' => event_coin_sku(), 'quantity' => 1, 'instance_id' => null]), $auth);
        if ($st < 200 || $st >= 300) break;
        try {
            tx(function (PDO $pdo) use ($who, $e, $xday, $n) {
                $slot = (int)q_val('SELECT COUNT(*) FROM event_claims WHERE pkey = ? AND event_id = ? AND day = ?', [$who['key'], $e['id'], $xday]) > 0 ? $xday . '#' . now_ms() . random_int(0, 999) : $xday;
                $pdo->prepare('INSERT INTO event_claims (pkey, event_id, day, amount, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$who['key'], $e['id'], $slot, $n, now_ms()]);
                event_wallet_add($pdo, $who['key'], $e['id'], $n);
            });
            $got += $n;
        } catch (Throwable $ex) {
            error_log("[event] consumed {$e['id']} coin but not recorded: " . $ex->getMessage());
            break;
        }
    }
    return array_merge(event_status_for($who), ['ok' => true, 'got' => $got]);
}

function event_exchange_event(array $who): array {
    $e = event_find(event_today(), EVENT_EXCHANGE_DAYS, !empty($who['unlimited']));
    if (!$e) throw new HttpError(409, 'event_closed');
    return $e;
}

function event_skin(): array {
    $who = require_user();
    $body = read_body(256);
    $e = event_exchange_event($who);
    $skin = (string)($body['skin'] ?? '');
    if (!in_array($skin, EVENT_THEMES[$e['theme']]['skins'], true)) throw new HttpError(400, 'bad_skin');
    tx(function (PDO $pdo) use ($who, $e, $skin) {
        if ((int)q_val('SELECT COUNT(*) FROM event_skins WHERE pkey = ? AND skin = ?', [$who['key'], $skin]) > 0) throw new HttpError(409, 'skin_owned');
        event_wallet_add($pdo, $who['key'], $e['id'], -EVENT_SKIN_PRICE);
        $now = now_ms();
        $pdo->prepare('INSERT INTO event_skins (pkey, skin, event_id, created_at) VALUES (?, ?, ?, ?)')->execute([$who['key'], $skin, $e['id'], $now]);
        $pdo->prepare('INSERT INTO event_spends (id, pkey, event_id, kind, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([new_id(), $who['key'], $e['id'], 'skin', $skin, EVENT_SKIN_PRICE, $now]);
    });
    return array_merge(event_status_for($who), ['ok' => true, 'skin' => $skin]);
}

function event_cash(): array {
    $who = require_user();
    $body = read_body(256);
    $e = event_exchange_event($who);
    $amount = $body['amount'] ?? null;
    if (!is_int($amount) || $amount < 1 || $amount > EVENT_MAX_CASH) throw new HttpError(400, 'bad_amount');
    $coin = EVENT_THEMES[$e['theme']]['coin'];
    $name = $e['name'] ?? ['ko' => $e['id'], 'en' => $e['id'], 'ja' => $e['id']];
    $mail = tx(function (PDO $pdo) use ($who, $e, $amount, $coin, $name) {
        event_wallet_add($pdo, $who['key'], $e['id'], -$amount);
        $now = now_ms();
        $mail = add_mail($who['key'], 'gift', ['cash' => $amount, 'note' => "{$name['ko']} 이벤트 {$coin['ko']} 교환",
            'notes' => ['en' => "{$name['en']} event: {$coin['en']} exchange", 'ja' => "{$name['ja']}イベント: {$coin['ja']}の交換"]], $now);
        $pdo->prepare('INSERT INTO event_spends (id, pkey, event_id, kind, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([new_id(), $who['key'], $e['id'], 'cash', $mail, $amount, $now]);
        return $mail;
    });
    return array_merge(event_status_for($who), ['ok' => true, 'cash' => $amount, 'mail' => mail_count($who['key'])]);
}
