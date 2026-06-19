import SwiftUI

/// Deal categories. Raw values are stable identifiers safe to persist.
enum DealCategory: String, CaseIterable, Codable, Identifiable, Hashable {
    case food
    case groceries
    case tech
    case studentSupplies
    case clothing
    case entertainment
    case beauty
    case automotive
    case home
    case books

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .food: return "Food"
        case .groceries: return "Groceries"
        case .tech: return "Tech"
        case .studentSupplies: return "Student Supplies"
        case .clothing: return "Clothing"
        case .entertainment: return "Entertainment"
        case .beauty: return "Beauty"
        case .automotive: return "Automotive"
        case .home: return "Home"
        case .books: return "Books"
        }
    }

    var symbol: String {
        switch self {
        case .food: return "fork.knife"
        case .groceries: return "cart.fill"
        case .tech: return "laptopcomputer"
        case .studentSupplies: return "backpack.fill"
        case .clothing: return "tshirt.fill"
        case .entertainment: return "ticket.fill"
        case .beauty: return "sparkles"
        case .automotive: return "car.fill"
        case .home: return "house.fill"
        case .books: return "books.vertical.fill"
        }
    }

    /// Two-stop gradient used for category artwork. Distinct, on-brand hues.
    var gradientColors: [Color] {
        switch self {
        case .food: return [Color(hex: 0xF97316), Color(hex: 0xEA580C)]
        case .groceries: return [Color(hex: 0x22C55E), Color(hex: 0x15803D)]
        case .tech: return [Color(hex: 0x3B82F6), Color(hex: 0x1D4ED8)]
        case .studentSupplies: return [Color(hex: 0x8B5CF6), Color(hex: 0x6D28D9)]
        case .clothing: return [Color(hex: 0xEC4899), Color(hex: 0xBE185D)]
        case .entertainment: return [Color(hex: 0x06B6D4), Color(hex: 0x0E7490)]
        case .beauty: return [Color(hex: 0xF472B6), Color(hex: 0xDB2777)]
        case .automotive: return [Color(hex: 0x64748B), Color(hex: 0x334155)]
        case .home: return [Color(hex: 0x14B8A6), Color(hex: 0x0F766E)]
        case .books: return [Color(hex: 0xF59E0B), Color(hex: 0xB45309)]
        }
    }

    var gradient: LinearGradient {
        LinearGradient(colors: gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}
