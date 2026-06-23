/**
 * Curated catalog of REAL national student-discount programs. There is no public
 * API that vends these, so they are hand-curated with official URLs. They ingest
 * as `editorial` trust → `curated` feed tier → never wear the Verified badge.
 * `redemptionBrand` is set only where a physical store can redeem the offer.
 */
export interface StudentProgram {
  slug: string;
  title: string;
  merchant: string;
  category: 'tech' | 'entertainment';
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  url: string; // official program page (https)
  redemptionBrand: string | null;
}

export const STUDENT_PROGRAMS: StudentProgram[] = [
  {
    slug: 'apple-education',
    title: 'Apple Education Pricing',
    merchant: 'Apple',
    category: 'tech',
    shortDescription: 'Student pricing on Mac and iPad, plus AppleCare savings.',
    detailedDescription:
      'Apple offers verified students and educators special pricing on Mac and iPad, with savings on AppleCare+. Eligibility verified by Apple at checkout.',
    terms:
      'Current/newly-accepted college students and educators. Verified by Apple. See official page.',
    url: 'https://www.apple.com/us-edu/store',
    redemptionBrand: 'Apple Store',
  },
  {
    slug: 'samsung-education',
    title: 'Samsung Education Offers',
    merchant: 'Samsung',
    category: 'tech',
    shortDescription: 'Student discounts on Galaxy phones, tablets, and laptops.',
    detailedDescription:
      'Samsung offers verified students additional discounts on Galaxy devices and Galaxy Books through its education store.',
    terms: 'Student eligibility verified by Samsung. See official page.',
    url: 'https://www.samsung.com/us/shop/discount-program/education/',
    redemptionBrand: 'Best Buy',
  },
  {
    slug: 'microsoft-education',
    title: 'Microsoft Student Store',
    merchant: 'Microsoft',
    category: 'tech',
    shortDescription: 'Student deals on Surface, Windows PCs, and software.',
    detailedDescription:
      'Microsoft offers eligible students discounts on Surface devices and software, plus free Office for many schools.',
    terms: 'Eligibility verified by Microsoft. See official page.',
    url: 'https://www.microsoft.com/en-us/store/b/education',
    redemptionBrand: 'Microsoft Store',
  },
  {
    slug: 'dell-student',
    title: 'Dell Student Discounts',
    merchant: 'Dell',
    category: 'tech',
    shortDescription: 'Extra savings on Dell laptops and desktops for students.',
    detailedDescription: 'Dell offers students coupons and member pricing on PCs and accessories.',
    terms: 'Student eligibility per Dell. See official page.',
    url: 'https://www.dell.com/en-us/lp/student-discounts',
    redemptionBrand: null,
  },
  {
    slug: 'lenovo-student',
    title: 'Lenovo Student Discount',
    merchant: 'Lenovo',
    category: 'tech',
    shortDescription: 'Student pricing on Lenovo laptops via verification.',
    detailedDescription:
      'Lenovo offers verified students additional discounts on ThinkPad, Yoga, and Legion devices.',
    terms: 'Verified by Lenovo/partner. See official page.',
    url: 'https://www.lenovo.com/us/en/d/deals/students/',
    redemptionBrand: null,
  },
  {
    slug: 'adobe-student',
    title: 'Adobe Creative Cloud for Students',
    merchant: 'Adobe',
    category: 'tech',
    shortDescription: 'Over 60% off the Creative Cloud All Apps plan for students.',
    detailedDescription:
      'Students and teachers save substantially on the Adobe Creative Cloud All Apps plan for the first year.',
    terms: 'Eligibility verified by Adobe. See official page.',
    url: 'https://www.adobe.com/creativecloud/buy/students.html',
    redemptionBrand: null,
  },
  {
    slug: 'github-student-pack',
    title: 'GitHub Student Developer Pack',
    merchant: 'GitHub',
    category: 'tech',
    shortDescription: 'Free developer tools and credits for verified students.',
    detailedDescription:
      'The GitHub Student Developer Pack bundles free access to dozens of developer tools and cloud credits for students.',
    terms: 'Verified student status via GitHub Education. See official page.',
    url: 'https://education.github.com/pack',
    redemptionBrand: null,
  },
  {
    slug: 'jetbrains-students',
    title: 'JetBrains Free for Students',
    merchant: 'JetBrains',
    category: 'tech',
    shortDescription: 'Free JetBrains IDEs (IntelliJ, PyCharm, …) for students.',
    detailedDescription:
      'Students and teachers get a free individual subscription to all JetBrains IDEs.',
    terms: 'Verified student status via JetBrains. See official page.',
    url: 'https://www.jetbrains.com/community/education/#students',
    redemptionBrand: null,
  },
  {
    slug: 'figma-education',
    title: 'Figma Education',
    merchant: 'Figma',
    category: 'tech',
    shortDescription: 'Free Figma Professional for students and educators.',
    detailedDescription: 'Eligible students and educators get Figma’s Education plan free.',
    terms: 'Verified by Figma. See official page.',
    url: 'https://www.figma.com/education/',
    redemptionBrand: null,
  },
  {
    slug: 'notion-education',
    title: 'Notion for Education',
    merchant: 'Notion',
    category: 'tech',
    shortDescription: 'Free Notion Plus plan with AI for students.',
    detailedDescription:
      'Students and educators with a school email get the Notion Plus plan free.',
    terms: 'Verified by school email. See official page.',
    url: 'https://www.notion.com/product/notion-for-education',
    redemptionBrand: null,
  },
  {
    slug: 'canva-education',
    title: 'Canva for Students/Education',
    merchant: 'Canva',
    category: 'tech',
    shortDescription: 'Free Canva premium features for eligible students.',
    detailedDescription: 'Canva offers free premium access to eligible students and educators.',
    terms: 'Eligibility verified by Canva. See official page.',
    url: 'https://www.canva.com/education/',
    redemptionBrand: null,
  },
  {
    slug: 'spotify-student',
    title: 'Spotify Premium Student',
    merchant: 'Spotify',
    category: 'entertainment',
    shortDescription: 'Discounted Premium plan (with Hulu) for students.',
    detailedDescription:
      'Verified college students get Spotify Premium at a reduced monthly price, often bundled with Hulu.',
    terms: 'Verified via SheerID. Up to 4 years. See official page.',
    url: 'https://www.spotify.com/us/student/',
    redemptionBrand: null,
  },
  {
    slug: 'prime-student',
    title: 'Amazon Prime Student',
    merchant: 'Amazon',
    category: 'entertainment',
    shortDescription: '6-month free trial, then half-price Prime for students.',
    detailedDescription:
      'College students get a 6-month Prime Student trial, then Prime at 50% off, plus exclusive student deals.',
    terms: 'Verified student status. See official page.',
    url: 'https://www.amazon.com/amazonprime/student',
    redemptionBrand: null,
  },
];
