import Foundation

/// The kind of grocery run the student wants. Drives staple selection on the
/// backend. Raw values are stable; `apiValue` is the snake_case wire value.
enum BasketGoal: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case cheapest
    case mealPrep
    case highProtein
    case dormSnacks
    case breakfast
    case quickMeals
    case healthy
    case party
    case custom

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .cheapest: return "cheapest"
        case .mealPrep: return "meal_prep"
        case .highProtein: return "high_protein"
        case .dormSnacks: return "dorm_snacks"
        case .breakfast: return "breakfast"
        case .quickMeals: return "quick_meals"
        case .healthy: return "healthy"
        case .party: return "party"
        case .custom: return "custom"
        }
    }

    var displayName: String {
        switch self {
        case .cheapest: return "Cheapest"
        case .mealPrep: return "Meal prep"
        case .highProtein: return "High protein"
        case .dormSnacks: return "Dorm snacks"
        case .breakfast: return "Breakfast"
        case .quickMeals: return "Quick meals"
        case .healthy: return "Healthy"
        case .party: return "Party"
        case .custom: return "Custom"
        }
    }

    var icon: String {
        switch self {
        case .cheapest: return "dollarsign.circle.fill"
        case .mealPrep: return "fork.knife"
        case .highProtein: return "dumbbell.fill"
        case .dormSnacks: return "popcorn.fill"
        case .breakfast: return "sun.horizon.fill"
        case .quickMeals: return "bolt.fill"
        case .healthy: return "leaf.fill"
        case .party: return "party.popper.fill"
        case .custom: return "slider.horizontal.3"
        }
    }
}

/// Budget options for a Smart Basket run. Presets plus a custom amount.
enum BasketBudget: CaseIterable, Identifiable, Hashable, Sendable {
    case twenty
    case thirtyFive
    case fifty
    case seventyFive
    case custom

    var id: String { displayName }

    /// Dollar amount for presets; nil for `.custom` (the caller supplies it).
    var presetDollars: Int? {
        switch self {
        case .twenty: return 20
        case .thirtyFive: return 35
        case .fifty: return 50
        case .seventyFive: return 75
        case .custom: return nil
        }
    }

    var displayName: String {
        switch self {
        case .twenty: return "$20"
        case .thirtyFive: return "$35"
        case .fifty: return "$50"
        case .seventyFive: return "$75"
        case .custom: return "Custom"
        }
    }

    var icon: String { self == .custom ? "slider.horizontal.3" : "dollarsign.circle.fill" }
}

/// How long the basket should cover. Scales quantities on the backend.
enum BasketTimeframe: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case today
    case threeDays
    case oneWeek

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .today: return "today"
        case .threeDays: return "3_days"
        case .oneWeek: return "1_week"
        }
    }

    var displayName: String {
        switch self {
        case .today: return "Today"
        case .threeDays: return "3 days"
        case .oneWeek: return "1 week"
        }
    }

    var icon: String {
        switch self {
        case .today: return "sun.max.fill"
        case .threeDays: return "calendar"
        case .oneWeek: return "calendar.badge.clock"
        }
    }
}

/// Optional dietary preferences applied to staple selection.
enum DietaryPreference: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case vegetarian
    case halal
    case highProtein
    case lowPrep
    case noCooking
    case healthy
    case bulkValue
    case snacksDrinks

    var id: String { rawValue }

    var apiValue: String {
        switch self {
        case .vegetarian: return "vegetarian"
        case .halal: return "halal"
        case .highProtein: return "high_protein"
        case .lowPrep: return "low_prep"
        case .noCooking: return "no_cooking"
        case .healthy: return "healthy"
        case .bulkValue: return "bulk_value"
        case .snacksDrinks: return "snacks_drinks"
        }
    }

    var displayName: String {
        switch self {
        case .vegetarian: return "Vegetarian"
        case .halal: return "Halal"
        case .highProtein: return "High protein"
        case .lowPrep: return "Low prep"
        case .noCooking: return "No cooking"
        case .healthy: return "Healthy"
        case .bulkValue: return "Bulk value"
        case .snacksDrinks: return "Snacks & drinks"
        }
    }

    var icon: String {
        switch self {
        case .vegetarian: return "carrot.fill"
        case .halal: return "moon.fill"
        case .highProtein: return "dumbbell.fill"
        case .lowPrep: return "timer"
        case .noCooking: return "flame.slash"
        case .healthy: return "leaf.fill"
        case .bulkValue: return "shippingbox.fill"
        case .snacksDrinks: return "cup.and.saucer.fill"
        }
    }
}

/// Request payload for generating a Smart Basket
/// (`POST /v1/grocery/baskets/generate`).
struct BasketRequest: Hashable, Sendable {
    var latitude: Double
    var longitude: Double
    var region: String?
    var campus: String?
    var budget: Int
    var goal: BasketGoal
    var timeframe: BasketTimeframe
    var dietary: [DietaryPreference]
    var excludedItems: [String]
    var preferredStores: [String]
    var maxDistance: Int?
    var allowSecondStop: Bool

    init(latitude: Double,
         longitude: Double,
         region: String? = nil,
         campus: String? = nil,
         budget: Int,
         goal: BasketGoal,
         timeframe: BasketTimeframe,
         dietary: [DietaryPreference] = [],
         excludedItems: [String] = [],
         preferredStores: [String] = [],
         maxDistance: Int? = nil,
         allowSecondStop: Bool = true) {
        self.latitude = latitude
        self.longitude = longitude
        self.region = region
        self.campus = campus
        self.budget = budget
        self.goal = goal
        self.timeframe = timeframe
        self.dietary = dietary
        self.excludedItems = excludedItems
        self.preferredStores = preferredStores
        self.maxDistance = maxDistance
        self.allowSecondStop = allowSecondStop
    }

    /// JSON body matching the wire contract exactly.
    var jsonBody: [String: Any] {
        var body: [String: Any] = [
            "latitude": latitude,
            "longitude": longitude,
            "budget": budget,
            "goal": goal.apiValue,
            "timeframe": timeframe.apiValue,
            "dietary": dietary.map { $0.apiValue },
            "excludedItems": excludedItems,
            "preferredStores": preferredStores,
            "allowSecondStop": allowSecondStop,
        ]
        if let region { body["region"] = region }
        if let campus { body["campus"] = campus }
        if let maxDistance { body["maxDistance"] = maxDistance }
        return body
    }
}
