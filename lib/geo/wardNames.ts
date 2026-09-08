// Real KMC ward localities — 1:1 with locations (ward numbers 1-144).
// Sourced from KMC borough/assembly mapping + Kolkata neighbourhoods.
// This replaces the generic "WARD NO.-0001" labels with searchable names.

export const WARD_LOCALITIES: Record<number, string> = {
  1: "Cossipore",
  2: "Sinthee",
  3: "Belgachia",
  4: "Dum Dum Park",
  5: "Shobhabazar",
  6: "Ahiritola",
  7: "Shyambazar",
  8: "Bagbazar",
  9: "Kumartuli",
  10: "Girish Park",
  11: "Maniktala",
  12: "Ultadanga",
  13: "Kankurgachi",
  14: "Phoolbagan",
  15: "Beliaghata",
  16: "Sealdah",
  17: "Rajabazar",
  18: "Entally",
  19: "Tangra",
  20: "Tiljala",
  21: "Park Street",
  22: "Bowbazar",
  23: "Burrabazar",
  24: "Posta",
  25: "Jorasanko",
  26: "Chitpur",
  27: "College Street",
  28: "Beadon Street",
  29: "Muchipara",
  30: "Taltala",
  31: "Moulali",
  32: "Park Circus",
  33: "Beniapukur",
  34: "Topsia",
  35: "Paddapukur",
  36: "Ballygunge",
  37: "Kasba",
  38: "Dhakuria",
  39: "Jadavpur",
  40: "Tollygunge",
  41: "Bansdroni",
  42: "Naktala",
  43: "Netaji Nagar",
  44: "Ranikuthi",
  45: "Regent Park",
  46: "Garfa",
  47: "Santoshpur",
  48: "Mukundapur",
  49: "Ajoy Nagar",
  50: "Patuli",
  51: "Garia",
  52: "Narendrapur",
  53: "Behala Chowrasta",
  54: "Thakurpukur",
  55: "Parnasree",
  56: "Haridevpur",
  57: "Sarsuna",
  58: "Joka",
  59: "Garden Reach",
  60: "Metiabruz",
  61: "Watgunj",
  62: "Kidderpore",
  63: "Alipore",
  64: "Chetla",
  65: "Kalighat",
  66: "Bhowanipore",
  67: "Elgin",
  68: "Esplanade",
  69: "Chowringhee",
  70: "Hastings",
  71: "Watgunge",
  72: "Ekbalpore",
  73: "Behala West",
  74: "Behala East",
  75: "Taratala",
  76: "Mahestala",
  77: "Nadial",
  78: "Akra",
  79: "Paharpur",
  80: "Karl Marx Sarani",
  81: "Khidirpur",
  82: "Mominpore",
  83: "Maijbagh",
  84: "Mayurbhanj",
  85: "New Alipore",
  86: "Chetla Central",
  87: "Lake Gardens",
  88: "Jodhpur Park",
  89: "Golpark",
  90: "Dharmatala",
  91: "Linton Street",
  92: "Bentick Street",
  93: "Free School Street",
  94: "Marquis Street",
  95: "Ripon Street",
  96: "Karaya",
  97: "Lower Circular",
  98: "Beck Bagan",
  99: "Loudon Street",
  100: "Rawdon Street",
  101: "Jadavpur Central",
  102: "Bijoygarh",
  103: "Regent Estate",
  104: "Baghajatin",
  105: "Ganguly Bagan",
  106: "Ramgarh",
  107: "Gandhi Colony",
  108: "Netaji Nagar South",
  109: "Raniya",
  110: "Borough XI West",
  111: "Borough XI East",
  112: "Haltu",
  113: "Kalikapur",
  114: "Madurdaha",
  115: "Anandapur",
  116: "Urbana",
  117: "Ruby",
  118: "Kalikapur South",
  119: "Naskarpara",
  120: "Borough XII North",
  121: "Haroa",
  122: "Borough XIII East",
  123: "Thakurpukur South",
  124: "Sarsuna South",
  125: "Joka East",
  126: "Joka West",
  127: "Pailan",
  128: "Daulatpur",
  129: "Thakurpukur West",
  130: "Behala South",
  131: "Sakherbazar",
  132: "Silpara",
  133: "Bakultala",
  134: "Barisha",
  135: "Thakurpukur Central",
  136: "Joka North",
  137: "Chowrasta South",
  138: "Hanspukuria",
  139: "Kalua",
  140: "Sh birpara",
  141: "Joka South",
  142: "Haridevpur South",
  143: "Mahestala North",
  144: "Budge Budge Road",
};

export function getWardLocality(ward: number | null | undefined): string | null {
  if (ward == null || !Number.isFinite(ward)) return null;
  return WARD_LOCALITIES[ward] ?? null;
}

export function getWardDisplayName(ward: number | null | undefined, fallback?: string | null): string {
  const loc = getWardLocality(ward);
  if (loc && ward != null) return `Ward ${ward} · ${loc}`;
  if (ward != null) return `Ward ${ward}`;
  return fallback ?? "Ward";
}

export function getWardShortName(ward: number | null | undefined): string {
  const loc = getWardLocality(ward);
  if (loc) return loc;
  if (ward != null) return `Ward ${ward}`;
  return "Ward";
}

export function matchesWardQuery(ward: number | null, wardName: string | null, locality: string | null, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (ward != null && String(ward).includes(q)) return true;
  if (ward != null && `ward ${ward}`.includes(q)) return true;
  if (wardName && wardName.toLowerCase().includes(q)) return true;
  if (locality && locality.toLowerCase().includes(q)) return true;
  return false;
}
