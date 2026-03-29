import Foundation
import Photos
import UIKit

@MainActor
final class PanoramaViewModel: ObservableObject {
    @Published var selectedImages: [UIImage] = []
    @Published var quality = QualitySettings()

    @Published var isStitching = false
    @Published var stitchProgress: Double = 0
    @Published var statusMessage: String = "写真を選択してください"

    @Published var panoramaResult: PanoramaResult?
    @Published var focusResult: FocusBoostResult?

    @Published var selectionRect: CGRect?
    @Published var focusUpscale: Double = 3
    @Published var focusDetail: Double = 1.2
    @Published var focusDenoise: Double = 0.32
    @Published var isFocusProcessing = false

    @Published var errorMessage: String?
    @Published var infoMessage: String?

    private let engine = PanoramaEngine()

    var canStartStitch: Bool {
        selectedImages.count >= 2 && !isStitching
    }

    var canCreateFocus: Bool {
        panoramaResult != nil && selectionRect != nil && !isFocusProcessing
    }

    func clearMessages() {
        errorMessage = nil
        infoMessage = nil
    }

    func resetAll() {
        selectedImages = []
        panoramaResult = nil
        focusResult = nil
        selectionRect = nil
        stitchProgress = 0
        statusMessage = "写真を選択してください"
        clearMessages()
    }

    func startStitch() {
        guard selectedImages.count >= 2 else {
            errorMessage = PanoramaError.notEnoughImages.localizedDescription
            return
        }

        clearMessages()
        focusResult = nil
        selectionRect = nil
        isStitching = true
        stitchProgress = 0
        statusMessage = "AIステッチを開始します..."

        let images = selectedImages
        let quality = self.quality

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            do {
                let result = try self.engine.stitch(images: images, settings: quality) { progress, message in
                    DispatchQueue.main.async {
                        self.stitchProgress = progress
                        self.statusMessage = message
                    }
                }

                DispatchQueue.main.async {
                    self.panoramaResult = result
                    self.isStitching = false
                    self.statusMessage = "パノラマ生成が完了しました"
                }
            } catch {
                DispatchQueue.main.async {
                    self.isStitching = false
                    self.errorMessage = error.localizedDescription
                    self.statusMessage = "生成に失敗しました"
                }
            }
        }
    }

    func setSelectedImages(_ images: [UIImage]) {
        clearMessages()
        selectedImages = images
        statusMessage = images.isEmpty
            ? "写真を選択してください"
            : "\(images.count)枚の画像を読み込みました"
    }

    func startFocusBoost() {
        guard let panorama = panoramaResult,
              let selectionRect else {
            errorMessage = PanoramaError.invalidSelection.localizedDescription
            return
        }

        clearMessages()
        isFocusProcessing = true

        let image = panorama.image
        let upscale = CGFloat(focusUpscale)
        let detail = focusDetail
        let denoise = focusDenoise

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            do {
                let result = try self.engine.makeFocusBoost(
                    from: image,
                    normalizedRect: selectionRect,
                    upscaleFactor: upscale,
                    detailBoost: detail,
                    denoiseStrength: denoise
                )

                DispatchQueue.main.async {
                    self.focusResult = result
                    self.isFocusProcessing = false
                }
            } catch {
                DispatchQueue.main.async {
                    self.isFocusProcessing = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    func savePanoramaToLibrary() {
        guard let image = panoramaResult?.image else { return }
        saveToPhotoLibrary(image: image)
    }

    func saveFocusToLibrary() {
        guard let image = focusResult?.image else { return }
        saveToPhotoLibrary(image: image)
    }

    private func saveToPhotoLibrary(image: UIImage) {
        clearMessages()

        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self else { return }

            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async {
                    self.errorMessage = "写真への保存権限がありません。設定アプリで許可してください。"
                }
                return
            }

            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                if let jpegData = image.jpegData(compressionQuality: 0.97) {
                    let options = PHAssetResourceCreationOptions()
                    request.addResource(with: .photo, data: jpegData, options: options)
                }
            } completionHandler: { success, error in
                DispatchQueue.main.async {
                    if success {
                        self.infoMessage = "写真ライブラリに保存しました"
                    } else {
                        self.errorMessage = error?.localizedDescription ?? "保存に失敗しました"
                    }
                }
            }
        }
    }
}
