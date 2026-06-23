import Foundation

/// Deterministic mock catalog. Deals are materialized against a reference date
/// so expirations stay relative while remaining reproducible in tests/previews.
enum MockDeals {

    /// Build the full dataset relative to `reference` (defaults to now).
    static func dataset(reference: Date = Date()) -> [Deal] {
        seeds.map { $0.makeDeal(reference: reference) } + studentPrograms(reference: reference)
    }

    /// Curated student programs for the offline/preview double. Online + student-
    /// only; one carries a `redemptionBrand` so the nearby-store finder is
    /// exercisable without the backend. Not shipped inventory.
    private static func studentPrograms(reference: Date) -> [Deal] {
        let expires = reference.addingTimeInterval(365 * 24 * 3600)
        func program(_ id: String, _ title: String, _ merchant: String, _ url: String,
                     brand: String?) -> Deal {
            Deal(
                id: id, title: title, merchant: merchant, category: .tech,
                currentPrice: 0, originalPrice: 0, distanceMiles: 0,
                expirationDate: expires, dealScore: 80, isOnline: true,
                shortDescription: "Student program at \(merchant).",
                detailedDescription: "Verified students save with \(merchant). Eligibility verified at the official page.",
                terms: "Student eligibility verified by \(merchant). See official page.",
                locationTags: ["online", "nationwide"],
                couponCode: nil, destinationURL: url, latitude: nil, longitude: nil,
                visualSeed: 7, publishedAt: reference.addingTimeInterval(-3600),
                verified: false, isStudentOnly: true, isTrending: false,
                redemptionBrand: brand
            )
        }
        return [
            program("student-apple-education", "Apple Education Pricing", "Apple",
                    "https://www.apple.com/us-edu/store", brand: "Apple Store"),
            program("student-spotify", "Spotify Premium Student", "Spotify",
                    "https://www.spotify.com/us/student/", brand: nil),
        ]
    }

    // MARK: - Seed

    /// Lightweight description that becomes a `Deal` given a reference date.
    private struct Seed {
        let id: String
        let title: String
        let merchant: String
        let category: DealCategory
        let current: Decimal
        let original: Decimal
        let distance: Double
        let expiresInHours: Double
        let score: Int
        let isOnline: Bool
        let short: String
        let detail: String
        let terms: String
        let tags: [String]
        var coupon: String? = nil
        var url: String? = nil
        var seed: Int = 0

        func makeDeal(reference: Date) -> Deal {
            Deal(
                id: id, title: title, merchant: merchant, category: category,
                currentPrice: current, originalPrice: original,
                distanceMiles: distance,
                expirationDate: reference.addingTimeInterval(expiresInHours * 3600),
                dealScore: score, isOnline: isOnline,
                shortDescription: short, detailedDescription: detail, terms: terms,
                locationTags: tags, couponCode: coupon, destinationURL: url,
                latitude: nil, longitude: nil, visualSeed: seed,
                publishedAt: reference.addingTimeInterval(-Double(max(seed, 1)) * 3 * 3600)
            )
        }
    }

    private static func mk(_ id: String, _ title: String, _ merchant: String,
                           _ category: DealCategory, _ current: Decimal, _ original: Decimal,
                           _ distance: Double, _ expiresInHours: Double, _ score: Int,
                           _ tags: [String], online: Bool = false, coupon: String? = nil,
                           url: String? = nil, seed: Int = 0,
                           short: String, detail: String, terms: String) -> Seed {
        Seed(id: id, title: title, merchant: merchant, category: category,
             current: current, original: original, distance: distance,
             expiresInHours: expiresInHours, score: score, isOnline: online,
             short: short, detail: detail, terms: terms, tags: tags,
             coupon: coupon, url: url, seed: seed)
    }

    private static let seeds: [Seed] = [

        // MARK: Food
        mk("food-bogo-pizza", "BOGO Pizza Slices", "Rosa's Pizza", .food, 5.99, 11.99, 0.4, 2, 94,
           ["Georgia State", "Downtown Atlanta", "Atlanta"], seed: 1,
           short: "Buy one slice, get one free during lunch.",
           detail: "Grab two of Rosa's famous NY-style slices for the price of one. Perfect between classes — dine in or take out.",
           terms: "Valid 11am–3pm. Dine-in or takeout. One redemption per visit."),
        mk("food-student-bowl", "$5 Student Bowl", "Fresh Greens", .food, 5.00, 9.50, 0.7, 30, 88,
           ["Georgia Tech", "Midtown Atlanta", "Atlanta"], seed: 2,
           short: "Build-your-own bowl, flat $5 with student ID.",
           detail: "Any base, two proteins, unlimited toppings. Show a valid student ID at checkout.",
           terms: "Requires valid student ID. Not combinable with other offers."),
        mk("food-free-coffee", "Free Coffee Upgrade", "Daybreak Coffee", .food, 3.25, 5.50, 0.3, 8, 82,
           ["University of Georgia", "Athens"], seed: 3,
           short: "Upgrade any size coffee for free.",
           detail: "Order a small, get a large for the same price. Includes seasonal lattes.",
           terms: "One per customer per day. Excludes cold brew flights."),
        mk("food-wings", "20% Off Wings", "Cluck & Co", .food, 9.59, 11.99, 1.2, 48, 79,
           ["Kennesaw State", "Kennesaw", "Atlanta"], seed: 4,
           short: "20% off any wing basket.",
           detail: "Bone-in or boneless, your choice of sauce. Great for game night.",
           terms: "Dine-in only. Excludes catering orders."),
        mk("food-taco-tuesday", "Taco Tuesday Special", "El Cactus", .food, 6.00, 10.00, 0.9, 20, 85,
           ["Georgia State", "Downtown Atlanta", "Atlanta"], seed: 5,
           short: "3 street tacos + drink, Tuesdays only.",
           detail: "Choice of carne asada, chicken, or veggie with a fountain drink.",
           terms: "Tuesdays only. While supplies last."),

        // MARK: Groceries
        mk("groc-kroger-snack", "Kroger Snack Bundle", "Kroger", .groceries, 12.99, 19.99, 1.8, 60, 76,
           ["Atlanta", "Metro Atlanta", "Downtown Atlanta"], coupon: "SNACK7", seed: 6,
           short: "Dorm-friendly snack bundle, save $7.",
           detail: "Chips, granola bars, popcorn, and drinks bundled for the week.",
           terms: "Digital coupon required. Limit one per loyalty account."),
        mk("groc-aldi-pack", "Aldi Dorm Grocery Pack", "Aldi", .groceries, 24.99, 34.99, 4.5, 90, 73,
           ["Kennesaw State", "Kennesaw", "Metro Atlanta"], seed: 7,
           short: "A week of essentials for under $25.",
           detail: "Pasta, sauce, eggs, bread, fruit, and coffee — curated for small kitchens.",
           terms: "In-store only. Substitutions may apply."),
        mk("groc-publix-bogo", "Publix BOGO Drinks", "Publix", .groceries, 4.49, 8.98, 2.2, 40, 80,
           ["University of Georgia", "Athens"], seed: 8,
           short: "Buy one, get one free on sports drinks.",
           detail: "Mix and match participating 12-packs. Stock up for the semester.",
           terms: "Equal or lesser value free. Participating items only."),
        mk("groc-walmart-ramen", "Walmart Ramen Box Deal", "Walmart", .groceries, 7.88, 12.50, 3.1, 120, 71,
           ["Atlanta", "Metro Atlanta"], seed: 9,
           short: "24-pack variety ramen box.",
           detail: "Four flavors, 24 cups. The unofficial student food group.",
           terms: "Online or in-store. Prices may vary by location."),

        // MARK: Tech
        mk("tech-logi-mouse", "Logitech Mouse Sale", "Best Buy", .tech, 19.99, 39.99, 2.6, 72, 90,
           ["Atlanta", "Metro Atlanta", "Midtown Atlanta"], seed: 10,
           short: "Wireless mouse, 50% off.",
           detail: "Logitech M-series wireless mouse with silent click and long battery life.",
           terms: "While supplies last. Limit two per customer."),
        mk("tech-usbc-hub", "USB-C Hub Discount", "Amazon", .tech, 22.49, 44.99, 0, 96, 86,
           ["Online"], online: true, coupon: "HUB50", url: "https://example.com/usbc-hub", seed: 11,
           short: "7-in-1 USB-C hub, half price.",
           detail: "HDMI, USB-A, SD, and 100W passthrough charging in one adapter.",
           terms: "Clip coupon at checkout. Sold by example marketplace."),
        mk("tech-monitor", "Monitor Deal", "Micro Center", .tech, 119.99, 169.99, 5.4, 54, 92,
           ["Atlanta", "Metro Atlanta"], seed: 12,
           short: "27\" 1080p IPS monitor, $50 off.",
           detail: "75Hz IPS panel with thin bezels — a clean dorm desk upgrade.",
           terms: "In-store pickup. Limited stock per store."),
        mk("tech-headphones", "Headphones Markdown", "Target", .tech, 34.99, 59.99, 1.5, 28, 84,
           ["Georgia State", "Downtown Atlanta", "Atlanta"], seed: 13,
           short: "Over-ear Bluetooth headphones, $25 off.",
           detail: "30-hour battery, fast pair, and a foldable travel design.",
           terms: "Subject to availability. Color selection varies."),
        mk("tech-ssd", "External SSD Deal", "Newegg", .tech, 59.99, 99.99, 0, 110, 87,
           ["Online"], online: true, url: "https://example.com/ssd", seed: 14,
           short: "1TB portable SSD, $40 off.",
           detail: "USB 3.2 portable SSD with up to 1050MB/s transfer speeds.",
           terms: "Online only. Shipping calculated at checkout."),

        // MARK: Student Supplies
        mk("supp-ti84", "TI-84 Calculator Used Deal", "Campus Trade", .studentSupplies, 64.00, 119.00, 0.5, 64, 89,
           ["Georgia Tech", "Midtown Atlanta", "Atlanta"], seed: 15,
           short: "Certified used TI-84 Plus.",
           detail: "Inspected and reset graphing calculator — required for many STEM courses.",
           terms: "Used, graded Good. 14-day return window."),
        mk("supp-backpack", "Backpack Sale", "JanSport Outlet", .studentSupplies, 27.99, 45.00, 3.3, 80, 75,
           ["Atlanta", "Metro Atlanta"], seed: 16,
           short: "Classic backpacks, up to 40% off.",
           detail: "Padded laptop sleeve and lifetime warranty styles included.",
           terms: "Outlet pricing. Selection varies by store."),
        mk("supp-notebook", "Notebook Bundle", "Office Depot", .studentSupplies, 9.99, 17.99, 2.0, 100, 70,
           ["University of Georgia", "Athens"], seed: 17,
           short: "5-pack college-ruled notebooks.",
           detail: "Spiral notebooks with perforated pages and durable covers.",
           terms: "Limit three bundles per customer."),
        mk("supp-paper", "Printer Paper Pack", "Staples", .studentSupplies, 6.49, 11.99, 1.7, 130, 66,
           ["Atlanta", "Metro Atlanta"], coupon: "PAPER5", seed: 18,
           short: "500-sheet multipurpose paper.",
           detail: "Bright white 20lb paper for everyday printing.",
           terms: "Coupon required. One per transaction."),
        mk("supp-lamp", "Desk Lamp Deal", "IKEA", .studentSupplies, 12.99, 19.99, 6.2, 150, 68,
           ["Atlanta", "Metro Atlanta", "Kennesaw"], seed: 19,
           short: "LED desk lamp, adjustable arm.",
           detail: "Warm-white LED lamp with a flexible neck for late-night study.",
           terms: "In-store availability varies."),

        // MARK: Clothing
        mk("cloth-nike-hoodie", "Nike Clearance Hoodie", "Nike Factory Store", .clothing, 32.97, 60.00, 7.8, 70, 83,
           ["Atlanta", "Metro Atlanta"], seed: 20,
           short: "Club fleece hoodies, clearance priced.",
           detail: "Soft brushed-back fleece in seasonal colors. Sizes XS–XXL.",
           terms: "Clearance, final sale. No price adjustments."),
        mk("cloth-adidas", "Adidas Student Deal", "adidas", .clothing, 0, 0, 0, 200, 77,
           ["Online"], online: true, url: "https://example.com/adidas-student", seed: 21,
           short: "Extra 20% off for verified students.",
           detail: "Stack a verified student discount on top of sale styles online.",
           terms: "Student verification required. Exclusions apply."),
        mk("cloth-hm", "H&M Basics Sale", "H&M", .clothing, 7.99, 14.99, 2.9, 58, 72,
           ["Midtown Atlanta", "Atlanta"], seed: 22,
           short: "Tees and basics from $7.99.",
           detail: "Everyday cotton tees, tanks, and socks at semester-start prices.",
           terms: "While supplies last. In-store and online."),

        // MARK: Entertainment
        mk("ent-movie", "Movie Ticket Discount", "AMC Theatres", .entertainment, 7.99, 13.49, 2.4, 36, 81,
           ["Atlanta", "Metro Atlanta", "Midtown Atlanta"], coupon: "STUDENT8", seed: 23,
           short: "Student tickets for $7.99.",
           detail: "Discounted standard tickets any showtime with student ID.",
           terms: "Valid student ID required at pickup. Excludes premium formats."),
        mk("ent-bowling", "Bowling Night Deal", "Midtown Bowl", .entertainment, 15.00, 28.00, 3.0, 18, 78,
           ["Midtown Atlanta", "Atlanta"], seed: 24,
           short: "2 hours + shoe rental for two.",
           detail: "Unlimited bowling for two with shoes included, evenings.",
           terms: "After 6pm. Subject to lane availability."),
        mk("ent-aquarium", "Aquarium Student Discount", "Georgia Aquarium", .entertainment, 32.95, 44.95, 1.1, 96, 80,
           ["Downtown Atlanta", "Atlanta", "Georgia State"], seed: 25,
           short: "Student admission, save $12.",
           detail: "General admission at the student rate with valid ID.",
           terms: "Timed entry. Student ID required."),

        // MARK: Beauty
        mk("beauty-ulta-set", "Skincare Starter Set", "Ulta Beauty", .beauty, 19.99, 32.00, 2.7, 84, 74,
           ["Atlanta", "Metro Atlanta"], seed: 26,
           short: "3-step skincare set, $12 off.",
           detail: "Cleanser, moisturizer, and SPF in a travel-friendly set.",
           terms: "While supplies last. One per customer."),
        mk("beauty-sephora", "Sample Sale Bundle", "Sephora", .beauty, 0, 0, 0, 140, 69,
           ["Online"], online: true, url: "https://example.com/sephora", seed: 27,
           short: "Free deluxe samples over $25.",
           detail: "Add three deluxe samples to any qualifying online order.",
           terms: "Online only. Minimum spend applies."),
        mk("beauty-haircut", "Student Haircut Deal", "Sharp Cuts", .beauty, 14.00, 24.00, 0.6, 46, 71,
           ["Georgia State", "Downtown Atlanta"], seed: 28,
           short: "Cuts for $14 with student ID.",
           detail: "Wash, cut, and style from licensed stylists near campus.",
           terms: "By appointment. Student ID required."),

        // MARK: Automotive
        mk("auto-oil", "Oil Change Special", "QuickLube", .automotive, 29.99, 49.99, 4.1, 160, 67,
           ["Kennesaw", "Kennesaw State", "Metro Atlanta"], seed: 29,
           short: "Full-synthetic oil change, $20 off.",
           detail: "Includes filter, fluid top-off, and multi-point inspection.",
           terms: "Most vehicles. Disposal fee may apply."),
        mk("auto-wash", "Car Wash Pass", "Splash Co", .automotive, 9.99, 18.00, 2.3, 200, 64,
           ["Atlanta", "Metro Atlanta"], seed: 30,
           short: "Unlimited wash trial month.",
           detail: "Top-tier wash package, first month at half price.",
           terms: "New members. Cancel anytime."),
        mk("auto-tires", "Student Tire Rotation", "TreadWorks", .automotive, 0, 0, 5.0, 180, 62,
           ["Athens", "University of Georgia"], seed: 31,
           short: "Free rotation with student ID.",
           detail: "Complimentary tire rotation and pressure check for students.",
           terms: "Appointment recommended. Student ID required."),

        // MARK: Home
        mk("home-bedding", "Dorm Bedding Set", "Target", .home, 39.99, 64.99, 1.6, 88, 73,
           ["Georgia State", "Downtown Atlanta", "Atlanta"], seed: 32,
           short: "Twin XL comforter set, $25 off.",
           detail: "Reversible comforter, sham, and sheet set sized for dorm beds.",
           terms: "Twin XL only. Selection varies."),
        mk("home-bins", "Storage Bins Deal", "The Container Store", .home, 16.99, 27.99, 3.4, 120, 65,
           ["Atlanta", "Metro Atlanta"], seed: 33,
           short: "Stackable storage bins, 3-pack.",
           detail: "Clear stackable bins to reclaim closet and under-bed space.",
           terms: "While supplies last."),
        mk("home-desk", "IKEA Desk Deal", "IKEA", .home, 49.00, 79.00, 6.2, 150, 70,
           ["Atlanta", "Metro Atlanta", "Kennesaw"], seed: 34,
           short: "Compact study desk, $30 off.",
           detail: "Sturdy compact desk with a cable channel — fits tight rooms.",
           terms: "Assembly required. In-store stock varies."),

        // MARK: Books
        mk("books-buyback", "Textbook Buyback Boost", "Campus Bookstore", .books, 0, 0, 0.4, 56, 76,
           ["Georgia Tech", "Midtown Atlanta"], seed: 35,
           short: "+15% on end-of-term buyback.",
           detail: "Earn a 15% bonus on eligible textbook buyback values this week.",
           terms: "Eligible titles only. ID required."),
        mk("books-chegg", "Chegg Rental Discount", "Chegg", .books, 0, 0, 0, 220, 72,
           ["Online"], online: true, coupon: "RENT15", url: "https://example.com/chegg", seed: 36,
           short: "15% off textbook rentals.",
           detail: "Apply the code to your cart on eligible textbook rentals.",
           terms: "Online only. New rentals only."),
        mk("books-halfprice", "Half-Price Books Sale", "2nd Read Books", .books, 4.99, 9.99, 1.9, 130, 68,
           ["Athens", "University of Georgia"], seed: 37,
           short: "Used paperbacks, 50% off.",
           detail: "Fiction and reference paperbacks at half price near campus.",
           terms: "Marked titles only. While supplies last."),
    ]
}
