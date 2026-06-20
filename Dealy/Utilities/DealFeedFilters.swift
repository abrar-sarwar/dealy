import Foundation

enum DealSortOption: String, CaseIterable, Identifiable {
    case recommended
    case mostPopular
    case mostRecent
    case biggestDiscount
    case lowestPrice

    var id: String { rawValue }

    var title: String {
        switch self {
        case .recommended: return "Recommended"
        case .mostPopular: return "Most Popular"
        case .mostRecent: return "Most Recent"
        case .biggestDiscount: return "Biggest Discount"
        case .lowestPrice: return "Price: Low to High"
        }
    }

    var symbol: String {
        switch self {
        case .recommended: return "sparkles"
        case .mostPopular: return "flame.fill"
        case .mostRecent: return "clock.fill"
        case .biggestDiscount: return "percent"
        case .lowestPrice: return "arrow.down"
        }
    }

    func sort(_ deals: [Deal]) -> [Deal] {
        switch self {
        case .recommended:
            return deals
        case .mostPopular:
            return deals.sorted { $0.dealScore == $1.dealScore ? $0.id < $1.id : $0.dealScore > $1.dealScore }
        case .mostRecent:
            return deals.sorted { $0.publishedAt == $1.publishedAt ? $0.id < $1.id : $0.publishedAt > $1.publishedAt }
        case .biggestDiscount:
            return deals.sorted {
                $0.savingsPercentage == $1.savingsPercentage
                    ? $0.id < $1.id
                    : $0.savingsPercentage > $1.savingsPercentage
            }
        case .lowestPrice:
            return deals.sorted {
                if $0.currentPrice == $1.currentPrice { return $0.id < $1.id }
                return $0.currentPrice < $1.currentPrice
            }
        }
    }
}

struct DealFeedFilters: Equatable {
    static let allowedPriceRange = 0.0...500.0

    var minPrice: Double = allowedPriceRange.lowerBound
    var maxPrice: Double = allowedPriceRange.upperBound
    var includeOnline = true
    var onlineOnly = false
    var endingSoonOnly = false
    var strongDiscountOnly = false
    var sort: DealSortOption = .recommended

    var hasCustomPrice: Bool {
        minPrice > Self.allowedPriceRange.lowerBound || maxPrice < Self.allowedPriceRange.upperBound
    }

    var isActive: Bool {
        let toggles = onlineOnly || endingSoonOnly || strongDiscountOnly
        return hasCustomPrice || !includeOnline || toggles || sort != .recommended
    }

    mutating func applyMaximum(_ maximum: Double) {
        minPrice = 0
        maxPrice = maximum
    }
}
