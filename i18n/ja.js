// 日本語 (용어: docs/i18n-glossary.md · 네임드는 일본 관용 이름)
(function (root) {
  "use strict";
  const L = root.RLI18N || (typeof require === "function" ? require("../i18n.js") : null);
  if (!L) return;

  const EL = { fire: "火", ice: "氷", bolt: "雷" };
  const join = (...a) => a.filter(Boolean).join(" ");

  L.add("ja", {
    data: {
      rarity: { common: "コモン", uncommon: "アンコモン", rare: "レア", epic: "エピック", legendary: "レジェンダリー", set: "セット", unique: "ユニーク" },
      slot: { head: "頭", chest: "胴", arms: "腕", pants: "脚", boots: "足", weapon: "武器", offhand: "サブ", neck: "ネックレス", ring: "指輪", ring1: "指輪 1", ring2: "指輪 2" },
      stat: {
        atk: "攻撃力", def: "防御力", hp: "最大HP", crit: "クリティカル率", parry: "パリィ率", lifesteal: "吸血",
        gold: "ゴールド獲得", xp: "経験値獲得", atkPct: "攻撃力", defPct: "防御力", hpPct: "最大HP", critDmg: "クリティカルダメージ",
        killHealPct: "撃破時 最大HP回復", dmgReduce: "被ダメージ軽減", splash: "周囲1マスにダメージ",
        fireDmg: "火ダメージ", iceDmg: "氷ダメージ", boltDmg: "雷ダメージ",
        fireRes: "火耐性", iceRes: "氷耐性", boltRes: "雷耐性", allRes: "全属性耐性",
        socket: "ソケット", skillPct: "スキルダメージ", power: "攻撃力・防御力・最大HP",
        fireResMax: "火耐性上限", iceResMax: "氷耐性上限", boltResMax: "雷耐性上限", allResMax: "全属性耐性上限",
        lsCap: "吸血上限", mf: "マジックファインド",
      },
      weapon: { dagger: "短剣", staff: "杖", axe: "斧", longsword: "長剣" },
      armor: { head: "兜", chest: "鎧", arms: "籠手", pants: "レギンス", boots: "ブーツ" },
      accessory: { neck: "ネックレス", ring: "指輪" },
      offhand: { shield: "盾", prefix: "サブ" },
      set: {
        trial: { name: "試練のセット", pieces: { head: "試練の兜", chest: "試練の鎧", arms: "試練の籠手", pants: "試練のレギンス", boots: "試練のブーツ", weapon: "試練の斧" } },
        frenzy: { name: "狂乱のセット", pieces: { weapon: "狂乱の右手武器", offhand: "狂乱の左手武器" } },
        inferno: { name: "業火のセット", pieces: { head: "業火の兜", chest: "業火の鎧", arms: "業火の籠手", pants: "業火のレギンス", boots: "業火のブーツ" } },
        frost: { name: "霜のセット", pieces: { head: "霜の兜", chest: "霜の鎧", arms: "霜の籠手", pants: "霜のレギンス", boots: "霜のブーツ" } },
        storm: { name: "雷電のセット", pieces: { head: "雷電の兜", chest: "雷電の鎧", arms: "雷電の籠手", pants: "雷電のレギンス", boots: "雷電のブーツ" } },
        sturdy: { name: "堅固のセット", pieces: { weapon: "堅固の長剣", offhand: "堅固の盾" } },
      },
      gem: { ruby: "ルビー", sapphire: "サファイア", emerald: "エメラルド", topaz: "トパーズ", diamond: "ダイヤモンド" },
      gemGrade: ["欠片", "宝石", "完璧"],
      runeword: {
        천하무적: "天下無敵", 폭풍전야: "嵐の前", 필살일격: "必殺の一撃", 태산: "泰山", 카리스마: "カリスマ",
        마음가짐: "心構え", 선견지명: "先見の明", 도원결의: "桃園の誓い", 기억: "記憶", 몰래: "忍び足", 나무: "大樹",
      },
      unique: {
        fang: { name: "牙", text: "噛みつき: 攻撃した敵は3ターンの間 受けるダメージ+12% · マジックファインド+20%" },
        ironscale: { name: "鉄鱗の鎧", text: "鉄鱗: 攻撃を受けるたびに防御力+3% (最大+15%、階を離れると解除)" },
        foxorb: { name: "狐玉の杖", text: "狐玉: フロストノヴァ (霜のセットなしでも)、敵を倒すと最大HPの3%回復" },
        binyeo: { name: "九尾の狐のかんざし", text: "魅了: 12%の確率でモンスターの攻撃を回避" },
        yeouiju: { name: "如意宝珠の剣", text: "如意宝珠: チェインライトニング (雷電のセットなしでも)、雷が2回多く跳ね、周りに他のモンスターがいなければ同じモンスターに再び当たる" },
        dragonboots: { name: "竜鱗のブーツ", text: "竜鱗: 2ターンごとに最大HPの8%のバリア" },
        scythe: { name: "死神の鎌", text: "魂の収穫: 敵を倒すたびに攻撃力+2% (最大+30%、階を離れると解除)" },
        chains: { name: "冥府の鎖", text: "冥府: エリート・ボスへのダメージ+15%" },
        mirror: { name: "浄玻璃の鏡", text: "業報: 受けたダメージの30%を攻撃したモンスターに返す (防いでも受けるはずのダメージ分を返す)、パリィ率+15%" },
        robe: { name: "閻魔の官服", text: "冥土の王: 全属性耐性+20%、最大HP+30%、倒れるダメージを受けると30%の確率でHP1で耐える" },
        ironfang: { name: "鉄牙のネックレス", text: "鉄牙: 火耐性上限+5% (75 → 80%) · マジックファインド+20%" },
        foxfire: { name: "狐火の指輪", text: "狐火: クリティカル率+3%、クリティカルダメージ+10% (2つ装備すると2倍)" },
        yeoui: { name: "如意の指輪", text: "如意: 雷耐性上限+3%、マジックファインド+15% (2つ装備すると2倍)" },
        myeongbu: { name: "冥府の指輪", text: "冥府: 吸血上限+2pt (2つで+4pt)" },
        eopgyeong: { name: "浄玻璃のネックレス", text: "浄玻璃: 全属性耐性上限+5% (75 → 80%)" },
      },
      element: { names: { fire: "火", ice: "氷", bolt: "雷" }, prefix: { fire: "炎の", ice: "霜の", bolt: "雷の" } },
      stone: { stones: "強化石", nmStones: "悪夢の強化石", hellStones: "地獄の強化石" },
      base: { chest: "鎧", head: "兜", shield: "盾", longsword: "長剣", weapon: "武器 (短剣・斧・杖)", staff: "杖" },
      monster: {
        rat: "ネズミ", bat: "コウモリ", kobold: "コボルト", goblin: "ゴブリン", skeleton: "スケルトン兵", zombie: "ゾンビ", orc: "オーク", wolf: "オオカミ",
        spider: "大蜘蛛", troll: "トロール", harpy: "ハーピー", wraith: "レイス", dark_knight: "暗黒騎士", minotaur: "ミノタウロス",
        chimera: "キメラ", lich: "リッチ", fire_spirit: "炎の精霊", vampire: "ヴァンパイア", drake: "ドラゴンの幼体", hydra: "ヒドラ",
        ghoul: "グール", basilisk: "バジリスク", gargoyle: "ガーゴイル", naga: "ナーガ", wyvern: "ワイバーン", death_knight: "デスナイト",
        banshee: "バンシー", golem: "ストーンゴーレム", manticore: "マンティコア", frost_giant: "フロストジャイアント", specter: "スペクター", demon: "デーモン",
        behemoth: "ベヒモス", kraken: "クラーケン", phoenix: "フェニックス", shadow_dragon: "シャドウドラゴン", archdemon: "アークデーモン", titan: "タイタン",
        void_lord: "ヴォイドロード", ancient_dragon: "エンシェントドラゴン",
        goblin_king: "ゴブリンキング", ogre_chief: "オーガ族長", lich_lord: "リッチロード",
      },
      golden: { normal: "ゴールデンゴブリン", elite: "エリートゴールデンゴブリン", king: "ゴールデンゴブリンキング" },
      named: {
        bulgasari: { name: "プルガサリ", title: "鉄を喰らう怪物" },
        gumiho: { name: "九尾の狐", title: "千年を生きた妖狐" },
        imugi: { name: "蛟竜", title: "龍になれなかった蛇" },
        jeoseung: { name: "死神", title: "冥府の使者" },
        yeomra: { name: "閻魔大王", title: "冥土の王" },
      },
    },
    fmt: {
      // 古代 +10 地獄の氷 レジェンダリー 兜 / 古代 +10 地獄の 業火の兜 / 古代 +10 天下無敵
      itemName(p) {
        const head = join(p.ancient ? "古代" : "", p.enh ? `+${p.enh}` : "");
        if (p.special) return join(head, p.special);
        const zone = (p.zone === "hell" ? "地獄の" : p.zone === "nm" ? "悪夢の" : "") + (p.zone && p.el && EL[p.el] ? EL[p.el] : "");
        if (p.set) return join(head, zone, p.set);
        return join(head, zone, p.rarity, p.kind);
      },
    },
    text: {
      "kind.offhand": (p, n) => `${p}${n}`,
      "gem.name": (n, g) => (g === 0 ? `${n}の欠片` : g === 2 ? `完璧な${n}` : n),
      "rune.name": (n) => `ルーン「${n}」`,
      "stat.socket": (n) => `ソケット ${n}個`,
      "mon.elite": (n) => `エリート${n}`,
      "mon.nm": "悪夢の",
      "mon.hell": "地獄の",
      "mon.zone": (z, p, b) => `${z}${p}${b}`,
      "rw.undying": "不死: 倒れるダメージを受けるとHP1で耐える (階ごとに1回)",
      "rw.teleport": (n) => `テレポート: 見える敵がいなければ一度に${n}マス移動 (通ったマスのアイテムも拾う)`,
      "rw.chain": "チェインライトニングを使う (セットなし)",
      "rw.vuln": (e, r, v) => `${e}ターンごとに${r}マス以内のモンスターの属性耐性 −${v}% (属性ダメージ・スキルが通りやすくなる)`,
      "rw.splash": (v) => `狂乱: 攻撃した敵の周囲1マスの敵にもダメージの${v}%`,
      "rw.shield": (e, v) => `${e}ターンごとに最大HP ${v}%のバリア (重ならない)`,
      "rw.skillLs": "セットスキル (ファイアボール・フロストノヴァ・チェインライトニング) にも吸血",
      "rw.lsCap": (v) => `吸血上限 +${v}pt`,
      "rw.skillFast": "セットスキルが1ターン早く発動",
      "rw.whirl": (e, v) => `回転斬り: ${e}ターンごとに周囲8マスの敵すべてに攻撃力の${v}% (吸血あり)`,
      "rw.blast": (v) => `撃破爆発: 倒したモンスターが爆発し、周りの敵にそのモンスターの最大HPの${v}% (吸血あり、連鎖する)`,
      "rw.counter": (v) => `反撃: 盾で防ぐとそのモンスターに攻撃力の${v}% (吸血あり)`,
      "rw.fireball": (e, v) => `弱いファイアボール (${e}ターンごと、業火のセットのファイアボールの${v}%のダメージ)`,
    },
  });
})(typeof self !== "undefined" ? self : this);
