#!/usr/bin/env python3
"""
Seed a sample players.json with well-known historical MLB players.
Run this to make the game playable before scraping full data.

Usage:
  python scripts/seed_sample.py
"""

import json, os

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "players.json")

# Must match src/lib/franchises.ts ERA_AVERAGES exactly
ERA_AVG = {
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

# League-average errors and fielding % by position (must match simulation.ts LEAGUE_AVG_ERRORS)
_DEF_E  = {"C":8,  "1B":7,  "2B":10, "3B":14, "SS":18, "LF":4,  "CF":5,  "RF":4}
_DEF_FP = {"C":.988,"1B":.993,"2B":.982,"3B":.952,"SS":.965,"LF":.977,"CF":.982,"RF":.977}

POS_ADJ = {"C": 1.5, "SS": 1.5, "2B": 1.0, "CF": 1.0, "3B": 0.0, "LF": -0.5, "RF": -0.5, "1B": -1.0}

def batter_war(stats, pos, decade):
    ea = ERA_AVG.get(decade, ERA_AVG["2010s"])
    ops_gain = (stats["ops"] / ea["ops"]) - 1.0
    pa_factor = stats["gp"] / 155.0
    padj = POS_ADJ.get(pos, 0.0)
    return round(ops_gain * 9.0 * pa_factor + padj + pa_factor * 1.5, 1)

def pitcher_war(stats, decade):
    ea = ERA_AVG.get(decade, ERA_AVG["2010s"])
    era_gain  = (ea["era"]  - stats["era"])  / ea["era"]
    whip_gain = (ea["whip"] - stats["whip"]) / ea["whip"]
    if stats["gs"] > 0:
        ip_factor = stats["ip"] / 200.0
        return round((era_gain * 4.0 + whip_gain * 2.5 + stats["kper9"] / 9.0 * 1.2) * ip_factor, 1)
    else:
        ip_factor = stats["ip"] / 80.0
        sv_bonus  = stats["sv"] * 0.06
        return round((era_gain * 2.5 + whip_gain * 1.5 + stats["kper9"] / 9.0 * 0.8) * ip_factor + sv_bonus, 1)

def p(id, name, pos, franchise, abbr, decade, stats, score, e=None, fp=None):
    initials = (name.split()[0][0] + name.split()[-1][0]).upper()
    positions = [pos]
    if pos in ("LF", "RF"):
        positions = ["LF", "RF"]
    if pos in ("2B", "SS"):
        opp = "SS" if pos == "2B" else "2B"
        positions = [pos, opp]

    is_pitcher = pos in ("SP", "RP")

    if not is_pitcher:
        stats["errors"]     = e  if e  is not None else _DEF_E.get(pos, 8)
        stats["fieldingPct"]= fp if fp is not None else _DEF_FP.get(pos, 0.980)

    stats["war"] = pitcher_war(stats, decade) if is_pitcher else batter_war(stats, pos, decade)

    return {
        "id": id, "name": name, "initials": initials,
        "position": pos, "positions": positions,
        "franchise": franchise, "franchiseAbbr": abbr, "decade": decade,
        "stats": stats, "strengthScore": score
    }

B = lambda gp,hr,rbi,avg,obp,slg: {"gp":gp,"hr":hr,"rbi":rbi,"avg":avg,"obp":obp,"slg":slg,"ops":round(obp+slg,3)}
S = lambda g,gs,w,era,whip,kp9,ip: {"g":g,"gs":gs,"w":w,"era":era,"whip":whip,"kper9":kp9,"sv":0,"ip":ip}
R = lambda g,sv,era,whip,kp9,ip:  {"g":g,"gs":0,"w":0,"era":era,"whip":whip,"kper9":kp9,"sv":sv,"ip":ip}

players = [
    # ── NYY 1990s ──────────────────────────────────────────────────────────────
    p(1,  "Derek Jeter",     "SS",  "Yankees",  "NYY","1990s", B(157,19,102,.315,.388,.449), 82, e=15),
    p(2,  "Bernie Williams", "CF",  "Yankees",  "NYY","1990s", B(148,20, 97,.305,.388,.492), 78),
    p(3,  "Paul O'Neill",    "RF",  "Yankees",  "NYY","1990s", B(153,21, 92,.303,.378,.468), 75),
    p(4,  "Tino Martinez",   "1B",  "Yankees",  "NYY","1990s", B(155,25,117,.281,.349,.476), 71),
    p(5,  "Andy Pettitte",   "SP",  "Yankees",  "NYY","1990s", S(32,32,16,3.87,1.35, 7.2,200.1), 68),
    p(6,  "Mariano Rivera",  "RP",  "Yankees",  "NYY","1990s", R(66,36,1.88,1.00,10.8, 73.0), 92),
    p(7,  "Jorge Posada",    "C",   "Yankees",  "NYY","1990s", B(120,17, 73,.271,.361,.442), 65),

    # ── NYY 2000s ──────────────────────────────────────────────────────────────
    p(8,  "Derek Jeter",     "SS",  "Yankees",  "NYY","2000s", B(154,15, 75,.310,.381,.459), 80, e=15),
    p(9,  "Alex Rodriguez",  "3B",  "Yankees",  "NYY","2000s", B(150,43,120,.304,.394,.583), 95),
    p(10, "Jason Giambi",    "1B",  "Yankees",  "NYY","2000s", B(131,32, 92,.254,.404,.527), 78),
    p(11, "Robinson Cano",   "2B",  "Yankees",  "NYY","2000s", B(157,23, 97,.306,.354,.497), 80, e=8, fp=.986),
    p(12, "CC Sabathia",     "SP",  "Yankees",  "NYY","2000s", S(33,33,19,3.37,1.18, 8.0,209.2), 78),
    p(13, "Mariano Rivera",  "RP",  "Yankees",  "NYY","2000s", R(70,43,2.01,0.96,10.5, 75.2), 94),

    # ── BOS 2000s ──────────────────────────────────────────────────────────────
    p(14, "David Ortiz",     "1B",  "Red Sox",  "BOS","2000s", B(144,38,118,.299,.386,.603), 88),
    p(15, "Manny Ramirez",   "LF",  "Red Sox",  "BOS","2000s", B(142,37,113,.312,.409,.604), 92, e=7),
    p(16, "Kevin Youkilis",  "3B",  "Red Sox",  "BOS","2000s", B(140,18, 79,.291,.387,.482), 73),
    p(17, "Dustin Pedroia",  "2B",  "Red Sox",  "BOS","2000s", B(150,17, 83,.298,.366,.452), 74, e=6, fp=.990),
    p(18, "Jason Varitek",   "C",   "Red Sox",  "BOS","2000s", B(130,18, 73,.262,.346,.461), 64),
    p(19, "Pedro Martinez",  "SP",  "Red Sox",  "BOS","2000s", S(29,29,17,2.22,0.92,11.4,199.3), 98),
    p(20, "Curt Schilling",  "SP",  "Red Sox",  "BOS","2000s", S(32,32,20,3.42,1.09, 9.0,226.3), 84),
    p(21, "Jonathan Papelbon","RP", "Red Sox",  "BOS","2000s", R(65,35,2.59,1.00,12.2, 69.0), 79),

    # ── NYY 1950s ──────────────────────────────────────────────────────────────
    p(22, "Mickey Mantle",   "CF",  "Yankees",  "NYY","1950s", B(148,37,102,.307,.414,.575), 97, e=2, fp=.992),
    p(23, "Yogi Berra",      "C",   "Yankees",  "NYY","1950s", B(144,27, 98,.288,.355,.476), 82, e=6, fp=.990),
    p(24, "Whitey Ford",     "SP",  "Yankees",  "NYY","1950s", S(32,30,18,2.75,1.09, 6.7,237.1), 90),
    p(25, "Hank Bauer",      "RF",  "Yankees",  "NYY","1950s", B(135,18, 72,.279,.346,.454), 66),
    p(26, "Gil McDougald",   "SS",  "Yankees",  "NYY","1950s", B(136,13, 62,.276,.356,.404), 62),
    p(27, "Bill Skowron",    "1B",  "Yankees",  "NYY","1950s", B(133,20, 83,.295,.354,.486), 69),

    # ── LAD 1970s ──────────────────────────────────────────────────────────────
    p(28, "Steve Garvey",    "1B",  "Dodgers",  "LAD","1970s", B(155,21,111,.300,.349,.456), 76),
    p(29, "Ron Cey",         "3B",  "Dodgers",  "LAD","1970s", B(150,24, 91,.263,.346,.433), 63),
    p(30, "Davey Lopes",     "2B",  "Dodgers",  "LAD","1970s", B(139,11, 51,.262,.347,.388), 59),
    p(31, "Bill Russell",    "SS",  "Dodgers",  "LAD","1970s", B(151, 5, 47,.268,.315,.335), 50, e=22, fp=.954),
    p(32, "Dusty Baker",     "LF",  "Dodgers",  "LAD","1970s", B(146,21, 88,.281,.351,.435), 62),
    p(33, "Don Sutton",      "SP",  "Dodgers",  "LAD","1970s", S(36,36,17,3.09,1.16, 7.4,268.2), 77),
    p(34, "Tommy John",      "SP",  "Dodgers",  "LAD","1970s", S(34,34,16,3.27,1.18, 4.9,232.1), 70),
    p(35, "Steve Yeager",    "C",   "Dodgers",  "LAD","1970s", B(111, 9, 40,.234,.301,.364), 47),
    p(36, "Reggie Smith",    "RF",  "Dodgers",  "LAD","1970s", B(128,24, 87,.298,.380,.517), 78),

    # ── OAK 1970s ──────────────────────────────────────────────────────────────
    p(37, "Reggie Jackson",  "RF",  "Athletics","OAK","1970s", B(145,32, 98,.265,.357,.495), 82),
    p(38, "Catfish Hunter",  "SP",  "Athletics","OAK","1970s", S(37,37,21,2.91,1.11, 6.0,275.0), 83),
    p(39, "Joe Rudi",        "LF",  "Athletics","OAK","1970s", B(141,19, 77,.278,.327,.440), 64),
    p(40, "Sal Bando",       "3B",  "Athletics","OAK","1970s", B(152,23, 89,.251,.348,.413), 62),
    p(41, "Bert Campaneris", "SS",  "Athletics","OAK","1970s", B(148, 5, 49,.256,.313,.337), 51),
    p(42, "Dick Green",      "2B",  "Athletics","OAK","1970s", B(110, 7, 38,.237,.299,.330), 43),
    p(43, "Rollie Fingers",  "RP",  "Athletics","OAK","1970s", R(72,26,2.77,1.04, 7.5, 119.1), 83),
    p(44, "Gene Tenace",     "C",   "Athletics","OAK","1970s", B(117,18, 65,.250,.386,.437), 70),
    p(45, "Vida Blue",       "SP",  "Athletics","OAK","1970s", S(39,37,17,2.98,1.15, 8.1,273.1), 80),

    # ── STL 1980s ──────────────────────────────────────────────────────────────
    p(46, "Ozzie Smith",     "SS",  "Cardinals","STL","1980s", B(155, 5, 61,.272,.337,.364), 72, e=8, fp=.987),
    p(47, "Jack Clark",      "RF",  "Cardinals","STL","1980s", B(131,22, 95,.268,.391,.482), 79),
    p(48, "Willie McGee",    "CF",  "Cardinals","STL","1980s", B(151,11, 72,.294,.326,.411), 64),
    p(49, "Tommy Herr",      "2B",  "Cardinals","STL","1980s", B(154, 8, 83,.282,.346,.376), 58),
    p(50, "Terry Pendleton", "3B",  "Cardinals","STL","1980s", B(148,12, 69,.256,.304,.379), 55),
    p(51, "John Tudor",      "SP",  "Cardinals","STL","1980s", S(30,30,18,2.52,1.01, 5.5,229.2), 84),
    p(52, "Bob Forsch",      "SP",  "Cardinals","STL","1980s", S(33,33,16,3.47,1.21, 4.1,226.0), 66),
    p(53, "Todd Worrell",    "RP",  "Cardinals","STL","1980s", R(74,32,2.76,1.11, 8.7,  89.0), 76),
    p(54, "Darrell Porter",  "C",   "Cardinals","STL","1980s", B(112,13, 58,.253,.352,.402), 57),
    p(55, "Andy Van Slyke",  "LF",  "Cardinals","STL","1980s", B(134,13, 63,.257,.330,.413), 58),

    # ── ATL 1990s ──────────────────────────────────────────────────────────────
    p(56, "Tom Glavine",     "SP",  "Braves",   "ATL","1990s", S(33,33,20,3.12,1.23, 6.2,229.1), 84),
    p(57, "Greg Maddux",     "SP",  "Braves",   "ATL","1990s", S(35,35,19,2.11,0.99, 7.1,234.0), 98),
    p(58, "John Smoltz",     "SP",  "Braves",   "ATL","1990s", S(32,32,17,3.09,1.12, 8.3,218.2), 82),
    p(59, "Chipper Jones",   "3B",  "Braves",   "ATL","1990s", B(144,26, 93,.303,.400,.539), 87),
    p(60, "Fred McGriff",    "1B",  "Braves",   "ATL","1990s", B(148,28, 96,.293,.385,.521), 81),
    p(61, "David Justice",   "RF",  "Braves",   "ATL","1990s", B(132,24, 79,.278,.364,.499), 76),
    p(62, "Javy Lopez",      "C",   "Braves",   "ATL","1990s", B(118,18, 68,.281,.330,.463), 65),
    p(63, "Mark Lemke",      "2B",  "Braves",   "ATL","1990s", B(121, 5, 45,.246,.314,.330), 44),
    p(64, "Jeff Blauser",    "SS",  "Braves",   "ATL","1990s", B(131,12, 54,.262,.344,.402), 55),
    p(65, "Ron Gant",        "LF",  "Braves",   "ATL","1990s", B(135,29, 91,.259,.334,.483), 68),
    p(66, "Mark Wohlers",    "RP",  "Braves",   "ATL","1990s", R(65,26,3.02,1.24,10.1, 71.1), 68),

    # ── CIN 1970s (Big Red Machine) ────────────────────────────────────────────
    p(67, "Johnny Bench",    "C",   "Reds",     "CIN","1970s", B(142,30,102,.271,.340,.482), 88, e=6, fp=.991),
    p(68, "Pete Rose",       "3B",  "Reds",     "CIN","1970s", B(159,14, 72,.313,.386,.446), 83),
    p(69, "Joe Morgan",      "2B",  "Reds",     "CIN","1970s", B(146,17, 82,.296,.430,.476), 91, e=7, fp=.987),
    p(70, "Ken Griffey Sr.", "RF",  "Reds",     "CIN","1970s", B(147,10, 67,.300,.351,.411), 69),
    p(71, "Tony Perez",      "1B",  "Reds",     "CIN","1970s", B(153,27,105,.282,.343,.473), 77),
    p(72, "Dave Concepcion", "SS",  "Reds",     "CIN","1970s", B(152, 8, 63,.270,.330,.368), 60, e=12, fp=.972),
    p(73, "George Foster",   "LF",  "Reds",     "CIN","1970s", B(143,33,108,.287,.340,.517), 80),
    p(74, "Cesar Geronimo",  "CF",  "Reds",     "CIN","1970s", B(143, 9, 55,.253,.308,.368), 52, e=2, fp=.994),
    p(75, "Jack Billingham", "SP",  "Reds",     "CIN","1970s", S(35,33,14,3.49,1.23, 5.0,214.0), 62),
    p(76, "Gary Nolan",      "SP",  "Reds",     "CIN","1970s", S(32,31,15,3.07,1.11, 5.4,202.1), 70),
    p(77, "Will McEnaney",   "RP",  "Reds",     "CIN","1970s", R(70,15,2.99,1.20, 5.9,  88.0), 62),

    # ── PIT 1970s ──────────────────────────────────────────────────────────────
    p(78, "Roberto Clemente","RF",  "Pirates",  "PIT","1970s", B(147,14, 83,.330,.384,.490), 90, e=4, fp=.984),
    p(79, "Willie Stargell", "1B",  "Pirates",  "PIT","1970s", B(136,33, 99,.282,.362,.539), 87),
    p(80, "Dave Parker",     "RF",  "Pirates",  "PIT","1970s", B(148,20, 92,.314,.360,.504), 84),
    p(81, "Bill Madlock",    "3B",  "Pirates",  "PIT","1970s", B(144,11, 68,.326,.381,.453), 78),
    p(82, "Rennie Stennett", "2B",  "Pirates",  "PIT","1970s", B(143, 6, 58,.271,.305,.357), 50),
    p(83, "Frank Taveras",   "SS",  "Pirates",  "PIT","1970s", B(144, 1, 31,.258,.292,.307), 40, e=28, fp=.947),
    p(84, "Omar Moreno",     "CF",  "Pirates",  "PIT","1970s", B(156, 7, 47,.251,.307,.340), 43),
    p(85, "Manny Sanguillen","C",   "Pirates",  "PIT","1970s", B(118,10, 53,.296,.331,.410), 63),
    p(86, "Dock Ellis",      "SP",  "Pirates",  "PIT","1970s", S(30,30,14,3.42,1.30, 5.6,194.0), 63),
    p(87, "Jerry Reuss",     "SP",  "Pirates",  "PIT","1970s", S(33,33,14,3.48,1.28, 5.2,212.0), 62),
    p(88, "Kent Tekulve",    "RP",  "Pirates",  "PIT","1970s", R(90,26,2.57,1.09, 5.2, 122.1), 76),

    # ── SEA 2000s (Ichiro era) ─────────────────────────────────────────────────
    p(89, "Ichiro Suzuki",   "RF",  "Mariners", "SEA","2000s", B(161, 8, 56,.331,.370,.427), 85, e=3, fp=.986),
    p(90, "Edgar Martinez",  "1B",  "Mariners", "SEA","2000s", B(145,23, 84,.299,.418,.514), 85),
    p(91, "Bret Boone",      "2B",  "Mariners", "SEA","2000s", B(155,24, 95,.284,.344,.472), 72),
    p(92, "Mike Cameron",    "CF",  "Mariners", "SEA","2000s", B(150,23, 74,.253,.334,.462), 62, e=3, fp=.990),
    p(93, "John Olerud",     "1B",  "Mariners", "SEA","2000s", B(148,16, 78,.302,.402,.493), 77),
    p(94, "Freddy Garcia",   "SP",  "Mariners", "SEA","2000s", S(33,33,16,3.87,1.26, 7.0,214.1), 67),
    p(95, "Jamie Moyer",     "SP",  "Mariners", "SEA","2000s", S(33,33,18,4.07,1.29, 6.0,216.0), 62),
    p(96, "Kazuhiro Sasaki", "RP",  "Mariners", "SEA","2000s", R(63,37,3.14,1.11,10.8,  69.0), 70),

    # ── HOU 2010s (Astros) ─────────────────────────────────────────────────────
    p(97,  "Jose Altuve",    "2B",  "Astros",   "HOU","2010s", B(153,21, 80,.313,.367,.492), 88, e=7, fp=.987),
    p(98,  "Alex Bregman",   "3B",  "Astros",   "HOU","2010s", B(146,26, 90,.282,.383,.491), 82, e=10, fp=.963),
    p(99,  "George Springer","CF",  "Astros",   "HOU","2010s", B(150,29, 84,.274,.361,.507), 80),
    p(100, "Carlos Correa",  "SS",  "Astros",   "HOU","2010s", B(142,24, 84,.281,.357,.491), 80, e=12, fp=.977),
    p(101, "Yuli Gurriel",   "1B",  "Astros",   "HOU","2010s", B(148,13, 75,.293,.337,.426), 64),
    p(102, "Justin Verlander","SP", "Astros",   "HOU","2010s", S(33,33,16,2.52,0.90,10.8,214.1), 95),
    p(103, "Gerrit Cole",    "SP",  "Astros",   "HOU","2010s", S(33,33,17,2.75,0.96,13.1,200.0), 95),
    p(104, "Roberto Osuna",  "RP",  "Astros",   "HOU","2010s", R(62,38,2.63,0.97,10.7,  72.2), 78),
    p(105, "Brian McCann",   "C",   "Astros",   "HOU","2010s", B(118,13, 53,.241,.322,.394), 56),

    # ── BAL 1970s ──────────────────────────────────────────────────────────────
    p(106, "Frank Robinson", "RF",  "Orioles",  "BAL","1970s", B(137,27, 86,.282,.378,.491), 82),
    p(107, "Brooks Robinson","3B",  "Orioles",  "BAL","1970s", B(153,18, 82,.262,.320,.401), 70, e=6, fp=.972),
    p(108, "Boog Powell",    "1B",  "Orioles",  "BAL","1970s", B(132,21, 78,.253,.354,.432), 63),
    p(109, "Mark Belanger",  "SS",  "Orioles",  "BAL","1970s", B(148, 4, 42,.226,.290,.301), 42, e=10, fp=.977),
    p(110, "Dave McNally",   "SP",  "Orioles",  "BAL","1970s", S(35,34,17,3.22,1.14, 6.0,233.0), 73),
    p(111, "Jim Palmer",     "SP",  "Orioles",  "BAL","1970s", S(36,36,21,2.71,1.12, 7.1,259.0), 89),
    p(112, "Don Baylor",     "LF",  "Orioles",  "BAL","1970s", B(139,18, 73,.277,.351,.435), 64),
    p(113, "Paul Blair",     "CF",  "Orioles",  "BAL","1970s", B(141,12, 61,.258,.315,.391), 56, e=2, fp=.994),
    p(114, "Elrod Hendricks","C",   "Orioles",  "BAL","1970s", B( 95,10, 43,.225,.290,.366), 43),

    # ── CHC 1980s ──────────────────────────────────────────────────────────────
    p(115, "Ryne Sandberg",  "2B",  "Cubs",     "CHC","1980s", B(153,22, 83,.288,.349,.467), 83, e=5, fp=.993),
    p(116, "Andre Dawson",   "RF",  "Cubs",     "CHC","1980s", B(154,27, 97,.279,.323,.478), 73, e=3, fp=.987),
    p(117, "Leon Durham",    "1B",  "Cubs",     "CHC","1980s", B(139,17, 69,.280,.347,.468), 65),
    p(118, "Shawon Dunston", "SS",  "Cubs",     "CHC","1980s", B(143,11, 59,.265,.290,.386), 51, e=24, fp=.952),
    p(119, "Keith Moreland", "RF",  "Cubs",     "CHC","1980s", B(148,14, 80,.279,.327,.416), 56),
    p(120, "Rick Sutcliffe", "SP",  "Cubs",     "CHC","1980s", S(30,30,13,3.93,1.30, 6.3,191.0), 62),
    p(121, "Lee Smith",      "RP",  "Cubs",     "CHC","1980s", R(78,28,3.10,1.17, 8.6,  93.0), 70),
    p(122, "Jody Davis",     "C",   "Cubs",     "CHC","1980s", B(134,17, 66,.249,.307,.401), 52),
    p(123, "Bob Dernier",    "CF",  "Cubs",     "CHC","1980s", B(117, 4, 30,.254,.312,.342), 42, e=2, fp=.993),

    # ── SFG 2000s ──────────────────────────────────────────────────────────────
    p(124, "Barry Bonds",    "LF",  "Giants",   "SFG","2000s", B(143,52,108,.341,.515,.796), 100),
    p(125, "Jeff Kent",      "2B",  "Giants",   "SFG","2000s", B(151,27, 99,.300,.357,.513), 80, e=14),
    p(126, "Rich Aurilia",   "SS",  "Giants",   "SFG","2000s", B(143,17, 68,.276,.326,.440), 61),
    p(127, "J.T. Snow",      "1B",  "Giants",   "SFG","2000s", B(138,16, 71,.268,.359,.429), 59, e=4, fp=.996),
    p(128, "Benito Santiago","C",   "Giants",   "SFG","2000s", B(119,12, 52,.260,.315,.421), 52),
    p(129, "Jason Schmidt",  "SP",  "Giants",   "SFG","2000s", S(29,29,17,3.16,1.11, 9.2,186.0), 79),
    p(130, "Kirk Rueter",    "SP",  "Giants",   "SFG","2000s", S(32,32,12,4.11,1.36, 4.5,196.1), 53),
    p(131, "Robb Nen",       "RP",  "Giants",   "SFG","2000s", R(68,41,2.81,1.06,10.7,  71.2), 78),

    # ── DET 1980s ──────────────────────────────────────────────────────────────
    p(132, "Alan Trammell",  "SS",  "Tigers",   "DET","1980s", B(151,16, 80,.294,.358,.432), 78, e=10, fp=.977),
    p(133, "Lou Whitaker",   "2B",  "Tigers",   "DET","1980s", B(152,19, 77,.281,.370,.435), 76, e=8, fp=.986),
    p(134, "Kirk Gibson",    "RF",  "Tigers",   "DET","1980s", B(141,24, 82,.276,.348,.478), 72),
    p(135, "Jack Morris",    "SP",  "Tigers",   "DET","1980s", S(34,34,19,3.72,1.26, 6.8,245.1), 72),
    p(136, "Lance Parrish",  "C",   "Tigers",   "DET","1980s", B(133,26, 89,.263,.322,.449), 68),
    p(137, "Darrell Evans",  "1B",  "Tigers",   "DET","1980s", B(136,24, 78,.259,.376,.453), 67),
    p(138, "Chet Lemon",     "CF",  "Tigers",   "DET","1980s", B(143,20, 72,.257,.333,.426), 59),
    p(139, "Willie Hernandez","RP", "Tigers",   "DET","1980s", R(80,32,2.47,1.07, 8.8,  98.2), 80),

    # ── MIN 1980s ──────────────────────────────────────────────────────────────
    p(140, "Kirby Puckett",  "CF",  "Twins",    "MIN","1980s", B(158,22, 97,.316,.360,.482), 88, e=3, fp=.991),
    p(141, "Kent Hrbek",     "1B",  "Twins",    "MIN","1980s", B(146,26, 93,.287,.372,.497), 79),
    p(142, "Gary Gaetti",    "3B",  "Twins",    "MIN","1980s", B(154,29, 98,.263,.310,.460), 66),
    p(143, "Frank Viola",    "SP",  "Twins",    "MIN","1980s", S(36,36,17,3.72,1.24, 6.6,243.0), 68),
    p(144, "Jeff Reardon",   "RP",  "Twins",    "MIN","1980s", R(64,34,3.19,1.20, 7.5,  79.1), 64),
    p(145, "Greg Gagne",     "SS",  "Twins",    "MIN","1980s", B(146, 9, 48,.254,.296,.367), 45),

    # ── LAD 2010s ──────────────────────────────────────────────────────────────
    p(146, "Clayton Kershaw","SP",  "Dodgers",  "LAD","2010s", S(32,32,18,2.13,0.91,10.1,202.1), 100),
    p(147, "Corey Seager",   "SS",  "Dodgers",  "LAD","2010s", B(135,18, 72,.294,.359,.479), 77, e=12, fp=.974),
    p(148, "Justin Turner",  "3B",  "Dodgers",  "LAD","2010s", B(131,21, 83,.301,.370,.499), 78),
    p(149, "Cody Bellinger", "CF",  "Dodgers",  "LAD","2010s", B(142,36, 96,.276,.360,.545), 82, e=2, fp=.995),
    p(150, "Max Muncy",      "1B",  "Dodgers",  "LAD","2010s", B(128,33, 93,.248,.374,.530), 76),
    p(151, "Walker Buehler", "SP",  "Dodgers",  "LAD","2010s", S(30,30,14,3.26,1.02, 9.7,182.1), 80),
    p(152, "Kenley Jansen",  "RP",  "Dodgers",  "LAD","2010s", R(72,41,2.21,0.87,13.3,  71.2), 87),
    p(153, "Will Smith",     "C",   "Dodgers",  "LAD","2010s", B(104,15, 52,.267,.345,.464), 62),
    p(154, "Mookie Betts",   "RF",  "Dodgers",  "LAD","2010s", B(143,28, 82,.310,.375,.562), 90, e=3, fp=.988),

    # ── PHI 1970s ──────────────────────────────────────────────────────────────
    p(155, "Mike Schmidt",   "3B",  "Phillies", "PHI","1970s", B(150,34,101,.264,.365,.505), 91),
    p(156, "Steve Carlton",  "SP",  "Phillies", "PHI","1970s", S(36,36,19,3.10,1.19, 8.2,262.1), 89),
    p(157, "Greg Luzinski",  "LF",  "Phillies", "PHI","1970s", B(144,30, 97,.278,.361,.481), 73),
    p(158, "Larry Bowa",     "SS",  "Phillies", "PHI","1970s", B(154, 4, 43,.265,.296,.325), 55, e=10, fp=.981),
    p(159, "Dave Cash",      "2B",  "Phillies", "PHI","1970s", B(155, 4, 56,.285,.323,.354), 55),
    p(160, "Bob Boone",      "C",   "Phillies", "PHI","1970s", B(129,11, 57,.261,.311,.375), 50, e=5, fp=.992),
    p(161, "Tug McGraw",     "RP",  "Phillies", "PHI","1970s", R(68,20,3.08,1.26, 7.5,  90.1), 64),
    p(162, "Richie Allen",   "1B",  "Phillies", "PHI","1970s", B(137,28, 87,.293,.385,.526), 85),
    p(163, "Garry Maddox",   "CF",  "Phillies", "PHI","1970s", B(147,12, 68,.283,.326,.421), 60, e=2, fp=.995),

    # ── KCR 1980s ──────────────────────────────────────────────────────────────
    p(164, "George Brett",   "3B",  "Royals",   "KCR","1980s", B(149,20, 93,.308,.376,.502), 90),
    p(165, "Dan Quisenberry","RP",  "Royals",   "KCR","1980s", R(78,38,2.55,1.10, 2.8,  108.2), 82),
    p(166, "Frank White",    "2B",  "Royals",   "KCR","1980s", B(150,16, 71,.257,.298,.391), 56, e=7, fp=.988),
    p(167, "Willie Wilson",  "CF",  "Royals",   "KCR","1980s", B(155, 4, 55,.285,.318,.373), 58),
    p(168, "Hal McRae",      "LF",  "Royals",   "KCR","1980s", B(140,14, 79,.290,.354,.440), 67),
    p(169, "Bret Saberhagen","SP",  "Royals",   "KCR","1980s", S(30,30,18,2.97,1.04, 7.5,202.1), 83),
    p(170, "Willie Aikens",  "1B",  "Royals",   "KCR","1980s", B(120,17, 68,.265,.337,.447), 57),

    # ── CHW 2000s ──────────────────────────────────────────────────────────────
    p(171, "Frank Thomas",   "1B",  "White Sox","CHW","2000s", B(136,28, 83,.271,.392,.493), 80),
    p(172, "Paul Konerko",   "1B",  "White Sox","CHW","2000s", B(151,34,112,.278,.343,.490), 73),
    p(173, "Jermaine Dye",   "RF",  "White Sox","CHW","2000s", B(150,30, 95,.278,.328,.480), 69),
    p(174, "Mark Buehrle",   "SP",  "White Sox","CHW","2000s", S(33,33,16,3.81,1.22, 5.7,229.0), 69),
    p(175, "Jon Garland",    "SP",  "White Sox","CHW","2000s", S(32,32,14,4.26,1.36, 5.3,208.0), 58),
    p(176, "Bobby Jenks",    "RP",  "White Sox","CHW","2000s", R(69,41,2.99,1.18, 9.4,  78.0), 70),
    p(177, "Joe Crede",      "3B",  "White Sox","CHW","2000s", B(140,22, 72,.258,.308,.454), 57, e=11, fp=.961),
    p(178, "A.J. Pierzynski","C",   "White Sox","CHW","2000s", B(140,14, 64,.272,.308,.407), 53),

    # ── BRO 1950s ──────────────────────────────────────────────────────────────
    p(179, "Duke Snider",    "CF",  "Dodgers",  "BRO","1950s", B(149,40,116,.306,.393,.594), 92, e=2, fp=.993),
    p(180, "Jackie Robinson","2B",  "Dodgers",  "BRO","1950s", B(140,14, 71,.313,.420,.490), 93, e=8, fp=.985),
    p(181, "Roy Campanella", "C",   "Dodgers",  "BRO","1950s", B(133,28, 96,.276,.365,.499), 84, e=7, fp=.988),
    p(182, "Carl Furillo",   "RF",  "Dodgers",  "BRO","1950s", B(143,18, 84,.300,.351,.464), 73, e=4, fp=.983),
    p(183, "Gil Hodges",     "1B",  "Dodgers",  "BRO","1950s", B(154,31,100,.276,.363,.493), 80, e=5, fp=.995),
    p(184, "Pee Wee Reese",  "SS",  "Dodgers",  "BRO","1950s", B(146,11, 61,.275,.375,.403), 70, e=14, fp=.971),
    p(185, "Don Newcombe",   "SP",  "Dodgers",  "BRO","1950s", S(34,33,18,3.52,1.27, 6.1,235.2), 71),
    p(186, "Don Drysdale",   "SP",  "Dodgers",  "BRO","1950s", S(28,26,12,3.65,1.23, 7.4,175.0), 66),
    p(187, "Jim Gilliam",    "3B",  "Dodgers",  "BRO","1950s", B(147, 8, 56,.267,.366,.377), 60),
    p(188, "Sandy Koufax",   "SP",  "Dodgers",  "BRO","1950s", S(26,22,11,3.86,1.30, 8.2,158.2), 64),

    # ── CLE 1990s ──────────────────────────────────────────────────────────────
    p(189, "Manny Ramirez",  "LF",  "Guardians","CLE","1990s", B(150,33,105,.313,.398,.578), 88),
    p(190, "Jim Thome",      "3B",  "Guardians","CLE","1990s", B(148,35, 99,.285,.411,.564), 87),
    p(191, "Albert Belle",   "LF",  "Guardians","CLE","1990s", B(152,43,128,.295,.366,.549), 88),
    p(192, "Kenny Lofton",   "CF",  "Guardians","CLE","1990s", B(153,10, 63,.310,.379,.440), 78, e=2, fp=.993),
    p(193, "Sandy Alomar Jr.","C",  "Guardians","CLE","1990s", B(112,13, 58,.284,.322,.430), 61),
    p(194, "Carlos Baerga",  "2B",  "Guardians","CLE","1990s", B(155,21, 90,.293,.336,.457), 69),
    p(195, "Omar Vizquel",   "SS",  "Guardians","CLE","1990s", B(154, 5, 56,.281,.353,.363), 62, e=8, fp=.983),
    p(196, "Orel Hershiser", "SP",  "Guardians","CLE","1990s", S(32,32,16,4.28,1.33, 6.9,203.0), 57),
    p(197, "Charles Nagy",   "SP",  "Guardians","CLE","1990s", S(33,33,17,4.04,1.32, 5.8,216.0), 60),
    p(198, "Jose Mesa",      "RP",  "Guardians","CLE","1990s", R(72,46,3.15,1.27, 7.6,  84.1), 64),

    # ── TOR 1990s ──────────────────────────────────────────────────────────────
    p(199, "Roberto Alomar", "2B",  "Blue Jays","TOR","1990s", B(154,11, 77,.312,.395,.451), 86, e=6, fp=.989),
    p(200, "Joe Carter",     "RF",  "Blue Jays","TOR","1990s", B(155,30,104,.256,.305,.441), 66),
    p(201, "John Olerud",    "1B",  "Blue Jays","TOR","1990s", B(154,24, 93,.293,.404,.495), 80, e=4, fp=.996),
    p(202, "Devon White",    "CF",  "Blue Jays","TOR","1990s", B(148,17, 70,.267,.325,.421), 59, e=2, fp=.994),
    p(203, "Pat Borders",    "C",   "Blue Jays","TOR","1990s", B(118, 9, 49,.247,.287,.380), 44),
    p(204, "Jack Morris",    "SP",  "Blue Jays","TOR","1990s", S(27,27,21,6.19,1.61, 4.8,152.2), 42),
    p(205, "Pat Hentgen",    "SP",  "Blue Jays","TOR","1990s", S(33,33,17,3.91,1.32, 6.4,218.2), 64),
    p(206, "Duane Ward",     "RP",  "Blue Jays","TOR","1990s", R(76,45,2.40,1.07,10.6,  97.2), 80),
    p(207, "Tony Fernandez", "SS",  "Blue Jays","TOR","1990s", B(144, 8, 63,.285,.342,.399), 61, e=12, fp=.975),

    # ── MIN 2000s (Twins) ──────────────────────────────────────────────────────
    p(208, "Johan Santana",  "SP",  "Twins",    "MIN","2000s", S(34,34,18,3.18,1.09,10.5,213.1), 93),
    p(209, "Torii Hunter",   "CF",  "Twins",    "MIN","2000s", B(152,25, 85,.274,.333,.456), 68, e=2, fp=.994),
    p(210, "Joe Mauer",      "C",   "Twins",    "MIN","2000s", B(143,10, 63,.327,.414,.452), 84, e=5, fp=.993),
    p(211, "Justin Morneau", "1B",  "Twins",    "MIN","2000s", B(142,30, 99,.282,.347,.494), 73),
    p(212, "Michael Cuddyer","RF",  "Twins",    "MIN","2000s", B(143,16, 68,.278,.346,.440), 60),
    p(213, "Nick Punto",     "SS",  "Twins",    "MIN","2000s", B(126, 3, 36,.243,.310,.313), 37, e=10, fp=.978),
    p(214, "Joe Nathan",     "RP",  "Twins",    "MIN","2000s", R(74,43,2.13,0.93,11.4,  74.1), 87),

    # ═══════════════════════════════════════════════════════════════════════════
    # ── NYY 1940s ──────────────────────────────────────────────────────────────
    p(215, "Joe DiMaggio",   "CF",  "Yankees",  "NYY","1940s", B(148,29,112,.322,.392,.541), 96, e=2,  fp=.992),
    p(216, "Joe Gordon",     "2B",  "Yankees",  "NYY","1940s", B(150,24, 93,.272,.340,.452), 74, e=14, fp=.977),
    p(217, "Tommy Henrich",  "RF",  "Yankees",  "NYY","1940s", B(138,24, 85,.282,.375,.490), 74, e=4,  fp=.985),
    p(218, "Charlie Keller", "LF",  "Yankees",  "NYY","1940s", B(142,25, 90,.285,.410,.544), 84, e=6,  fp=.970),
    p(219, "Phil Rizzuto",   "SS",  "Yankees",  "NYY","1940s", B(148, 5, 62,.275,.348,.367), 55, e=14, fp=.967),
    p(220, "Bill Dickey",    "C",   "Yankees",  "NYY","1940s", B(126,15, 73,.285,.380,.490), 72, e=7,  fp=.981),
    p(221, "Nick Etten",     "1B",  "Yankees",  "NYY","1940s", B(154,22, 91,.285,.379,.477), 60, e=9,  fp=.988),
    p(222, "Spud Chandler",  "SP",  "Yankees",  "NYY","1940s", S(30,30,20,1.64,1.08, 6.5,253.0), 99),
    p(223, "Johnny Murphy",  "RP",  "Yankees",  "NYY","1940s", R(52,19,3.49,1.23, 5.2, 58.0), 60),

    # ── BOS 1940s ──────────────────────────────────────────────────────────────
    p(224, "Ted Williams",   "LF",  "Red Sox",  "BOS","1940s", B(150,36,113,.356,.492,.648), 100, e=3, fp=.979),
    p(225, "Bobby Doerr",    "2B",  "Red Sox",  "BOS","1940s", B(154,22, 95,.285,.350,.465), 70,  e=12, fp=.979),
    p(226, "Johnny Pesky",   "SS",  "Red Sox",  "BOS","1940s", B(150, 6, 61,.318,.396,.415), 64,  e=22, fp=.956),
    p(227, "Dom DiMaggio",   "CF",  "Red Sox",  "BOS","1940s", B(144, 7, 62,.298,.394,.396), 65,  e=3,  fp=.990),
    p(228, "Rudy York",      "1B",  "Red Sox",  "BOS","1940s", B(149,27, 98,.275,.343,.475), 72,  e=9,  fp=.988),
    p(229, "Tex Hughson",    "SP",  "Red Sox",  "BOS","1940s", S(30,30,18,2.94,1.15, 5.8,237.0), 82),
    p(230, "Dave Ferriss",   "SP",  "Red Sox",  "BOS","1940s", S(36,36,25,3.25,1.26, 4.1,274.0), 73),
    p(231, "Hal Wagner",     "C",   "Red Sox",  "BOS","1940s", B(113, 6, 52,.270,.345,.400), 44,  e=9,  fp=.980),

    # ── CLE 1940s ──────────────────────────────────────────────────────────────
    p(232, "Bob Feller",     "SP",  "Guardians","CLE","1940s", S(37,37,27,2.18,1.28, 8.2,299.0), 97),
    p(233, "Lou Boudreau",   "SS",  "Guardians","CLE","1940s", B(152,18,106,.327,.409,.453), 82, e=15, fp=.970),
    p(234, "Larry Doby",     "CF",  "Guardians","CLE","1940s", B(141,24, 85,.301,.386,.490), 75, e=4,  fp=.987),
    p(235, "Ken Keltner",    "3B",  "Guardians","CLE","1940s", B(150,22, 90,.278,.352,.457), 65, e=16, fp=.953),
    p(236, "Bob Lemon",      "SP",  "Guardians","CLE","1940s", S(37,37,20,2.82,1.21, 5.8,286.0), 87),
    p(237, "Jim Hegan",      "C",   "Guardians","CLE","1940s", B(138,12, 54,.240,.300,.360), 45, e=6,  fp=.991),

    # ── STL 1940s ──────────────────────────────────────────────────────────────
    p(238, "Stan Musial",    "LF",  "Cardinals","STL","1940s", B(154,28,120,.346,.429,.587), 100, e=4, fp=.979),
    p(239, "Enos Slaughter", "RF",  "Cardinals","STL","1940s", B(152,18, 95,.310,.374,.458), 77,  e=4, fp=.979),
    p(240, "Marty Marion",   "SS",  "Cardinals","STL","1940s", B(149, 6, 63,.272,.337,.365), 55,  e=12, fp=.972),
    p(241, "Mort Cooper",    "SP",  "Cardinals","STL","1940s", S(33,33,22,1.78,1.12, 6.2,278.0), 98),
    p(242, "Harry Brecheen", "SP",  "Cardinals","STL","1940s", S(30,30,20,2.24,1.14, 5.8,233.0), 90),
    p(243, "Whitey Kurowski","3B",  "Cardinals","STL","1940s", B(148,21, 89,.287,.363,.449), 68, e=15, fp=.956),
    p(244, "Walker Cooper",  "C",   "Cardinals","STL","1940s", B(124,13, 72,.317,.362,.469), 70, e=8,  fp=.981),

    # ── DET 1940s ──────────────────────────────────────────────────────────────
    p(245, "Hank Greenberg", "1B",  "Tigers",   "DET","1940s", B(142,37,122,.311,.404,.604), 96, e=8,  fp=.989),
    p(246, "Hal Newhouser",  "SP",  "Tigers",   "DET","1940s", S(36,36,29,1.81,1.15, 7.1,313.0), 100),
    p(247, "Dizzy Trout",    "SP",  "Tigers",   "DET","1940s", S(40,40,27,2.12,1.18, 5.4,352.0), 95),
    p(248, "Dick Wakefield", "LF",  "Tigers",   "DET","1940s", B(138,12, 78,.316,.407,.535), 76, e=5,  fp=.972),
    p(249, "Eddie Mayo",     "2B",  "Tigers",   "DET","1940s", B(148, 5, 54,.285,.360,.374), 52, e=12, fp=.979),
    p(250, "Birdie Tebbetts","C",   "Tigers",   "DET","1940s", B(121, 6, 51,.267,.332,.363), 48, e=9,  fp=.981),

    # ── BRO 1940s ──────────────────────────────────────────────────────────────
    p(251, "Pete Reiser",    "CF",  "Dodgers",  "BRO","1940s", B(127,14, 76,.310,.400,.508), 81, e=4,  fp=.984),
    p(252, "Dolph Camilli",  "1B",  "Dodgers",  "BRO","1940s", B(149,34,120,.285,.395,.525), 87, e=7,  fp=.990),
    p(253, "Whit Wyatt",     "SP",  "Dodgers",  "BRO","1940s", S(32,32,22,2.34,1.21, 5.7,286.0), 92),
    p(254, "Billy Herman",   "2B",  "Dodgers",  "BRO","1940s", B(143, 5, 57,.285,.360,.362), 57, e=9,  fp=.984),
    p(255, "Augie Galan",    "LF",  "Dodgers",  "BRO","1940s", B(140, 9, 62,.307,.414,.430), 61, e=5,  fp=.971),

    # ── NYG 1940s ──────────────────────────────────────────────────────────────
    p(256, "Mel Ott",        "RF",  "Giants",   "NYG","1940s", B(138,26, 93,.308,.413,.516), 88, e=4,  fp=.979),
    p(257, "Johnny Mize",    "1B",  "Giants",   "NYG","1940s", B(145,28,110,.311,.400,.543), 90, e=7,  fp=.991),
    p(258, "Willard Marshall","CF", "Giants",   "NYG","1940s", B(148,17, 74,.281,.348,.449), 60, e=4,  fp=.987),
    p(259, "Bill Voiselle",  "SP",  "Giants",   "NYG","1940s", S(35,35,21,3.02,1.29, 5.6,312.2), 75),
    p(260, "Ace Adams",      "RP",  "Giants",   "NYG","1940s", R(65,11,3.47,1.31, 4.2, 97.0), 55),
    p(261, "Ernie Lombardi", "C",   "Giants",   "NYG","1940s", B(120,14, 73,.296,.357,.441), 68, e=9,  fp=.981),

    # ── CHC 1940s ──────────────────────────────────────────────────────────────
    p(262, "Phil Cavarretta","1B",  "Cubs",     "CHC","1940s", B(150,20, 97,.355,.449,.500), 85, e=8,  fp=.990),
    p(263, "Bill Nicholson", "RF",  "Cubs",     "CHC","1940s", B(150,29,117,.294,.367,.531), 82, e=5,  fp=.979),
    p(264, "Andy Pafko",     "CF",  "Cubs",     "CHC","1940s", B(144,21, 93,.298,.357,.489), 74, e=4,  fp=.987),
    p(265, "Claude Passeau", "SP",  "Cubs",     "CHC","1940s", S(33,33,17,2.86,1.22, 5.2,227.0), 78),
]

print(f"Seed data: {len(players)} players")
os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(players, f, indent=2, ensure_ascii=False)
print(f"Written to {OUTPUT_PATH}")
