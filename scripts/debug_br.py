#!/usr/bin/env python3
"""Quick diagnostic: fetch one BR page and show what we get."""
import requests
from bs4 import BeautifulSoup, Comment

URL = "https://www.baseball-reference.com/teams/NYY/2023.shtml"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

resp = requests.get(URL, headers=HEADERS, timeout=20)
print(f"Status: {resp.status_code}")
print(f"Content-Type: {resp.headers.get('Content-Type')}")
print(f"Body length: {len(resp.text)} chars")
print()

soup = BeautifulSoup(resp.text, "html.parser")

# Show all table IDs in main HTML
tables = soup.find_all("table")
print(f"Tables in main HTML ({len(tables)}):")
for t in tables:
    print(f"  id={t.get('id')!r}")

# Show all table IDs in HTML comments
comment_tables = []
for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
    cs = BeautifulSoup(str(comment), "html.parser")
    for t in cs.find_all("table"):
        comment_tables.append(t.get("id"))
print(f"\nTables in HTML comments ({len(comment_tables)}):")
for tid in comment_tables:
    print(f"  id={tid!r}")

# Try to find the batting table specifically
def find_table(soup, table_id):
    t = soup.find("table", {"id": table_id})
    if t:
        return t, "main HTML"
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        cs = BeautifulSoup(str(comment), "html.parser")
        t = cs.find("table", {"id": table_id})
        if t:
            return t, "comment"
    return None, None

for tid in ["players_standard_batting", "players_standard_pitching", "players_standard_fielding"]:
    t, loc = find_table(soup, tid)
    if t:
        rows = t.find("tbody").find_all("tr") if t.find("tbody") else []
        print(f"\nFound '{tid}' in {loc} — {len(rows)} rows")
        # Print first data row's cells
        for row in rows[:2]:
            cells = {td.get("data-stat"): td.get_text(strip=True) for td in row.find_all("td")}
            if cells:
                print(f"  sample row: {cells}")
    else:
        print(f"\n'{tid}' not found")
