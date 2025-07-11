# Dockerfile (最終決定版)

# -------------------------------------------------------------
# ステージ1: ビルドステージ
# -------------------------------------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

# 依存関係をインストール
COPY package*.json ./
RUN npm install --frozen-lockfile

# ソースコードをコピー
COPY . .

# Next.jsアプリケーションをビルド
RUN npm run build

# -------------------------------------------------------------
# ステージ2: 本番実行ステージ
# -------------------------------------------------------------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# ビルドステージから、必要なファイルだけをコピーする
# これにより、最終的なイメージサイズが小さく、安全になる
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# アプリケーションを起動
CMD ["npm", "start"]