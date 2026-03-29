# GigaPan Studio

## プロジェクト概要
モダンなUIで、写真ライブラリから高精度パノラマを簡単に生成し、さらにズーム選択した一部分だけを超高画質化できるプロジェクトです。

現在は次の2実装を同梱しています。
- Web実装: `src/`（React + Vite）
- iOS実装: `ios/GigaPanSwift/`（SwiftUI + Vision + CoreImage）

## ユーザー指定要件・条件（最優先）
1. モダンで洗練されたデザインにすること
2. 既存ライブラリ写真からギガピクセル級パノラマを生成できること
3. 機械学習的な品質向上機能（ノイズ低減、エッジ補強、露出/色補正など）を可能な範囲で使うこと
4. できるだけ簡単な操作で高精度パノラマを作成できること
5. ズームや選択操作で、部分的に超高画質化して保存できること

## 実装済み機能
- iOS SwiftUIアプリで写真ライブラリ複数選択入力
- Visionの平行移動レジストレーションを用いた高精度ステッチ
- CoreImageベースのノイズ低減・ディテール補強・色/露出補正
- ギガピクセル相当の大判合成（上限ピクセル制御あり）
- Focus Boost（範囲選択 -> 部分アップスケール -> 高精細保存）
- パノラマ表示のズーム/パン確認
- 生成画像・Focus画像の写真ライブラリ保存
- モダンなガラス調UI（Web/iOS両方）

## 不具合分析ログ
### 1) 大規模差分適用時の失敗
- 症状: 一括パッチ適用時にタイムアウト、または差分形式エラーが発生
- 根本原因: 単一差分が大きすぎてツール制限に抵触
- 解決策: 変更をファイル分割・段階適用に変更し、小さなパッチで反映

### 2) 新規作成ファイルへの差分記号混入
- 症状: `+` 記号混入によりTSX/TS構文が崩れ、コンパイルエラー多発
- 根本原因: 差分記法の記号が一部ソースに残ったまま保存
- 解決策: 該当ブロックを再パッチして差分記号を除去し、構文を正常化

### 3) Swift側の `PhotosPickerItem` 解決失敗
- 症状: iOSビルド時に `cannot find type 'PhotosPickerItem' in scope`
- 根本原因: ターゲット側の `PhotosPickerItem` 依存でビルド整合が崩れた
- 解決策: `PHPickerViewController` ベースの `MultiPhotoPicker` に切替し、`UIImage` 配列を直接 `ViewModel` に受け渡し

## 作業ログ
### 変更ファイル
- `ios/GigaPanSwift/project.yml`
- `ios/GigaPanSwift/Sources/GigaPanSwiftApp.swift`
- `ios/GigaPanSwift/Sources/Models/PanoramaModels.swift`
- `ios/GigaPanSwift/Sources/Services/PanoramaEngine.swift`
- `ios/GigaPanSwift/Sources/ViewModels/PanoramaViewModel.swift`
- `ios/GigaPanSwift/Sources/Views/ContentView.swift`
- `ios/GigaPanSwift/Sources/Views/MultiPhotoPicker.swift`
- `ios/GigaPanSwift/GigaPanSwift.xcodeproj/project.pbxproj`
- `src/main.tsx`
- `src/App.tsx`
- `src/GigaPanStudio.tsx`
- `src/panoramaEngine.ts`
- `src/index.css`
- `.gitignore`
- `README.md`

### 実行コマンド
- `npm install`
- `npm run build`
- `xcodegen generate` (`ios/GigaPanSwift`)
- `xcodebuild -project GigaPanSwift.xcodeproj -scheme GigaPanSwift -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`
- `git init`
- `git branch -m main`
- `git add .`
- `git commit -m "feat: add Swift iOS gigapixel panorama studio"`
- `gh repo create swift-image-stitching-app --public --source=. --remote=origin --push`

## ビルド確認
- `npm run build` 成功
- 出力: `dist/index.html` 生成確認
- iOSビルド成功（上記 `xcodebuild` コマンド、exit code 0）

## GitHub
- リポジトリ: `https://github.com/ichirooo6755/swift-image-stitching-app`

## iOS実行方法
1. `cd ios/GigaPanSwift`
2. `xcodegen generate`
3. `open GigaPanSwift.xcodeproj`
4. Xcodeで実機またはシミュレータを選択して `Run`

## Web実行方法
1. `npm install`
2. `npm run dev`
3. ブラウザで表示されたURLを開く
