<?php
// 무료 선물 (dc#105): BONUS_HOURS시간마다 광고를 보면 세트·유니크 3개를 보여 주고, 그중 하나를 골라 받음. api.php가 불러서 씀.
//
//   GET  api.php?r=bonus_status              지금 받을 수 있는지(ready), 다음 시각(nextAt), 아직 안 고른 선물(pending)
//   POST api.php?r=bonus_open  { adTicket }  광고 티켓(ads.php, kind bonus)으로 선물 3개를 만듦. BONUS_HOURS시간마다 한 번
//   POST api.php?r=bonus_pick  { id, pick }  3개 중 하나 고르기 (한 번만). 로그인 사용자는 BONUS_CASH_CHANCE 확률로 캐시 1~3개가 우편함으로
//
// 선물의 수준은 서버에 기록된 진행(랭킹 표의 최고 층)으로 정함 (게임이 보내는 값은 믿지 않음)
//   나이트메어 완료 → 헬: 지옥의 세트, 헬에서 만난 네임드 보스(10·20…층)의 유니크도 섞임
//   일반 던전 완료 → 나이트메어: 악몽의 세트
//   그 전 → 일반 던전 세트
//   레벨은 그 던전 최고 층에서 떨어지는 아이템과 같음 (유니크는 그 보스 층)
// 시드: bonus|선물 번호|e·n·j층|s칸_순번 (세트, 보스 등급표에서 세트가 나온 순번) · bonus|선물 번호|j보스 층|u·a순번 (유니크)
//   items.js·rules.php의 규칙 그대로 만든 아이템이고, 고른 시드만 bonus_items에 기록 → 그 시드만 아이템으로 인정 (seed_origin_ok)
// 개발자 계정(운영자 기기)은 시간 제한 없이 시험할 수 있음 (광고는 그대로 봐야 함)

const BONUS_HOURS = 3;
const BONUS_CASH_CHANCE = 0.1;
const BONUS_CASH = [1, 3];
const BONUS_REV = 8;          // 선물을 만드는 규칙 개정 (items.js RULES_REV)
const BONUS_UNIQUE_SHARE = 0.5;   // 헬 선물 한 칸이 유니크일 확률 (만난 네임드 보스가 있을 때)
const R_BONUS_SEED = '/^bonus\|([0-9a-f]{16})\|([enj])(\d{1,2})\|(s[0-2]_\d{1,4}|[ua]\d{1,4})$/';

function bonus_tables(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS bonus_offers (
        id          VARCHAR(32) PRIMARY KEY,
        pkey        VARCHAR(64) NOT NULL,
        tier        VARCHAR(12) NOT NULL,
        offers      TEXT NOT NULL,
        picked      INTEGER,
        cash        INTEGER NOT NULL DEFAULT 0,
        created_at  BIGINT NOT NULL,
        picked_at   BIGINT
    )');
    try { $pdo->exec('CREATE INDEX idx_bonus_offers_owner ON bonus_offers (pkey, created_at)'); } catch (PDOException $e) { /* 이미 있음 */ }
    // 고른 선물의 시드 (seed_origin_ok가 이것만 인정)
    $pdo->exec('CREATE TABLE IF NOT EXISTS bonus_items (
        seed        VARCHAR(80) PRIMARY KEY,
        offer_id    VARCHAR(32) NOT NULL,
        pkey        VARCHAR(64) NOT NULL,
        src         VARCHAR(12) NOT NULL,
        lvl         INTEGER NOT NULL,
        rev         INTEGER NOT NULL,
        created_at  BIGINT NOT NULL
    )');
}

function bonus_seed_ok(string $seed, string $src, int $lvl, int $rev): bool {
    return (int)q_val('SELECT COUNT(*) FROM bonus_items WHERE seed = ? AND src = ? AND lvl = ? AND rev = ?', [$seed, $src, $lvl, $rev]) > 0;
}

// 서버에 기록된 진행 → 선물 수준
function bonus_tier(string $key): array {
    $best = function (string $t) use ($key) { return (int)(q_val("SELECT best_stage FROM {$t} WHERE pkey = ?", [$key]) ?: 0); };
    $normal = $best('players_v4'); $nm = $best('players_nm'); $hell = $best('players_hell');
    if ($nm > NM_FLOORS) { $n = max(1, min(HELL_FLOORS, $hell)); return ['tier' => 'hell', 'z' => 'j', 'n' => $n, 'lvl' => HELL_ITEM_BASE + $n]; }
    if ($normal > MAX_FLOOR) { $n = max(1, min(NM_FLOORS, $nm)); return ['tier' => 'nightmare', 'z' => 'n', 'n' => $n, 'lvl' => NM_ITEM_BASE + $n]; }
    $n = max(1, min(MAX_FLOOR, $normal));
    return ['tier' => 'normal', 'z' => 'e', 'n' => $n, 'lvl' => r_eff($n)];
}

function bonus_ref(array $item): array {
    return ['seed' => $item['seed'], 'src' => $item['src'], 'lvl' => $item['lvl'], 'v' => 4, 'enh' => 0, 'r' => BONUS_REV, 'id' => $item['id']];
}

// 선물 3개: 서로 다른 부위의 세트 (헬은 만난 네임드 보스의 유니크가 반쯤 섞임, 같은 유니크는 한 번만)
function bonus_make(string $id, array $t): array {
    $out = []; $slots = []; $uqs = [];
    $named = $t['tier'] === 'hell' ? array_values(array_filter(array_keys(R_UNIQUE['items']), function ($k) use ($t) { return R_UNIQUE['items'][$k]['boss'] <= $t['n']; })) : [];
    for ($k = 0; $k < 3; $k++) {
        $left = array_values(array_diff($named, $uqs));
        if ($left && random_int(0, 999) < BONUS_UNIQUE_SHARE * 1000) {
            $uq = $left[random_int(0, count($left) - 1)];
            $U = R_UNIQUE['items'][$uq];
            for ($i = 0; $i < 2000; $i++) {   // 그 보스의 유니크가 여럿이면 원하는 것이 나오는 순번을 찾음
                $seed = "bonus|{$id}|j{$U['boss']}|" . (empty($U['acc']) ? 'u' : 'a') . $i;
                $it = r_generate(4, $seed, 'unique', HELL_ITEM_BASE + $U['boss'], BONUS_REV);
                if ($it['uq'] === $uq) { $out[] = $it; $uqs[] = $uq; continue 2; }
            }
        }
        for ($i = 0; $i < 5000; $i++) {   // 보스 등급표에서 세트가 나온 순번 (세트 4% → 평균 25번), 앞의 선물과 다른 부위
            $it = r_generate(4, "bonus|{$id}|{$t['z']}{$t['n']}|s{$k}_{$i}", 'boss', $t['lvl'], BONUS_REV);
            if ($it['rarity'] === 'set' && (!in_array($it['slot'], $slots, true) || $i > 3000)) { $out[] = $it; $slots[] = $it['slot']; break; }
        }
    }
    if (count($out) !== 3) throw new HttpError(500, 'bonus_failed');
    return $out;
}

function bonus_last(string $key): ?array {
    $r = q_row('SELECT * FROM bonus_offers WHERE pkey = ? ORDER BY created_at DESC LIMIT 1', [$key]);
    return $r ?: null;
}
function bonus_out(array $o): array {
    return ['id' => $o['id'], 'tier' => $o['tier'], 'offers' => json_decode($o['offers'], true), 'createdAt' => (int)$o['created_at']];
}

function bonus_status_for(array $who): array {
    $last = bonus_last($who['key']);
    $now = now_ms();
    $next = $last ? (int)$last['created_at'] + BONUS_HOURS * 3600000 : 0;
    $pending = $last && $last['picked'] === null ? bonus_out($last) : null;
    return [
        'hours' => BONUS_HOURS, 'ready' => !$pending && ($now >= $next || !empty($who['unlimited'])), 'nextAt' => $pending ? null : max($now, $next),
        'pending' => $pending, 'tier' => bonus_tier($who['key'])['tier'],
        // 캐시는 Xsolla 계정에 들어가서 로그인 사용자만
        'cash' => $who['kind'] === 'user' ? ['chance' => BONUS_CASH_CHANCE, 'min' => BONUS_CASH[0], 'max' => BONUS_CASH[1]] : null,
    ];
}
function bonus_status(): array { return bonus_status_for(identify()); }

function bonus_open(): array {
    $who = identify();
    $body = read_body(256);
    $st = bonus_status_for($who);
    if ($st['pending']) return array_merge($st, ['ok' => true]);   // 아직 안 고른 선물이 있으면 그대로 (광고 티켓은 쓰지 않음)
    if (!$st['ready']) throw new HttpError(429, 'bonus_wait');
    $t = check_ticket($who, $body['adTicket'] ?? null, 'bonus');
    $tier = bonus_tier($who['key']);
    $id = new_id();
    $items = bonus_make($id, $tier);
    $now = now_ms();
    tx(function (PDO $pdo) use ($who, $t, $id, $tier, $items, $now) {
        use_ticket($t['id']);
        // 같은 시간 안에 두 번 열지 못하게 (동시에 요청해도 하나만)
        if (empty($who['unlimited'])) {
            $recent = (int)q_val('SELECT COUNT(*) FROM bonus_offers WHERE pkey = ? AND created_at > ?', [$who['key'], $now - BONUS_HOURS * 3600000]);
            if ($recent > 0) throw new HttpError(429, 'bonus_wait');
        }
        $pdo->prepare('INSERT INTO bonus_offers (id, pkey, tier, offers, created_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$id, $who['key'], $tier['tier'], json_encode(array_map('bonus_ref', $items)), $now]);
    });
    return array_merge(bonus_status_for($who), ['ok' => true]);
}

function bonus_pick(): array {
    $who = identify();
    $body = read_body(256);
    $o = q_row('SELECT * FROM bonus_offers WHERE id = ? AND pkey = ?', [(string)($body['id'] ?? ''), $who['key']]);
    if (!$o || $o['picked'] !== null) throw new HttpError(404, 'not_found');
    $pick = $body['pick'] ?? null;
    $refs = json_decode($o['offers'], true);
    if (!is_int($pick) || !isset($refs[$pick])) throw new HttpError(400, 'bad_pick');
    $ref = $refs[$pick];
    $cash = $who['kind'] === 'user' && random_int(0, 999) < BONUS_CASH_CHANCE * 1000 ? random_int(BONUS_CASH[0], BONUS_CASH[1]) : 0;
    $now = now_ms();
    tx(function (PDO $pdo) use ($who, $o, $pick, $ref, $cash, $now) {
        $up = $pdo->prepare('UPDATE bonus_offers SET picked = ?, picked_at = ?, cash = ? WHERE id = ? AND picked IS NULL');
        $up->execute([$pick, $now, $cash, $o['id']]);
        if ($up->rowCount() !== 1) throw new HttpError(404, 'not_found');
        $pdo->prepare('INSERT INTO bonus_items (seed, offer_id, pkey, src, lvl, rev, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$ref['seed'], $o['id'], $who['key'], $ref['src'], $ref['lvl'], $ref['r'], $now]);
        set_owner($ref['id'], $who['key'], $now);
        if ($cash > 0) add_mail($who['key'], 'gift', ['cash' => $cash, 'note' => '무료 선물 보너스 캐시',
            'notes' => ['en' => 'Free gift bonus cash', 'ja' => '無料ギフトのボーナスキャッシュ']], $now);
    });
    return array_merge(bonus_status_for($who), ['ok' => true, 'item' => $ref, 'cash' => $cash, 'mail' => $who['kind'] === 'user' ? mail_count($who['key']) : 0]);
}
