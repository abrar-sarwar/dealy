import Foundation

/// A coarse, user-facing filter for the local discovery deck. Unlike
/// `DealCategory` (the inventory's intrinsic taxonomy), this collapses related
/// categories and cross-cuts on audience/campus signals so a single chip row maps
/// to how people browse ("Food", "Campus", "Student"). Pure value type — the
/// matching logic lives here so it stays unit-testable and reusable.
enum DealCategoryFilter: String, CaseIterable, Identifiable {
    case all
    case food
    case grocery
    case campus
    case entertainment
    case student
    case services

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .food: return "Food"
        case .grocery: return "Grocery"
        case .campus: return "Campus"
        case .entertainment: return "Entertainment"
        case .student: return "Student"
        case .services: return "Services"
        }
    }

    var symbol: String {
        switch self {
        case .all: return "square.grid.2x2"
        case .food: return "fork.knife"
        case .grocery: return "cart.fill"
        case .campus: return "graduationcap.fill"
        case .entertainment: return "ticket.fill"
        case .student: return "person.badge.shield.checkmark"
        case .services: return "wrench.and.screwdriver.fill"
        }
    }

    /// Whether `deal` belongs in this filter.
    func matches(_ deal: Deal) -> Bool {
        switch self {
        case .all: return true
        case .food: return deal.category == .food
        case .grocery: return deal.category == .groceries
        case .entertainment: return deal.category == .entertainment
        case .campus: return deal.campusSlug != nil
        case .student:
            return deal.requiresStudentId || deal.audience == "students" || deal.isStudentOnly
        case .services:
            // The non-consumer / utility offers (e.g. transport passes, generic
            // "other"-type campus perks) — surfaced under their own lane so they
            // don't clutter Food/Grocery/Entertainment.
            return deal.campusDealType == "other" || deal.campusDealType == "transport"
        }
    }
}
