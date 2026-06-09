export interface Franchise {
  abbr: string;
  name: string;
  city: string;
  color: string;
  decades: string[];
}

export const FRANCHISES: Franchise[] = [
  // AL East
  { abbr: 'NYY', name: 'Yankees',       city: 'New York',    color: '#003087', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'BOS', name: 'Red Sox',        city: 'Boston',      color: '#BD3039', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'TOR', name: 'Blue Jays',      city: 'Toronto',     color: '#134A8E', decades: ['1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'BAL', name: 'Orioles',        city: 'Baltimore',   color: '#DF4601', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'TBR', name: 'Rays',           city: 'Tampa Bay',   color: '#092C5C', decades: ['2000s','2010s','2020s'] },
  // AL Central
  { abbr: 'CHW', name: 'White Sox',      city: 'Chicago',     color: '#27251F', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'CLE', name: 'Guardians',      city: 'Cleveland',   color: '#00385D', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'MIN', name: 'Twins',          city: 'Minnesota',   color: '#002B5C', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'KCR', name: 'Royals',         city: 'Kansas City', color: '#004687', decades: ['1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'DET', name: 'Tigers',         city: 'Detroit',     color: '#0C2340', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  // AL West
  { abbr: 'HOU', name: 'Astros',         city: 'Houston',     color: '#002D62', decades: ['1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'OAK', name: 'Athletics',      city: 'Oakland',     color: '#003831', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'SEA', name: 'Mariners',       city: 'Seattle',     color: '#0C2C56', decades: ['1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'TEX', name: 'Rangers',        city: 'Texas',       color: '#003278', decades: ['1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'LAA', name: 'Angels',         city: 'Los Angeles', color: '#BA0021', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  // NL East
  { abbr: 'ATL', name: 'Braves',         city: 'Atlanta',     color: '#CE1141', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'NYM', name: 'Mets',           city: 'New York',    color: '#002D72', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'PHI', name: 'Phillies',       city: 'Philadelphia',color: '#E81828', decades: ['1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'MIA', name: 'Marlins',        city: 'Miami',       color: '#00A3E0', decades: ['1990s','2000s','2010s','2020s'] },
  { abbr: 'WSN', name: 'Nationals',      city: 'Washington',  color: '#AB0003', decades: ['2000s','2010s','2020s'] },
  // NL Central
  { abbr: 'CHC', name: 'Cubs',           city: 'Chicago',     color: '#0E3386', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'STL', name: 'Cardinals',      city: 'St. Louis',   color: '#C41E3A', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'MIL', name: 'Brewers',        city: 'Milwaukee',   color: '#12284B', decades: ['1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'PIT', name: 'Pirates',        city: 'Pittsburgh',  color: '#FDB827', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'CIN', name: 'Reds',           city: 'Cincinnati',  color: '#C6011F', decades: ['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  // NL West
  { abbr: 'LAD', name: 'Dodgers',        city: 'Los Angeles', color: '#005A9C', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'SFG', name: 'Giants',         city: 'San Francisco',color: '#FD5A1E', decades: ['1960s','1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'SDN', name: 'Padres',         city: 'San Diego',   color: '#2F241D', decades: ['1970s','1980s','1990s','2000s','2010s','2020s'] },
  { abbr: 'COL', name: 'Rockies',        city: 'Colorado',    color: '#33006F', decades: ['1990s','2000s','2010s','2020s'] },
  { abbr: 'ARI', name: 'Diamondbacks',   city: 'Arizona',     color: '#A71930', decades: ['2000s','2010s','2020s'] },
  // Historic / relocated
  { abbr: 'MON', name: 'Expos',          city: 'Montreal',    color: '#003087', decades: ['1970s','1980s','1990s','2000s'] },
  { abbr: 'BRO', name: 'Dodgers',        city: 'Brooklyn',    color: '#005A9C', decades: ['1940s','1950s'] },
  { abbr: 'NYG', name: 'Giants',         city: 'New York',    color: '#FD5A1E', decades: ['1940s','1950s'] },
];

export const FRANCHISE_MAP = new Map(FRANCHISES.map(f => [f.abbr, f]));

// Era averages for normalization (league OPS, OBP, ERA, and WHIP)
// obp used for weighted-OPS calculation in WAR formula and simulation
export const ERA_AVERAGES: Record<string, { ops: number; obp: number; era: number; whip: number }> = {
  '1940s': { ops: 0.712, obp: 0.327, era: 3.62, whip: 1.32 },
  '1950s': { ops: 0.740, obp: 0.339, era: 4.00, whip: 1.38 },
  '1960s': { ops: 0.694, obp: 0.305, era: 3.60, whip: 1.29 },
  '1970s': { ops: 0.715, obp: 0.321, era: 3.80, whip: 1.33 },
  '1980s': { ops: 0.730, obp: 0.323, era: 3.95, whip: 1.36 },
  '1990s': { ops: 0.752, obp: 0.338, era: 4.22, whip: 1.41 },
  '2000s': { ops: 0.762, obp: 0.332, era: 4.38, whip: 1.43 },
  '2010s': { ops: 0.728, obp: 0.320, era: 4.08, whip: 1.33 },
  '2020s': { ops: 0.730, obp: 0.318, era: 4.10, whip: 1.32 },
};
