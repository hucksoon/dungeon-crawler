<?php
// items.js의 아이템 규칙을 PHP로 옮긴 것. 서버가 아이템을 시드로 다시 만들어 위조를 확인하고 능력치를 계산한다.
// items.js와 한 비트도 다르면 안 됨: items.js를 바꾸면 여기도 같이 바꾸고 일치 테스트를 돌릴 것.
// v1: 기본 능력치가 부위로 고정 / v2: 주 능력치도 무작위, [최소~최대] 범위에서 최대치 20%
// v3: 보조 손(보조무기·방패) 부위, 방패의 패링 확률, 광란·견고 세트
// v4: 부위별 주 능력치 후보, % 능력치는 등급별 고정 범위, 추가 능력치에 치명타 피해·공격력%.
//     예전(v2·v3) 아이템의 % 능력치는 효과 계산 때 v4 최대치로 잘림
// v4 r1(규칙 개정, 아이템의 r): 레전더리·세트의 3%가 고대 (모든 능력치 최대치). r이 없는 v4 아이템은 그대로
// v4 r2: 일반 던전 75층에 맞춰 드롭을 늘림 — 몬스터·보스 등급표(R_TABLES_R2)와 드롭 확률(R_DROP_CHANCE_R2)
// v4 r3: 나이트메어에서 얻은 아이템(시드에 나이트메어 층)의 추가 능력치 후보에 속성 피해·저항 (R_STAT_KEYS_NM)

declare(strict_types=1);

const R_MASK = 0xFFFFFFFF;
const R_SLOTS_V2 = ['head', 'chest', 'arms', 'pants', 'boots', 'weapon'];   // v1·v2 아이템을 다시 만들 때
const R_SLOTS = ['head', 'chest', 'arms', 'pants', 'boots', 'weapon', 'offhand'];
const R_OFFHAND = ['shieldChance' => 0.5, 'shieldName' => '방패', 'weaponPrefix' => '보조'];
const R_PARRY = [
    'ranges' => ['common' => [9, 11], 'uncommon' => [9, 11], 'rare' => [9, 11], 'epic' => [16, 18], 'legendary' => [23, 25], 'set' => [23, 25]],
    'max' => 40,
];
const R_WEAPONS = [
    'dagger' => ['name' => '단검', 'base' => ['atk' => 2, 'crit' => 6], 'atkMul' => 1],
    'staff' => ['name' => '지팡이', 'base' => ['atk' => 2, 'hp' => 6], 'atkMul' => 1],
    'axe' => ['name' => '도끼', 'base' => ['atk' => 4], 'atkMul' => 1.3],
    // 장검 (r5, items.js WEAPONS.longsword): 무기 칸에만, 보조 손에는 방패만. 공격력 ×1.5, 다른 주 능력치도 ×mainMul
    'longsword' => ['name' => '장검', 'base' => ['atk' => 4], 'atkMul' => 1.5, 'mainMul' => 1.5, 'shieldOnly' => true],
];
// 무작위로 나오는 무기 종류: 장검은 r5부터 무기 칸에만
const R_WEAPON_TYPES_OLD = ['dagger', 'staff', 'axe'];
function r_weapon_types(int $rev): array { return $rev >= 5 ? array_keys(R_WEAPONS) : R_WEAPON_TYPES_OLD; }
function r_is_shield_only(?array $item): bool {
    return $item !== null && $item['slot'] === 'weapon' && !empty($item['type']) && !empty(R_WEAPONS[$item['type']]['shieldOnly']);
}
const R_ARMOR = [
    'head' => ['name' => '투구', 'base' => ['def' => 1, 'hp' => 2]],
    'chest' => ['name' => '갑옷', 'base' => ['def' => 2, 'hp' => 4]],
    'arms' => ['name' => '팔보호구', 'base' => ['def' => 1]],
    'pants' => ['name' => '바지', 'base' => ['def' => 1, 'hp' => 2]],
    'boots' => ['name' => '장화', 'base' => ['def' => 1]],
];
const R_RARITIES = [
    'common' => ['name' => '커먼', 'lines' => 1],
    'uncommon' => ['name' => '언커먼', 'lines' => 2],
    'rare' => ['name' => '레어', 'lines' => 3],
    'epic' => ['name' => '에픽', 'lines' => 4],
    'legendary' => ['name' => '레전더리', 'lines' => 5],
    'set' => ['name' => '세트', 'lines' => 4],
];
const R_TABLES = [
    'box' => ['common' => 40, 'uncommon' => 30, 'rare' => 18, 'epic' => 8, 'legendary' => 3, 'set' => 1],
    'drop' => ['common' => 60, 'uncommon' => 25, 'rare' => 10, 'epic' => 3.5, 'legendary' => 1, 'set' => 0.5],
    'boss' => ['common' => 20, 'uncommon' => 30, 'rare' => 28, 'epic' => 15, 'legendary' => 5, 'set' => 2],
    'golden' => ['rare' => 65, 'epic' => 25, 'legendary' => 7, 'set' => 3],
];
const R_DROP_CHANCE = ['normal' => 0.08, 'elite' => 0.4];          // r2 전
const R_DROP_CHANCE_R2 = ['normal' => 0.15, 'elite' => 0.6];       // v4 r2부터
// v4 r2부터 바뀐 등급표 (나머지 출처는 R_TABLES 그대로)
const R_TABLES_R2 = [
    'drop' => ['common' => 45, 'uncommon' => 28, 'rare' => 17, 'epic' => 6.5, 'legendary' => 2.5, 'set' => 1],
    'boss' => ['common' => 10, 'uncommon' => 25, 'rare' => 32, 'epic' => 20, 'legendary' => 9, 'set' => 4],
];
function r_tables_for(int $version, int $rev): array { return ($version === 4 && $rev >= 2) ? array_merge(R_TABLES, R_TABLES_R2) : R_TABLES; }
function r_drop_chance_for(int $version, int $rev): array { return ($version === 4 && $rev >= 2) ? R_DROP_CHANCE_R2 : R_DROP_CHANCE; }
const R_STAT_KEYS = ['atk', 'def', 'hp', 'crit', 'lifesteal', 'gold', 'xp'];
const R_STAT_KEYS_V4 = ['atk', 'def', 'hp', 'crit', 'critDmg', 'atkPct', 'lifesteal', 'gold', 'xp'];
// 나이트메어 아이템(r3): v4 후보 + 속성 피해 3종 + 속성 저항 3종 + 모든 속성 저항
const R_ELEMENT_KEYS = ['fireDmg', 'iceDmg', 'boltDmg', 'fireRes', 'iceRes', 'boltRes', 'allRes'];
const R_STAT_KEYS_NM = [...R_STAT_KEYS_V4, ...R_ELEMENT_KEYS];
const R_ELEMENT_DMG_CAP = 11;   // 속성 피해는 강화해도 한 줄 최대 11%
const R_RES_CAP = 75;
const R_SHIELD_GUARD = ['lifesteal' => 10, 'cap' => 30];   // 장검 + 방패 (items.js SHIELD_GUARD)
const R_LIFESTEAL_MAX = 20;     // 흡혈은 장비·세트를 합쳐 최대 20% (items.js LIFESTEAL)           // 속성마다 (그 속성 저항 + 모든 속성 저항) 최대 75%
const R_NM_SEED = '/\|(shop\|)?n\d+\|/';
function r_is_element_dmg(string $k): bool { return $k === 'fireDmg' || $k === 'iceDmg' || $k === 'boltDmg'; }
const R_ELEMENT_NAMES = ['fire' => '불', 'ice' => '얼음', 'bolt' => '번개'];
// 나이트메어에서 얻은 아이템 (속성 줄은 r3부터). 이름 앞에 "악몽의 (속성)"
function r_is_nightmare_item(array $item): bool { return ($item['v'] ?? 0) === 4 && preg_match(R_NM_SEED, (string)($item['seed'] ?? '')) === 1; }
// 속성 피해 줄 중 가장 큰 것 (같으면 먼저 붙은 줄, 강화 전 값). 없으면 null (items.js itemElement)
// 속성 피해 줄은 하나만 (items.js oneElementDmg): 가장 큰 것만 남기고 나머지는 다른 능력치로 (시드 el1|…)
function r_one_element_dmg(array $item, array $left, string $seed): array {
    $dmg = [];
    foreach ($item['lines'] as $i => [$k]) if (r_is_element_dmg($k)) $dmg[] = $i;
    if (count($dmg) < 2) return $item;
    $keep = $dmg[0];
    foreach ($dmg as $i) if ($item['lines'][$i][1] > $item['lines'][$keep][1]) $keep = $i;
    $maxed = r_is_ancient($item);
    $pool = array_values(array_filter($left, function ($k) { return !r_is_element_dmg($k) && $k !== 'socket'; }));
    $rng = r_rng("el1|{$seed}");
    foreach ($dmg as $i) {
        if ($i === $keep) continue;
        $stat = array_splice($pool, (int)floor($rng() * count($pool)), 1)[0];
        $range = r_line_range_of($stat, $item);
        $v = r_roll_range($rng, $range);
        $item['lines'][$i] = [$stat, $maxed ? $range[1] : $v];
    }
    return $item;
}
function r_item_element(array $item): ?string {
    $best = null; $bestV = 0;
    foreach ($item['lines'] ?? [] as [$k, $v]) {
        if (!r_is_element_dmg($k) || $v <= $bestV) continue;
        $best = substr($k, 0, -3); $bestV = $v;
    }
    return $best;
}
const R_STAT_NAMES = [
    'atk' => ['공격력', false], 'def' => ['방어력', false], 'hp' => ['최대 HP', false], 'crit' => ['치명타 확률', true],
    'lifesteal' => ['흡혈', true], 'gold' => ['골드 획득', true], 'xp' => ['경험치 획득', true], 'parry' => ['패링 확률', true],
    'critDmg' => ['치명타 피해', true], 'atkPct' => ['공격력', true], 'defPct' => ['방어력', true], 'hpPct' => ['최대 HP', true],
    'fireDmg' => ['불 피해', true], 'iceDmg' => ['얼음 피해', true], 'boltDmg' => ['번개 피해', true],
    'dmgReduce' => ['받는 피해 감소', true],
    'fireRes' => ['불 저항', true], 'iceRes' => ['얼음 저항', true], 'boltRes' => ['번개 저항', true], 'allRes' => ['모든 속성 저항', true],
    'socket' => ['홈', false],   // 추가 능력치 한 줄 (r6), 값 = 홈 개수
];
// v4 % 능력치 등급별 고정 범위 (커먼, 언커먼, 레어, 에픽, 레전더리, 세트)
const R_RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
const R_PCT_MAIN = [
    'crit' => [[1, 2], [2, 3], [3, 5], [5, 7], [8, 10], [7, 9]],
    'critDmg' => [[5, 10], [10, 15], [15, 25], [25, 35], [40, 50], [35, 45]],
    'atkPct' => [[2, 3], [3, 5], [5, 8], [8, 12], [13, 15], [12, 14]],
    'lifesteal' => [[1, 1], [1, 2], [2, 3], [3, 4], [5, 6], [4, 5]],
    'defPct' => [[2, 3], [3, 5], [5, 8], [8, 12], [13, 15], [12, 14]],
    'xp' => [[5, 8], [8, 12], [12, 18], [18, 25], [28, 35], [25, 30]],
    'gold' => [[5, 8], [8, 12], [12, 18], [18, 25], [28, 35], [25, 30]],
    'allRes' => [[4, 7], [4, 7], [4, 7], [4, 7], [4, 7], [4, 7]],   // 장검 (× mainMul, 강화로 오르지 않음)
];
const R_PCT_LINE = [
    'crit' => [[1, 1], [1, 2], [2, 3], [3, 4], [4, 6], [4, 5]],
    'critDmg' => [[3, 5], [5, 7], [7, 9], [9, 12], [12, 15], [11, 14]],
    'atkPct' => [[1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]],
    'lifesteal' => [[1, 1], [1, 1], [1, 2], [2, 3], [3, 4], [3, 3]],
    'gold' => [[3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]],
    'xp' => [[3, 6], [5, 8], [8, 12], [12, 16], [18, 25], [15, 20]],
    // 나이트메어 아이템(r3)만
    'fireDmg' => [[1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]],
    'iceDmg' => [[1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]],
    'boltDmg' => [[1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [5, 7]],
    'fireRes' => [[11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]],
    'iceRes' => [[11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]],
    'boltRes' => [[11, 34], [11, 34], [11, 34], [11, 34], [11, 34], [11, 34]],
    'allRes' => [[6, 11], [6, 11], [6, 11], [6, 11], [6, 11], [6, 11]],
];
const R_PCT_LINE_BOOST = 0.2;
const R_MAIN_POOL_V4 = [
    'weapon' => ['atk', 'critDmg', 'atkPct', 'lifesteal'],
    'offhandWeapon' => ['atk', 'critDmg', 'lifesteal'],
    'chest' => ['def', 'crit', 'hp'],
    'arms' => ['def', 'crit', 'atkPct'],
    'head' => ['def', 'hp', 'xp'],
    'pants' => ['def', 'hp', 'defPct'],
    'boots' => ['def', 'hp', 'gold'],
    'shield' => ['def', 'hp'],
    'longsword' => ['atk', 'def', 'crit', 'allRes'],
];
const R_MAIN_COUNT_V4 = ['common' => [1, 1], 'uncommon' => [1, 2], 'rare' => [2, 2], 'epic' => [2, 3], 'legendary' => [2, 3], 'set' => [2, 3]];
const R_MAIN_POOL = ['weapon' => ['atk', 'crit', 'lifesteal', 'hp'], 'armor' => ['def', 'hp', 'atk', 'crit']];
const R_MAIN_COUNT = ['common' => [1, 2], 'uncommon' => [1, 2], 'rare' => [3, 4], 'epic' => [3, 4], 'legendary' => [3, 4], 'set' => [3, 4]];
const R_RARITY_MUL = ['common' => 1, 'uncommon' => 1.15, 'rare' => 1.3, 'epic' => 1.5, 'legendary' => 1.75, 'set' => 1.6];
const R_OFF_SLOT_MUL = 0.5;
const R_MAX_ROLL_CHANCE = 0.2;
const R_ANCIENT_CHANCE = 0.03;   // v4 r1부터
// 고대 다시 굴리기 (items.js ANCIENT_REROLL): 고대가 아닌 v4 레전더리·세트를 골드로 굴림. 한 번에 5%, 최대 20번. 참조의 ar = 굴린 횟수
const R_ANCIENT_REROLL = ['chance' => 0.05, 'max' => 20];
const R_ENHANCE = ['max' => 12, 'statPerLevel' => 0.1, 'lineSteps' => [4, 6, 8, 10, 12], 'lineBoost' => 0.5];   // +11·+12: 대장간 업데이트
const R_SETS = [
    'trial' => [
        'name' => '시험의 세트',
        'weapon' => 'axe',
        'pieces' => ['head' => '시험의 투구', 'chest' => '시험의 갑옷', 'arms' => '시험의 팔보호구', 'pants' => '시험의 바지', 'boots' => '시험의 장화', 'weapon' => '시험의 도끼'],
        'bonuses' => [
            ['count' => 2, 'text' => '최대 HP +20%, 방어력 +20%', 'stats' => ['hpPct' => 20, 'defPct' => 20]],
            ['count' => 3, 'text' => '공격력 +25%, 치명타 확률 +10%', 'stats' => ['atkPct' => 25, 'crit' => 10]],
            ['count' => 5, 'text' => '치명타 피해 +100%, 받는 피해 −10%, 적을 쓰러뜨리면 최대 HP의 15% 회복', 'stats' => ['critDmg' => 100, 'dmgReduce' => 10, 'killHealPct' => 15]],
        ],
    ],
    'frenzy' => [
        'name' => '광란의 세트',
        'weapon' => 'dagger', 'offhand' => 'dagger',
        'pieces' => ['weapon' => '광란의 오른손무기', 'offhand' => '광란의 왼손무기'],
        'bonuses' => [
            ['count' => 2, 'text' => '공격하면 대상 주변 1칸의 적도 피해의 50%를 입어요', 'stats' => ['splash' => 1]],
        ],
    ],
    // 화염의 세트 (나이트메어 전용, r4)
    'inferno' => [
        'name' => '화염의 세트',
        'nightmare' => true,
        'pieces' => ['head' => '화염의 투구', 'chest' => '화염의 갑옷', 'arms' => '화염의 팔보호구', 'pants' => '화염의 바지', 'boots' => '화염의 장화'],
        'bonuses' => [
            ['count' => 2, 'text' => '파이어볼: 2턴마다 3칸 안의 가장 가까운 적을 중심으로 3×3 폭발 (공격력의 80% 불 피해, 방어력 무시)', 'stats' => ['fireball' => 1]],
            ['count' => 3, 'text' => '파이어볼에 맞은 적이 모두 화상을 입어요', 'stats' => ['fireballBurn' => 1]],
            ['count' => 5, 'text' => '파이어볼 피해 +50%, 최대 HP +15%, 불 저항 +20%', 'stats' => ['fireballPct' => 50, 'hpPct' => 15, 'fireRes' => 20]],
        ],
    ],
    // 서리의 세트·뇌전의 세트 (나이트메어 전용, r4)
    'frost' => [
        'name' => '서리의 세트',
        'nightmare' => true,
        'pieces' => ['head' => '서리의 투구', 'chest' => '서리의 갑옷', 'arms' => '서리의 팔보호구', 'pants' => '서리의 바지', 'boots' => '서리의 장화'],
        'bonuses' => [
            ['count' => 2, 'text' => '프로스트 노바: 2턴마다 내 주변 8칸의 적 모두에게 공격력의 70% 얼음 피해 (방어력 무시)', 'stats' => ['nova' => 1]],
            ['count' => 3, 'text' => '프로스트 노바에 맞은 적이 모두 느려져요 (얼음 면역 중인 적 빼고)', 'stats' => ['novaSlow' => 1]],
            ['count' => 5, 'text' => '프로스트 노바 피해 +50%, 방어력 +10%, 얼음 저항 +20%', 'stats' => ['novaPct' => 50, 'defPct' => 10, 'iceRes' => 20]],
        ],
    ],
    'storm' => [
        'name' => '뇌전의 세트',
        'nightmare' => true,
        'pieces' => ['head' => '뇌전의 투구', 'chest' => '뇌전의 갑옷', 'arms' => '뇌전의 팔보호구', 'pants' => '뇌전의 바지', 'boots' => '뇌전의 장화'],
        'bonuses' => [
            ['count' => 2, 'text' => '체인 라이트닝: 2턴마다 3칸 안의 가장 가까운 적부터 번개가 2번 튕겨요 (서로 다른 적, 한 번에 공격력의 40% 번개 피해, 방어력 무시)', 'stats' => ['chain' => 1]],
            ['count' => 3, 'text' => '번개가 4번 튕기고, 튕길 다른 적이 없으면 같은 적이 다시 맞아요 (한 마리면 4번). 맞은 적은 감전: 3턴 동안 받는 피해 +20%', 'stats' => ['chainMax' => 1]],
            ['count' => 5, 'text' => '체인 라이트닝 피해 +50%, 치명타 확률 +10%, 번개 저항 +20%', 'stats' => ['chainPct' => 50, 'crit' => 10, 'boltRes' => 20]],
        ],
    ],
    'sturdy' => [
        'name' => '견고의 세트',
        // 무기는 도끼였다가 장검으로 (세트 무기 종류는 굴리지 않아서 예전 견고의 도끼도 다시 만들면 장검, ID는 같음)
        'weapon' => 'longsword', 'offhand' => 'shield',
        'pieces' => ['weapon' => '견고의 장검', 'offhand' => '견고의 방패'],
        'bonuses' => [
            ['count' => 2, 'text' => '패링 확률 +15% (방패와 합쳐 최대 40%)', 'stats' => ['parry' => 15]],
        ],
    ],
];

// 무기처럼 쓰는 아이템: 무기 칸, 또는 보조 손의 방패가 아닌 것
function r_weapon_like(array $item): bool {
    return $item['slot'] === 'weapon' || ($item['slot'] === 'offhand' && !empty($item['type']) && $item['type'] !== 'shield');
}
// 그 부위로 나올 수 있는 세트 (R_SETS 순서). $nm4: 나이트메어 아이템(r4 이후)이면 나이트메어 전용 세트도
function r_sets_for(string $slot, bool $nm4 = false): array {
    $out = [];
    foreach (R_SETS as $id => $set) if (isset($set['pieces'][$slot]) && (empty($set['nightmare']) || $nm4)) $out[] = $id;
    return $out;
}
function r_set_full(string $id): int { return max(array_column(R_SETS[$id]['bonuses'], 'count')); }
// 등급별 고정 범위 표에서 찾기 (없으면 null)
function r_pct_of(array $table, string $stat, string $rarity): ?array {
    if (!isset($table[$stat])) return null;
    $i = array_search($rarity, R_RARITY_ORDER, true);
    return $i === false ? null : $table[$stat][$i];
}
// v4 아이템의 % 능력치 고정 범위
// 속성 저항 줄 (r4부터, items.js RES_R4): 범위가 줄고 강화로는 오르지 않음. r3까지 얻은 아이템은 효과에서 새 최대치까지만
const R_RES_R4 = ['fireRes' => [7, 20], 'iceRes' => [7, 20], 'boltRes' => [7, 20], 'allRes' => [4, 7]];
function r_fixed_pct(array $item, array $table, string $stat): ?array {
    if (($item['v'] ?? 0) < 4) return null;
    if ($table === R_PCT_LINE && isset(R_RES_R4[$stat]) && ($item['r'] ?? 0) >= 4) return R_RES_R4[$stat];
    return r_pct_of($table, $stat, $item['rarity']);
}
function r_old_res_cap(array $item, string $stat): ?int {
    return ($item['v'] ?? 0) === 4 && isset(R_RES_R4[$stat]) && ($item['r'] ?? 0) < 4 ? R_RES_R4[$stat][1] : null;
}
function r_main_pool_v4(array $item): array {
    if ($item['slot'] === 'offhand') return R_MAIN_POOL_V4[$item['type'] === 'shield' ? 'shield' : 'offhandWeapon'];
    return R_MAIN_POOL_V4[r_is_shield_only($item) ? $item['type'] : $item['slot']];
}

// ---------------------------------------------------------------- 시드 난수 (JS Math.imul / >>> 와 같게)

function r_imul(int $a, int $b): int {
    $a &= R_MASK; $b &= R_MASK;
    $lo = ($a & 0xFFFF) * $b;
    $hi = ((($a >> 16) & 0xFFFF) * $b) & 0xFFFF;
    return ($lo + ($hi << 16)) & R_MASK;
}

// JS의 charCodeAt처럼 UTF-16 코드 단위로
function r_code_units(string $s): array {
    if ($s === '') return [];
    $u = mb_convert_encoding($s, 'UTF-16LE', 'UTF-8');
    return array_values(unpack('v*', $u));
}

function r_hash_seed(string $str): array {
    $h1 = 0xdeadbeef; $h2 = 0x41c6ce57;
    foreach (r_code_units($str) as $c) {
        $h1 = r_imul($h1 ^ $c, 2654435761);
        $h2 = r_imul($h2 ^ $c, 1597334677);
    }
    $h1 = r_imul($h1 ^ ($h1 >> 16), 2246822507) ^ r_imul($h2 ^ ($h2 >> 13), 3266489909);
    $h2 = r_imul($h2 ^ ($h2 >> 16), 2246822507) ^ r_imul($h1 ^ ($h1 >> 13), 3266489909);
    return [$h1 & R_MASK, $h2 & R_MASK];
}

function r_rng(string $seed): Closure {
    $a = r_hash_seed($seed)[0];
    return function () use (&$a): float {
        $a = ($a + 0x6d2b79f5) & R_MASK;
        $t = r_imul($a ^ ($a >> 15), 1 | $a);
        $t = (($t + r_imul($t ^ ($t >> 7), 61 | $t)) & R_MASK) ^ $t;
        return (($t ^ ($t >> 14)) & R_MASK) / 4294967296;
    };
}

function r_rand_int(Closure $rng, int $lo, int $hi): int { return $lo + (int)floor($rng() * ($hi - $lo + 1)); }
function r_pick(Closure $rng, array $list) { return $list[(int)floor($rng() * count($list))]; }
function r_pick_weighted(Closure $rng, array $weights): string {
    $entries = array_filter($weights, function ($w) { return $w > 0; });
    $total = array_sum($entries);
    $r = $rng() * $total;
    $last = '';
    foreach ($entries as $k => $w) { $last = $k; if (($r -= $w) < 0) return $k; }
    return $last;
}
// JS Math.round (양수)
function r_round(float $x): int { return (int)floor($x + 0.5); }

// ---------------------------------------------------------------- 범위

function r_line_range(string $stat, int $lv): array {
    switch ($stat) {
        case 'atk': return [1, 1 + intdiv($lv, 2)];
        case 'def': return [1, 1 + intdiv($lv, 3)];
        case 'hp': return [2, 4 + $lv * 2];
        case 'crit': return [1, 2 + intdiv($lv, 3)];
        case 'lifesteal': return [1, 2 + intdiv($lv, 4)];
        case 'gold': case 'xp': return [3, 8 + $lv];
    }
    throw new InvalidArgumentException("unknown stat $stat");
}

function r_main_base_range(string $stat, int $lv): array {
    switch ($stat) {
        case 'atk': return [1 + (int)floor($lv * 0.3), 3 + (int)floor($lv * 0.6)];
        case 'def': return [1 + (int)floor($lv * 0.2), 2 + (int)floor($lv * 0.5)];
        case 'hp': return [2 + $lv, 4 + $lv * 2];
        case 'crit': return [1, 2 + intdiv($lv, 4)];
        case 'lifesteal': return [1, 1 + intdiv($lv, 5)];
    }
    throw new InvalidArgumentException("unknown main stat $stat");
}

function r_main_range(string $stat, array $item): array {
    // 장검(v4): 공격력 말고 다른 주 능력치도 다른 부위 범위의 mainMul배
    $lsMul = ($item['v'] ?? 0) >= 4 && $stat !== 'atk' && r_is_shield_only($item) ? R_WEAPONS[$item['type']]['mainMul'] : 1;
    $fixed = r_fixed_pct($item, R_PCT_MAIN, $stat);
    if ($fixed) {
        if ($lsMul === 1) return $fixed;
        $a = max(1, r_round($fixed[0] * $lsMul));
        return [$a, max($a, r_round($fixed[1] * $lsMul))];
    }
    $mul = (R_RARITY_MUL[$item['rarity']] ?? 1) * $lsMul;
    $weaponLike = r_weapon_like($item);
    if ($weaponLike && $stat === 'atk' && $item['type']) $mul *= R_WEAPONS[$item['type']]['atkMul'];
    $off = $weaponLike ? $stat === 'hp' : ($stat === 'atk' || $stat === 'crit');
    if ($off) $mul *= R_OFF_SLOT_MUL;
    [$lo, $hi] = r_main_base_range($stat, $item['lvl']);
    $a = max(1, r_round($lo * $mul));
    return [$a, max($a, r_round($hi * $mul))];
}

// 그 아이템의 추가 능력치 범위 (v4 % 능력치는 등급별 고정)
function r_line_range_of(string $stat, array $item): array {
    if ($stat === 'socket') return r_socket_range($item);
    return r_fixed_pct($item, R_PCT_LINE, $stat) ?? r_line_range($stat, $item['lvl']);
}

// ---------------------------------------------------------------- 홈·보석 (r6, items.js SOCKETS·GEMS)

const R_SOCKETS = [
    'head' => [1, 2], 'chest' => [1, 4], 'arms' => [1, 2], 'boots' => [1, 2],
    'weapon' => [1, 2], 'offhandWeapon' => [1, 2], 'longsword' => [4, 6], 'shield' => [1, 4],
];
function r_socket_range(array $item): ?array {
    $k = $item['slot'] === 'offhand' ? ($item['type'] === 'shield' ? 'shield' : 'offhandWeapon') : (r_is_shield_only($item) ? 'longsword' : $item['slot']);
    return R_SOCKETS[$k] ?? null;
}
function r_socket_count(array $item): int {
    foreach ($item['lines'] ?? [] as [$k, $v]) if ($k === 'socket') return $v;
    return 0;
}
const R_GEM_GRADES = ['조각', '보석', '완벽한 보석'];
const R_GEMS = [
    'ruby' => ['name' => '루비', 'weapon' => ['atkPct' => [2, 4, 6]], 'armor' => ['hpPct' => [2, 4, 6]]],
    'sapphire' => ['name' => '사파이어', 'weapon' => ['critDmg' => [5, 10, 15]], 'armor' => ['defPct' => [2, 4, 6]]],
    'emerald' => ['name' => '에메랄드', 'weapon' => ['crit' => [1, 2, 3]], 'armor' => ['dmgReduce' => [1, 2, 3]]],
    'topaz' => ['name' => '토파즈', 'weapon' => ['gold' => [5, 10, 15]], 'armor' => ['xp' => [5, 10, 15]]],
    'diamond' => ['name' => '다이아몬드', 'weapon' => ['allRes' => [2, 3, 4]], 'armor' => ['allRes' => [2, 3, 4]]],
];
const R_GEM_CAPS = ['dmgReduce' => 30];
function r_is_gem($g): bool {
    return is_array($g) && count($g) === 2 && is_string($g[0] ?? null) && isset(R_GEMS[$g[0]]) && is_int($g[1] ?? null) && $g[1] >= 0 && $g[1] < count(R_GEM_GRADES);
}
function r_gem_name(string $kind, int $grade): string {
    $n = R_GEMS[$kind]['name'];
    return $grade === 0 ? "{$n} 조각" : ($grade === 2 ? "완벽한 {$n}" : $n);
}
function r_gem_stats(array $item): array {
    $out = [];
    $place = r_weapon_like($item) ? 'weapon' : 'armor';
    foreach (array_slice($item['gems'] ?? [], 0, r_socket_count($item)) as $g) {
        if (!r_is_gem($g)) continue;
        foreach (R_GEMS[$g[0]][$place] as $k => $vals) $out[$k] = ($out[$k] ?? 0) + $vals[$g[1]];
    }
    return $out;
}

function r_roll_range(Closure $rng, array $range): int {
    [$lo, $hi] = $range;
    if ($hi <= $lo || $rng() < R_MAX_ROLL_CHANCE) return $hi;
    return r_rand_int($rng, $lo, $hi - 1);
}

// ---------------------------------------------------------------- 생성

function r_scale_base(array $base, int $level): array {
    $out = [];
    foreach ($base as $k => $v) $out[$k] = max($v, r_round($v * (1 + ($level - 1) * 0.2)));
    return $out;
}

function r_id(int $version, string $source, int $lv, string $seed, int $rev = 0): string {
    $r = $rev ? "r{$rev}" : '';
    [$h1, $h2] = r_hash_seed("{$version}{$r}|{$source}|{$lv}|{$seed}");
    return str_pad(dechex($h1), 8, '0', STR_PAD_LEFT) . str_pad(dechex($h2), 8, '0', STR_PAD_LEFT);
}

function r_generate(int $version, string $seed, string $source, int $level, int $rev = 0): array {
    if ($rev !== 0 && !($rev >= 1 && $rev <= 6 && $version === 4)) throw new InvalidArgumentException('bad rev');
    if (!isset(R_TABLES[$source])) throw new InvalidArgumentException('bad source');
    $lv = max(1, $level);
    if (!in_array($version, [1, 2, 3, 4], true)) throw new InvalidArgumentException('bad version');
    $rng = r_rng("v{$version}|{$seed}");
    $rarity = r_pick_weighted($rng, r_tables_for($version, $rev)[$source]);
    $type = null;
    if ($version < 3) {
        $slot = r_pick($rng, R_SLOTS_V2);
        $set = $rarity === 'set' ? 'trial' : null;
        if ($slot === 'weapon') $type = $set ? R_SETS[$set]['weapon'] : r_pick($rng, R_WEAPON_TYPES_OLD);
    } else {
        $slot = r_pick($rng, R_SLOTS);
        $set = $rarity === 'set' ? r_pick($rng, r_sets_for($slot, $version === 4 && $rev >= 4 && preg_match(R_NM_SEED, $seed) === 1)) : null;
        if ($slot === 'weapon') $type = $set ? R_SETS[$set]['weapon'] : r_pick($rng, r_weapon_types($version === 4 ? $rev : 0));
        elseif ($slot === 'offhand') $type = $set ? R_SETS[$set]['offhand'] : ($rng() < R_OFFHAND['shieldChance'] ? 'shield' : r_pick($rng, R_WEAPON_TYPES_OLD));
    }
    $item = ['v' => $version, 'seed' => $seed, 'src' => $source, 'lvl' => $lv, 'slot' => $slot, 'type' => $type, 'rarity' => $rarity, 'set' => $set];
    if ($rev) $item['r'] = $rev;   // 줄 범위가 개정마다 다를 수 있어서 먼저 (저항 줄 r4)

    if ($version === 1) {
        $stats = R_STAT_KEYS;
        $lines = [];
        for ($i = 0; $i < R_RARITIES[$rarity]['lines']; $i++) {
            $stat = array_splice($stats, (int)floor($rng() * count($stats)), 1)[0];
            [$lo, $hi] = r_line_range($stat, $lv);
            $lines[] = [$stat, r_rand_int($rng, $lo, $hi)];
        }
        $item['base'] = r_scale_base($type ? R_WEAPONS[$type]['base'] : R_ARMOR[$slot]['base'], $lv);
        $item['lines'] = $lines;
        $item['id'] = r_id(1, $source, $lv, $seed);
        $item['ancient'] = false;
        return $item;
    }
    $pool = $version >= 4 ? r_main_pool_v4($item) : R_MAIN_POOL[r_weapon_like($item) ? 'weapon' : 'armor'];
    [$cLo, $cHi] = ($version >= 4 ? R_MAIN_COUNT_V4 : R_MAIN_COUNT)[$rarity];
    $count = min(count($pool), r_rand_int($rng, $cLo, $cHi));
    $rest = array_slice($pool, 1);
    $mainStats = [$pool[0]];
    while (count($mainStats) < $count) $mainStats[] = array_splice($rest, (int)floor($rng() * count($rest)), 1)[0];
    $item['main'] = [];
    foreach ($mainStats as $stat) $item['main'][] = [$stat, r_roll_range($rng, r_main_range($stat, $item))];

    $nightmare = $version === 4 && $rev >= 3 && preg_match(R_NM_SEED, $seed) === 1;
    $stats = $nightmare ? R_STAT_KEYS_NM : ($version >= 4 ? R_STAT_KEYS_V4 : R_STAT_KEYS);
    if ($version === 4 && $rev >= 6 && r_socket_range($item)) $stats[] = 'socket';
    $item['lines'] = [];
    for ($i = 0; $i < R_RARITIES[$rarity]['lines']; $i++) {
        $stat = array_splice($stats, (int)floor($rng() * count($stats)), 1)[0];
        $item['lines'][] = [$stat, r_roll_range($rng, r_line_range_of($stat, $item))];
    }
    if ($type === 'shield') $item['parry'] = r_rand_int($rng, ...R_PARRY['ranges'][$rarity]);
    $item['id'] = r_id($version, $source, $lv, $seed, $rev);
    if ($rev) {
        $item['r'] = $rev;
        // 고대 굴림 (items.js와 같은 시드): 걸리면 모든 능력치·패링을 최대치로
        if (($rarity === 'legendary' || $rarity === 'set') && r_rng("anc|{$item['id']}")() < R_ANCIENT_CHANCE) $item = r_max_out($item);
    }
    if ($nightmare) $item = r_one_element_dmg($item, $stats, "v{$version}|{$seed}");
    $item['ancient'] = r_is_ancient($item);
    return $item;
}

// 모든 능력치(주·추가·패링)를 범위의 최대치로
function r_max_out(array $item): array {
    foreach ($item['main'] as $i => [$k, $v]) $item['main'][$i][1] = r_main_range($k, $item)[1];
    foreach ($item['lines'] as $i => [$k, $v]) $item['lines'][$i][1] = r_line_range_of($k, $item)[1];
    if (isset($item['parry'])) $item['parry'] = R_PARRY['ranges'][$item['rarity']][1];
    return $item;
}

// 대장간 옵션 재련 (items.js reforgeLine): rf = 고른 추가 능력치 줄 번호 목록. n번째 재련은 시드 rf|ID|n
// 후보는 그 아이템의 추가 능력치 후보 중 다른 줄에 없는 것 (속성 피해는 하나만), 고대면 최대치. 레전더리·세트(v4)만, 홈 줄은 안 됨
function r_reforge_line(array $item, int $i): ?array {
    if (($item['v'] ?? 0) !== 4 || !isset($item['main']) || ($item['rarity'] !== 'legendary' && $item['rarity'] !== 'set')) return null;
    if (!isset($item['lines'][$i]) || $item['lines'][$i][0] === 'socket') return null;
    $n = count($item['rf'] ?? []) + 1;
    $rng = r_rng("rf|{$item['id']}|{$n}");
    $nightmare = r_is_nightmare_item($item) && ($item['r'] ?? 0) >= 3;
    $others = [];
    foreach ($item['lines'] as $j => [$k]) if ($j !== $i) $others[] = $k;
    $elemTaken = false;
    foreach ($others as $k) if (r_is_element_dmg($k)) $elemTaken = true;
    $pool = [];
    foreach ($nightmare ? R_STAT_KEYS_NM : R_STAT_KEYS_V4 as $k) if (!in_array($k, $others, true) && !($elemTaken && r_is_element_dmg($k))) $pool[] = $k;
    $stat = $pool[(int)floor($rng() * count($pool))];
    $range = r_line_range_of($stat, $item);
    $v = r_roll_range($rng, $range);
    $item['lines'][$i] = [$stat, !empty($item['ancient']) ? $range[1] : $v];
    $item['rf'] = array_merge($item['rf'] ?? [], [$i]);
    $item['ancient'] = r_is_ancient($item);
    return $item;
}
function r_apply_reforges(array $item, array $rf): ?array {
    foreach ($rf as $i) if (!is_int($i) || !isset($item['lines'][$i]) || $item['lines'][$i][0] === 'socket') return null;
    foreach ($rf as $i) {
        if (!is_int($i)) return null;
        $item = r_reforge_line($item, $i);
        if ($item === null) return null;
    }
    return $item;
}

// 고대 다시 굴리기: ar번째 굴림이 고대였으면 최대치로 (고대가 되면 더 굴리지 않으므로 마지막 굴림만 봄)
function r_apply_ancient_rerolls(array $item, int $ar): array {
    if ($ar < 1) return $item;
    if (($item['v'] ?? 0) !== 4 || !isset($item['main']) || ($item['rarity'] !== 'legendary' && $item['rarity'] !== 'set')) return $item;
    $item['ar'] = $ar;
    if (!$item['ancient'] && r_rng("anc|{$item['id']}|re{$ar}")() < R_ANCIENT_REROLL['chance']) {
        $item = r_max_out($item);
        $item['ancient'] = r_is_ancient($item);
    }
    return $item;
}

// 고대: 최고 등급(레전더리·세트)이면서 모든 능력치(방패는 패링도)가 최대치
// 전설의 힘 (items.js LEGEND): v4 레전더리의 완성도에 따라 공격력·방어력·최대 HP +%
const R_LEGEND = ['start' => 0.6, 'max' => 12, 'allRes' => 4];
function r_completeness(array $item): float {
    if (!isset($item['main'])) return 0;
    $sum = 0; $n = 0;
    $add = function (array $r, int $v) use (&$sum, &$n) { [$lo, $hi] = $r; $sum += $hi > $lo ? ($v - $lo) / ($hi - $lo) : 1; $n++; };
    foreach ($item['main'] as [$k, $v]) $add(r_main_range($k, $item), $v);
    foreach ($item['lines'] as [$k, $v]) $add(r_line_range_of($k, $item), $v);
    if (isset($item['parry'])) $add(R_PARRY['ranges'][$item['rarity']], $item['parry']);
    return $n ? $sum / $n : 0;
}
function r_legend_curve(array $item): float {
    if (($item['v'] ?? 0) !== 4 || $item['rarity'] !== 'legendary' || !isset($item['main'])) return 0;
    $c = max(0, min(1, (r_completeness($item) - R_LEGEND['start']) / (1 - R_LEGEND['start'])));
    return $c * $c;
}
function r_legend_power(array $item): int { return r_round(R_LEGEND['max'] * r_legend_curve($item)); }
function r_legend_res(array $item): int { return r_round(R_LEGEND['allRes'] * r_legend_curve($item)); }

function r_is_ancient(array $item): bool {
    if (!isset($item['main']) || ($item['rarity'] !== 'legendary' && $item['rarity'] !== 'set')) return false;
    if (isset($item['parry']) && $item['parry'] !== R_PARRY['ranges'][$item['rarity']][1]) return false;
    foreach ($item['main'] as [$k, $v]) if ($v !== r_main_range($k, $item)[1]) return false;
    foreach ($item['lines'] as [$k, $v]) if ($v !== r_line_range_of($k, $item)[1]) return false;
    return true;
}

// 몬스터·포션 자리 드롭이 실제로 나오는 시드인지 (items.js rollDrop의 첫 굴림)
function r_drop_roll(int $version, string $seed): float {
    $rng = r_rng("v{$version}|drop?|{$seed}");
    return $rng();
}

// ---------------------------------------------------------------- 강화 / 합계 / 이름

function r_main_stats(array $item): array {
    if (isset($item['main'])) return $item['main'];
    $out = [];
    foreach ($item['base'] ?? [] as $k => $v) $out[] = [$k, $v];
    return $out;
}

// 나이트메어 아이템의 힘 (items.js NM_POWER): 주 능력치 공격력·방어력·최대 HP가 mul배. 굴린 값은 그대로, 계산할 때 곱함
const R_NM_POWER = ['mul' => 3, 'stats' => ['atk', 'def', 'hp']];
function r_nm_power(array $item, string $stat): int {
    return r_is_nightmare_item($item) && in_array($stat, R_NM_POWER['stats'], true) ? R_NM_POWER['mul'] : 1;
}

function r_enhanced_base(array $item): array {
    $n = (int)($item['enh'] ?? 0);
    $out = [];
    foreach (r_main_stats($item) as [$k, $v]) {
        $v = $v * r_nm_power($item, $k);
        // 저항(장검의 모든 속성 저항)은 강화로 오르지 않음
        if (isset(R_RES_R4[$k])) { $out[$k] = $v; continue; }
        if (($item['v'] ?? 0) >= 4 && R_STAT_NAMES[$k][1]) { $out[$k] = $v + intdiv($n, 2); continue; }
        $floor = R_STAT_NAMES[$k][1] ? intdiv($n, 2) : $n;
        $out[$k] = $v + ($n ? max($floor, r_round($v * R_ENHANCE['statPerLevel'] * $n)) : 0);
    }
    return $out;
}

function r_enhanced_lines(array $item): array {
    $lines = [];
    foreach ($item['lines'] as [$k, $v]) $lines[] = [$k, $v, 0];
    if (!$lines) return $lines;
    // 오를 줄: 저항 줄은 빼고 고름
    $can = [];
    foreach ($lines as $i => [$k]) if (!isset(R_RES_R4[$k]) && $k !== 'socket') $can[] = $i;   // 홈도 안 오름
    foreach (R_ENHANCE['lineSteps'] as $step) {
        if ((int)($item['enh'] ?? 0) < $step || !$can) break;
        $rng = r_rng("enhline|{$item['id']}|{$step}");
        $i = $can[(int)floor($rng() * count($can))];
        $add = r_line_boost($item, $lines[$i][0]);
        $lines[$i][1] += $add;
        $lines[$i][2] += $add;
    }
    foreach ($lines as $i => [$k, $v]) {
        if (r_is_element_dmg($k) && $v > R_ELEMENT_DMG_CAP) { $lines[$i][2] -= $v - R_ELEMENT_DMG_CAP; $lines[$i][1] = R_ELEMENT_DMG_CAP; }
    }
    return $lines;
}

function r_line_boost(array $item, string $stat): int {
    $fixed = r_fixed_pct($item, R_PCT_LINE, $stat);
    if ($fixed) return max(1, r_round($fixed[1] * R_PCT_LINE_BOOST));
    return max(1, r_round(r_line_range($stat, $item['lvl'])[1] * R_ENHANCE['lineBoost']));
}

// 예전(v2·v3) 아이템의 % 능력치 상한: 같은 등급 v4 최대치 + 강화로 오를 수 있는 만큼 (items.js oldCap)
function r_old_cap(array $item, string $kind, string $stat): ?int {
    $v = $item['v'] ?? 0;
    if (!($v >= 2 && $v < 4)) return null;
    $n = (int)($item['enh'] ?? 0);
    if ($kind === 'main') {
        $r = r_pct_of(R_PCT_MAIN, $stat, $item['rarity']);
        return $r ? $r[1] + intdiv($n, 2) : null;
    }
    $r = r_pct_of(R_PCT_LINE, $stat, $item['rarity']);
    if (!$r) return null;
    $steps = count(array_filter(R_ENHANCE['lineSteps'], function ($s) use ($n) { return $n >= $s; }));
    return $r[1] + max(1, r_round($r[1] * R_PCT_LINE_BOOST)) * $steps;
}
function r_effective_base(array $item): array {
    $out = r_enhanced_base($item);
    foreach ($out as $k => $v) { $cap = r_old_cap($item, 'main', $k); if ($cap !== null) $out[$k] = min($v, $cap); }
    return $out;
}
function r_effective_lines(array $item): array {
    $out = [];
    foreach (r_enhanced_lines($item) as [$k, $v, $plus]) { $cap = r_old_cap($item, 'line', $k) ?? r_old_res_cap($item, $k); $out[] = [$k, $cap !== null ? min($v, $cap) : $v, $plus]; }
    return $out;
}

function r_totals(array $equipped): array {
    $sum = ['atk' => 0, 'def' => 0, 'hp' => 0, 'crit' => 0, 'lifesteal' => 0, 'gold' => 0, 'xp' => 0, 'killHeal' => 0,
        'atkPct' => 0, 'defPct' => 0, 'hpPct' => 0, 'critDmg' => 0, 'killHealPct' => 0, 'dmgReduce' => 0, 'parry' => 0, 'splash' => 0, 'dual' => 0, 'guard' => 0,
        'legend' => 0, 'fireball' => 0, 'fireballPct' => 0, 'fireballBurn' => 0, 'nova' => 0, 'novaPct' => 0, 'novaSlow' => 0, 'chain' => 0, 'chainPct' => 0, 'chainMax' => 0,
        'fireDmg' => 0, 'iceDmg' => 0, 'boltDmg' => 0, 'fireRes' => 0, 'iceRes' => 0, 'boltRes' => 0, 'allRes' => 0];
    $setCounts = [];
    $shieldOnly = false;
    foreach ($equipped as $item) if (r_is_shield_only($item)) $shieldOnly = true;
    foreach ($equipped as $item) {
        if ($shieldOnly && $item['slot'] === 'offhand' && r_weapon_like($item)) continue;   // 장검과 보조무기는 같이 못 씀
        foreach (r_effective_base($item) as $k => $v) $sum[$k] += $v;
        foreach (r_effective_lines($item) as [$k, $v]) if ($k !== 'socket') $sum[$k] += $v;
        foreach (r_gem_stats($item) as $k => $v) $sum[$k] += $v;
        if (!empty($item['parry'])) $sum['parry'] += $item['parry'];
        if ($item['slot'] === 'offhand' && r_weapon_like($item)) $sum['dual'] = 1;
        if (!empty($item['set'])) $setCounts[$item['set']] = ($setCounts[$item['set']] ?? 0) + 1;
        // 전설의 힘: 공격력·방어력·최대 HP +%
        $lp = r_legend_power($item);
        if ($lp) { $sum['atkPct'] += $lp; $sum['defPct'] += $lp; $sum['hpPct'] += $lp; $sum['legend'] += $lp; }
        $sum['allRes'] += r_legend_res($item);
    }
    $sets = [];
    foreach ($setCounts as $id => $count) {
        $set = R_SETS[$id];
        $bonuses = [];
        foreach ($set['bonuses'] as $b) {
            $on = $count >= $b['count'];
            if ($on) foreach ($b['stats'] as $k => $v) $sum[$k] += $v;
            $bonuses[] = ['count' => $b['count'], 'text' => $b['text'], 'on' => $on];
        }
        $sets[] = ['id' => $id, 'name' => $set['name'], 'count' => $count, 'full' => r_set_full($id), 'bonuses' => $bonuses];
    }
    $sum['parry'] = min(R_PARRY['max'], $sum['parry']);
    // 장검 + 방패: 흡혈 +R_SHIELD_GUARD['lifesteal'], 상한 R_SHIELD_GUARD['cap'] (items.js SHIELD_GUARD)
    $shieldWorn = false;
    foreach ($equipped as $item) if ($item['slot'] === 'offhand' && ($item['type'] ?? null) === 'shield') $shieldWorn = true;
    if ($shieldOnly && $shieldWorn) { $sum['guard'] = 1; $sum['lifesteal'] += R_SHIELD_GUARD['lifesteal']; }
    $sum['lifesteal'] = min($sum['guard'] ? R_SHIELD_GUARD['cap'] : R_LIFESTEAL_MAX, $sum['lifesteal']);
    $sum['dmgReduce'] = min(R_GEM_CAPS['dmgReduce'], $sum['dmgReduce']);
    $sum['splash'] = $sum['splash'] ? 1 : 0;
    return ['stats' => $sum, 'sets' => $sets];
}

function r_item_name(array $item): string {
    $el = r_is_nightmare_item($item) ? r_item_element($item) : null;
    $nm = r_is_nightmare_item($item) ? '악몽의 ' . ($el ? R_ELEMENT_NAMES[$el] . ' ' : '') : '';   // 속성 피해 줄이 없으면 속성 이름 없이
    $plus = (!empty($item['ancient']) ? '고대 ' : '') . (!empty($item['enh']) ? "+{$item['enh']} " : '') . $nm;
    if (!empty($item['set'])) return $plus . R_SETS[$item['set']]['pieces'][$item['slot']];
    return $plus . R_RARITIES[$item['rarity']]['name'] . ' ' . r_kind_name($item);
}

// 아이템 종류 이름: 단검 / 보조 단검 / 방패 / 투구…
function r_kind_name(array $item): string {
    if ($item['slot'] === 'offhand') return $item['type'] === 'shield' ? R_OFFHAND['shieldName'] : R_OFFHAND['weaponPrefix'] . ' ' . R_WEAPONS[$item['type']]['name'];
    return $item['type'] ? R_WEAPONS[$item['type']]['name'] : R_ARMOR[$item['slot']]['name'];
}

// 게임 화면의 stats()와 같은 최종 능력치. 레벨로 오르는 기본치: HP 20 + 4/레벨, 공격력 3 + 1/레벨
function r_player_stats(int $plvl, array $totals): array {
    $g = $totals['stats'];
    $pct = function (float $v, float $p): int { return r_round($v * (1 + $p / 100)); };
    $maxHp = $pct(20 + 4 * ($plvl - 1) + $g['hp'], $g['hpPct']);
    return [
        'level' => $plvl,
        'maxHp' => $maxHp,
        'atk' => $pct(3 + ($plvl - 1) + $g['atk'], $g['atkPct']),
        'def' => $pct($g['def'], $g['defPct']),
        'crit' => min(75, $g['crit']),
        'critMul' => 2 + $g['critDmg'] / 100,
        'lifesteal' => $g['lifesteal'],
        'gold' => $g['gold'],
        'xp' => $g['xp'],
        'killHeal' => $g['killHeal'] + r_round($maxHp * $g['killHealPct'] / 100),
        'parry' => $g['parry'],
        'dmgReduce' => $g['dmgReduce'],
        'dual' => (bool)$g['dual'],
        'splash' => (bool)$g['splash'],
        'elem' => ['fire' => $g['fireDmg'], 'ice' => $g['iceDmg'], 'bolt' => $g['boltDmg']],
        'res' => ['fire' => min(R_RES_CAP, $g['fireRes'] + $g['allRes']), 'ice' => min(R_RES_CAP, $g['iceRes'] + $g['allRes']), 'bolt' => min(R_RES_CAP, $g['boltRes'] + $g['allRes'])],
    ];
}
