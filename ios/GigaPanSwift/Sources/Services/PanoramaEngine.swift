import CoreGraphics
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
import Vision

final class PanoramaEngine {
    typealias ProgressHandler = (Double, String) -> Void

    private let context = CIContext()
    private let maxPanoramaPixels: CGFloat = 170_000_000
    private let maxFocusPixels: CGFloat = 14_000_000

    func stitch(images: [UIImage], settings: QualitySettings, progress: ProgressHandler?) throws -> PanoramaResult {
        guard images.count >= 2 else {
            throw PanoramaError.notEnoughImages
        }

        progress?(0.06, "画像を前処理中...")
        let prepared = try images.enumerated().map { index, image -> PreparedImage in
            let cgImage = try normalizedCGImage(from: image)
            let processed = try preprocess(cgImage: cgImage, settings: settings)
            progress?(0.06 + Double(index + 1) / Double(images.count) * 0.18, "前処理 \(index + 1)/\(images.count)")
            return PreparedImage(original: cgImage, processed: processed)
        }

        progress?(0.28, "Visionで位置合わせ中...")
        var positions: [CGPoint] = [.zero]
        var confidences: [Double] = []
        var overlaps: [Double] = []

        for index in 1..<prepared.count {
            let shift = try estimateShift(previous: prepared[index - 1], next: prepared[index], searchRadius: settings.searchRadius)
            let previousPoint = positions[index - 1]
            positions.append(CGPoint(x: previousPoint.x + shift.dx, y: previousPoint.y + shift.dy))
            confidences.append(shift.confidence)
            overlaps.append(shift.overlap)

            let stage = 0.28 + Double(index) / Double(max(prepared.count - 1, 1)) * 0.32
            progress?(stage, "高精度位置合わせ \(index)/\(prepared.count - 1)")
        }

        progress?(0.64, "ギガピクセル合成中...")
        let stitchedImage = try compose(preparedImages: prepared, positions: positions, settings: settings)

        let averageConfidence = confidences.isEmpty ? 0.85 : confidences.reduce(0, +) / Double(confidences.count)
        let averageOverlap = overlaps.isEmpty ? 0.8 : overlaps.reduce(0, +) / Double(overlaps.count)
        let quality = Int((averageConfidence * 0.72 + averageOverlap * 0.28) * 100.0)

        progress?(1.0, "パノラマ生成が完了しました。")

        return PanoramaResult(
            image: stitchedImage,
            frameCount: images.count,
            methodLabel: "Vision Translational Stitch",
            qualityScore: min(99, max(45, quality)),
            diagnostics: StitchDiagnostics(averageConfidence: averageConfidence, averageOverlap: averageOverlap)
        )
    }

    func makeFocusBoost(
        from image: UIImage,
        normalizedRect: CGRect,
        upscaleFactor: CGFloat,
        detailBoost: Double,
        denoiseStrength: Double
    ) throws -> FocusBoostResult {
        guard normalizedRect.width > 0.03, normalizedRect.height > 0.03 else {
            throw PanoramaError.invalidSelection
        }

        let cgImage = try normalizedCGImage(from: image)

        let cropRect = CGRect(
            x: normalizedRect.origin.x * CGFloat(cgImage.width),
            y: normalizedRect.origin.y * CGFloat(cgImage.height),
            width: normalizedRect.width * CGFloat(cgImage.width),
            height: normalizedRect.height * CGFloat(cgImage.height)
        ).integral

        guard let cropped = cgImage.cropping(to: cropRect) else {
            throw PanoramaError.invalidSelection
        }

        var ciImage = CIImage(cgImage: cropped)

        let denoise = CIFilter.noiseReduction()
        denoise.inputImage = ciImage
        denoise.noiseLevel = Float(max(0, denoiseStrength) * 0.04)
        denoise.sharpness = Float(max(0, detailBoost) * 0.26)
        if let output = denoise.outputImage {
            ciImage = output
        }

        let requestedScale = max(1, min(6, upscaleFactor))
        let requestedPixels = CGFloat(cropped.width) * CGFloat(cropped.height) * requestedScale * requestedScale
        let pixelLimitScale = requestedPixels > maxFocusPixels ? sqrt(maxFocusPixels / requestedPixels) : 1
        let finalScale = requestedScale * pixelLimitScale

        let upscale = CIFilter.lanczosScaleTransform()
        upscale.inputImage = ciImage
        upscale.scale = Float(finalScale)
        upscale.aspectRatio = 1
        if let output = upscale.outputImage {
            ciImage = output
        }

        let sharpen = CIFilter.sharpenLuminance()
        sharpen.inputImage = ciImage
        sharpen.sharpness = Float(max(0.1, detailBoost))
        if let output = sharpen.outputImage {
            ciImage = output
        }

        guard let output = context.createCGImage(ciImage, from: ciImage.extent) else {
            throw PanoramaError.renderFailed
        }

        return FocusBoostResult(image: UIImage(cgImage: output))
    }

    private func normalizedCGImage(from image: UIImage) throws -> CGImage {
        if let cgImage = image.cgImage {
            return cgImage
        }

        if let ciImage = image.ciImage,
           let output = context.createCGImage(ciImage, from: ciImage.extent) {
            return output
        }

        let rendererFormat = UIGraphicsImageRendererFormat.default()
        rendererFormat.scale = 1
        let renderer = UIGraphicsImageRenderer(size: image.size, format: rendererFormat)
        let rendered = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }

        if let cgImage = rendered.cgImage {
            return cgImage
        }

        throw PanoramaError.imageConversionFailed
    }

    private func preprocess(cgImage: CGImage, settings: QualitySettings) throws -> CGImage {
        var ciImage = CIImage(cgImage: cgImage)

        let denoise = CIFilter.noiseReduction()
        denoise.inputImage = ciImage
        denoise.noiseLevel = Float(max(0, settings.denoiseStrength) * 0.035)
        denoise.sharpness = Float(max(0.1, settings.detailBoost) * 0.2)
        if let output = denoise.outputImage {
            ciImage = output
        }

        let color = CIFilter.colorControls()
        color.inputImage = ciImage
        color.saturation = Float(1 + settings.saturationBoost)
        color.brightness = Float(settings.exposureBoost * 0.12)
        color.contrast = Float(1 + settings.detailBoost * 0.16)
        if let output = color.outputImage {
            ciImage = output
        }

        let sharpen = CIFilter.sharpenLuminance()
        sharpen.inputImage = ciImage
        sharpen.sharpness = Float(max(0.1, settings.detailBoost * 0.85))
        if let output = sharpen.outputImage {
            ciImage = output
        }

        guard let output = context.createCGImage(ciImage, from: ciImage.extent) else {
            throw PanoramaError.imageConversionFailed
        }

        return output
    }

    private func estimateShift(previous: PreparedImage, next: PreparedImage, searchRadius: Int) throws -> ShiftDiagnostics {
        let request = VNTranslationalImageRegistrationRequest(targetedCGImage: next.processed)
        let handler = VNImageRequestHandler(cgImage: previous.processed)

        do {
            try handler.perform([request])
        } catch {
            throw PanoramaError.registrationFailed
        }

        guard let observation = request.results?.first as? VNImageTranslationAlignmentObservation else {
            throw PanoramaError.registrationFailed
        }

        let transform = observation.alignmentTransform
        let limitedDX = clamp(transform.tx, min: -CGFloat(searchRadius), max: CGFloat(searchRadius))
        let limitedDY = clamp(transform.ty, min: -CGFloat(searchRadius), max: CGFloat(searchRadius))

        let overlapX = max(0, 1 - abs(limitedDX) / CGFloat(max(1, previous.original.width)))
        let overlapY = max(0, 1 - abs(limitedDY) / CGFloat(max(1, previous.original.height)))
        let overlap = Double((overlapX + overlapY) * 0.5)

        let shiftMagnitude = hypot(limitedDX, limitedDY)
        let magnitudeLimit = CGFloat(max(previous.original.width, previous.original.height)) * 0.35
        let confidence = Double(max(0.35, min(0.99, 1 - shiftMagnitude / max(1, magnitudeLimit))))

        return ShiftDiagnostics(dx: limitedDX, dy: limitedDY, confidence: confidence, overlap: overlap)
    }

    private func compose(preparedImages: [PreparedImage], positions: [CGPoint], settings: QualitySettings) throws -> UIImage {
        guard preparedImages.count == positions.count else {
            throw PanoramaError.renderFailed
        }

        var minX = CGFloat.greatestFiniteMagnitude
        var minY = CGFloat.greatestFiniteMagnitude
        var maxX = -CGFloat.greatestFiniteMagnitude
        var maxY = -CGFloat.greatestFiniteMagnitude

        for (index, image) in preparedImages.enumerated() {
            let point = positions[index]
            let width = CGFloat(image.original.width)
            let height = CGFloat(image.original.height)

            minX = min(minX, point.x)
            minY = min(minY, point.y)
            maxX = max(maxX, point.x + width)
            maxY = max(maxY, point.y + height)
        }

        let rawWidth = max(1, maxX - minX)
        let rawHeight = max(1, maxY - minY)
        let rawPixels = rawWidth * rawHeight
        let scale = rawPixels > maxPanoramaPixels ? sqrt(maxPanoramaPixels / rawPixels) : 1

        let renderSize = CGSize(width: max(1, rawWidth * scale), height: max(1, rawHeight * scale))

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(size: renderSize, format: format)
        let rendered = renderer.image { context in
            let cgContext = context.cgContext
            let gradientColors = [
                UIColor(red: 0.02, green: 0.03, blue: 0.08, alpha: 1).cgColor,
                UIColor(red: 0.01, green: 0.04, blue: 0.09, alpha: 1).cgColor,
            ] as CFArray

            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: gradientColors, locations: [0, 1]) {
                cgContext.drawLinearGradient(
                    gradient,
                    start: CGPoint(x: 0, y: 0),
                    end: CGPoint(x: renderSize.width, y: renderSize.height),
                    options: []
                )
            } else {
                cgContext.setFillColor(UIColor.black.cgColor)
                cgContext.fill(CGRect(origin: .zero, size: renderSize))
            }

            for (index, image) in preparedImages.enumerated() {
                let point = positions[index]
                let drawRect = CGRect(
                    x: (point.x - minX) * scale,
                    y: (point.y - minY) * scale,
                    width: CGFloat(image.original.width) * scale,
                    height: CGFloat(image.original.height) * scale
                )

                cgContext.saveGState()
                cgContext.setAlpha(index == 0 ? 1.0 : 0.88)
                cgContext.interpolationQuality = .high
                cgContext.draw(image.original, in: drawRect)
                cgContext.restoreGState()
            }
        }

        guard rendered.cgImage != nil else {
            throw PanoramaError.renderFailed
        }

        return rendered
    }

    private func clamp(_ value: CGFloat, min: CGFloat, max: CGFloat) -> CGFloat {
        Swift.min(max, Swift.max(min, value))
    }
}

private struct PreparedImage {
    let original: CGImage
    let processed: CGImage
}

private struct ShiftDiagnostics {
    let dx: CGFloat
    let dy: CGFloat
    let confidence: Double
    let overlap: Double
}
