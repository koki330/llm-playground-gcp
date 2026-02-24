# 復旧手順書 — 2026/02/20 大規模リファクタリング

## 概要

Vercel AI SDK のプロバイダーパッケージを各LLMプロバイダーの公式SDKに統一するリファクタリングを実施。
変更はまだ **コミットされていない** ため、git操作で完全に元に戻せる。

---

## 全変更を一括で元に戻す方法（最も確実）

```bash
# 1. 全ての変更を破棄（変更・削除されたファイルを復元）
git checkout .

# 2. 新規作成されたファイルを削除
git clean -fd src/app/api/chat/handlers/ src/app/api/chat/types.ts src/components/web-search-warning.tsx src/utils/

# 3. package-lock.jsonも元に戻っているので、依存を再インストール
npm install
```

これで完全に元の状態に復元される。

---

## 削除されたパッケージ（5個）

| パッケージ | バージョン | 用途 |
|---|---|---|
| `@ai-sdk/anthropic` | latest | Vercel AI SDK経由でClaude呼び出し |
| `@ai-sdk/google` | ^1.2.22 | Vercel AI SDK経由でGemini呼び出し |
| `@ai-sdk/google-vertex` | latest | Vercel AI SDK経由でVertex AI呼び出し |
| `@ai-sdk/openai` | latest | Vercel AI SDK経由でOpenAI呼び出し |
| `tiktoken` | ^1.0.21 | トークン数推定（入力トークン計算） |

個別に復元する場合:
```bash
npm install @ai-sdk/anthropic@latest @ai-sdk/google@^1.2.22 @ai-sdk/google-vertex@latest @ai-sdk/openai@latest tiktoken@^1.0.21
```

---

## 削除されたファイル（3個）

| ファイル | 用途 |
|---|---|
| `src/services/openai.ts` | Vercel AI SDKの`@ai-sdk/openai`ラッパー（`createOpenAI()`） |
| `src/services/anthropic.ts` | Vercel AI SDKの`@ai-sdk/anthropic`ラッパー（`createAnthropic()`） |
| `src/services/vertexai.ts` | Vercel AI SDKの`@ai-sdk/google-vertex`ラッパー（`createVertex()`） |

これらは `git checkout .` で自動復元される。

---

## 新規作成されたファイル（9個）

一括復元時は `git clean` で削除する必要がある:

| ファイル | 用途 |
|---|---|
| `src/utils/sse-encoder.ts` | SSEエンコード共通関数 |
| `src/utils/usage-tracker.ts` | Firestore利用量トラッキング |
| `src/app/api/chat/types.ts` | ハンドラー共有型定義 |
| `src/app/api/chat/handlers/openai-standard.ts` | GPT-4.1/O3ハンドラー |
| `src/app/api/chat/handlers/openai-gpt5.ts` | GPT-5シリーズハンドラー |
| `src/app/api/chat/handlers/o3-web-search.ts` | O3+Web検索ハンドラー |
| `src/app/api/chat/handlers/claude.ts` | Claudeハンドラー |
| `src/app/api/chat/handlers/gemini-standard.ts` | Gemini 2.5 Pro/Flashハンドラー |
| `src/app/api/chat/handlers/gemini3.ts` | Gemini 3 Proハンドラー |

---

## 変更されたファイル（8個）と主な変更内容

### `src/app/api/chat/route.ts`（最大の変更）
- **旧**: 全モデルの処理ロジック（約628行のモノリス）
- **新**: リクエスト解析・共通処理・ルーティングのみ（約130行）
- 全モデル固有ロジックが `handlers/` に分離された
- `usageTracker` オブジェクトが `utils/usage-tracker.ts` に移動
- Vercel AI SDKの `streamText()`, `toDataStreamResponse()` 呼び出しを全て除去
- DEBUGログ17箇所を削除

### `src/context/AppContext.tsx`
- `fileContent` / `setFileContent`（単一ファイル後方互換state）を削除
- `imageUri` / `setImageUri`（単一画像後方互換state）を削除
- `submitPrompt` 内の上記stateへのフォールバックロジックを削除
- `clearConversation` から上記stateのリセット処理を削除

### `src/components/sidebar.tsx`
- 4箇所の同一Web検索警告ブロックを `<WebSearchWarning />` コンポーネントに置換
- `AlertTriangle` import を削除
- 旧 "File Content" テキストエリアセクションを削除

### `src/components/chat-input.tsx`
- `alert(errorMessage)` → `setError(errorMessage)` に変更（AppContext経由のエラー表示）
- DEBUGログを削除

### `src/services/openai-gpt5.ts`
- ローカルの `TextEncoder` → `encodeTextChunk()` / `encodeError()` に置換（import先変更のみ）

### `src/services/vertexai-gemini3.ts`
- ローカルの `TextEncoder` → `encodeTextChunk()` に置換（import先変更のみ）
- DEBUGログ4箇所を削除

### `package.json`
- 5パッケージ削除（上記参照）

### `package-lock.json`
- 上記パッケージ削除に伴う自動更新

---

## 運用への影響が特に大きい変更点

### 1. ストリーミング方式の変更
- **旧**: Vercel AI SDKの `streamText()` → `toDataStreamResponse()` が自動的にSSEフォーマットを処理
- **新**: 各公式SDKのストリーミングAPIを手動で `ReadableStream` に変換し、`encodeTextChunk()` でSSEフォーマットに変換
- **リスク**: SSEフォーマットが微妙に異なると、フロントエンドの `useChat` がテキストを正しくパースできない可能性

### 2. トークン使用量の計算方式変更
- **旧**: `tiktoken` でリクエスト時に入力トークン数を推定 + レスポンスから出力トークン数を取得
- **新**: APIレスポンスの `usage` フィールドから入出力トークン数を取得（`tiktoken` 不要）
- **リスク**: 一部モデルで `usage` データが返されない場合、Firestoreへの利用量記録が欠落する可能性

### 3. O3+Web検索のクエリ生成方式変更
- **旧**: Vercel AI SDKの `generateObject()` + zodスキーマでJSON構造を保証
- **新**: OpenAI SDKの `response_format: { type: 'json_object' }` + 手動JSONパース
- **リスク**: JSONパース失敗時の検索クエリ生成エラー

### 4. Gemini 2.5のグラウンディング方式変更
- **旧**: Vercel AI SDK経由で `useSearchGrounding: true`
- **新**: 公式Vertex AI SDKの `googleSearchRetrieval: {}` ツール
- **リスク**: パラメータ名や構造の違いでグラウンディングが機能しない可能性

---

## テスト確認項目

以下の全項目を動作確認してからデプロイすること:

### 基本チャット（全10モデル）
- [ ] GPT-4.1 — テキストチャット
- [ ] GPT-4.1-nano — テキストチャット
- [ ] O3 — テキストチャット（Web検索OFF）
- [ ] O3 + Web検索 — 検索結果を含む回答
- [ ] GPT-5 — テキストチャット
- [ ] GPT-5-mini — テキストチャット
- [ ] GPT-5.1 — テキストチャット
- [ ] Claude Sonnet 4.5 — テキストチャット
- [ ] Gemini 2.5 Pro — テキストチャット
- [ ] Gemini 2.5 Flash — テキストチャット
- [ ] Gemini 3 Pro Preview — テキストチャット

### ファイル添付
- [ ] 画像ファイル（PNG/JPEG）添付
- [ ] PDFファイル添付
- [ ] DOCX/XLSX添付
- [ ] 複数ファイル同時添付

### Web検索/グラウンディング
- [ ] O3 + Web検索
- [ ] GPT-5シリーズ + グラウンディング
- [ ] Gemini 2.5 + グラウンディング
- [ ] Gemini 3 + グラウンディング

### モデル設定
- [ ] Temperature/スタイル切替
- [ ] 最大トークン数変更
- [ ] リーゾニング精度変更
- [ ] システムプロンプト設定

### エラー表示
- [ ] ファイルアップロードエラー時にチャット画面にエラー表示（alert()ではなくなった）
- [ ] 利用上限超過時のエラー表示

---

## 注意事項

- **全変更はコミットされていない**: `git checkout . && git clean -fd <対象ディレクトリ> && npm install` で完全復元可能
- 復元後は `npm install` を忘れずに実行すること（削除パッケージの再インストールが必要）
- `.claude/` ディレクトリはツール設定用であり、アプリケーションには影響しない

---
---

# 改修2: PDFネイティブ処理への移行 — 2026/02/20

## 概要

PDFファイルの処理をGoogle Document AI経由のテキスト抽出から、各モデルのネイティブAPI機能による直接処理に移行。
Document AIサービスおよび依存パッケージ `@google-cloud/documentai` を完全削除。

---

## 改修の目的

- **旧フロー**: Frontend → GCS → `/api/extract-text` → Document AI → テキスト抽出 → プロンプトに文字列付加
- **新フロー**: Frontend → GCS → URI保持 → Backend: GCSダウンロード → base64変換 → 各モデルAPIにネイティブ送信

---

## この改修だけを元に戻す方法

この改修は前回のリファクタリングに追加で行われたものなので、git操作での一括巻き戻しは前回分も含まれる。
個別に戻す場合は以下のファイルを手動で復元する必要がある。

### 1. 削除されたファイルの復元
```bash
git checkout HEAD -- src/services/documentAiService.ts
```

### 2. 削除されたパッケージの復元
```bash
npm install @google-cloud/documentai@^9.2.0
```

### 3. 変更されたファイルの手動復元（該当部分のみ）
以下のファイルからPDF関連の変更を手動で取り消す:
- `src/config/models.json` — `supportsPdf` フラグを全エントリから削除
- `src/config/modelConfig.ts` — 型から `supportsPdf` を削除
- `src/context/AppContext.tsx` — `pdfUris` 関連のstate・ロジックを削除
- `src/components/chat-input.tsx` — PDF分岐を削除し、元のextract-text経由に戻す
- `src/components/sidebar.tsx` — `supportedFiles` を静的配列に戻す
- `src/app/api/chat/types.ts` — `pdfUris` を削除
- `src/app/api/chat/route.ts` — PDF処理ブロックを削除
- `src/app/api/chat/handlers/openai-standard.ts` — PDF分岐を削除
- `src/app/api/chat/handlers/claude.ts` — PDF分岐を削除
- `src/app/api/chat/handlers/gemini-standard.ts` — PDF分岐を削除
- `src/app/api/chat/handlers/gemini3.ts` — PDF透過を削除
- `src/services/openai-gpt5.ts` — `InputFilePart` とPDF分岐を削除
- `src/services/vertexai-gemini3.ts` — PDF分岐を削除
- `src/app/api/extract-text/route.ts` — PDF/PNG の Document AI 処理を復元

---

## 削除されたパッケージ（1個）

| パッケージ | バージョン | 用途 |
|---|---|---|
| `@google-cloud/documentai` | ^9.2.0 | PDFおよびPNG画像からのテキスト抽出 |

---

## 削除されたファイル（1個）

| ファイル | 用途 |
|---|---|
| `src/services/documentAiService.ts` | Document AI APIラッパー（`processDocument()`） |

---

## 変更されたファイル一覧と主な変更内容

### 設定ファイル

#### `src/config/models.json`
- 全モデルの `modelConfig` に `supportsPdf` フラグを追加
- O3のみ `false`、他の全モデルは `true`

#### `src/config/modelConfig.ts`
- `ModelConfig` 型の `modelConfig` に `supportsPdf?: boolean` を追加

### フロントエンド

#### `src/context/AppContext.tsx`
- `ModelConfigData` 型に `supportsPdf?: boolean` を追加
- `AppContextType` に `pdfUris` / `setPdfUris` を追加
- `pdfUris` stateを追加
- `submitPrompt` にPDF対応チェック（非対応モデルでPDF添付時はエラー表示して中断）
- `append()` の `body` に `pdfUris` を追加
- `onFinish` / `clearConversation` で `setPdfUris([])` を追加

#### `src/components/chat-input.tsx`
- `handleFileChange`: `application/pdf` の場合は `/api/extract-text` を呼ばず `pdfUris` にGCS URIを保持
- `handleRemoveAttachment`: PDF用の分岐を追加

#### `src/components/sidebar.tsx`
- `supportedFiles` を静的配列から動的リストに変更
- `currentModelConfig?.supportsPdf` が `true` のとき「PDF」が表示される

### バックエンド共通

#### `src/app/api/chat/types.ts`
- `ChatRequestBody` に `pdfUris?: string[]` を追加

#### `src/app/api/chat/route.ts`
- 画像処理ブロックの直後にPDF処理ブロックを追加
- GCSからダウンロード → base64変換 → content配列に `{ type: 'pdf', pdf: dataUrl }` を注入

### 各ハンドラー

#### `src/app/api/chat/handlers/openai-standard.ts`（GPT-4.1, O3）
- PDF → `{ type: 'file', file: { filename: 'document.pdf', file_data } }` に変換

#### `src/services/openai-gpt5.ts`（GPT-5シリーズ）
- `InputFilePart` 型を追加
- `getGpt5Response` / `streamGpt5Response` 両方のcontent構築にPDF分岐追加
- PDF → `{ type: 'input_file', filename: 'document.pdf', file_data }` に変換

#### `src/app/api/chat/handlers/claude.ts`（Claude Sonnet 4.5）
- PDF → `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }` に変換

#### `src/app/api/chat/handlers/gemini-standard.ts`（Gemini 2.5 Pro/Flash）
- PDF → `{ inlineData: { mimeType: 'application/pdf', data } }` に変換

#### `src/app/api/chat/handlers/gemini3.ts` + `src/services/vertexai-gemini3.ts`（Gemini 3 Pro）
- メッセージ内容の型に `pdf?: string` を追加
- content変換ループにPDF分岐を追加（`inlineData` 形式）

### クリーンアップ

#### `src/app/api/extract-text/route.ts`
- `application/pdf` と `image/png` のDocument AI分岐を削除
- `import { processDocument }` を削除
- PDF固有のエラーハンドリング（30ページ制限等）を削除
- 残る対応形式: DOCX, XLSX, TXT, JSON

#### `package.json`
- `@google-cloud/documentai` を依存から削除

---

## 各モデルのPDF APIフォーマット対応表

| モデル | supportsPdf | APIフォーマット |
|---|---|---|
| GPT-4.1 | true | `{ type: 'file', file: { filename, file_data } }` |
| O3 | **false** | 非対応（推論モデルのためマルチモーダル未確認） |
| GPT-5 / GPT-5-mini / GPT-5-nano / GPT-5.1 | true | `{ type: 'input_file', filename, file_data }` |
| Claude Sonnet 4.5 | true | `{ type: 'document', source: { type: 'base64', media_type, data } }` |
| Gemini 2.5 Pro / Flash | true | `{ inlineData: { mimeType, data } }` |
| Gemini 3 Pro Preview | true | `{ inlineData: { mimeType, data } }` |

---

## 運用への影響

### 1. PDFの処理方式変更
- **旧**: Document AIでテキスト抽出 → プロンプト文字列として送信（全モデル共通）
- **新**: base64エンコードしたPDFバイナリを各モデルAPIにネイティブ送信
- **メリット**: レイアウト・画像・表などの視覚的情報もモデルが認識可能に
- **リスク**: 大きなPDFファイルでbase64変換のメモリ消費が増加する可能性

### 2. O3でのPDF非対応
- O3選択時にサイドバーの対応ファイルからPDFが消える
- O3でPDF添付して送信すると「選択中のモデルはPDFのネイティブ処理に対応していません」エラー
- 検証後 `models.json` の `supportsPdf` を `true` に変更するだけで有効化可能

### 3. Document AI環境変数
- `LLM_GCP_DOCAI_PROCESSOR_NAME` が不要になった（残っていても害はない）

### 4. PNG画像のテキスト抽出
- **旧**: PNG画像もDocument AIでOCR可能だった
- **新**: PNGは従来通り画像としてネイティブ送信されるため、OCR目的のextract-textは使えなくなった
- **影響**: PNGからのテキスト抽出が必要なケースではモデルの画像認識能力に依存

---

## テスト確認項目

### PDFネイティブ処理
- [ ] GPT-4.1 + PDF添付 → モデルがPDF内容を認識して回答
- [ ] GPT-5-mini + PDF添付 → 同上
- [ ] Claude Sonnet 4.5 + PDF添付 → 同上
- [ ] Gemini 2.5 Pro + PDF添付 → 同上
- [ ] Gemini 3 Pro + PDF添付 → 同上
- [ ] O3 + PDF添付 → エラーメッセージ表示（supportsPdf: false）

### 既存機能の動作確認
- [ ] 画像添付（PNG/JPEG）が全モデルで従来通り動作
- [ ] DOCX/XLSX添付が従来通り動作（extract-text経由）
- [ ] TXT/JSON添付が従来通り動作
- [ ] 複数ファイル同時添付（画像+PDF、PDF+DOCX等）

### UI
- [ ] O3選択時にサイドバーの対応ファイルからPDFが消える
- [ ] 他モデル選択時にPDFが表示される

### ビルド
- [x] `tsc --noEmit` エラーなし（確認済み）
