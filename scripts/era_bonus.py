"""
Era fairness correction:
  • Pre-1980 batters couldn't win Silver Sluggers (+0.5 each, capped at 3 = +1.5).
    Award a simulated SS bonus based on how far above the era OPS average they were.
  • Pre-1956 starting pitchers couldn't win a Cy Young Award (+2.5).
    Award a simulated CY bonus to clear dominant aces.

This only adds on top of what players already have — if a player already
received Silver Slugger or Cy Young awards for the years those existed
(e.g. Warren Spahn won the 1957 CY), their existing bonus is preserved
and the gap is filled for the seasons before.
"""
import json
from pathlib import Path

DATA = Path(__file__).parent.parent / "data" / "players.json"

ERA_OPS  = {"1940s": 0.712, "1950s": 0.740, "1960s": 0.694, "1970s": 0.715}
ERA_ERA  = {"1940s": 3.62,  "1950s": 4.00}
ERA_WHIP = {"1940s": 1.32,  "1950s": 1.38}

SS_ERAS = {"1940s", "1950s", "1960s", "1970s"}   # Silver Slugger started 1980
CY_ERAS = {"1940s", "1950s"}                       # Cy Young started 1956


def ss_gap_bonus(ops: float, era: str, existing_ss: int) -> float:
    """Extra Silver Slugger credit a pre-1980 batter missed out on."""
    avg = ERA_OPS.get(era, 0.715)
    ratio = ops / avg
    if ratio < 1.08:
        return 0.0
    # Estimate how many SS they would have won (cap total at 3)
    if ratio >= 1.25:
        would_have = 3
    elif ratio >= 1.15:
        would_have = 2
    else:
        would_have = 1
    gap = max(0, would_have - existing_ss)
    return round(gap * 0.5, 1)


def cy_gap_bonus(era_val: float, whip: float, ip: float, era: str, existing_cy: int) -> float:
    """Extra Cy Young credit a pre-1956 ace missed out on."""
    avg_era  = ERA_ERA.get(era, 3.80)
    avg_whip = ERA_WHIP.get(era, 1.33)
    era_gain  = (avg_era  - era_val)  / avg_era
    whip_gain = (avg_whip - whip)     / avg_whip
    combined  = era_gain * 0.6 + whip_gain * 0.4
    seasons   = ip / 200.0
    if combined < 0.10 or seasons < 2.5:
        return 0.0
    # A clear ace (combined >= 0.18, 4+ seasons) → 1 simulated CY
    would_have = 1 if combined >= 0.10 else 0
    gap = max(0, would_have - existing_cy)
    return round(gap * 2.5, 1)


def main():
    players = json.loads(DATA.read_text(encoding="utf-8"))
    changed = 0

    for p in players:
        decade = p["decade"]
        stats  = p["stats"]
        awards = p.get("awards", {})
        bonus  = 0.0

        if "ops" in stats and decade in SS_ERAS:
            existing_ss = awards.get("silver_sluggers", 0)
            bonus += ss_gap_bonus(stats["ops"], decade, existing_ss)

        if "era" in stats and stats.get("gs", 0) > 0 and decade in CY_ERAS:
            existing_cy = awards.get("cy_young_wins", 0)
            bonus += cy_gap_bonus(stats["era"], stats["whip"], stats["ip"], decade, existing_cy)

        if bonus > 0:
            old_war = stats["war"]
            p["awardsBonus"]  = round(p.get("awardsBonus", 0) + bonus, 1)
            stats["war"]      = round(old_war + bonus, 1)
            changed += 1
            if stats["war"] - old_war >= 1.0:  # only log notable bumps
                name = p["name"]
                abbr = p["franchiseAbbr"]
                print(f"  {name:28s} {abbr} {decade}  +{bonus:.1f}  → WAR {stats['war']:.1f}")

    DATA.write_text(json.dumps(players, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nApplied era bonuses to {changed} players.")


if __name__ == "__main__":
    main()
