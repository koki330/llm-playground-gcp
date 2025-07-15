import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // 開発環境では何もしない
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // --- ▼▼▼ デバッグログ ▼▼▼ ---
  console.log('--- [Middleware Intercept] ---');
  console.log(`Pathname: ${req.nextUrl.pathname}`);

  // 1. クライアントIPの特定 (より堅牢な方法)
  // Cloud Runでは 'x-forwarded-for' ヘッダーが最も信頼性が高い
  const xForwardedFor = req.headers.get('x-forwarded-for');
  
  // 'x-forwarded-for' は "client, proxy1, proxy2" の形式なので、最初のIPを取得
  const clientIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : null;

  console.log(`- Raw 'x-forwarded-for' header: [${xForwardedFor}]`);
  console.log(`===> Final Detected Client IP: [${clientIp}]`);

  // 2. 許可IPリストの読み込み
  const allowedIpsEnv = process.env.LLM_GCP_ALLOWED_IPS;
  console.log(`- Raw 'LLM_GCP_ALLOWED_IPS' env var: [${allowedIpsEnv}]`);

  // 3. 許可IPリストの生成
  const allowedIps = (allowedIpsEnv || '').split(',').map(ip => ip.trim()).filter(ip => ip);
  console.log(`- Parsed Allowed IP List: [${allowedIps.join(', ')}]`);

  // 4. 判定
  const isAllowed = clientIp && allowedIps.length > 0 && allowedIps.includes(clientIp);
  console.log(`===> Final Check: Is [${clientIp}] included in [${allowedIps.join(', ')}]?  >>> ${isAllowed ? 'YES (Access Granted)' : 'NO (Access Denied)'}`);
  console.log('------------------------------------');
  // --- ▲▲▲ デバッグログここまで ▲▲▲ ---

  if (isAllowed) {
    return NextResponse.next();
  }

  // アクセス拒否
  return new NextResponse('<h1>403 Forbidden</h1><p>You are not authorized to access this page.</p>', {
    status: 403,
    headers: { 'Content-Type': 'text/html' },
  });
}

// configは変更なし
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};