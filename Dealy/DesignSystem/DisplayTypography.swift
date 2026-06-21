import SwiftUI

extension Font {
    /// Dealy's narrow display voice. Helvetica Neue Condensed Black ships with
    /// iOS, so this creates the requested look without bundling a font asset.
    static func dealyCondensedBlack(size: CGFloat) -> Font {
        .custom("HelveticaNeue-CondensedBlack", size: size)
    }
}
