"""
One-off fix: recompute the synthetic `war` field for every player already in
data/players.json using the corrected (cumulative, not per-season-averaged)
formula from scrape.py — without needing to re-scrape anything, since gp/ip/sv
are already stored as aggregate totals per decade-tenure.

Why: the old formula normalized stats to a "per season" rate before scoring,
which meant a player with one great season (e.g. Kevin Millwood's 2005 with
Cleveland) could out-WAR a player with a long, accumulated tenure of being
very good (e.g. CC Sabathia's 8 years with Cleveland). WAR is a counting stat
in real baseball — it should reward the accumulated value of a career/tenure,
not just its average rate. This script brings the stored data in line with
the corrected formula in scrape.py.
"""
import json
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "data" / "players.json"

# ── Mirrors of the corrected formulas/constants in scrape.py ─────────────────
# (duplicated here rather than imported, since scrape.py pulls in bs4/requests
# which aren't needed just to recompute WAR from already-scraped totals.)

ERA_AVERAGES = {
    "1940s": {"ops": 0.712, "obp": 0.327, "era": 3.62, "whip": 1.32},
    "1950s": {"ops": 0.740, "obp": 0.339, "era": 4.00, "whip": 1.38},
    "1960s": {"ops": 0.694, "obp": 0.305, "era": 3.60, "whip": 1.29},
    "1970s": {"ops": 0.715, "obp": 0.321, "era": 3.80, "whip": 1.33},
    "1980s": {"ops": 0.730, "obp": 0.323, "era": 3.95, "whip": 1.36},
    "1990s": {"ops": 0.752, "obp": 0.338, "era": 4.22, "whip": 1.41},
    "2000s": {"ops": 0.762, "obp": 0.332, "era": 4.38, "whip": 1.43},
    "2010s": {"ops": 0.728, "obp": 0.320, "era": 4.08, "whip": 1.33},
    "2020s": {"ops": 0.730, "obp": 0.318, "era": 4.10, "whip": 1.32},
}

POS_ADJ = {"C": 1.5, "SS": 1.5, "2B": 1.0, "CF": 1.0, "3B": 0.0, "LF": 0.0, "RF": 0.0, "1B": -1.0, "DH": -0.5}


def calc_batter_war(ops: float, obp: float, pos: str, decade: str, gp: int, sb: int = 0) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    # Weighted OPS: OBP is ~1.7× more valuable than SLG per wOBA research.
    # wops = ops + 0.7 * obp; era_wops = era_ops + 0.7 * era_obp
    # Average player (ops=era_ops, obp=era_obp) → ops_gain=0, no change.
    wops      = ops + 0.7 * obp
    era_wops  = ea["ops"] + 0.7 * ea["obp"]
    ops_gain  = (wops / era_wops) - 1.0
    padj      = POS_ADJ.get(pos, 0.0)
    playing_time = gp / 155.0
    # SB bonus: ~0.012 WAR per decade-total stolen base (net of ~25% CS rate,
    # ~0.12 WAR per 10 net SB, consistent with real baserunning run values).
    sb_bonus  = sb * 0.012
    return round(ops_gain * 9.0 * playing_time + padj * playing_time + playing_time * 1.5 + sb_bonus, 1)


def calc_pitcher_war(era: float, whip: float, kper9: float, ip: float,
                      gs: int, sv: int, decade: str) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    era_gain  = (ea["era"]  - era)  / ea["era"]
    whip_gain = (ea["whip"] - whip) / ea["whip"]
    if gs > 0:
        return round((era_gain * 4.0 + whip_gain * 2.5 + kper9 / 9.0 * 1.2) * (ip / 200.0), 1)
    else:
        return round((era_gain * 2.5 + whip_gain * 1.5 + kper9 / 9.0 * 0.8) * (ip / 80.0)
                     + sv * 0.025, 1)


# Positional priority for fixing mis-assigned primary positions (mirrors scrape.py).
_POS_PRIORITY = {'C': 0, 'SS': 1, 'CF': 2, '2B': 3, '3B': 4, 'RF': 5, 'LF': 6, '1B': 7}

# Players who are primarily 1B but appeared at other positions in fielding tables
_KNOWN_1B = {
    'Albert Pujols', 'Miguel Cabrera', 'Harmon Killebrew',
    'Steve Garvey', 'Jim Thome',
}

# Verified career designated hitters — override position to DH (POS_ADJ = -0.5).
# These players spent the majority of their at-bats as DH and are penalised
# unfairly when classified as 1B (POS_ADJ = -1.0).
_KNOWN_DH = {
    'Edgar Martínez',   # SEA 1990s-2000s — the archetypal DH
    'David Ortiz',      # BOS 2000s-2010s, MIN 2000s
    'Harold Baines',    # CHW/OAK/BAL/TEX 1980s-90s
    'Hal McRae',        # KCR 1970s-80s
    'Travis Hafner',    # CLE 2000s-10s
    'Don Baylor',       # various AL 1980s
    'Chili Davis',      # MIN/CAL 1990s
    'Paul Molitor',     # MIL 1980s (later DH-heavy); TOR/MIN 1990s
}

# Verified genuine center fielders — protected from the CF+one-corner → corner rule.
# These players may have LF or RF logged (spot starts) but are unmistakably CF.
_KNOWN_CF = {
    # All-time iconic CFers
    'Willie Mays', 'Mickey Mantle', 'Mike Trout', 'Ken Griffey Jr.',
    'Duke Snider', 'Larry Doby', 'Richie Ashburn',
    # Franchise CFers
    'Kirby Puckett', 'Bobby Murcer', 'Dale Murphy',
    'Jim Edmonds', 'Fred Lynn', 'Bernie Williams',
    'Mickey Rivers', 'Paul Blair', 'Elliott Maddox', 'Bill Bruton',
    'Lloyd Moseby', 'César Gerónimo', 'Mickey Stanley', 'Chet Lemon',
    'Andre Dawson',   # CF in Montreal; later RF in Chicago (separate card)
    'Jim Wynn', 'Vic Davalillo', 'Mack Jones', 'Dan Ford',
    'Al Bumbry', 'Jimmie Hall', 'Marquis Grissom', 'Ray Lankford',
    'Cleon Jones', 'Mookie Wilson', 'Phil Bradley', 'Dave Henderson',
    'Eric Davis', 'Willie Wilson', 'Ron Gant',
    'George Springer', 'Jackie Bradley Jr.', 'Kevin Kiermaier',
    'Jarren Duran', 'Coco Crisp', 'Brandon Nimmo',
}


def best_position(positions: list[str], name: str = '') -> str:
    """Pick the most appropriate primary position for a batter.

    Rules applied in order:
    0. If player is in the known-DH list, always return DH.
    1. If player is in the known-1B list, always return 1B.
    2. If C is present, return C (catchers are unmistakable).
    3. If the player shows CF but also has BOTH LF and RF, they're a corner OF
       who occasionally filled in at centre — use the better corner (RF > LF).
    3.5 If the player shows CF + exactly ONE corner OF, and is NOT a known CF,
       they're a corner OFer who spot-started in centre — use that corner.
    4. Otherwise fall back to the defensive-hierarchy minimum.
    """
    if not positions:
        return '1B'

    # Rule 0: verified career DHs — always return DH regardless of fielding history
    if name in _KNOWN_DH:
        return 'DH'

    # Rule 1: known 1B players
    if name in _KNOWN_1B and '1B' in positions:
        return '1B'

    # Rule 2: catcher always wins
    if 'C' in positions:
        return 'C'

    # Rule 3: CF + both corner OFs → use best corner OF (RF preferred over LF)
    if 'CF' in positions and 'LF' in positions and 'RF' in positions:
        corners = [p for p in positions if p in ('LF', 'RF')]
        return min(corners, key=lambda p: _POS_PRIORITY.get(p, 8))

    # Rule 3.5: CF + exactly one corner OF, not a known CFer → use that corner
    if 'CF' in positions and name not in _KNOWN_CF:
        corners = [p for p in positions if p in ('LF', 'RF')]
        if len(corners) == 1:
            return corners[0]

    # Rule 4: hierarchy
    return min(positions, key=lambda p: _POS_PRIORITY.get(p, 8))


def is_pitcher(stats: dict) -> bool:
    return "era" in stats


def main():
    with open(DATA_PATH, encoding="utf-8") as f:
        players = json.load(f)

    war_changed = 0
    pos_changed = 0

    for p in players:
        stats = p["stats"]
        decade = p["decade"]

        # ── Fix primary position ───────────────────────────────────────────────
        # The scraper previously picked whichever position appeared first in the
        # batting table rows rather than the one with the most playing time.
        # Use the stored positions[] list + positional priority to reassign.
        if not is_pitcher(stats):
            positions = p.get("positions", [p["position"]])
            correct_pos = best_position(positions, name=p.get("name", ""))
            if correct_pos != p["position"]:
                print(f"  {p['name']} ({p['franchiseAbbr']} {p['decade']}): "
                      f"{p['position']} → {correct_pos}  (positions={positions})")
                p["position"] = correct_pos
                pos_changed += 1

        # ── Recompute WAR with (possibly corrected) position ──────────────────
        old_war = stats.get("war")
        awards_bonus = p.get("awardsBonus", 0.0)

        if is_pitcher(stats):
            gs = stats.get("gs", 0)
            sv = stats.get("sv", 0)
            base_war = calc_pitcher_war(
                stats["era"], stats["whip"], stats["kper9"], stats["ip"],
                gs, sv, decade,
            )
        else:
            base_war = calc_batter_war(
                stats["ops"], stats.get("obp", 0.320), p["position"], decade,
                stats["gp"], stats.get("sb", 0),
            )

        new_war = round(base_war + awards_bonus, 1)

        if new_war != old_war:
            stats["war"] = new_war
            war_changed += 1

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(players, f, indent=2, ensure_ascii=False)

    print(f"\nFixed primary position for {pos_changed} players.")
    print(f"Recomputed WAR for {war_changed} players (values changed).")
    print(f"Total players: {len(players)}")


if __name__ == "__main__":
    main()
