<?php
// 이벤트 (dc#130): 기간 동안 상점에서 하루 한 번 이벤트 재화를 무료로 받고, 모아서 스킨이나 캐시로 바꿈. api.php가 불러서 씀.
//
//   GET  api.php?r=event_status              지금 이벤트, 오늘 받았는지, 가진 재화·스킨 (로그인 안 하면 이벤트 정보만)
//   POST api.php?r=event_claim  {}           오늘의 무료 재화 (하루 EVENT_DAILY개 + 그날 기념일 bonus). 이벤트 기간에만
//   POST api.php?r=event_skin   { skin }     재화 EVENT_SKIN_PRICE개 → 스킨 (계정에 영구, 한 번만)
//   POST api.php?r=event_cash   { amount }   남은 재화 → 캐시 1:1. 캐시는 우편함으로 (받으면 Xsolla 계정에 들어감)
//
// - 재화·스킨·캐시가 걸려 있어서 모두 로그인 사용자만 (게스트는 이벤트 정보만)
// - 교환(스킨·캐시)은 이벤트가 끝나고 EVENT_EXCHANGE_DAYS일까지. 날짜는 한국 시간 (today_kst)
// - 일정은 events.js와 같음 (event-api-test가 비교). 내용을 만든 이벤트만 ready
// - 운영자 기기(unlimited)는 시험용: 하루에 여러 번 받기, 시작 EVENT_PREVIEW_DAYS일 전부터 미리 열기

const EVENT_DAILY = 1;
const EVENT_SKIN_PRICE = 10;
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
    $day = event_today();
    $preview = !empty($who['unlimited']);
    $ex = event_find($day, EVENT_EXCHANGE_DAYS, $preview);
    $out = ['day' => $day, 'login' => $who['kind'] === 'user', 'price' => EVENT_SKIN_PRICE, 'event' => null, 'skins' => [], 'balance' => 0, 'earned' => 0, 'claimed' => false];
    if ($who['kind'] === 'user') $out['skins'] = event_skins_of($who['key']);
    if (!$ex) return $out;
    $open = event_find($day, 0, $preview) !== null;   // 받기는 이벤트 기간에만
    $out['event'] = [
        'id' => $ex['id'], 'theme' => $ex['theme'], 'start' => $ex['start'], 'end' => $ex['end'],
        'exchangeUntil' => event_add_days($ex['end'], EVENT_EXCHANGE_DAYS), 'open' => $open,
        'today' => $open ? event_daily_amount($ex, $day) : 0, 'skins' => EVENT_THEMES[$ex['theme']]['skins'],
    ];
    if ($who['kind'] === 'user') {
        $out = array_merge($out, event_wallet_of($who['key'], $ex['id']));
        $out['claimed'] = !$preview && (int)q_val('SELECT COUNT(*) FROM event_claims WHERE pkey = ? AND event_id = ? AND day = ?', [$who['key'], $ex['id'], $day]) > 0;
    }
    return $out;
}
function event_status(): array { return event_status_for(identify()); }

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

function event_claim(): array {
    $who = require_user();
    $day = event_today();
    $preview = !empty($who['unlimited']);
    $e = event_find($day, 0, $preview);
    if (!$e) throw new HttpError(409, 'event_closed');
    $n = event_daily_amount($e, $day);
    // 운영자 기기는 같은 날 여러 번 받을 수 있게 날짜 칸에 시각을 붙임
    $slot = $preview ? $day . '#' . now_ms() : $day;
    tx(function (PDO $pdo) use ($who, $e, $slot, $n) {
        if ((int)q_val('SELECT COUNT(*) FROM event_claims WHERE pkey = ? AND event_id = ? AND day = ?', [$who['key'], $e['id'], $slot]) > 0) throw new HttpError(429, 'event_claimed');
        $pdo->prepare('INSERT INTO event_claims (pkey, event_id, day, amount, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$who['key'], $e['id'], $slot, $n, now_ms()]);
        event_wallet_add($pdo, $who['key'], $e['id'], $n);
    });
    return array_merge(event_status_for($who), ['ok' => true, 'got' => $n]);
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
