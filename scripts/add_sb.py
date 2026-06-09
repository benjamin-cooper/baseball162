#!/usr/bin/env python3
"""
Scrapes stolen-base totals from Baseball Reference team pages and adds
them to the existing players.json. Also updates WAR using the SB bonus
(sb * 0.012) that was added to calc_batter_war in recompute_war.py.

Why a separate script: the original scrape.py did not collect SB. Rather
than re-scraping all 2000+ pages from scratch, this script revisits only
the franchise × decade combos that appear in players.json (≈200 combos),
pulls only the SB column from each year page, aggregates per player per
decade, and patches the existing data in-place.

Usage:
  .venv/bin/python3 scripts/add_sb.py

Estimated time: ~180 combos × 10 years × 3s sleep ≈ 90 minutes.
Progress is printed after every decade so you can interrupt and re-run
safely — already-updated players won't lose data (script adds sb only
where it finds a match; missing matches keep whatever was there before).
"""

import json, time, os, sys, re
from collections import defaultdict
from pathlib import Path

# Use bs4 from the venv
sys.path.insert(0, str(Path(__file__).parent.parent / ".venv" / "lib" /
    next((d for d in os.listdir(Path(__file__).parent.parent / ".venv" / "lib")
          if d.startswith("python")), "python3") / "site-packages"))

from bs4 import BeautifulSoup, Comment
import requests

DATA_PATH = Path(__file__).parent.parent / "data" / "players.json"
BASE_URL  = "https://www.baseball-reference.com"
HEADERS   = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"}

session = requests.Session()
session.headers.update(HEADERS)

# ── Era OBP for wOPS WAR formula (must match recompute_war.py) ───────────────
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

POS_ADJ = {"C": 1.5, "SS": 1.5, "2B": 1.0, "CF": 1.0, "3B": 0.0,
           "LF": 0.0, "RF": 0.0, "1B": -1.0, "DH": -0.5}

DECADES = {
    "1940s": list(range(1940, 1950)),
    "1950s": list(range(1950, 1960)),
    "1960s": list(range(1960, 1970)),
    "1970s": list(range(1970, 1980)),
    "1980s": list(range(1980, 1990)),
    "1990s": list(range(1990, 2000)),
    "2000s": list(range(2000, 2010)),
    "2010s": list(range(2010, 2020)),
    "2020s": list(range(2020, 2026)),
}


def br_abbr_for(game_abbr: str, year: int) -> str:
    if game_abbr == "TBR":   return "TBD" if year <= 2007 else "TBR"
    if game_abbr == "LAA":
        if year <= 1964: return "LAA"
        if year <= 1996: return "CAL"
        if year <= 2004: return "ANA"
        return "LAA"
    if game_abbr == "ATL":   return "MLN" if year <= 1965 else "ATL"
    if game_abbr == "MIA":   return "FLO" if year <= 2011 else "MIA"
    if game_abbr == "WSN":   return "MON" if year <= 2004 else "WSN"
    return game_abbr


def clean_name(name: str) -> str:
    return name.rstrip("*#").strip()


def get_page(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=20)
            if r.status_code == 404:   return None
            if r.status_code == 429:
                print(f"  Rate-limited, sleeping 90s…")
                time.sleep(90)
                continue
            r.raise_for_status()
            r.encoding = "utf-8"
            return BeautifulSoup(r.text, "html.parser")
        except Exception as e:
            print(f"  fetch error: {e} (attempt {attempt+1})")
            time.sleep(5)
    return None


def find_table(soup, table_id: str):
    t = soup.find("table", {"id": table_id})
    if t: return t
    for c in soup.find_all(string=lambda x: isinstance(x, Comment)):
        cs = BeautifulSoup(str(c), "html.parser")
        t = cs.find("table", {"id": table_id})
        if t: return t
    return None


def scrape_season_sb(br_abbr: str, year: int) -> dict[str, int]:
    """Return {player_name: sb} for one season from the batting table."""
    url   = f"{BASE_URL}/teams/{br_abbr}/{year}.shtml"
    soup  = get_page(url)
    if not soup: return {}
    table = find_table(soup, "players_standard_batting")
    if not table: return {}
    result: dict[str, int] = {}
    for row in table.find("tbody").find_all("tr"):
        if "thead" in row.get("class", []) or "spacer" in row.get("class", []):
            continue
        name_cell = row.find("td", {"data-stat": "name_display"})
        sb_cell   = row.find("td", {"data-stat": "b_sb"})
        pa_cell   = row.find("td", {"data-stat": "b_pa"})
        if not name_cell: continue
        name = clean_name(name_cell.get_text(strip=True))
        if not name or name == "Team Totals": continue
        pa = int(pa_cell.get_text(strip=True) or 0) if pa_cell else 0
        if pa < 50: continue  # skip tiny sample rows
        try:
            sb = int(sb_cell.get_text(strip=True) or 0) if sb_cell else 0
        except ValueError:
            sb = 0
        result[name] = result.get(name, 0) + sb
    return result


def calc_batter_war(ops: float, obp: float, pos: str, decade: str, gp: int, sb: int = 0) -> float:
    ea        = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    wops      = ops + 0.7 * obp
    era_wops  = ea["ops"] + 0.7 * ea["obp"]
    ops_gain  = (wops / era_wops) - 1.0
    padj      = POS_ADJ.get(pos, 0.0)
    pt        = gp / 155.0
    sb_bonus  = sb * 0.012
    return round(ops_gain * 9.0 * pt + padj * pt + pt * 1.5 + sb_bonus, 1)


def main():
    with open(DATA_PATH, encoding="utf-8") as f:
        players = json.load(f)

    # Build index: (franchiseAbbr, decade) → list of player objects
    combo_players: dict[tuple, list] = defaultdict(list)
    for p in players:
        if "ops" in p["stats"]:  # batters only
            combo_players[(p["franchiseAbbr"], p["decade"])].append(p)

    combos = sorted(combo_players.keys())
    print(f"Found {len(combos)} franchise×decade combos with batters.")
    print(f"Estimated time: {len(combos) * 10 * 3 // 60} min\n")

    updated_sb = 0
    updated_war = 0

    for idx, (abbr, decade) in enumerate(combos, 1):
        years = DECADES.get(decade, [])
        if not years:
            continue

        print(f"[{idx}/{len(combos)}] {abbr} {decade}…", end=" ", flush=True)

        # Accumulate SB per player across all years in this decade
        decade_sb: dict[str, int] = defaultdict(int)
        for year in years:
            br = br_abbr_for(abbr, year)
            sb_map = scrape_season_sb(br, year)
            for name, sb in sb_map.items():
                decade_sb[name] += sb
            time.sleep(3)

        # Patch matching players in our dataset
        decade_updated = 0
        for p in combo_players[(abbr, decade)]:
            sb = decade_sb.get(p["name"], 0)
            old_sb  = p["stats"].get("sb", None)
            old_war = p["stats"].get("war")
            awards_bonus = p.get("awardsBonus", 0.0)

            if sb > 0 or old_sb is None:
                p["stats"]["sb"] = sb

            # Recompute WAR with the SB bonus included
            new_base_war = calc_batter_war(
                p["stats"]["ops"], p["stats"].get("obp", 0.320),
                p["position"], p["decade"], p["stats"]["gp"], sb,
            )
            new_war = round(new_base_war + awards_bonus, 1)
            if new_war != old_war:
                p["stats"]["war"] = new_war
                updated_war += 1
            if old_sb != sb:
                updated_sb += 1
                decade_updated += 1

        print(f"{decade_updated} SB updates")

        # Save incrementally every 10 combos so we don't lose progress
        if idx % 10 == 0:
            with open(DATA_PATH, "w", encoding="utf-8") as f:
                json.dump(players, f, indent=2, ensure_ascii=False)
            print(f"  → saved checkpoint ({updated_sb} SB, {updated_war} WAR updates so far)")

    # Final save
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(players, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Added/updated SB for {updated_sb} players.")
    print(f"Updated WAR for {updated_war} players.")


if __name__ == "__main__":
    main()
