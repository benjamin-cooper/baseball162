#!/usr/bin/env python3
"""
Baseball Reference scraper for baseball-162-0.
Scrapes batting, pitching, and fielding stats by franchise × decade.
Outputs: data/players.json

Usage:
  pip install requests beautifulsoup4
  python scripts/scrape.py

Notes:
  - Batters: G, HR, RBI, AVG, OBP, SLG, OPS + E, Fld%, WAR (aggregated per decade)
  - Pitchers: G, GS, W, ERA, WHIP, K/9, SV, IP + WAR
  - SP vs RP determined by GS/G ratio (>= 0.4 = SP)
  - Min 300 PA for batters, 100 IP for SP, 50 G for RP (decade aggregate)
"""

import json, time, os, re
from collections import defaultdict
from bs4 import BeautifulSoup, Comment
import requests

BASE_URL    = "https://www.baseball-reference.com"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "players.json")

# Must match src/lib/franchises.ts ERA_AVERAGES exactly
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

# League-average errors/fielding% by position (must match simulation.ts)
_DEF_E  = {"C":8,  "1B":7,  "2B":10, "3B":14, "SS":18, "LF":4,  "CF":5,  "RF":4}
_DEF_FP = {"C":.988,"1B":.993,"2B":.982,"3B":.952,"SS":.965,"LF":.977,"CF":.982,"RF":.977}

POS_ADJ = {"C": 1.5, "SS": 1.5, "2B": 1.0, "CF": 1.0, "3B": 0.0, "LF": -0.5, "RF": -0.5, "1B": -1.0}

# Decades to scrape
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

# (game_abbr, display_name, city)
# BR redirects most historical codes (CHA→CHW, SLN→STL, NYN→NYM, etc.) to the
# current franchise code, so we only need explicit per-year handling for
# franchises that actually relocated/rebranded with a *different* BR family.
FRANCHISES = [
    # AL East
    ("NYY", "Yankees",      "New York"),
    ("BOS", "Red Sox",      "Boston"),
    ("TOR", "Blue Jays",    "Toronto"),
    ("BAL", "Orioles",      "Baltimore"),
    ("TBR", "Rays",         "Tampa Bay"),
    # AL Central
    ("CHW", "White Sox",    "Chicago"),
    ("CLE", "Guardians",    "Cleveland"),
    ("MIN", "Twins",        "Minnesota"),
    ("KCR", "Royals",       "Kansas City"),
    ("DET", "Tigers",       "Detroit"),
    # AL West
    ("HOU", "Astros",       "Houston"),
    ("OAK", "Athletics",    "Oakland"),
    ("SEA", "Mariners",     "Seattle"),
    ("TEX", "Rangers",      "Texas"),
    ("LAA", "Angels",       "Los Angeles"),
    # NL East
    ("ATL", "Braves",       "Atlanta"),
    ("NYM", "Mets",         "New York"),
    ("PHI", "Phillies",     "Philadelphia"),
    ("MIA", "Marlins",      "Miami"),
    ("WSN", "Nationals",    "Washington"),
    # NL Central
    ("CHC", "Cubs",         "Chicago"),
    ("STL", "Cardinals",    "St. Louis"),
    ("MIL", "Brewers",      "Milwaukee"),
    ("PIT", "Pirates",      "Pittsburgh"),
    ("CIN", "Reds",         "Cincinnati"),
    # NL West
    ("LAD", "Dodgers",      "Los Angeles"),
    ("SFG", "Giants",       "San Francisco"),
    ("SDN", "Padres",       "San Diego"),
    ("COL", "Rockies",      "Colorado"),
    ("ARI", "Diamondbacks", "Arizona"),
    # Historic / relocated
    ("MON", "Expos",        "Montreal"),
    ("BRO", "Dodgers",      "Brooklyn"),
    ("NYG", "Giants",       "New York"),
]


def br_abbr_for(game_abbr: str, year: int) -> str:
    """Resolve the BR team code for a given franchise+year (handles relocations/rebrands)."""
    if game_abbr == "TBR":
        return "TBD" if year <= 2007 else "TBR"
    if game_abbr == "LAA":
        if year <= 1964: return "LAA"
        if year <= 1996: return "CAL"
        if year <= 2004: return "ANA"
        return "LAA"
    if game_abbr == "ATL":
        return "MLN" if year <= 1965 else "ATL"
    if game_abbr == "MIA":
        return "FLO" if year <= 2011 else "MIA"
    if game_abbr == "WSN":
        return "MON" if year <= 2004 else "WSN"
    return game_abbr

FRANCHISE_DECADES = {
    "NYY": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "BOS": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "TOR": ["1980s","1990s","2000s","2010s","2020s"],
    "BAL": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "TBR": ["2000s","2010s","2020s"],
    "CHW": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "CLE": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "MIN": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "KCR": ["1970s","1980s","1990s","2000s","2010s","2020s"],
    "DET": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "HOU": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "OAK": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "SEA": ["1980s","1990s","2000s","2010s","2020s"],
    "TEX": ["1970s","1980s","1990s","2000s","2010s","2020s"],
    "LAA": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "ATL": ["1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "NYM": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "PHI": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "MIA": ["1990s","2000s","2010s","2020s"],
    "WSN": ["2000s","2010s","2020s"],
    "CHC": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "STL": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "MIL": ["1970s","1980s","1990s","2000s","2010s","2020s"],
    "PIT": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "CIN": ["1940s","1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "LAD": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "SFG": ["1960s","1970s","1980s","1990s","2000s","2010s","2020s"],
    "SDN": ["1970s","1980s","1990s","2000s","2010s","2020s"],
    "COL": ["1990s","2000s","2010s","2020s"],
    "ARI": ["2000s","2010s","2020s"],
    "MON": ["1970s","1980s","1990s","2000s"],
    "BRO": ["1940s","1950s"],
    "NYG": ["1940s","1950s"],
}

POSITION_MAP = {
    "C":  "C",  "1B": "1B", "2B": "2B", "3B": "3B", "SS": "SS",
    "LF": "LF", "CF": "CF", "RF": "RF",
    "DH": "1B",  # DH → 1B slot
    "OF": "LF",  # generic OF → LF
}

# BR fielding table encodes positions as numbers in strings like "*6/H"
_POS_CODE = {
    "2": "C", "3": "1B", "4": "2B", "5": "3B",
    "6": "SS", "7": "LF", "8": "CF", "9": "RF",
}

def decode_fielding_pos(pos_str: str) -> str | None:
    for ch in pos_str:
        if ch in _POS_CODE:
            return _POS_CODE[ch]
    return None

def clean_name(name: str) -> str:
    return name.rstrip("*#").strip()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

session = requests.Session()
session.headers.update(HEADERS)


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_page(url: str, retries: int = 3) -> BeautifulSoup | None:
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code == 404:
                return None
            if resp.status_code == 429:
                wait = 90
                print(f"  Rate limited, sleeping {wait}s…")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            print(f"  Error fetching {url}: {e} (attempt {attempt+1})")
            time.sleep(5)
    return None


def find_table(soup: BeautifulSoup, table_id: str):
    """Find a table by id, including BR's comment-hidden tables."""
    t = soup.find("table", {"id": table_id})
    if t:
        return t
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        cs = BeautifulSoup(str(comment), "html.parser")
        t = cs.find("table", {"id": table_id})
        if t:
            return t
    return None


def parse_float(val: str) -> float:
    try:
        return float(val.replace(",", "").strip())
    except (ValueError, AttributeError):
        return 0.0


def parse_int(val: str) -> int:
    try:
        return int(val.replace(",", "").strip())
    except (ValueError, AttributeError):
        return 0


def get_initials(name: str) -> str:
    parts = name.split()
    return (parts[0][0] + parts[-1][0]).upper() if len(parts) >= 2 else name[:2].upper()


# ── WAR formulas (must match seed_sample.py) ───────────────────────────────────

def calc_batter_war(ops: float, pos: str, decade: str, gp: int) -> float:
    """
    WAR is a counting stat — it should accumulate over a player's tenure with
    a franchise, not get averaged down to a "per season" rate. (A player who
    is solidly above-average for 8 seasons should outrank one who had a single
    great season — that's the whole point of using WAR to compare "best ever.")
    So this scales directly off the *aggregated* games-played total (gp),
    rather than normalizing to a single-season equivalent first.
    """
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    ops_gain = (ops / ea["ops"]) - 1.0
    padj = POS_ADJ.get(pos, 0.0)
    playing_time = gp / 155.0
    return round(ops_gain * 9.0 * playing_time + padj * playing_time + playing_time * 1.5, 1)


def calc_pitcher_war(era: float, whip: float, kper9: float, ip: float,
                     gs: int, sv: int, decade: str) -> float:
    """Same accumulation principle as calc_batter_war — scales off the
    aggregated innings/saves totals so a long, solid tenure outweighs one
    spectacular but brief season."""
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    era_gain  = (ea["era"]  - era)  / ea["era"]
    whip_gain = (ea["whip"] - whip) / ea["whip"]
    if gs > 0:
        return round((era_gain * 4.0 + whip_gain * 2.5 + kper9 / 9.0 * 1.2) * (ip / 200.0), 1)
    else:
        return round((era_gain * 2.5 + whip_gain * 1.5 + kper9 / 9.0 * 0.8) * (ip / 80.0)
                     + sv * 0.025, 1)


def calc_batter_strength(ops: float, decade: str) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    ratio = ops / ea["ops"] if ea["ops"] > 0 else 1.0
    return round(min(100, max(0, 20 + (ratio - 0.6) * 80)), 1)


def calc_pitcher_strength(era: float, whip: float, decade: str) -> float:
    ea = ERA_AVERAGES.get(decade, ERA_AVERAGES["2010s"])
    era_gain  = (ea["era"]  - era)  / ea["era"]  if ea["era"]  > 0 else 0
    whip_gain = (ea["whip"] - whip) / ea["whip"] if ea["whip"] > 0 else 0
    return round(min(100, max(0, 50 + era_gain * 30 + whip_gain * 20)), 1)


# ── Fielding scraper ───────────────────────────────────────────────────────────

def scrape_fielding(soup: BeautifulSoup) -> dict[tuple[str, str], dict]:
    """
    Returns {(name, pos): {"errors": N, "fieldingPct": F, "g": N}}
    from the players_standard_fielding table (in HTML comment on BR).
    Position is encoded as a number in the 'pos' field (e.g. '*6/H' = SS).
    """
    result: dict[tuple, dict] = {}
    table = find_table(soup, "players_standard_fielding")
    if not table:
        return result

    tbody = table.find("tbody")
    if not tbody:
        return result

    for row in tbody.find_all("tr"):
        if "thead" in row.get("class", []) or "spacer" in row.get("class", []):
            continue
        name_cell = row.find("td", {"data-stat": "name_display"})
        pos_cell  = row.find("td", {"data-stat": "pos"})
        g_cell    = row.find("td", {"data-stat": "f_games_distinct"})
        e_cell    = row.find("td", {"data-stat": "f_errors"})
        fp_cell   = row.find("td", {"data-stat": "f_fielding_perc"})

        if not name_cell or not pos_cell:
            continue

        name     = clean_name(name_cell.get_text(strip=True))
        game_pos = decode_fielding_pos(pos_cell.get_text(strip=True))
        if not name or not game_pos:
            continue

        g   = parse_int(g_cell.get_text())    if g_cell  else 0
        e   = parse_int(e_cell.get_text())    if e_cell  else _DEF_E.get(game_pos, 8)
        fp  = parse_float(fp_cell.get_text()) if fp_cell else _DEF_FP.get(game_pos, 0.980)

        key = (name, game_pos)
        if key not in result:
            result[key] = {"errors": e, "fieldingPct": fp, "g": g}
        else:
            prev = result[key]
            total_g = prev["g"] + g
            if total_g > 0:
                w1, w2 = prev["g"] / total_g, g / total_g
                prev["fieldingPct"] = round(prev["fieldingPct"] * w1 + fp * w2, 3)
            prev["errors"] += e
            prev["g"] = total_g

    return result


# ── Season scraper ─────────────────────────────────────────────────────────────

def scrape_season(br_abbr: str, year: int) -> tuple[list[dict], list[dict]]:
    """Returns (batters, pitchers) for a single season including fielding."""
    url = f"{BASE_URL}/teams/{br_abbr}/{year}.shtml"
    soup = get_page(url)
    if soup is None:
        print(f"    [skip] {url} returned None", flush=True)
        return [], []

    fielding = scrape_fielding(soup)
    # Build name→primary-position lookup from fielding table (fallback for old pages
    # where the batting table has no pos column)
    fielding_pos: dict[str, str] = {}
    for (fname, fpos) in fielding.keys():
        if fname not in fielding_pos:
            fielding_pos[fname] = fpos

    batters  = []
    pitchers = []

    # ── Batting ──
    batting_table = find_table(soup, "players_standard_batting")
    if batting_table:
        for row in batting_table.find("tbody").find_all("tr"):
            if "thead" in row.get("class", []) or "spacer" in row.get("class", []):
                continue
            name_cell = row.find("td", {"data-stat": "name_display"})
            if not name_cell:
                continue
            name = clean_name(name_cell.get_text(strip=True))
            if not name or name in ("Team Totals", ""):
                continue

            pos_cell = row.find("td", {"data-stat": "team_position"})
            pa_cell  = row.find("td", {"data-stat": "b_pa"})
            g_cell   = row.find("td", {"data-stat": "b_games"})
            hr_cell  = row.find("td", {"data-stat": "b_hr"})
            rbi_cell = row.find("td", {"data-stat": "b_rbi"})
            avg_cell = row.find("td", {"data-stat": "b_batting_avg"})
            obp_cell = row.find("td", {"data-stat": "b_onbase_perc"})
            slg_cell = row.find("td", {"data-stat": "b_slugging_perc"})
            ops_cell = row.find("td", {"data-stat": "b_onbase_plus_slugging"})

            raw_pos  = pos_cell.get_text(strip=True) if pos_cell else ""
            game_pos = POSITION_MAP.get(raw_pos.split("/")[0].strip().upper())
            if not game_pos:
                game_pos = fielding_pos.get(name)
            if not game_pos:
                continue

            pa = parse_int(pa_cell.get_text()) if pa_cell else 0
            g  = parse_int(g_cell.get_text())  if g_cell  else 0
            if pa < 50 or g < 20:
                continue

            hr  = parse_int(hr_cell.get_text())    if hr_cell  else 0
            rbi = parse_int(rbi_cell.get_text())   if rbi_cell else 0
            avg = parse_float(avg_cell.get_text()) if avg_cell else 0.0
            obp = parse_float(obp_cell.get_text()) if obp_cell else 0.0
            slg = parse_float(slg_cell.get_text()) if slg_cell else 0.0
            ops = parse_float(ops_cell.get_text()) if ops_cell else round(obp + slg, 3)

            fd  = fielding.get((name, game_pos), {})
            batters.append({
                "name": name, "position": game_pos,
                "gp": g, "pa": pa,
                "hr": hr, "rbi": rbi,
                "avg": avg, "obp": obp, "slg": slg, "ops": ops,
                "errors":      fd.get("errors",      _DEF_E.get(game_pos, 8)),
                "fieldingPct": fd.get("fieldingPct",  _DEF_FP.get(game_pos, 0.980)),
                "fg":          fd.get("g", g),
            })

    # ── Pitching ──
    pitching_table = find_table(soup, "players_standard_pitching")
    if pitching_table:
        for row in pitching_table.find("tbody").find_all("tr"):
            if "thead" in row.get("class", []) or "spacer" in row.get("class", []):
                continue
            name_cell = row.find("td", {"data-stat": "name_display"})
            if not name_cell:
                continue
            name = clean_name(name_cell.get_text(strip=True))
            if not name or name in ("Team Totals", ""):
                continue

            g_cell    = row.find("td", {"data-stat": "p_g"})
            gs_cell   = row.find("td", {"data-stat": "p_gs"})
            w_cell    = row.find("td", {"data-stat": "p_w"})
            era_cell  = row.find("td", {"data-stat": "p_earned_run_avg"})
            whip_cell = row.find("td", {"data-stat": "p_whip"})
            so9_cell  = row.find("td", {"data-stat": "p_so_per_nine"})
            sv_cell   = row.find("td", {"data-stat": "p_sv"})
            ip_cell   = row.find("td", {"data-stat": "p_ip"})

            g    = parse_int(g_cell.get_text())     if g_cell    else 0
            gs   = parse_int(gs_cell.get_text())    if gs_cell   else 0
            w    = parse_int(w_cell.get_text())     if w_cell    else 0
            era  = parse_float(era_cell.get_text()) if era_cell  else 0.0
            whip = parse_float(whip_cell.get_text()) if whip_cell else 0.0
            kp9  = parse_float(so9_cell.get_text()) if so9_cell  else 0.0
            sv   = parse_int(sv_cell.get_text())    if sv_cell   else 0
            ip   = parse_float(ip_cell.get_text())  if ip_cell   else 0.0

            if g < 5 or ip < 10:
                continue

            pos = "SP" if gs >= g * 0.4 else "RP"
            pitchers.append({
                "name": name, "position": pos,
                "g": g, "gs": gs, "w": w,
                "era": era, "whip": whip, "kper9": kp9,
                "sv": sv, "ip": ip,
            })

    return batters, pitchers


# ── Aggregation ────────────────────────────────────────────────────────────────

# Positional hierarchy: most demanding defence → least.  Used to break ties
# when a player appears at multiple positions (e.g. heavy DH who occasionally
# played 1B AND LF — we want LF, not 1B, as his primary).
_POS_PRIORITY = {'C': 0, 'SS': 1, 'CF': 2, '2B': 3, '3B': 4, 'RF': 5, 'LF': 6, '1B': 7}

def _primary_position(pos_pa: dict[str, int]) -> str:
    """Pick the primary position from a {position: PA} dict.

    Rule: most PA wins; ties broken by positional priority (harder defence =
    lower priority number = preferred).  This stops a DH-heavy player who
    happened to play a handful of 1B games from being labelled '1B'.
    """
    return min(pos_pa, key=lambda p: (-pos_pa[p], _POS_PRIORITY.get(p, 8)))


def aggregate_batters(rows: list[dict]) -> list[dict]:
    by_name: dict[str, dict] = {}
    seasons_count: dict[str, set] = defaultdict(set)
    pos_pa: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))  # name→pos→PA

    for p in rows:
        name = p["name"]
        # Track PA at each position so we can pick the true primary later.
        pos_pa[name][p["position"]] += p.get("pa", p["gp"] * 4)
        # Track seasons via unique gp values per season (approximate)
        seasons_count[name].add(id(p))  # each row = one season appearance
        if name not in by_name:
            by_name[name] = dict(p)
            by_name[name]["_all_positions"] = {p["position"]}
            by_name[name]["_season_count"]  = 1
        else:
            e = by_name[name]
            e["_all_positions"].add(p["position"])
            e["_season_count"] += 1
            total_pa = e["pa"] + p["pa"]
            if total_pa == 0:
                continue
            w1, w2 = e["pa"] / total_pa, p["pa"] / total_pa
            e["avg"]  = round(e["avg"] * w1 + p["avg"] * w2, 3)
            e["obp"]  = round(e["obp"] * w1 + p["obp"] * w2, 3)
            e["slg"]  = round(e["slg"] * w1 + p["slg"] * w2, 3)
            e["ops"]  = round(e["ops"] * w1 + p["ops"] * w2, 3)
            # Fielding: sum errors, weight fieldingPct by fielding games
            e["errors"] += p.get("errors", 0)
            total_fg = e["fg"] + p.get("fg", 0)
            if total_fg > 0:
                wf1, wf2 = e["fg"] / total_fg, p.get("fg", 0) / total_fg
                e["fieldingPct"] = round(e["fieldingPct"] * wf1 + p.get("fieldingPct", 0.980) * wf2, 3)
            e["fg"] = total_fg
            # Counting stats
            e["gp"]  += p["gp"]
            e["pa"]  += p["pa"]
            e["hr"]  += p["hr"]
            e["rbi"] += p["rbi"]

    result = []
    for name, p in by_name.items():
        if p["pa"] < 300:
            continue
        # Normalize errors to per-season average (avoid decade-total bloat)
        seasons = max(1, p.pop("_season_count"))
        p["errors"]    = round(p["errors"] / seasons)
        primary        = _primary_position(pos_pa[name])
        total_pa       = sum(pos_pa[name].values())
        # Only include secondary positions if the player had meaningful time there:
        # at least 10% of their total PA or 50 PA (~15 games), whichever is smaller.
        # This prevents fill-in appearances (e.g. 1 game at 1B for an outfielder)
        # from granting permanent position eligibility.
        pa_threshold   = min(50, total_pa * 0.10)
        all_pos        = sorted({
            pos for pos, pa in pos_pa[name].items()
            if pa >= pa_threshold or pos == primary
        })
        p.pop("_all_positions")
        p["positions"] = all_pos
        p["position"]  = primary
        p["_seasons"]  = seasons  # keep for WAR calc
        p.pop("fg", None)
        p.pop("pa", None)
        result.append(p)

    result.sort(key=lambda x: x["ops"], reverse=True)
    return result


def aggregate_pitchers(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    sp_by_name: dict[str, dict] = {}
    rp_by_name: dict[str, dict] = {}

    for p in rows:
        store = sp_by_name if p["position"] == "SP" else rp_by_name
        name  = p["name"]
        if name not in store:
            store[name] = dict(p)
            store[name]["_all_positions"] = {p["position"]}
            store[name]["_season_count"]  = 1
        else:
            e = store[name]
            e["_all_positions"].add(p["position"])
            e["_season_count"] += 1
            total_ip = e["ip"] + p["ip"]
            if total_ip == 0:
                continue
            w1, w2 = e["ip"] / total_ip, p["ip"] / total_ip
            e["era"]   = round(e["era"]   * w1 + p["era"]   * w2, 2)
            e["whip"]  = round(e["whip"]  * w1 + p["whip"]  * w2, 2)
            e["kper9"] = round(e["kper9"] * w1 + p["kper9"] * w2, 1)
            e["g"]  += p["g"]
            e["gs"] += p["gs"]
            e["w"]  += p["w"]
            e["sv"] += p["sv"]
            e["ip"] += p["ip"]

    sp_list = [p for p in sp_by_name.values() if p["ip"] >= 100]
    rp_list = [p for p in rp_by_name.values() if p["g"]  >= 50]
    for lst in (sp_list, rp_list):
        for p in lst:
            p["positions"]   = sorted(p.pop("_all_positions"))
    sp_list.sort(key=lambda x: x["era"])
    rp_list.sort(key=lambda x: x["era"])
    return sp_list, rp_list


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    all_players = []
    player_id   = 1

    franchise_map = {abbr: (name, city) for abbr, name, city in FRANCHISES}

    for game_abbr, active_decades in FRANCHISE_DECADES.items():
        display_name, city = franchise_map[game_abbr]

        print(f"\n{'='*50}")
        print(f"  {city} {display_name} ({game_abbr})")
        print(f"{'='*50}")

        for decade in active_decades:
            if decade not in DECADES:
                continue

            years = DECADES[decade]
            print(f"  {decade}…", end=" ", flush=True)

            all_batters_raw  = []
            all_pitchers_raw = []
            seasons_found    = 0

            for year in years:
                br_abbr = br_abbr_for(game_abbr, year)
                b, p = scrape_season(br_abbr, year)
                if b or p:
                    seasons_found += 1
                    all_batters_raw.extend(b)
                    all_pitchers_raw.extend(p)
                time.sleep(4)  # respect rate limits

            if seasons_found == 0:
                print("no data")
                continue

            print(f"{seasons_found} seasons")

            batters_agg = aggregate_batters(all_batters_raw)
            sp_agg, rp_agg = aggregate_pitchers(all_pitchers_raw)

            # ── Batters ──
            pos_groups: dict[str, list] = defaultdict(list)
            for p in batters_agg:
                pos_groups[p["position"]].append(p)

            for pos, players in pos_groups.items():
                for p in players[:10]:
                    war = calc_batter_war(p["ops"], pos, decade, p["gp"])
                    all_players.append({
                        "id": player_id,
                        "name": p["name"],
                        "initials": get_initials(p["name"]),
                        "position": pos,
                        "positions": p.get("positions", [pos]),
                        "franchise": display_name,
                        "franchiseAbbr": game_abbr,
                        "decade": decade,
                        "stats": {
                            "gp":  p["gp"],
                            "hr":  p["hr"],
                            "rbi": p["rbi"],
                            "avg": p["avg"],
                            "obp": p["obp"],
                            "slg": p["slg"],
                            "ops": p["ops"],
                            "war": war,
                            "errors":      p.get("errors",      _DEF_E.get(pos, 8)),
                            "fieldingPct": p.get("fieldingPct",  _DEF_FP.get(pos, 0.980)),
                        },
                        "strengthScore": calc_batter_strength(p["ops"], decade),
                    })
                    player_id += 1

            # ── Starters ──
            for p in sp_agg[:8]:
                war = calc_pitcher_war(p["era"], p["whip"], p["kper9"], p["ip"],
                                       p["gs"], 0, decade)
                all_players.append({
                    "id": player_id,
                    "name": p["name"],
                    "initials": get_initials(p["name"]),
                    "position": "SP",
                    "positions": p.get("positions", ["SP"]),
                    "franchise": display_name,
                    "franchiseAbbr": game_abbr,
                    "decade": decade,
                    "stats": {
                        "g": p["g"], "gs": p["gs"], "w": p["w"],
                        "era": p["era"], "whip": p["whip"], "kper9": p["kper9"],
                        "sv": 0, "ip": round(p["ip"], 1),
                        "war": war,
                    },
                    "strengthScore": calc_pitcher_strength(p["era"], p["whip"], decade),
                })
                player_id += 1

            # ── Relievers ──
            for p in rp_agg[:6]:
                war = calc_pitcher_war(p["era"], p["whip"], p["kper9"], p["ip"],
                                       0, p["sv"], decade)
                all_players.append({
                    "id": player_id,
                    "name": p["name"],
                    "initials": get_initials(p["name"]),
                    "position": "RP",
                    "positions": p.get("positions", ["RP"]),
                    "franchise": display_name,
                    "franchiseAbbr": game_abbr,
                    "decade": decade,
                    "stats": {
                        "g": p["g"], "gs": 0, "w": p["w"],
                        "era": p["era"], "whip": p["whip"], "kper9": p["kper9"],
                        "sv": p["sv"], "ip": round(p["ip"], 1),
                        "war": war,
                    },
                    "strengthScore": calc_pitcher_strength(p["era"], p["whip"], decade),
                })
                player_id += 1

    print(f"\n\nTotal players: {len(all_players)}")
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_players, f, indent=2, ensure_ascii=False)
    print(f"Written to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
