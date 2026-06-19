import CoreGraphics

enum DealSwipeIntent: Equatable {
    case rest
    case bye
    case save
    case getDeal
}

enum DealSwipeGesture {
    private static let horizontalThreshold: CGFloat = 110
    private static let predictedHorizontalThreshold: CGFloat = 380
    private static let upwardThreshold: CGFloat = 90
    private static let predictedUpwardThreshold: CGFloat = 260

    static func intent(
        translation: CGSize,
        predictedEndTranslation: CGSize
    ) -> DealSwipeIntent {
        let horizontalDominates = abs(translation.width) >= abs(translation.height)

        if horizontalDominates {
            if translation.width > horizontalThreshold
                || predictedEndTranslation.width > predictedHorizontalThreshold {
                return .save
            }
            if translation.width < -horizontalThreshold
                || predictedEndTranslation.width < -predictedHorizontalThreshold {
                return .bye
            }
        }

        let upwardDominates = abs(translation.height) > abs(translation.width)

        if upwardDominates,
           translation.height < -upwardThreshold
            || predictedEndTranslation.height < -predictedUpwardThreshold {
            return .getDeal
        }

        return .rest
    }
}
