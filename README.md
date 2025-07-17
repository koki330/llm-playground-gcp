# LLM API Playground

複数のLLMプロバイダー（Anthropic, OpenAI, Google）のAIモデルとの対話を、統一されたインターフェースで実現する高機能なWebアプリケーションです。ファイルアップロードによるテキスト抽出や、利用料金の追跡など、実践的な機能を備えています。

## 機能概要

### 対応AIモデル

現在、以下のモデルをサポートしています。料金設定やモデルの有効/無効は設定ファイルで管理されています。

**Anthropic Claude シリーズ**
- Claude Sonnet 4

**OpenAI GPT シリーズ**
- GPT-4.1
- GPT-4.1-mini
- GPT-4.1-nano
- O3
- O4-mini

**Google Gemini シリーズ**
- Gemini 2.5 Pro
- Gemini 2.5 Flash

### 主要機能

- **マルチプロバイダー対応:**
  - 複数のLLMをUIから切り替えて利用可能。

- **ファイルアップロードとテキスト抽出:**
  - 様々な形式のファイルをアップロードし、その内容をプロンプトに含めることができます。
  - **対応ファイル:** PDF, PNG, Word (.docx), Excel (.xlsx), テキスト (.txt), JSON (.json)
  - **処理方法:**
    - **PDF, PNG:** Google Cloud Document AI を利用したOCR処理。
    - **Word, Excelなど:** アプリケーション内部のライブラリでテキストを抽出。

- **利用料金トラッキングと上限設定:**
  - モデルごとのAPI利用料金をトークン数に基づいて自動で計算し、Firestoreに記録します。
  - 特定のモデルに対して月間の利用料金上限を設定できます。（現在は `Claude Sonnet 4` と `o3` に設定されています。）
  - **UIへの警告表示:**
    - モデル選択時、利用料金が上限の8割に達している場合は警告メッセージを表示します。
    - 上限に達したモデルは、UI上で自動的に無効化され、選択できなくなります。

- **IPアドレスによるアクセス制限:**
  - 環境変数で指定されたIPアドレスからのアクセスのみを許可する、堅牢なセキュリティ機能を備えています。

## システム構成

### アーキテクチャ

- **フレームワーク:** [Next.js](https://nextjs.org/) (App Router)
- **言語:** [TypeScript](https://www.typescriptlang.org/)
- **UI:** [React](https://reactjs.org/), [Tailwind CSS](https://tailwindcss.com/)
- **状態管理 (フロントエンド):** [Vercel AI SDK (`useChat`)](https://sdk.vercel.ai/)
- **バックエンド API:** Next.js API Routes
- **クラウドサービス:**
  - **デプロイ先:** Google Cloud Run
  - **CI/CD:** Google Cloud Build
  - **コンテナレジストリ:** Google Artifact Registry
  - **ファイルストレージ:** Google Cloud Storage
  - **OCR:** Google Cloud Document AI
  - **データベース:** Google Cloud Firestore (料金追跡用)
  - **シークレット管理:** Google Secret Manager

### ディレクトリ構成の概要

```
llm-playground-gcp/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── page.tsx        # メインページのUI
│   │   └── api/            # バックエンドAPIルート
│   │       ├── chat/       # AIとの対話処理
│   │       └── extract-text/ # ファイルからのテキスト抽出処理
│   ├── components/         # Reactコンポーネント (UI部品)
│   ├── context/            # アプリケーションの状態管理 (AppContext)
│   ├── services/           # 外部サービス連携 (OpenAI, Anthropic, VertexAIなど)
│   └── config/             # アプリケーション設定 (料金など)
├── cloudbuild.yaml         # Cloud Build の設定ファイル
├── Dockerfile              # コンテナイメージの定義ファイル
└── package.json            # プロジェクト情報と依存関係
```

## セットアップとローカルでの実行

### 前提条件

- Node.js (v18.x 以上を推奨)
- Google Cloud SDK (gcloud CLI)
- Google Cloud プロジェクトと、各種APIが有効化された環境

### 環境変数

プロジェクトのルートに `.env.local` ファイルを作成し、以下の環境変数を設定します。これらの値の多くは、本番環境ではGoogle Secret Managerから注入されます。

```bash
# --- Google Cloud Settings --- 
# サービスアカウントキーのJSON文字列 (ローカル開発用)
LLM_GCP_VERTEX_AI_SERVICE_ACCOUNT_JSON='{"type": "service_account", ...}'

# 各種Google Cloudリソースの名前
LLM_GCP_GOOGLE_CLOUD_PROJECT_ID="your-gcp-project-id"
LLM_GCP_GOOGLE_CLOUD_LOCATION="your-gcp-region" #例: asia-northeast1
LLM_GCP_GCS_BUCKET_NAME="your-gcs-bucket-name"
LLM_GCP_DOCAI_PROCESSOR_NAME="projects/your-gcp-project-id/locations/us/processors/your-processor-id"

# --- API Keys --- 
LLM_GCP_ANTHROPIC_API_KEY="sk-ant-..."
LLM_GCP_OPENAI_API_KEY="sk-..."

# --- Security --- 
# 許可するIPアドレス (カンマ区切り)
LLM_GCP_ALLOWED_IPS="127.0.0.1,::1"
```

### インストールと起動

1.  **依存関係のインストール:**
    ```bash
    npm install
    ```

2.  **開発サーバーの起動:**
    ```bash
    npm run dev
    ```

アプリケーションが [http://localhost:3000](http://localhost:3000) で利用可能になります。

## デプロイ

このアプリケーションは、Google Cloud Build を使ってCloud Runにデプロイされるように構成されています。リポジトリへのプッシュをトリガーとして、`cloudbuild.yaml` に定義されたパイプラインが自動的に実行されます。

1.  **Dockerイメージのビルド:** `Dockerfile` を基に、本番用のコンテナイメージがビルドされます。
2.  **Artifact Registryへのプッシュ:** ビルドされたイメージがArtifact Registryに保存されます。
3.  **Cloud Runへのデプロイ:** 最新のイメージを使って、Cloud Runサービスが更新されます。この際、Secret Managerから本番用の環境変数が安全にサービスに渡されます。

## セキュリティ機能

### IPアドレスによるアクセス制限

Next.jsのミドルウェア (`src/middleware.ts`) を利用して、アプリケーション全体へのアクセスをIPアドレスで制限しています。

- **動作:** `LLM_GCP_ALLOWED_IPS` 環境変数に設定されたIPアドレスからのリクエストのみを許可します。
- **IPの特定:** Cloud Run環境を想定し、`x-forwarded-for` ヘッダーを正しく解釈して、クライアントのIPを特定します。
- **開発環境:** `NODE_ENV` が `development` の場合は、この制限は自動的に無効になります。