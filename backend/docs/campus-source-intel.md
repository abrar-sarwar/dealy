# Campus source intel (parsed from operator docs)

Parsed from two operator-provided Word docs (in `~/Downloads`, NOT committed):
`campus_deals_and_niche_food_spots.docx` and `campus_deals_restaurants_ranked_v2.docx`
(both dated 2026-06-24). The docs are a **working source sheet, not a publish list** —
they explicitly say "verify the source URL or confirm in-store before posting to Dealy."

Classification labels: `verified_deal_source` (real URL + explicit current discounts),
`source_lead` (good lead, needs URL verification), `restaurant_target` (worth Places
resolution / crawl, no confirmed deal), `student_discount_candidate` (mentions a student
discount, needs proof), `not_actionable` (vague / expired / closed / no public source).

## A. Campus student-discount LIST pages — `verified_deal_source`
Real public pages that explicitly list current student discounts. All verified **HTTP 200**
(2026-06-25). These are the actionable crawl sources — Firecrawl/Gemini should extract the
listed offers. Seed with `dealUrl` = the page (so `resolveCrawlTargets` keeps the deep link).

| Campus | URL | HTTP | Sample offers the page lists (evidence, not to hand-publish) |
|---|---|---|---|
| GSU | https://engagement.gsu.edu/student-center/foodandretail/ | 200 | Food & retail student perks hub (the doc's cited GSU source) |
| GSU | (attractions, same hub) | 200 | Alliance Theatre $15 (COLLEGE15), Zoo Atlanta 15% (CGSU), SkyView $17.50, Regal $9, Medieval Times 30% — codes are public |
| GT | https://www.buzzcard.gatech.edu/offers-from-our-merchants/ | 200 | BuzzCard merchant offers (50+ merchants: Five Guys, Hattie B's, Rocky Mountain Pizza…) |
| GT | https://benefits.hr.gatech.edu/perks-and-programs/ | 200 | Barnes & Noble GT 10%, Wellness Spot 15% (GATECH), perks list |
| KSU | https://campus.kennesaw.edu/faculty-staff/human-resources/resources/employees/perks-discounts.php | 200 | **Strongest list**: 1000 Degrees 10%, Chuy's 15%, Mellow Mushroom 20% Tue, Jersey Mike's 10%, Texas Roadhouse 10%, Taco Mac 10%, etc. (note: page mixes student vs faculty/staff — extraction must respect eligibility) |
| UGA | https://alumni.uga.edu/benefits/ | 200 | UGA benefits/perks hub |
| UGA | https://pac.uga.edu/discounts/ | 200 | UGA Performing Arts $15 student tickets, PAC30 |
| UGA | https://tps.uga.edu/navigating-campus/uga-ride-smart/ | 200 | UGA Ride Smart 50% off Lyft (program page) |

Caveat: KSU/GT pages mix **student** vs **faculty/staff** eligibility — the doc flags
several KSU rows as "faculty/staff only." Extraction must set `requires_student_id` only
for genuinely student-facing offers; the existing schema captures `requires_student_id`.

## B. Niche restaurant picks — `restaurant_target` (NO confirmed deal)
From doc §2 / doc 2 ranking. These are **place leads** with addresses/prices/ratings — good
for Places resolution and *potential* crawl targets, but **most have "no student deal
confirmed"** so they must NOT be published as deals. Captured in `discovery-source-leads.md`.

- **GSU / Downtown:** Ali Baba Mediterranean (60 Broad St NW), Tyde Tate Kitchen (229 Mitchell St SW), Sweet Auburn Curb Market (209 Edgewood Ave SE), The Food Shoppe (123 Luckie St NW), Dolo's Pizza (Underground), Baraka Shawarma (68 Walton St NW), Reuben's Deli, Cafe Momentum.
- **GT / Midtown:** Aviva by Kameel (756 W Peachtree — BuzzCard nearby), Atwood's Pizza, Antico Pizza (1093 Hemphill), Choong Man Chicken, Rocky Mountain Pizza (BuzzCard flyer), Sweet Hut, Wagaya, Satto Thai, Sublime Doughnuts.
- **KSU / Kennesaw:** Honeysuckle Biscuits (10% KSU ID), Rico! Tropical Grill (15% KSU ID), Mellow Mushroom (20% Tue KSU ID), Ru San's, Big Pie in the Sky, Jinya Ramen, etc.
- **UGA / Athens:** Cali N Tito's, Mama's Boy, The World Famous, Donderos', Tamez BBQ, White Tiger, Puma Yu's, Royal Peasant, Mannaweenta.

A few KSU restaurants (Honeysuckle, Rico, Mellow Mushroom) DO carry KSU-ID discounts — but
those come **from the KSU HR perks page** (source A), so crawling that page covers them; we
do not hand-create those deals.

## C. `not_actionable`
- **Weaver D's (Athens)** — doc 2 marks it **CLOSED (Feb 2026)**; exclude.
- Bare "Athens student food discounts at Dunkin/McDonald's/…" — third-party guide, "verify
  at checkout"; no single crawlable source → lead only.

## D. Source-acquisition status vs follow-up issue #14
This satisfies issue #14's research step: real verified list pages now exist for **all four
campuses** (HTTP 200). Remaining gate before *enabling*: a trial `discovery:run <campus>`
must actually extract ≥1 concrete offer from each page (Firecrawl-accessibility + Gemini
yield), and merchant/location must resolve. Until then → **seeded disabled**.
