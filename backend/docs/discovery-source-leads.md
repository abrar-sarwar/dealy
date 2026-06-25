# Discovery source leads (restaurants / niche food spots)

**Leads, not deals.** Parsed from the operator docs (`campus_deals_*.docx`, 2026-06-24).
These are merchant/place recommendations with addresses + public ratings/prices — useful
for Google Places resolution and as *candidate* crawl targets **only if** a real
deal/special/student-discount page is later found. **Do NOT publish menu items as deals.**
Most are explicitly "no student deal confirmed." Where a student discount exists, it comes
from a campus list page already seeded in `crawl_sources` (see `campus-source-intel.md`) —
do not hand-create those deals.

## GSU / Downtown Atlanta
| Spot | Address | Cuisine | Rating | Cheap pick | Student deal? |
|---|---|---|---|---|---|
| Ali Baba Mediterranean Delites | 60 Broad St NW, 30303 | Mediterranean | 3.7 | hummus+pita $7.50 | none confirmed |
| Tyde Tate Kitchen | 229 Mitchell St SW, 30303 | Thai | 4.8 | spring rolls $8 | none confirmed |
| Sweet Auburn Curb Market | 209 Edgewood Ave SE, 30303 | Food hall | N/A | ~$10 | vendors may run own promos |
| The Food Shoppe | 123 Luckie St NW, 30303 | Creole | 4.1 | creole potatoes $7 | none confirmed |
| Dolo's Pizza | 50 Lower Alabama St / Underground | Jamaican pizza | N/A | OG pie $12 | none confirmed |
| Baraka Shawarma | 68 Walton St NW, 30303 | Halal Mediterranean | — | wrap | none confirmed |
| Reuben's Deli | 57 Broad St NW | Deli | — | sandwich | none confirmed |
| Cafe Momentum Atlanta | 200 Peachtree St NW | Southern / mission | — | — | none confirmed (not cheap) |

## GT / Midtown + West Midtown
| Spot | Address | Cuisine | Student deal? |
|---|---|---|---|
| Aviva by Kameel | 756 W Peachtree St NW | Mediterranean | BuzzCard merchant nearby — verify via BuzzCard source |
| Rocky Mountain Pizza | 1005 Hemphill Ave NW | College bar / pizza | BuzzCard flyer offers — verify via BuzzCard source |
| Atwood's Pizza Cafe | 817 W Peachtree St NW | Pizza | none confirmed |
| Antico Pizza | 1093 Hemphill Ave NW | Neapolitan | none confirmed |
| Choong Man Chicken | 525 10th St NW | Korean fried chicken | none confirmed |
| Sweet Hut Bakery & Cafe | 935 Peachtree St NE | Asian bakery / boba | none confirmed |
| Wagaya | 339 14th St NW | Ramen / sushi | none confirmed |
| Satto Thai & Sushi | 768 Marietta St NW | Thai / sushi | none confirmed |
| Sublime Doughnuts | 535 10th St NW | Doughnuts | none confirmed |

## KSU / Kennesaw + Marietta
KSU restaurant student discounts (Honeysuckle 10%, Rico! 15%, Mellow Mushroom 20% Tue,
Jersey Mike's, etc.) are listed on the **KSU HR perks page** (seeded source) — covered there.
Place leads with no own-page deal: Ru San's Kennesaw, Big Pie in the Sky, Crispina, The
Rotisserie Shop, Chopped Oyster Club, Jinya Ramen Bar, Capriotti's (faculty/staff code only — not student).

## UGA / Athens
| Spot | Area | Student deal? |
|---|---|---|
| Cali N Tito's | Lumpkin/Athens | none confirmed |
| Mama's Boy | Downtown/Athens | none confirmed |
| The World Famous | Downtown Athens | none confirmed |
| Donderos' Kitchen | Cobbham | none confirmed |
| Tamez Barbecue | West Broad | none confirmed |
| White Tiger Athens | Boulevard | none confirmed |
| Puma Yu's | Athens | none confirmed |
| Royal Peasant | Five Points | none confirmed |
| Mannaweenta | Athens | none confirmed |

## Excluded (not actionable)
- **Weaver D's (Athens)** — reported **closed Feb 2026**. Do not add.

## How to promote a lead to a real source
1. Find the merchant's own **deals/specials/happy-hour/student-discount page** (not a menu).
2. Verify HTTP 200 + explicit current offer text.
3. Seed it `enabled: false` with `dealUrl` = that page; trial `discovery:run`; enable only if it yields a concrete offer.
4. Never seed a menu page or invent a discount.
