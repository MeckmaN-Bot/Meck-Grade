// MeckGrade Holo — shared data
const HOLO_DATA = {
  user: { name: "Mecky", tier: "Curator · Pro", initials: "MK", email: "mecky@meckgrade.app" },

  cards: [
    { id: "MG-2026-0508-021", name: "Charizard", set: "Base · 4/102", year: 1999, lang: "EN",
      img: "cards/14db6e3a-d24d-45c3-a16e-6f365a4406b6_front.jpg",
      grade: 9.0, raw: 580, graded10: 9200, graded9: 2400, status: "graded", date: "08 May", trend: "up" },
    { id: "MG-2026-0508-019", name: "Mew (Promo)", set: "Black Star · 8", year: 1999, lang: "EN",
      img: "cards/21593dbe-b500-430b-a962-f5a76a9e05c8_front.jpg",
      grade: 9.5, raw: 240, graded10: 1800, graded9: 540, status: "graded", date: "06 May", trend: "up" },
    { id: "MG-2026-0508-017", name: "Blastoise", set: "Base · 2/102", year: 1999, lang: "EN",
      img: "cards/2dcb418d-710a-4553-9b78-bfb784cb8725_front.jpg",
      grade: 8.5, raw: 180, graded10: 2100, graded9: 620, status: "review", date: "06 May", trend: "flat" },
    { id: "MG-2026-0508-015", name: "Pikachu Illustrator", set: "Promo", year: 1998, lang: "JP",
      img: "cards/4dfe0d87-f8bb-4ece-94ab-9a25795ea224_front.jpg",
      grade: 7.5, raw: 80, graded10: 380, graded9: 140, status: "graded", date: "05 May", trend: "down" },
    { id: "MG-2026-0508-013", name: "Venusaur", set: "Base · 15/102", year: 1999, lang: "EN",
      img: "cards/59350832-5417-40a8-934b-5b1ba8fc6a06_front.jpg",
      grade: 9.0, raw: 220, graded10: 1100, graded9: 380, status: "graded", date: "04 May", trend: "up" },
    { id: "MG-2026-0508-011", name: "Gyarados", set: "Base · 6/102", year: 1999, lang: "EN",
      img: "cards/75aed0a3-bb95-41ab-be9a-c5a619431859_front.jpg",
      grade: 8.0, raw: 95, graded10: 480, graded9: 180, status: "review", date: "03 May", trend: "flat" },
    { id: "MG-2026-0508-009", name: "Alakazam", set: "Base · 1/102", year: 1999, lang: "EN",
      img: "cards/9d4719fb-0d1e-4382-b9e7-ad3a1494c554_front.jpg",
      grade: 9.0, raw: 110, graded10: 720, graded9: 240, status: "graded", date: "02 May", trend: "up" },
    { id: "MG-2026-0508-007", name: "Dragonite", set: "Fossil · 4/62", year: 1999, lang: "EN",
      img: "cards/a2a7f73d-903d-477e-8c5d-06ed9e637d1e_front.jpg",
      grade: 8.5, raw: 75, graded10: 360, graded9: 140, status: "graded", date: "01 May", trend: "up" },
    { id: "MG-2026-0508-005", name: "Mewtwo", set: "Base · 10/102", year: 1999, lang: "EN",
      img: "cards/e11e9fd9-7384-4de4-a334-ad8f2f4e56e7_front.jpg",
      grade: 9.5, raw: 320, graded10: 2400, graded9: 720, status: "graded", date: "30 Apr", trend: "up" }
  ],

  hero: {
    img: "cards/14db6e3a-d24d-45c3-a16e-6f365a4406b6_front.jpg",
    name: "Charizard",
    set: "Base Set · 4/102 · Holo · 1999",
    grade: 9.0,
    centeringFB: { l: 53, r: 47, t: 50, b: 50 },
    centeringLR: { l: 49, r: 51, t: 52, b: 48 },
    subscores: [
      { label: "Centering", value: 8.5, raw: "53/47 · 49/51" },
      { label: "Edges",     value: 9.5, raw: "12 micro-marks" },
      { label: "Corners",   value: 9.0, raw: "TR softening" },
      { label: "Surface",   value: 9.5, raw: "no scratches" }
    ],
    findings: [
      { type: "minor", region: "Top-right corner", note: "Soft whitening, ~0.4mm radius" },
      { type: "info", region: "Holo foil", note: "Pristine — no print lines or scratches" },
      { type: "minor", region: "Front centering",  note: "53/47 horizontal — borderline 9 / 9.5" },
      { type: "info", region: "Back centering",    note: "49/51 — within tolerance" }
    ],
    roi: {
      raw: 580,
      g10: 9200, g9: 2400, g8: 1100,
      probability: { p10: 0.18, p9: 0.62, p8: 0.16, p7: 0.04 },
      grading: 95, ship: 22,
      ev: 3284,
      verdict: "submit"
    }
  },

  ticker: [
    { name: "Charizard PSA 10", val: "9,200", d: "+4.2%", dir: "up" },
    { name: "Blastoise PSA 10", val: "2,100", d: "+1.8%", dir: "up" },
    { name: "Mewtwo PSA 9",     val: "720",   d: "−0.6%", dir: "down" },
    { name: "Pikachu Illustrator", val: "380", d: "−2.1%", dir: "down" },
    { name: "Venusaur PSA 10",  val: "1,100", d: "+3.4%", dir: "up" },
    { name: "Mew Promo PSA 10", val: "1,800", d: "+0.9%", dir: "up" },
    { name: "Alakazam PSA 9",   val: "240",   d: "+2.2%", dir: "up" },
    { name: "Dragonite PSA 10", val: "360",   d: "−1.4%", dir: "down" }
  ],

  population: [
    { card: "Charizard · Base 4/102",  total: 32418, p10: 1486, p9: 4602, p8: 6201 },
    { card: "Blastoise · Base 2/102",  total: 21884, p10: 928,  p9: 3201, p8: 4806 },
    { card: "Venusaur · Base 15/102",  total: 17220, p10: 612,  p9: 2418, p8: 3620 },
    { card: "Mewtwo · Base 10/102",    total: 15044, p10: 521,  p9: 2210, p8: 3040 },
    { card: "Pikachu Illustrator",     total:   72,  p10: 11,   p9: 18,   p8: 21 }
  ],

  watch: [
    { card: "Charizard · Shadowless",  trigger: "ROI > 1500", state: "armed", spread: "+12%" },
    { card: "Blastoise · 1st Edition", trigger: "PSA 10 < 4500", state: "cold", spread: "−3%" },
    { card: "Mew · Black Star Promo",  trigger: "Population +50", state: "armed", spread: "+8%" },
    { card: "Venusaur · Holo",         trigger: "ROI > 800",  state: "triggered", spread: "+22%" }
  ]
};

window.HOLO_DATA = HOLO_DATA;
