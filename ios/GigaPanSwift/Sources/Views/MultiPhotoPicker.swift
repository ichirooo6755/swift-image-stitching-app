import PhotosUI
import SwiftUI

struct MultiPhotoPicker: UIViewControllerRepresentable {
    let maxSelection: Int
    let onComplete: ([UIImage]) -> Void

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = maxSelection
        config.selection = .ordered

        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onComplete: onComplete)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        private let onComplete: ([UIImage]) -> Void

        init(onComplete: @escaping ([UIImage]) -> Void) {
            self.onComplete = onComplete
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)

            guard !results.isEmpty else {
                onComplete([])
                return
            }

            let itemProviders = results.map(\.itemProvider)
            var loadedImages: [UIImage?] = Array(repeating: nil, count: itemProviders.count)
            let dispatchGroup = DispatchGroup()

            for (index, provider) in itemProviders.enumerated() {
                dispatchGroup.enter()

                if provider.canLoadObject(ofClass: UIImage.self) {
                    provider.loadObject(ofClass: UIImage.self) { object, _ in
                        if let image = object as? UIImage {
                            loadedImages[index] = image
                        }
                        dispatchGroup.leave()
                    }
                } else {
                    dispatchGroup.leave()
                }
            }

            dispatchGroup.notify(queue: .main) {
                let images = loadedImages.compactMap { $0 }
                self.onComplete(images)
            }
        }
    }
}
