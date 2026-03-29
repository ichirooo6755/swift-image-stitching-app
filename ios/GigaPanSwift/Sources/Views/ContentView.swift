import PhotosUI
import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = PanoramaViewModel()
    @State private var isPickerPresented = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.02, green: 0.04, blue: 0.08),
                        Color(red: 0.01, green: 0.07, blue: 0.14),
                        Color(red: 0.03, green: 0.05, blue: 0.09)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 16) {
                        headerCard
                        pickerCard
                        qualityCard
                        actionCard

                        if let panorama = viewModel.panoramaResult {
                            panoramaCard(result: panorama)
                        }

                        if let focus = viewModel.focusResult {
                            focusCard(result: focus)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 20)
                }
            }
            .navigationTitle("GigaPan Swift")
            .navigationBarTitleDisplayMode(.inline)
            .alert("エラー", isPresented: Binding(get: {
                viewModel.errorMessage != nil
            }, set: { _ in
                viewModel.errorMessage = nil
            })) {
                Button("閉じる", role: .cancel) {
                    viewModel.errorMessage = nil
                }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .alert("完了", isPresented: Binding(get: {
                viewModel.infoMessage != nil
            }, set: { _ in
                viewModel.infoMessage = nil
            })) {
                Button("OK") {
                    viewModel.infoMessage = nil
                }
            } message: {
                Text(viewModel.infoMessage ?? "")
            }
            .sheet(isPresented: $isPickerPresented) {
                MultiPhotoPicker(maxSelection: 40) { images in
                    viewModel.setSelectedImages(images)
                }
            }
        }
    }

    private var headerCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("AI Panorama Lab")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.cyan)

                Text("写真ライブラリから\n高精度ギガピクセル生成")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text("Visionベースの位置合わせ・ノイズ低減・ディテール補強・Focus Boostまで、iOSだけで完結します。")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.82))

                HStack(spacing: 8) {
                    Label("ライブラリ入力", systemImage: "photo.stack")
                    Label("高精度ステッチ", systemImage: "sparkles")
                    Label("部分超高画質", systemImage: "viewfinder")
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(.mint.opacity(0.95))
            }
        }
    }

    private var pickerCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("1. 画像選択")
                    .font(.headline)

                Button {
                    isPickerPresented = true
                } label: {
                    Label("写真ライブラリから選択", systemImage: "photo.on.rectangle.angled")
                        .font(.callout.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.cyan.opacity(0.25))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                HStack {
                    metricChip(title: "読み込み枚数", value: "\(viewModel.selectedImages.count)")
                    metricChip(title: "状態", value: viewModel.statusMessage)
                }
            }
        }
    }

    private var qualityCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("2. 高精度設定")
                    .font(.headline)

                sliderRow(
                    title: "ノイズ低減",
                    value: $viewModel.quality.denoiseStrength,
                    range: 0...1,
                    step: 0.05
                )

                sliderRow(
                    title: "ディテール補強",
                    value: $viewModel.quality.detailBoost,
                    range: 0.4...2,
                    step: 0.05
                )

                sliderRow(
                    title: "彩度補正",
                    value: $viewModel.quality.saturationBoost,
                    range: 0...0.4,
                    step: 0.02
                )

                sliderRow(
                    title: "露出補正",
                    value: $viewModel.quality.exposureBoost,
                    range: -0.2...0.3,
                    step: 0.01
                )

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("探索範囲")
                        Spacer()
                        Text("\(viewModel.quality.searchRadius)")
                            .foregroundStyle(.cyan)
                    }
                    .font(.caption.weight(.semibold))

                    Slider(
                        value: Binding(
                            get: { Double(viewModel.quality.searchRadius) },
                            set: { viewModel.quality.searchRadius = Int($0) }
                        ),
                        in: 24...96,
                        step: 1
                    )
                    .tint(.cyan)
                }
            }
        }
    }

    private var actionCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("3. パノラマ生成")
                    .font(.headline)

                ProgressView(value: viewModel.stitchProgress)
                    .tint(.mint)

                Text(viewModel.statusMessage)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.8))

                Button {
                    viewModel.startStitch()
                } label: {
                    HStack {
                        Image(systemName: "sparkles")
                        Text(viewModel.isStitching ? "生成中..." : "AIステッチ開始")
                    }
                    .font(.callout.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(viewModel.canStartStitch ? Color.mint.opacity(0.32) : Color.gray.opacity(0.25))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(!viewModel.canStartStitch)

                Button(role: .destructive) {
                    viewModel.resetAll()
                } label: {
                    Text("選択と結果をリセット")
                        .font(.caption.weight(.semibold))
                }
            }
        }
    }

    private func panoramaCard(result: PanoramaResult) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("4. パノラマ結果")
                    .font(.headline)

                HStack {
                    metricChip(title: "方式", value: result.methodLabel)
                    metricChip(title: "品質", value: "\(result.qualityScore)")
                }

                HStack {
                    metricChip(title: "フレーム", value: "\(result.frameCount)")
                    metricChip(title: "解像度", value: result.megapixelsText)
                }

                HStack {
                    metricChip(title: "信頼度", value: String(format: "%.1f%%", result.diagnostics.averageConfidence * 100))
                    metricChip(title: "重なり", value: String(format: "%.1f%%", result.diagnostics.averageOverlap * 100))
                }

                ZoomPanImageView(image: result.image)
                    .frame(height: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                Button {
                    viewModel.savePanoramaToLibrary()
                } label: {
                    Label("パノラマを写真へ保存", systemImage: "square.and.arrow.down")
                        .font(.callout.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.cyan.opacity(0.28))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                Divider().overlay(Color.white.opacity(0.2))

                Text("5. Focus Boost（部分超高画質）")
                    .font(.headline)

                SelectionImageView(
                    image: result.image,
                    selection: $viewModel.selectionRect
                )
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                if let selection = viewModel.selectionRect {
                    Text(
                        "選択範囲: x=\(Int(selection.origin.x * 100))% y=\(Int(selection.origin.y * 100))% " +
                        "w=\(Int(selection.width * 100))% h=\(Int(selection.height * 100))%"
                    )
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.85))
                }

                sliderRow(title: "アップスケール倍率", value: $viewModel.focusUpscale, range: 1...6, step: 0.25)
                sliderRow(title: "ディテール補強", value: $viewModel.focusDetail, range: 0.2...2, step: 0.05)
                sliderRow(title: "ノイズ低減", value: $viewModel.focusDenoise, range: 0...1, step: 0.05)

                Button {
                    viewModel.startFocusBoost()
                } label: {
                    HStack {
                        Image(systemName: "viewfinder")
                        Text(viewModel.isFocusProcessing ? "生成中..." : "選択範囲を超高画質化")
                    }
                    .font(.callout.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(viewModel.canCreateFocus ? Color.mint.opacity(0.3) : Color.gray.opacity(0.22))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(!viewModel.canCreateFocus)
            }
        }
    }

    private func focusCard(result: FocusBoostResult) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("6. Focus Boost 出力")
                    .font(.headline)

                metricChip(title: "解像度", value: result.megapixelsText)

                Image(uiImage: result.image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                Button {
                    viewModel.saveFocusToLibrary()
                } label: {
                    Label("Focus画像を写真へ保存", systemImage: "square.and.arrow.down")
                        .font(.callout.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.cyan.opacity(0.28))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
        }
    }

    private func metricChip(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.65))
            Text(value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func sliderRow(title: String, value: Binding<Double>, range: ClosedRange<Double>, step: Double) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title)
                    .font(.caption.weight(.semibold))
                Spacer()
                Text(String(format: step < 1 ? "%.2f" : "%.0f", value.wrappedValue))
                    .font(.caption)
                    .foregroundStyle(.cyan)
            }

            Slider(value: value, in: range, step: step)
                .tint(.cyan)
        }
    }
}

private struct GlassCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
            )
            .shadow(color: Color.cyan.opacity(0.1), radius: 10, x: 0, y: 8)
    }
}

private struct ZoomPanImageView: View {
    let image: UIImage

    @State private var accumulatedScale: CGFloat = 1
    @State private var gestureScale: CGFloat = 1
    @State private var accumulatedOffset: CGSize = .zero
    @State private var dragOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.opacity(0.45)

                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .scaleEffect(accumulatedScale * gestureScale)
                    .offset(
                        x: accumulatedOffset.width + dragOffset.width,
                        y: accumulatedOffset.height + dragOffset.height
                    )
                    .gesture(magnifyGesture)
                    .simultaneousGesture(dragGesture)
                    .onTapGesture(count: 2) {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            accumulatedScale = 1
                            gestureScale = 1
                            accumulatedOffset = .zero
                            dragOffset = .zero
                        }
                    }

                VStack {
                    Spacer()
                    Text("ピンチ/ドラッグで拡大表示（ダブルタップでリセット）")
                        .font(.caption2)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.black.opacity(0.45))
                        .clipShape(Capsule())
                        .padding(.bottom, 8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
            .onChange(of: geometry.size) { _, _ in
                accumulatedOffset = .zero
                dragOffset = .zero
            }
        }
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                gestureScale = max(1, min(6, value.magnification))
            }
            .onEnded { value in
                let next = accumulatedScale * value.magnification
                accumulatedScale = max(1, min(8, next))
                gestureScale = 1
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation
            }
            .onEnded { value in
                accumulatedOffset.width += value.translation.width
                accumulatedOffset.height += value.translation.height
                dragOffset = .zero
            }
    }
}

private struct SelectionImageView: View {
    let image: UIImage
    @Binding var selection: CGRect?

    @State private var dragStart: CGPoint?
    @State private var draftSelection: CGRect?

    var body: some View {
        GeometryReader { geo in
            let fitRect = fittedRect(imageSize: image.size, container: geo.size)

            ZStack {
                Color.black.opacity(0.45)

                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if let active = draftSelection ?? selection {
                    let drawRect = denormalized(rect: active, in: fitRect)
                    Rectangle()
                        .strokeBorder(Color.cyan, lineWidth: 2)
                        .background(Rectangle().fill(Color.cyan.opacity(0.2)))
                        .frame(width: drawRect.width, height: drawRect.height)
                        .position(x: drawRect.midX, y: drawRect.midY)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let point = clampPoint(value.location, to: fitRect)

                        if dragStart == nil {
                            dragStart = point
                        }

                        if let start = dragStart {
                            draftSelection = normalizedRect(from: start, to: point, in: fitRect)
                        }
                    }
                    .onEnded { _ in
                        if let draftSelection,
                           draftSelection.width > 0.03,
                           draftSelection.height > 0.03 {
                            selection = draftSelection
                        } else {
                            selection = nil
                        }

                        dragStart = nil
                        draftSelection = nil
                    }
            )
        }
    }

    private func fittedRect(imageSize: CGSize, container: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0, container.width > 0, container.height > 0 else {
            return .zero
        }

        let imageAspect = imageSize.width / imageSize.height
        let containerAspect = container.width / container.height

        if imageAspect > containerAspect {
            let width = container.width
            let height = width / imageAspect
            return CGRect(x: 0, y: (container.height - height) * 0.5, width: width, height: height)
        } else {
            let height = container.height
            let width = height * imageAspect
            return CGRect(x: (container.width - width) * 0.5, y: 0, width: width, height: height)
        }
    }

    private func normalizedRect(from start: CGPoint, to end: CGPoint, in bounds: CGRect) -> CGRect {
        let minX = min(start.x, end.x)
        let minY = min(start.y, end.y)
        let maxX = max(start.x, end.x)
        let maxY = max(start.y, end.y)

        let x = (minX - bounds.minX) / bounds.width
        let y = (minY - bounds.minY) / bounds.height
        let w = (maxX - minX) / bounds.width
        let h = (maxY - minY) / bounds.height

        return CGRect(x: x, y: y, width: w, height: h)
    }

    private func denormalized(rect: CGRect, in bounds: CGRect) -> CGRect {
        CGRect(
            x: bounds.minX + rect.minX * bounds.width,
            y: bounds.minY + rect.minY * bounds.height,
            width: rect.width * bounds.width,
            height: rect.height * bounds.height
        )
    }

    private func clampPoint(_ point: CGPoint, to bounds: CGRect) -> CGPoint {
        CGPoint(
            x: min(max(point.x, bounds.minX), bounds.maxX),
            y: min(max(point.y, bounds.minY), bounds.maxY)
        )
    }
}
