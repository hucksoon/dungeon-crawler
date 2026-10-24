// English (용어: docs/i18n-glossary.md)
(function (root) {
  "use strict";
  const L = root.RLI18N || (typeof require === "function" ? require("../i18n.js") : null);
  if (!L) return;

  const EL_SUFFIX = { fire: "of Flame", ice: "of Frost", bolt: "of Thunder" };
  const join = (...a) => a.filter(Boolean).join(" ");

  L.add("en", {
    data: {
      rarity: { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary", set: "Set", unique: "Unique" },
      slot: { head: "Head", chest: "Chest", arms: "Arms", pants: "Legs", boots: "Feet", weapon: "Weapon", offhand: "Off-hand", neck: "Necklace", ring: "Ring", ring1: "Ring 1", ring2: "Ring 2" },
      stat: {
        atk: "Attack", def: "Defense", hp: "Max HP", crit: "Critical Chance", parry: "Parry Chance", lifesteal: "Lifesteal",
        gold: "Gold Find", xp: "XP Gain", atkPct: "Attack", defPct: "Defense", hpPct: "Max HP", critDmg: "Critical Damage",
        killHealPct: "HP on Kill (% of Max)", dmgReduce: "Damage Reduction", splash: "Splash (1 tile)",
        fireDmg: "Fire Damage", iceDmg: "Ice Damage", boltDmg: "Lightning Damage",
        fireRes: "Fire Resistance", iceRes: "Ice Resistance", boltRes: "Lightning Resistance", allRes: "All Resistances",
        socket: "Socket", skillPct: "Skill Damage", power: "Attack · Defense · Max HP",
        fireResMax: "Max Fire Resistance", iceResMax: "Max Ice Resistance", boltResMax: "Max Lightning Resistance", allResMax: "Max All Resistances",
        lsCap: "Max Lifesteal", mf: "Magic Find",
      },
      weapon: { dagger: "Dagger", staff: "Staff", axe: "Axe", longsword: "Longsword" },
      armor: { head: "Helm", chest: "Armor", arms: "Bracers", pants: "Leggings", boots: "Boots" },
      accessory: { neck: "Necklace", ring: "Ring" },
      offhand: { shield: "Shield", prefix: "Off-hand" },
      set: {
        trial: { name: "Set of Trials", pieces: { head: "Helm of Trials", chest: "Armor of Trials", arms: "Bracers of Trials", pants: "Leggings of Trials", boots: "Boots of Trials", weapon: "Axe of Trials" }, bonuses: ["Max HP +20%, Defense +20%", "Attack +25%, Critical Chance +10%", "Critical Damage +100%, Damage Taken −10%, restore 15% of Max HP when you kill an enemy"] },
        frenzy: { name: "Frenzy Set", pieces: { weapon: "Frenzy Right-Hand Blade", offhand: "Frenzy Left-Hand Blade" }, bonuses: ["When you attack, enemies within 1 tile of the target also take 50% of the damage"] },
        inferno: { name: "Inferno Set", pieces: { head: "Inferno Helm", chest: "Inferno Armor", arms: "Inferno Bracers", pants: "Inferno Leggings", boots: "Inferno Boots" }, bonuses: ["Fireball: every 2 turns, a 3×3 explosion centered on the nearest enemy within 3 tiles (80% of Attack as fire damage, ignores Defense)", "All enemies hit by Fireball are burned", "Fireball damage +50%, Max HP +15%, Fire Resistance +20%"] },
        frost: { name: "Frost Set", pieces: { head: "Frost Helm", chest: "Frost Armor", arms: "Frost Bracers", pants: "Frost Leggings", boots: "Frost Boots" }, bonuses: ["Frost Nova: every 2 turns, 70% of Attack as ice damage to all enemies in the 8 tiles around you (ignores Defense)", "All enemies hit by Frost Nova are slowed (except those immune to ice)", "Frost Nova damage +50%, Defense +10%, Ice Resistance +20%"] },
        storm: { name: "Storm Set", pieces: { head: "Storm Helm", chest: "Storm Armor", arms: "Storm Bracers", pants: "Storm Leggings", boots: "Storm Boots" }, bonuses: ["Chain Lightning: every 2 turns, lightning bounces 2 times starting from the nearest enemy within 3 tiles (different enemies, 40% of Attack as lightning damage per hit, ignores Defense)", "Lightning bounces 4 times, hitting the same enemy again if there's no other to bounce to (4 times on a lone enemy). Hit enemies are shocked: +20% damage taken for 3 turns", "Chain Lightning damage +50%, Critical Chance +10%, Lightning Resistance +20%"] },
        sturdy: { name: "Steadfast Set", pieces: { weapon: "Steadfast Longsword", offhand: "Steadfast Shield" }, bonuses: ["Parry Chance +15% (up to 40% with a shield)"] },
      },
      recommend: {
        normal: { name: "Normal", goal: "Normal floor 75", acc: "High Attack · Defense · Max HP, enhanced to +10 (no resistance lines needed in the Normal Dungeon)" },
        nightmare: { name: "Nightmare", goal: "Nightmare floor 50", acc: "2 elemental resistance lines (the element you're short on + All Resistances), enhanced to +10" },
        hell: { name: "Hell", goal: "Hell floor 50", acc: "Karma Necklace + 2 Foxfire Rings (Ring of the Underworld if short on Lifesteal), enhanced to +10. Resistance lines: All Resistances" },
        kind: { weapon: "Dagger · Staff · Axe (not Longsword)", offhand: "Off-hand Dagger · Staff · Axe (not Shield)" },
      },
      gem: { ruby: "Ruby", sapphire: "Sapphire", emerald: "Emerald", topaz: "Topaz", diamond: "Diamond" },
      gemGrade: ["Chipped", "Gem", "Perfect"],
      runeword: {
        천하무적: "Invincible", 폭풍전야: "Calm Before the Storm", 필살일격: "Killing Blow", 태산: "Mount Tai", 카리스마: "Charisma",
        마음가짐: "Resolve", 선견지명: "Foresight", 도원결의: "Peach Garden Oath", 기억: "Memory", 몰래: "Stealth", 나무: "Tree",
      },
      unique: {
        fang: { name: "Fang", text: "Bite: enemies you hit take +12% damage for 3 turns · Magic Find +20%" },
        ironscale: { name: "Ironscale Armor", text: "Ironscale: +3% Defense each time you are hit (up to +15%, resets when you leave the floor)" },
        foxorb: { name: "Fox Bead Staff", text: "Fox Bead: Frost Nova (even without the Frost Set), restore 3% Max HP when you kill an enemy" },
        binyeo: { name: "Gumiho's Hairpin", text: "Bewitch: 12% chance to dodge monster attacks" },
        yeouiju: { name: "Dragon Pearl Sword", text: "Dragon Pearl: Chain Lightning (even without the Storm Set), lightning bounces 2 more times and hits the same monster again if no other monster is near" },
        dragonboots: { name: "Dragonscale Boots", text: "Dragonscale: a shield of 8% Max HP every 2 turns" },
        scythe: { name: "Reaper's Scythe", text: "Soul Harvest: +2% Attack for each enemy you kill (up to +30%, resets when you leave the floor)" },
        chains: { name: "Chains of the Underworld", text: "Underworld: +15% damage to elites and bosses" },
        mirror: { name: "Mirror of Karma", text: "Karma: returns 30% of damage taken to the attacker (even when blocked, based on the damage you would have taken), Parry Chance +15%" },
        robe: { name: "Yeomra's Robe", text: "King of the Underworld: All Resistances +20%, Max HP +30%, 30% chance to survive a fatal blow with 1 HP" },
        ironfang: { name: "Ironfang Necklace", text: "Ironfang: Max Fire Resistance +5% (75 → 80%) · Magic Find +20%" },
        foxfire: { name: "Foxfire Ring", text: "Foxfire: Critical Chance +3%, Critical Damage +10% (doubled with two)" },
        yeoui: { name: "Wishing Ring", text: "Wish: Max Lightning Resistance +3%, Magic Find +15% (doubled with two)" },
        myeongbu: { name: "Ring of the Underworld", text: "Underworld: Max Lifesteal +2pp (+4pp with two)" },
        eopgyeong: { name: "Karma Necklace", text: "Karma Mirror: Max All Resistances +5% (75 → 80%)" },
      },
      element: { names: { fire: "Fire", ice: "Ice", bolt: "Lightning" }, prefix: { fire: "Blazing", ice: "Frost", bolt: "Thunder" } },
      stone: { stones: "Enhancement Stone", nmStones: "Nightmare Stone", hellStones: "Hell Stone" },
      base: { chest: "Armor", head: "Helm", shield: "Shield", longsword: "Longsword", weapon: "Weapon (Dagger · Axe · Staff)", staff: "Staff" },
      monster: {
        rat: "Rat", bat: "Bat", kobold: "Kobold", goblin: "Goblin", skeleton: "Skeleton Soldier", zombie: "Zombie", orc: "Orc", wolf: "Wolf",
        spider: "Giant Spider", troll: "Troll", harpy: "Harpy", wraith: "Wraith", dark_knight: "Dark Knight", minotaur: "Minotaur",
        chimera: "Chimera", lich: "Lich", fire_spirit: "Fire Elemental", vampire: "Vampire", drake: "Young Dragon", hydra: "Hydra",
        ghoul: "Ghoul", basilisk: "Basilisk", gargoyle: "Gargoyle", naga: "Naga", wyvern: "Wyvern", death_knight: "Death Knight",
        banshee: "Banshee", golem: "Stone Golem", manticore: "Manticore", frost_giant: "Frost Giant", specter: "Specter", demon: "Demon",
        behemoth: "Behemoth", kraken: "Kraken", phoenix: "Phoenix", shadow_dragon: "Shadow Dragon", archdemon: "Archdemon", titan: "Titan",
        void_lord: "Void Lord", ancient_dragon: "Ancient Dragon",
        goblin_king: "Goblin King", ogre_chief: "Ogre Chieftain", lich_lord: "Lich Lord",
      },
      golden: { normal: "Golden Goblin", elite: "Elite Golden Goblin", king: "Golden Goblin King" },
      named: {
        bulgasari: { name: "Bulgasari", title: "The Iron-Eating Beast" },
        gumiho: { name: "Gumiho", title: "The Nine-Tailed Fox" },
        imugi: { name: "Imugi", title: "The Serpent Who Never Became a Dragon" },
        jeoseung: { name: "Jeoseung Saja", title: "Envoy of the Underworld" },
        yeomra: { name: "Yeomra Daewang", title: "King of the Underworld" },
      },
    },
    fmt: {
      // +10 Ancient Legendary Hell Helm of Frost / +10 Ancient Hell Inferno Helm / +10 Ancient Invincible
      itemName(p) {
        const head = join(p.enh ? `+${p.enh}` : "", p.ancient ? "Ancient" : "");
        if (p.special) return join(head, p.special);
        const zone = p.zone === "hell" ? "Hell" : p.zone === "nm" ? "Nightmare" : "";
        const suffix = p.el && EL_SUFFIX[p.el] ? ` ${EL_SUFFIX[p.el]}` : "";
        if (p.set) return join(head, zone, p.set) + suffix;
        return join(head, p.rarity, zone, p.kind) + suffix;
      },
    },
    text: {
      "kind.offhand": (p, n) => `${p} ${n}`,
      "gem.name": (n, g) => (g === 0 ? `Chipped ${n}` : g === 2 ? `Perfect ${n}` : n),
      "rune.name": (n) => `${n} Rune`,
      "stat.socket": (n) => `${n} Socket${n === 1 ? "" : "s"}`,
      "mon.elite": (n) => `Elite ${n}`,
      "mon.nm": "Nightmare",
      "mon.hell": "Hell",
      "mon.zone": (z, p, b) => join(p, z, b),
      "rw.undying": "Undying: survive a fatal blow with 1 HP (once per floor)",
      "rw.teleport": (n) => `Teleport: move ${n} tiles at once when no enemy is in sight (picks up items on the way)`,
      "rw.chain": "Casts Chain Lightning (no set needed)",
      "rw.vuln": (e, r, v) => `Every ${e} turns, monsters within ${r} tiles get −${v}% resistances (elemental damage and skills hit harder)`,
      "rw.splash": (v) => `Frenzy: enemies next to your target also take ${v}% of the damage`,
      "rw.shield": (e, v) => `Every ${e} turns, a shield of ${v}% Max HP (does not stack)`,
      "rw.skillLs": "Lifesteal also works on set skills (Fireball · Frost Nova · Chain Lightning)",
      "rw.lsCap": (v) => `Max Lifesteal +${v}pp`,
      "rw.skillFast": "Set skills trigger 1 turn sooner",
      "rw.whirl": (e, v) => `Whirlwind: every ${e} turns, ${v}% of Attack to all enemies in the 8 tiles around you (with lifesteal)`,
      "rw.blast": (v) => `Corpse Blast: slain monsters explode for ${v}% of their Max HP to nearby enemies (with lifesteal, chains)`,
      "rw.counter": (v) => `Counter: when your shield blocks, strike back for ${v}% of Attack (with lifesteal)`,
      "rw.fireball": (e, v) => `Weak Fireball (every ${e} turns, ${v}% of the Inferno Set Fireball damage)`,
    },
  });
})(typeof self !== "undefined" ? self : this);
