<?php
// 펫 (dc#164): 계정별 펫 목록을 서버가 관리. api.php가 불러서 씀. 로그인 사용자만 (게스트는 그 기기에만 두었다가 계정을 연결하면 올림)
//
//   GET  api.php?r=pets                         { have: { 이름표: { g, at } }, on, pin }
//   POST api.php?r=pet_claim { key, g, src }    새 펫 하나. 결과는 위와 같은 목록 (+ got: 이름표)
//   POST api.php?r=pet_set   { key | null }     데리고 다닐 펫으로 고정 / null이면 고정 풀기 (가장 좋은 펫). 결과는 목록
//
// 이름표: 몬스터 id (이벤트 모습이면 "id@이벤트", 예: troll@halloween). 등급: common · rare · epic · legend
// 서버가 확인하는 것
//   - 몬스터 id는 PET_MONSTERS 안 (monsters.js petMonsters()와 같음, pets-api-test가 비교)
//   - 이벤트 모습은 그 이벤트 기간에만 (끝난 다음 날까지는 봐줌: 마지막 날 밤에 잡은 것)
//   - 등급은 떨어뜨린 종류(src: elite · boss · named)에서 나올 수 있는 것 (이벤트 모습이면 한 단계 위, monsters.js petGradesFor와 같음)
//   - 같은 펫은 한 번만, 하루(한국 시간)에 PET_DAILY_MAX마리까지
// 몬스터를 정말 쓰러뜨렸는지는 서버가 판 진행을 몰라서 확인하지 못함 (펫은 아이템 줍기를 돕는 것이라 랭킹·능력치와 상관없음)

const PET_DAILY_MAX = 20;
const PET_GRADES = ['common', 'rare', 'epic', 'legend'];
const PET_ODDS = ['elite' => ['common', 'rare', 'epic'], 'boss' => ['rare', 'epic', 'legend'], 'named' => ['epic', 'legend']];
const PET_MONSTERS = ['rat', 'bat', 'kobold', 'goblin', 'skeleton', 'zombie', 'orc', 'wolf', 'spider', 'troll', 'harpy', 'wraith', 'dark_knight', 'minotaur',
    'chimera', 'lich', 'fire_spirit', 'vampire', 'drake', 'hydra', 'ghoul', 'basilisk', 'gargoyle', 'naga', 'wyvern', 'death_knight', 'banshee', 'golem',
    'manticore', 'frost_giant', 'specter', 'demon', 'behemoth', 'kraken', 'phoenix', 'shadow_dragon', 'archdemon', 'titan', 'void_lord', 'ancient_dragon',
    'goblin_king', 'ogre_chief', 'lich_lord', 'bulgasari', 'gumiho', 'imugi', 'jeoseung', 'yeomra'];
// 이벤트 모습을 그릴 수 없는 몬스터 (그림 모음에 할로윈 모자 그림이 없음: 이미 관·갓을 씀)
const PET_NO_SKIN = ['halloween' => ['goblin_king', 'jeoseung', 'yeomra']];

function pets_tables(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS pets (
        pkey     VARCHAR(64) NOT NULL,
        pet_key  VARCHAR(40) NOT NULL,
        grade    VARCHAR(8) NOT NULL,
        src      VARCHAR(8) NOT NULL,
        day      VARCHAR(10) NOT NULL,
        got_at   BIGINT NOT NULL,
        PRIMARY KEY (pkey, pet_key)
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS pet_prefs (
        pkey        VARCHAR(64) PRIMARY KEY,
        on_key      VARCHAR(40),
        pin         INTEGER NOT NULL DEFAULT 0,
        updated_at  BIGINT NOT NULL
    )');
}

// 이 사람의 펫 목록. 고정하지 않았으면 가장 좋은 펫(등급 → 최근)을 데리고 다님 (게임과 같은 규칙)
function pets_of(string $key): array {
    $st = db()->prepare('SELECT pet_key, grade, got_at FROM pets WHERE pkey = ?');
    $st->execute([$key]);
    $have = [];
    foreach ($st->fetchAll() as $r) $have[$r['pet_key']] = ['g' => $r['grade'], 'at' => (int)$r['got_at']];
    $pref = q_row('SELECT on_key, pin FROM pet_prefs WHERE pkey = ?', [$key]);
    $pin = $pref && (int)$pref['pin'] === 1 && isset($have[$pref['on_key']]);
    $on = $pin ? $pref['on_key'] : pet_best($have);
    return ['have' => (object)$have, 'on' => $on, 'pin' => $pin];
}
function pet_best(array $have): ?string {
    $best = null;
    foreach ($have as $k => $v) {
        if ($best === null) { $best = $k; continue; }
        $a = array_search($v['g'], PET_GRADES, true); $b = array_search($have[$best]['g'], PET_GRADES, true);
        if ($a > $b || ($a === $b && $v['at'] > $have[$best]['at'])) $best = $k;
    }
    return $best;
}

// 이름표 나누기: [몬스터 id, 이벤트 모습 | null]. 이상하면 null
function pet_parse($k): ?array {
    if (!is_string($k) || !preg_match('/^([a-z_]{2,24})(?:@([a-z]{2,16}))?$/', $k, $m)) return null;
    if (!in_array($m[1], PET_MONSTERS, true)) return null;
    $skin = $m[2] ?? '';
    if ($skin === '') return [$m[1], null];
    if (!isset(EVENT_THEMES[$skin]) || in_array($m[1], PET_NO_SKIN[$skin] ?? [], true)) return null;
    return [$m[1], $skin];
}
// 떨어뜨린 종류에서 나올 수 있는 등급 (이벤트 모습이면 한 단계 위)
function pet_grades_for(string $src, bool $event): array {
    $out = [];
    foreach (PET_ODDS[$src] ?? [] as $g) $out[] = $event ? PET_GRADES[min(count(PET_GRADES) - 1, array_search($g, PET_GRADES, true) + 1)] : $g;
    return $out;
}

function pets_list(): array { return pets_of(require_user()['key']); }

function pet_claim(): array {
    $who = require_user();
    $b = read_body(512);
    $parsed = pet_parse($b['key'] ?? null);
    $g = (string)($b['g'] ?? ''); $src = (string)($b['src'] ?? '');
    if (!$parsed || !isset(PET_ODDS[$src])) throw new HttpError(400, 'bad_pet');
    [$id, $skin] = $parsed;
    // 이벤트 모습은 그 이벤트 기간에만 (다음 날까지 봐줌)
    if ($skin !== null) {
        $e = event_find(event_today(), 1, !empty($who['unlimited']));
        if (!$e || $e['theme'] !== $skin) throw new HttpError(403, 'event_over');
    }
    if (!in_array($g, pet_grades_for($src, $skin !== null), true)) throw new HttpError(400, 'bad_grade');
    $key = $skin ? "{$id}@{$skin}" : $id;
    $day = today_kst();
    tx(function (PDO $pdo) use ($who, $key, $g, $src, $day) {
        if (q_val('SELECT 1 FROM pets WHERE pkey = ? AND pet_key = ?', [$who['key'], $key])) throw new HttpError(409, 'have');
        if (empty($who['unlimited']) && (int)q_val('SELECT COUNT(*) FROM pets WHERE pkey = ? AND day = ?', [$who['key'], $day]) >= PET_DAILY_MAX) throw new HttpError(429, 'pet_limit');
        $pdo->prepare('INSERT INTO pets (pkey, pet_key, grade, src, day, got_at) VALUES (?, ?, ?, ?, ?, ?)')->execute([$who['key'], $key, $g, $src, $day, now_ms()]);
    });
    return array_merge(pets_of($who['key']), ['got' => $key]);
}

function pet_set(): array {
    $who = require_user();
    $b = read_body(256);
    $key = $b['key'] ?? null;
    $now = now_ms();
    if ($key !== null) {
        if (!is_string($key) || !q_val('SELECT 1 FROM pets WHERE pkey = ? AND pet_key = ?', [$who['key'], $key])) throw new HttpError(404, 'no_pet');
    }
    tx(function (PDO $pdo) use ($who, $key, $now) {
        $up = $pdo->prepare('UPDATE pet_prefs SET on_key = ?, pin = ?, updated_at = ? WHERE pkey = ?');
        $up->execute([$key, $key === null ? 0 : 1, $now, $who['key']]);
        if ($up->rowCount() === 0) $pdo->prepare('INSERT INTO pet_prefs (pkey, on_key, pin, updated_at) VALUES (?, ?, ?, ?)')->execute([$who['key'], $key, $key === null ? 0 : 1, $now]);
    });
    return pets_of($who['key']);
}
