import Foundation

/// A campus or city the user can anchor their deal feed to.
struct Campus: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let shortName: String
    let cityContext: String
    let blurb: String
    let defaultRadius: Int
    let latitude: Double
    let longitude: Double
    /// Location tags a deal can carry to be considered "near" this campus.
    let locationTags: [String]

    static let minRadius = 1
    static let maxRadius = 25
}

extension Campus {
    static let georgiaState = Campus(
        id: "gsu",
        name: "Georgia State University",
        shortName: "Georgia State",
        cityContext: "Downtown Atlanta",
        blurb: "Deals around the downtown campus and Atlanta core.",
        defaultRadius: 3,
        latitude: 33.7531, longitude: -84.3857,
        locationTags: ["Georgia State", "Downtown Atlanta", "Atlanta"]
    )

    static let georgiaTech = Campus(
        id: "gt",
        name: "Georgia Tech",
        shortName: "Georgia Tech",
        cityContext: "Midtown Atlanta",
        blurb: "Tech, food, and student finds across Midtown.",
        defaultRadius: 3,
        latitude: 33.7756, longitude: -84.3963,
        locationTags: ["Georgia Tech", "Midtown Atlanta", "Atlanta"]
    )

    static let kennesaw = Campus(
        id: "ksu",
        name: "Kennesaw State University",
        shortName: "Kennesaw State",
        cityContext: "Kennesaw",
        blurb: "Savings around Kennesaw and the northwest metro.",
        defaultRadius: 6,
        latitude: 34.0383, longitude: -84.5817,
        locationTags: ["Kennesaw State", "Kennesaw", "Atlanta"]
    )

    static let uga = Campus(
        id: "uga",
        name: "University of Georgia",
        shortName: "UGA",
        cityContext: "Athens",
        blurb: "Athens deals for the Bulldog community.",
        defaultRadius: 6,
        latitude: 33.9480, longitude: -83.3773,
        locationTags: ["University of Georgia", "Athens"]
    )

    static let atlanta = Campus(
        id: "atl",
        name: "Atlanta",
        shortName: "Atlanta",
        cityContext: "Metro Atlanta",
        blurb: "The broader metro Atlanta deal scene.",
        defaultRadius: 15,
        latitude: 33.7490, longitude: -84.3880,
        locationTags: ["Atlanta", "Metro Atlanta", "Downtown Atlanta", "Midtown Atlanta", "Kennesaw"]
    )

    static let all: [Campus] = [georgiaState, georgiaTech, kennesaw, uga, atlanta]

    static func campus(withID id: String) -> Campus {
        all.first { $0.id == id } ?? georgiaState
    }
}
