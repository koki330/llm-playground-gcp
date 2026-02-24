/**
 * APIプロバイダーから返されるエラーを、一般ユーザー向けの日本語メッセージに変換する。
 * アプリ内の利用上限（monthlyLimitsUSD）とは別の、プロバイダー側の制限やエラーを対象とする。
 */
export function formatApiError(error: unknown): string {
  const raw = extractRawMessage(error);
  const status = extractStatusCode(error);

  // --- プロバイダー側の使用量・レート制限 ---
  if (
    status === 429 ||
    /usage.?limit|rate.?limit|quota.?exceed|resource.?exhaust|too many requests/i.test(raw)
  ) {
    return 'APIプロバイダー側の利用制限に達しています。しばらく時間をおいてから再度お試しください。解消しない場合は管理者にご連絡ください。';
  }

  if (/reached your specified API usage limits/i.test(raw)) {
    return 'APIプロバイダー側の月間利用上限に達しています。管理者にご連絡ください。';
  }

  if (/insufficient.?quota|billing|payment/i.test(raw)) {
    return 'APIプロバイダー側の課金設定に問題があります。管理者にご連絡ください。';
  }

  // --- 認証エラー ---
  if (status === 401 || status === 403 || /auth|permission|forbidden|api.?key/i.test(raw)) {
    return 'APIの認証に失敗しました。管理者にご連絡ください。';
  }

  // --- コンテンツポリシー ---
  if (/content.?policy|safety|blocked|harmful|moderation/i.test(raw)) {
    return 'コンテンツポリシーにより、リクエストが拒否されました。入力内容を変更して再度お試しください。';
  }

  // --- モデル関連 ---
  if (/model.*not found|model.*not available|does not exist/i.test(raw)) {
    return '指定されたモデルが現在利用できません。管理者にご連絡ください。';
  }

  // --- 入力サイズ超過 ---
  if (/too long|too large|max.*token|context.?length|payload/i.test(raw)) {
    return '入力が長すぎます。メッセージやファイルのサイズを減らして再度お試しください。';
  }

  // --- サーバーエラー ---
  if (status === 500 || status === 502 || status === 503 || /server.?error|service.?unavailable|internal.?error/i.test(raw)) {
    return 'AIサービスが一時的に利用できません。しばらく時間をおいてから再度お試しください。';
  }

  if (status === 504 || /timeout|deadline/i.test(raw)) {
    return 'リクエストがタイムアウトしました。入力を短くするか、しばらく時間をおいてから再度お試しください。';
  }

  // --- フォールバック ---
  return 'エラーが発生しました。しばらく時間をおいてから再度お試しください。解消しない場合は管理者にご連絡ください。';
}

function extractRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function extractStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status;
  }
  return null;
}
