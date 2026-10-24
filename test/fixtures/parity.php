<?php
// stdin: [{v, seed, src, lvl, enh}] → 각 아이템을 PHP 규칙으로 다시 만들어 JSON으로
require $argv[1];
$in = json_decode(stream_get_contents(STDIN), true);
$out = [];
foreach ($in['items'] as $q) {
  $it = r_generate($q['v'], $q['seed'], $q['src'], $q['lvl'], $q['r'] ?? 0);
  if (!empty($q['ar']) && function_exists('r_apply_ancient_rerolls')) $it = r_apply_ancient_rerolls($it, $q['ar']); if ($q['v'] === 4 && !empty($q['rf'])) { $x = r_apply_reforges($it, $q['rf']); if ($x) $it = $x; }
  $it['enh'] = $q['enh']; if (!empty($q['g'])) $it['gems'] = $q['g'];
  $out[] = ['item' => $it, 'name' => r_item_name($it), 'eb' => r_enhanced_base($it), 'el' => r_enhanced_lines($it), 'efb' => $q['v'] === 1 ? null : r_effective_base($it), 'efl' => $q['v'] === 1 ? null : r_effective_lines($it), 'gate' => r_drop_roll($q['v'], $q['seed'])];
}
$tot = [];
foreach ($in['sets'] as $set) {
  $items = [];
  foreach ($set['items'] as $q) { $it = r_generate($q['v'], $q['seed'], $q['src'], $q['lvl'], $q['r'] ?? 0); if (!empty($q['ar']) && function_exists('r_apply_ancient_rerolls')) $it = r_apply_ancient_rerolls($it, $q['ar']); if ($q['v'] === 4 && !empty($q['rf'])) { $x = r_apply_reforges($it, $q['rf']); if ($x) $it = $x; } $it['enh'] = $q['enh']; if (!empty($q['g'])) $it['gems'] = $q['g']; $items[] = $it; }
  $t = r_totals($items);
  $tot[] = ['t' => $t, 'ps' => r_player_stats($set['plvl'], $t)];
}
echo json_encode(['items' => $out, 'tot' => $tot], JSON_UNESCAPED_UNICODE);
