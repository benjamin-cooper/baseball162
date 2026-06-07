"""
Scrape award data from Baseball Reference and apply WAR bonuses to players.json.

Awards scraped (9 total page fetches):
  HOF        — /awards/hof.shtml                       (all inductees)
  MVP        — /awards/mvp.shtml                       (winners only)
  Cy Young   — /awards/cya.shtml                       (winners only)
  ROY        — /awards/roy.shtml                       (winners only)
  All-Stars  — /allstar/bat-register.shtml             (career totals)
               /allstar/pitch-register.shtml
  Gold Glove — /awards/gold_glove_al.shtml             (grid format)
               /awards/gold_glove_nl.shtml
  Silver Slug— /awards/silver_slugger_al.shtml         (grid format)
               /awards/silver_slugger_nl.shtml

Run:  .venv/bin/python3 scripts/scrape_awards.py
"""

import json
import re
import time
import shutil
from collections import defaultdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.baseball-reference.com"
DATA_PATH = Path(__file__).parent.parent / "data" / "players.json"
BACKUP_PATH = DATA_PATH.with_suffix(".pre_awards.json")

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
DELAY = 2.5  # seconds between requests

# ── WAR bonus per award ───────────────────────────────────────────────────────
BONUS = {
    "hof":            3.0,   # Hall of Fame (best tenure)
    "mvp_win":        2.5,   # MVP winner
    "cy_win":         2.5,   # Cy Young winner
    "roy":            1.0,   # Rookie of the Year winner
    "allstar":        0.4,   # per All-Star selection (attributed to best tenure)
    "allstar_cap":    7,     # max selections counted per player
    "gold_glove":     0.5,   # per Gold Glove
    "silver_slugger": 0.5,   # per Silver Slugger
}

# ── Team abbreviation mapping (BBRef → our franchiseAbbr) ────────────────────
TEAM_MAP = {
    # AL
    "NYY": "NYY", "NYA": "NYY",
    "BOS": "BOS",
    "DET": "DET",
    "CLE": "CLE", "CLV": "CLE", "CLG": "CLE",
    "CHW": "CHW", "CHA": "CHW",
    "MIN": "MIN", "WS1": "MIN", "WSA": "MIN",
    "KCR": "KCR", "KCA": "KCR",
    "OAK": "OAK", "PHA": "OAK", "KCA2": "OAK",
    "SEA": "SEA",
    "TBR": "TBR", "TBA": "TBR", "TBD": "TBR",
    "BAL": "BAL", "SLA": "BAL",
    "TEX": "TEX", "WS2": "TEX",
    "LAA": "LAA", "ANA": "LAA", "CAL": "LAA",
    "TOR": "TOR",
    "HOU": "HOU",  # moved to AL in 2013 but close enough
    # NL
    "NYM": "NYM", "NYN": "NYM",
    "PHI": "PHI",
    "ATL": "ATL", "BSN": "ATL", "MLN": "ATL",
    "BRO": "BRO", "BRK": "BRO",
    "NYG": "NYG", "NY1": "NYG",
    "SFG": "SFG", "SFN": "SFG",
    "LAD": "LAD", "LAN": "LAD",
    "STL": "STL", "SLN": "STL",
    "CHC": "CHC", "CHN": "CHC",
    "CIN": "CIN",
    "PIT": "PIT",
    "MON": "MON", "MTL": "MON",
    "WSN": "WSN", "WAS": "WSN",
    "MIA": "MIA", "FLA": "MIA", "FLO": "MIA",
    "SDN": "SDN", "SDP": "SDN",
    "COL": "COL",
    "ARI": "ARI",
    "MIL": "MIL", "SEA2": "MIL",
    # Athletics moved to Oakland/Sacramento
    "ATH": "OAK", "SAS": "OAK",
}


# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

def fetch(url: str) -> BeautifulSoup:
    time.sleep(DELAY)
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    # BBRef reports ISO-8859-1 but actually serves UTF-8 — force correct decode
    html = r.content.decode("utf-8", errors="replace")
    # BBRef hides some tables in HTML comments — strip them so BS4 sees them
    html = html.replace("<!--", "").replace("-->", "")
    return BeautifulSoup(html, "html.parser")


def rows_from_table(soup: BeautifulSoup, table_id: str) -> list[dict]:
    """Return list of {data-stat: text} dicts for every data row in table."""
    tbl = soup.find("table", {"id": table_id})
    if not tbl:
        return []
    result = []
    for row in tbl.find_all("tr"):
        cells = row.find_all(["td", "th"])
        d = {c.get("data-stat"): c.get_text(strip=True) for c in cells}
        if any(d.values()):
            result.append(d)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Individual scrapers
# ─────────────────────────────────────────────────────────────────────────────

def scrape_hof() -> list[str]:
    """Return list of player names inducted into the Hall of Fame."""
    print("  Scraping HOF...")
    soup = fetch(f"{BASE_URL}/awards/hof.shtml")
    names = []
    for row in rows_from_table(soup, "hof"):
        cat = row.get("category_hof", "")
        name = row.get("player", "").strip()
        if name and cat == "Player":
            names.append(name)
    print(f"    → {len(names)} HOF players")
    return names


def scrape_winners(url: str, table_id: str, label: str) -> list[dict]:
    """
    Scrape a single-winner-per-year award page (MVP, CYA, ROY).
    Returns list of {year, name, team} with year parsed from th[data-stat=year_ID].
    """
    print(f"  Scraping {label}...")
    soup = fetch(url)
    winners = []
    current_year = None
    tbl = soup.find("table", {"id": table_id})
    if not tbl:
        print(f"    WARNING: table #{table_id} not found")
        return winners
    for row in tbl.find_all("tr"):
        cells = row.find_all(["td", "th"])
        d = {c.get("data-stat"): c.get_text(strip=True) for c in cells}
        # Year may be in a th cell
        yr_str = d.get("year_ID", "")
        if yr_str and yr_str.isdigit():
            current_year = int(yr_str)
        name = d.get("player", "").strip()
        team = d.get("team_ID", "").strip()
        if name and current_year and name != "Name":
            winners.append({"year": current_year, "name": name, "team": team})
    print(f"    → {len(winners)} {label} winners")
    return winners


def scrape_allstar_register(url: str, label: str) -> list[dict]:
    """
    Scrape the career All-Star batting or pitching register.
    Returns list of {name, games, year_min, year_max}.
    """
    print(f"  Scraping All-Star {label} register...")
    soup = fetch(url)
    tbl_id = "batting_register" if "bat" in url else "pitching_register"
    players = []
    for row in rows_from_table(soup, tbl_id):
        name = row.get("player", "").strip()
        g_str = row.get("G", "0")
        yr_min_str = row.get("year_min", "")
        yr_max_str = row.get("year_max", "")
        if not name or name in ("Name", ""):
            continue
        try:
            g = int(g_str)
            yr_min = int(yr_min_str) if yr_min_str.isdigit() else 0
            yr_max = int(yr_max_str) if yr_max_str.isdigit() else 0
        except ValueError:
            continue
        if g > 0:
            players.append({"name": name, "games": g, "year_min": yr_min, "year_max": yr_max})
    print(f"    → {len(players)} All-Star {label}s")
    return players


def parse_grid_cell(cell) -> tuple[str, str, str] | None:
    """
    Parse a Gold Glove / Silver Slugger grid cell element.
    Cells look like: <td><a href="/players/f/friedma01.shtml">Fried</a>·NYY</td>
    Returns (last_name, team, bbref_id) or None.
    bbref_id is the slug like 'friedma01' — useful for disambiguation.
    """
    text = cell.get_text(strip=True)
    if not text or text in ("—", "-", ""):
        return None
    # Strip leading position prefix (LF, CF, RF, RP, etc.)
    text = re.sub(r"^(LF|CF|RF|RP|SP|P)\s*", "", text)
    # Split on middle dot (U+00B7 = \xb7)
    dot = "·"
    if dot not in text:
        return None
    parts = text.split(dot, 1)
    if len(parts) != 2:
        return None
    last_name, team = parts[0].strip(), parts[1].strip()
    # "2tm" / "3tm" means traded mid-season — can't attribute to one team
    if team.lower() in ("2tm", "3tm", "4tm"):
        return None
    # Extract BBRef player ID from the link href
    a = cell.find("a", href=True)
    bbref_id = ""
    if a:
        m = re.search(r"/players/\w/(\w+)\.shtml", a["href"])
        if m:
            bbref_id = m.group(1)
    return (last_name, team, bbref_id) if last_name and team else None


def scrape_award_grid(url: str, label: str) -> list[dict]:
    """
    Parse a Gold Glove or Silver Slugger award grid page.
    Each row = one year; each cell (except first) = LastName·Team (with player link).
    Returns list of {year, last_name, team, bbref_id}.
    """
    print(f"  Scraping {label}...")
    soup = fetch(url)
    tbl = soup.find("table", {"id": "award_grid"})
    if not tbl:
        print(f"    WARNING: award_grid table not found at {url}")
        return []
    results = []
    for row in tbl.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        year_text = cells[0].get_text(strip=True)
        # Year cell looks like "2025\xa0AL" or "2000 NL"
        m = re.match(r"(\d{4})", year_text)
        if not m:
            continue
        year = int(m.group(1))
        for cell in cells[1:]:
            parsed = parse_grid_cell(cell)
            if parsed:
                last_name, team, bbref_id = parsed
                results.append({
                    "year": year,
                    "last_name": last_name,
                    "team": team,
                    "bbref_id": bbref_id,
                })
    print(f"    → {len(results)} {label} winners")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Name/player matching
# ─────────────────────────────────────────────────────────────────────────────

_ACCENT_MAP = str.maketrans(
    "áéíóúàèìòùâêîôûäëïöüñüÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÑÜ",
    "aeiouaeiouaeiouaeiounaAEIOUAEIOUAEIOUAEIOUNA",
)

def norm(name: str) -> str:
    name = name.translate(_ACCENT_MAP).lower().strip()
    # Undo BBRef's Latin-1-in-UTF-8 mojibake for common patterns
    name = name.replace("\xc3\xa1", "a").replace("\xc3\xad", "i").replace("\xc3\xb3", "o")
    # Remove suffixes
    name = re.sub(r"\b(jr|sr|ii|iii|iv)\.?\s*$", "", name).strip()
    # Collapse whitespace
    return re.sub(r"\s+", " ", name)


def build_lookup(players: list[dict]) -> dict[str, list[dict]]:
    idx: dict[str, list[dict]] = defaultdict(list)
    for p in players:
        idx[norm(p["name"])].append(p)
    return idx


def build_last_name_lookup(players: list[dict]) -> dict[str, list[dict]]:
    """Secondary lookup by normalised last name (for Gold Glove/Silver Slugger grids)."""
    idx: dict[str, list[dict]] = defaultdict(list)
    for p in players:
        parts = norm(p["name"]).split()
        last = parts[-1] if parts else ""
        if last:
            idx[last].append(p)
    return idx


def find_player_by_last(last_lookup: dict, last_name: str, team_br: str, year: int) -> dict | None:
    """Match a grid cell (last name + team + year) to a player record."""
    decade = year_to_decade(year)
    our_team = resolve_team(team_br) if team_br else None
    key = norm(last_name)
    # Remove common trailing position artifacts e.g. "Jr" from cells
    key = re.sub(r"\b(jr|sr|ii|iii)$", "", key).strip()
    candidates = last_lookup.get(key, [])
    if not candidates:
        return None
    # Exact franchise + decade
    if our_team:
        for p in candidates:
            if p["franchiseAbbr"] == our_team and p["decade"] == decade:
                return p
    # Decade only
    for p in candidates:
        if p["decade"] == decade:
            return p
    # Any
    return candidates[0] if candidates else None


def resolve_team(br_team: str) -> str | None:
    return TEAM_MAP.get(br_team.upper())


def year_to_decade(year: int) -> str:
    return f"{(year // 10) * 10}s"


def find_player(lookup: dict, name: str, team_br: str, year: int) -> dict | None:
    decade = year_to_decade(year)
    our_team = resolve_team(team_br) if team_br else None
    candidates = lookup.get(norm(name), [])

    # Best match: exact franchise + decade
    if our_team:
        for p in candidates:
            if p["franchiseAbbr"] == our_team and p["decade"] == decade:
                return p

    # Fallback: decade only
    for p in candidates:
        if p["decade"] == decade:
            return p

    # Any match
    return candidates[0] if candidates else None


def find_best_tenure(lookup: dict, name: str) -> dict | None:
    candidates = lookup.get(norm(name), [])
    if not candidates:
        return None
    return max(candidates, key=lambda p: p["stats"].get("war", 0))


# ─────────────────────────────────────────────────────────────────────────────
# Apply awards
# ─────────────────────────────────────────────────────────────────────────────

def apply_awards(players: list[dict],
                 hof_names: list[str],
                 mvp_winners: list[dict],
                 cy_winners: list[dict],
                 roy_winners: list[dict],
                 as_batters: list[dict],
                 as_pitchers: list[dict],
                 gold_gloves: list[dict],
                 silver_sluggers: list[dict]) -> None:

    lookup      = build_lookup(players)
    last_lookup = build_last_name_lookup(players)

    # Initialise
    for p in players:
        p["awards"] = {}
        p["awardsBonus"] = 0.0

    unmatched: list[str] = []

    # ── HOF ──────────────────────────────────────────────────────────────────
    # Badge goes on ALL tenures (player is a HOFer regardless of decade).
    # WAR bonus goes only to the single best-WAR tenure to avoid double-counting.
    hof_matched = 0
    for name in hof_names:
        key = norm(name)
        all_tenures = lookup.get(key, [])
        if not all_tenures:
            unmatched.append(f"HOF:{name}")
            continue
        # Mark every tenure with the badge
        for p in all_tenures:
            p["awards"]["hof"] = True
        # WAR bonus only on the best tenure
        best = max(all_tenures, key=lambda p: p["stats"].get("war", 0))
        best["awardsBonus"] += BONUS["hof"]
        hof_matched += 1
    print(f"  HOF matched: {hof_matched}/{len(hof_names)}")

    # ── MVP ──────────────────────────────────────────────────────────────────
    mvp_matched = 0
    for row in mvp_winners:
        p = find_player(lookup, row["name"], row["team"], row["year"])
        if p:
            p["awards"].setdefault("mvp_wins", 0)
            p["awards"]["mvp_wins"] += 1
            p["awardsBonus"] += BONUS["mvp_win"]
            mvp_matched += 1
        else:
            unmatched.append(f"MVP:{row['name']} {row['year']}")
    print(f"  MVP matched: {mvp_matched}/{len(mvp_winners)}")

    # ── Cy Young ─────────────────────────────────────────────────────────────
    cy_matched = 0
    for row in cy_winners:
        p = find_player(lookup, row["name"], row["team"], row["year"])
        if p:
            p["awards"].setdefault("cy_young_wins", 0)
            p["awards"]["cy_young_wins"] += 1
            p["awardsBonus"] += BONUS["cy_win"]
            cy_matched += 1
        else:
            unmatched.append(f"CY:{row['name']} {row['year']}")
    print(f"  Cy Young matched: {cy_matched}/{len(cy_winners)}")

    # ── ROY ──────────────────────────────────────────────────────────────────
    roy_matched = 0
    for row in roy_winners:
        p = find_player(lookup, row["name"], row["team"], row["year"])
        if p:
            p["awards"]["roy"] = True
            p["awardsBonus"] += BONUS["roy"]
            roy_matched += 1
        else:
            unmatched.append(f"ROY:{row['name']} {row['year']}")
    print(f"  ROY matched: {roy_matched}/{len(roy_winners)}")

    # ── All-Stars (career totals → split proportionally across tenures) ─────────
    # Rather than dumping all selections on the highest-WAR tenure, we distribute
    # them by tenure length (IP for pitchers, GP for batters).  This means a
    # player like Nolan Ryan who had long stints with LAA *and* HOU both get
    # credited, instead of HOU getting nothing.
    as_matched = 0
    for row in as_batters + as_pitchers:
        key = norm(row["name"])
        candidates = lookup.get(key, [])
        if not candidates:
            continue
        as_matched += 1
        total_count = row["games"]

        # Weight each tenure by playing time
        def tenure_weight(p: dict) -> float:
            s = p["stats"]
            if "ip" in s:
                return s["ip"]
            return s.get("gp", 0)

        total_weight = sum(tenure_weight(p) for p in candidates)
        if total_weight == 0:
            # Fallback: give all to best WAR tenure
            best = max(candidates, key=lambda p: p["stats"].get("war", 0))
            effective = min(total_count, BONUS["allstar_cap"])
            best["awards"]["allstar"] = best["awards"].get("allstar", 0) + total_count
            best["awardsBonus"] += effective * BONUS["allstar"]
            continue

        remaining = total_count
        for p in sorted(candidates, key=tenure_weight, reverse=True):
            share = round(total_count * tenure_weight(p) / total_weight)
            share = min(share, remaining)
            if share <= 0:
                continue
            effective = min(share, BONUS["allstar_cap"])
            p["awards"]["allstar"] = p["awards"].get("allstar", 0) + share
            p["awardsBonus"] += effective * BONUS["allstar"]
            remaining -= share
    print(f"  All-Star matched: {as_matched}/{len(as_batters) + len(as_pitchers)}")

    # ── Gold Gloves ───────────────────────────────────────────────────────────
    gg_matched = 0
    for row in gold_gloves:
        p = find_player_by_last(last_lookup, row["last_name"], row["team"], row["year"])
        if p:
            p["awards"].setdefault("gold_gloves", 0)
            p["awards"]["gold_gloves"] += 1
            p["awardsBonus"] += BONUS["gold_glove"]
            gg_matched += 1
    print(f"  Gold Glove matched: {gg_matched}/{len(gold_gloves)}")

    # ── Silver Sluggers ───────────────────────────────────────────────────────
    ss_matched = 0
    for row in silver_sluggers:
        p = find_player_by_last(last_lookup, row["last_name"], row["team"], row["year"])
        if p:
            p["awards"].setdefault("silver_sluggers", 0)
            p["awards"]["silver_sluggers"] += 1
            p["awardsBonus"] += BONUS["silver_slugger"]
            ss_matched += 1
    print(f"  Silver Slugger matched: {ss_matched}/{len(silver_sluggers)}")

    # ── Round bonuses and fold into WAR ──────────────────────────────────────
    for p in players:
        bonus = round(p["awardsBonus"], 2)
        p["awardsBonus"] = bonus
        if bonus:
            p["stats"]["war"] = round(p["stats"].get("war", 0) + bonus, 1)

    if unmatched:
        print(f"\n  Unmatched ({len(unmatched)} total, first 30):")
        for u in unmatched[:30]:
            print(f"    {u}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print(f"Loading {DATA_PATH}...")
    with open(DATA_PATH, encoding="utf-8") as f:
        players = json.load(f)
    print(f"  {len(players)} players loaded.")

    shutil.copy(DATA_PATH, BACKUP_PATH)
    print(f"  Backup → {BACKUP_PATH.name}\n")

    print("Fetching award data from Baseball Reference (~25 seconds)...")
    hof_names      = scrape_hof()
    mvp_winners    = scrape_winners(f"{BASE_URL}/awards/mvp.shtml",  "mvp", "MVP")
    cy_winners     = scrape_winners(f"{BASE_URL}/awards/cya.shtml",  "cya", "Cy Young")
    roy_winners    = scrape_winners(f"{BASE_URL}/awards/roy.shtml",  "roy", "ROY")
    as_batters     = scrape_allstar_register(f"{BASE_URL}/allstar/bat-register.shtml",   "batter")
    as_pitchers    = scrape_allstar_register(f"{BASE_URL}/allstar/pitch-register.shtml", "pitcher")
    gg_al          = scrape_award_grid(f"{BASE_URL}/awards/gold_glove_al.shtml",       "Gold Glove AL")
    gg_nl          = scrape_award_grid(f"{BASE_URL}/awards/gold_glove_nl.shtml",       "Gold Glove NL")
    ss_al          = scrape_award_grid(f"{BASE_URL}/awards/silver_slugger_al.shtml",   "Silver Slugger AL")
    ss_nl          = scrape_award_grid(f"{BASE_URL}/awards/silver_slugger_nl.shtml",   "Silver Slugger NL")

    print("\nApplying awards...")
    apply_awards(
        players, hof_names, mvp_winners, cy_winners, roy_winners,
        as_batters, as_pitchers,
        gg_al + gg_nl, ss_al + ss_nl,
    )

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(players, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {DATA_PATH}")

    # ── Sanity checks ─────────────────────────────────────────────────────────
    print("\n── BOS 2000s pitchers (by WAR) ──")
    bos_p = [p for p in players
             if p["franchiseAbbr"] == "BOS" and p["decade"] == "2000s"
             and p["position"] in ("SP", "RP")]
    for p in sorted(bos_p, key=lambda x: x["stats"]["war"], reverse=True)[:5]:
        print(f"  {p['name']:25s} WAR={p['stats']['war']:5.1f}  awards={p['awards']}")

    print("\n── BOS 2000s batters (by WAR) ──")
    bos_b = [p for p in players
             if p["franchiseAbbr"] == "BOS" and p["decade"] == "2000s"
             and p["position"] not in ("SP", "RP")]
    for p in sorted(bos_b, key=lambda x: x["stats"]["war"], reverse=True)[:5]:
        print(f"  {p['name']:25s} WAR={p['stats']['war']:5.1f}  awards={p['awards']}")

    print("\n── NYY 2000s (Judge, Jeter area) ──")
    nyy = [p for p in players
           if p["franchiseAbbr"] == "NYY" and p["decade"] in ("2000s", "2010s")]
    for p in sorted(nyy, key=lambda x: x["stats"]["war"], reverse=True)[:6]:
        print(f"  {p['name']:25s} {p['decade']}  WAR={p['stats']['war']:5.1f}  awards={p['awards']}")


if __name__ == "__main__":
    main()
