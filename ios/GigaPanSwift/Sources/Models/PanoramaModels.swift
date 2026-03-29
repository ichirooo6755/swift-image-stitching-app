import CoreGraphics
import UIKit

struct QualitySettings {
    var denoiseStrength: Double = 0.34
    var detailBoost: Double = 1.05
    var saturationBoost: Double = 0.12
    var exposureBoost: Double = 0.06
    var searchRadius: Int = 52
}

struct StitchDiagnostics {
    let averageConfidence: Double
    let averageOverlap: Double
}

struct PanoramaResult {
    let image: UIImage
    let frameCount: Int
    let methodLabel: String
    let qualityScore: Int
    let diagnostics: StitchDiagnostics

    var megapixelsText: String {
        let pixels = image.size.width * image.size.height
        return String(format: "%.1fMP", pixels / 1_000_000)
    }
}

struct FocusBoostResult {
    let image: UIImage

    var megapixelsText: String {
        let pixels = image.size.width * image.size.height
        return String(format: "%.1fMP", pixels / 1_000_000)
    }
}

enum PanoramaError: LocalizedError {
    case notEnoughImages
    case imageConversionFailed
    case registrationFailed
    case renderFailed
    case invalidSelection

    var errorDescription: String? {
        switch self {
        case .notEnoughImages:
            return "2枚以上の画像を選択してください。"
        case .imageConversionFailed:
            return "画像処理用フォーマットへの変換に失敗しました。"
        case .registrationFailed:
            return "画像の位置合わせに失敗しました。別の順序または画像セットをお試しください。"
        case .renderFailed:
            return "パノラマのレンダリングに失敗しました。"
        case .invalidSelection:
            return "有効な範囲を選択してください。"
        }
    }
}
