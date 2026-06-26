"""
One-shot script: reclassify existing players.json RP entries into CL or SU
based on decade-aggregate saves data, without re-scraping everything.

CL threshold: sv >= 20 AND sv/g >= 0.12
"""
import json

INPUT = "data/players.json"

CL_SV_MIN  = 20
CL_SVG_MIN = 0.12

with open(INPUT, encoding="utf-8") as f:
    players = json.load(f)

cl_count = su_count = 0
for p in players:
    if p.get("position") == "RP":
        stats = p.get("stats", {})
        g  = stats.get("g", 0)
        sv = stats.get("sv", 0)
        svg = sv / g if g > 0 else 0
        new_pos = "CL" if (sv >= CL_SV_MIN and svg >= CL_SVG_MIN) else "SU"
        p["position"] = new_pos
        p["positions"] = [new_pos]
        if new_pos == "CL":
            cl_count += 1
        else:
            su_count += 1

with open(INPUT, "w", encoding="utf-8") as f:
    json.dump(players, f, indent=2, ensure_ascii=False)

print(f"Reclassified: {cl_count} CL, {su_count} SU")
counts: dict[str, int] = {}
for p in players:
    pos = p["position"]
    counts[pos] = counts.get(pos, 0) + 1
print("All position counts:", dict(sorted(counts.items())))
