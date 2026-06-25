import SwiftUI

/// Small reusable chip with icon + text and a tint.
struct InfoChip: View {
    let symbol: String
    let text: String
    var tint: Color = Theme.primary
    var filled: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.caption2.weight(.bold))
            Text(text).font(.caption.weight(.semibold))
        }
        .foregroundStyle(filled ? .white : tint)
        .padding(.vertical, 5)
        .padding(.horizontal, Spacing.xs)
        .background(
            Capsule().fill(filled ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.14)))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// "Verified" chip — means Dealy recently confirmed this deal through its
/// authoritative source. Server-controlled; never derived on the client.
struct VerifiedBadge: View {
    var body: some View {
        InfoChip(symbol: "checkmark.seal.fill", text: "Verified", tint: Theme.save)
            .accessibilityLabel("Verified — recently confirmed with the source")
    }
}

/// "Student ID" chip — the offer requires a valid student ID at redemption.
/// Distinct from `VerifiedBadge`: this is an eligibility signal, not a trust claim.
struct StudentIDBadge: View {
    var body: some View {
        InfoChip(symbol: "graduationcap.fill", text: "Student ID", tint: Theme.primary)
            .accessibilityLabel("Requires a valid student ID")
    }
}

/// Campus chip (GSU / GT / KSU / UGA) for deals tied to a specific campus.
struct CampusBadge: View {
    let label: String
    var body: some View {
        InfoChip(symbol: "building.columns.fill", text: label, tint: Theme.primary)
            .accessibilityLabel("\(label) campus deal")
    }
}

/// "Campus Perk" chip — the offer is open to the wider campus community (no ID required).
struct CampusPerkBadge: View {
    var body: some View {
        InfoChip(symbol: "building.2.fill", text: "Campus Perk", tint: Theme.primary)
            .accessibilityLabel("Campus perk — open to campus community")
    }
}

/// "Faculty/Staff" chip — the offer targets faculty and staff members.
struct FacultyStaffBadge: View {
    var body: some View {
        InfoChip(symbol: "briefcase.fill", text: "Faculty/Staff", tint: Theme.primary)
            .accessibilityLabel("Faculty and staff offer")
    }
}

/// "Alumni" chip — the offer targets alumni.
struct AlumniBadge: View {
    var body: some View {
        InfoChip(symbol: "graduationcap.circle", text: "Alumni", tint: Theme.primary)
            .accessibilityLabel("Alumni offer")
    }
}

/// Renders eligibility and campus chips for a deal — and nothing at all for a
/// normal (non-campus, non-student) grocery/restaurant deal.
struct StudentDealBadges: View {
    let deal: Deal

    var body: some View {
        let badge = deal.eligibilityBadge
        let campus = deal.campusBadge
        if badge != nil || campus != nil {
            HStack(spacing: 6) {
                if let campus { CampusBadge(label: campus) }
                switch badge {
                case .studentID: StudentIDBadge()
                case .campusPerk: CampusPerkBadge()
                case .facultyStaff: FacultyStaffBadge()
                case .alumni: AlumniBadge()
                case nil: EmptyView()
                }
            }
        }
    }
}

/// Deal score badge with an explainer affordance handled by the parent.
struct DealScoreBadge: View {
    let score: Int
    var compact: Bool = false

    private var tint: Color {
        switch score {
        case 90...: return Theme.save
        case 75..<90: return Theme.primary
        default: return Theme.mutedText
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "bolt.fill").font(.caption2.weight(.bold))
            if !compact { Text("Deal Score").font(.caption2.weight(.semibold)) }
            Text("\(score)").font(.caption.weight(.bold))
        }
        .foregroundStyle(.white)
        .padding(.vertical, 5)
        .padding(.horizontal, Spacing.xs)
        .background(Capsule().fill(tint))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Deal score \(score) out of 100")
    }
}

/// Expiry chip that turns urgent when ending soon / expired.
struct ExpiryChip: View {
    let date: Date
    var reference: Date = Date()

    private var expired: Bool { date <= reference }
    private var endingSoon: Bool {
        let i = date.timeIntervalSince(reference)
        return i > 0 && i <= 60 * 60 * 12
    }
    private var tint: Color { expired ? Theme.mutedText : (endingSoon ? Theme.warning : Theme.mutedText) }

    var body: some View {
        InfoChip(symbol: expired ? "xmark.circle" : "clock",
                 text: Format.expiryLong(date, reference: reference),
                 tint: tint,
                 filled: endingSoon)
    }
}
