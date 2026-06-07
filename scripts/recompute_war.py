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
    "1940s": {"ops": 0.712, "era": 3.62, "whip": 1.32},
    "1950s": {"ops": 0.740, "era": 4.00, "whip": 1.38},
    "1960s": {"ops": 0.694, "era": 3.60, "whip": 1.29},
    "1970s": {"ops": 0.715, "era": 3.80, "whip": 1.33},
    "1980s": {"ops": 0.730, "era": 3.95, "whip": 1.36},
    "1990s": {"ops": 0.752, "era": 4.22, "whip": 1.41},
    "2000s": {"ops": 0.762, "era": 4.38, "whip": 1.43},
    "2010s": {"ops": 0.728, "era": 4.08, "whip": 1.33},
    "2020s": {"ops": 0.730, "era": 4.10, "whip": 1.32},
}

POS_ADJ = {"C": 1.5, "SS": 1.5, "2B": 1.0, "CF": 1.0, "3B": 0.0, "LF": -0.5, "RF": -0.5, "1B": -1.0}


def calc_batter_war(ops: float, pos: str, decade: str, gp: int) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    ops_gain = (ops / ea["ops"]) - 1.0
    padj = POS_ADJ.get(pos, 0.0)
    playing_time = gp / 155.0
    return round(ops_gain * 9.0 * playing_time + padj * playing_time + playing_time * 1.5, 1)


def calc_pitcher_war(era: float, whip: float, kper9: float, ip: float,
                      gs: int, sv: int, decade: str) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    era_gain  = (ea["era"]  - era)  / ea["era"]
    whip_gain = (ea["whip"] - whip) / ea["whip"]
    if gs > 0:
        return round((era_gain * 4.0 + whip_gain * 2.5 + kper9 / 9.0 * 1.2) * (ip / 200.0), 1)
    else:
        return round((era_gain * 2.5 + whip_gain * 1.5 + kper9 / 9.0 * 0.8) * (ip / 80.0)
                     + sv * 0.06, 1)


# Positional priority for fixing mis-assigned primary positions (mirrors scrape.py).
_POS_PRIORITY = {'C': 0, 'SS': 1, 'CF': 2, '2B': 3, '3B': 4, 'RF': 5, 'LF': 6, '1B': 7}


def best_position(positions: list[str]) -> str:
    """From a player's stored positions list, pick the most defensively demanding
    one as primary.  This fixes cases where a DH-heavy player was assigned '1B'
    as primary because he played a handful of games there, when his real home
    was LF or RF."""
    if not positions:
        return '1B'
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
            correct_pos = best_position(positions)
            if correct_pos != p["position"]:
                print(f"  {p['name']} ({p['franchiseAbbr']} {p['decade']}): "
                      f"{p['position']} → {correct_pos}  (positions={positions})")
                p["position"] = correct_pos
                pos_changed += 1

        # ── Recompute WAR with (possibly corrected) position ──────────────────
        old_war = stats.get("war")
        if is_pitcher(stats):
            gs = stats.get("gs", 0)
            sv = stats.get("sv", 0)
            new_war = calc_pitcher_war(
                stats["era"], stats["whip"], stats["kper9"], stats["ip"],
                gs, sv, decade,
            )
        else:
            new_war = calc_batter_war(stats["ops"], p["position"], decade, stats["gp"])

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
