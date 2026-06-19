import SwiftUI

struct OnboardingLocationView: View {
    @Binding var selectedCampus: Campus
    @Binding var radius: Int
    var onContinue: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            OnboardingHeader(
                title: "Where are you?",
                subtitle: "Pick your campus or city. We’ll use it to show nearby mock deals — no location permission needed."
            )

            ScrollView {
                VStack(spacing: Spacing.sm) {
                    ForEach(Campus.all) { campus in
                        CampusRow(campus: campus, isSelected: campus.id == selectedCampus.id) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                selectedCampus = campus
                                radius = campus.defaultRadius
                            }
                        }
                    }

                    DealyCard {
                        RadiusControl(radius: $radius)
                    }
                    .padding(.top, Spacing.xs)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.lg)
            }

            Button("Continue", action: onContinue)
                .buttonStyle(.primaryDealy)
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.xl)
        }
        .background(Theme.background.ignoresSafeArea())
    }
}

/// Shared title/subtitle header for onboarding setup steps.
struct OnboardingHeader: View {
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.primaryText)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(Theme.mutedText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.xl)
        .padding(.bottom, Spacing.md)
    }
}
