import { NextRequest, NextResponse } from 'next/server';
import { getSecret } from '@/lib/secrets';

// --- 設定 ---
const IP_SECRET_NAME = 'ALLOWED_IPS';

// --- キャッシュ ---
let allowedIps: string[] | null = null;

/**
 * 環境に応じて許可IPリストを取得・キャッシュする
 * - 本番環境: GCP Secret Managerから取得
 * - 開発環境: 環境変数 (.env.local) から取得
 */
async function getAllowedIps(): Promise<string[]> {
  if (allowedIps) {
    return allowedIps;
  }

  let ipString: string | null = null;

  if (process.env.NODE_ENV === 'production') {
    console.log('Fetching allowed IPs from Secret Manager...');
    ipString = await getSecret(IP_SECRET_NAME);
  } else {
    console.log('Loading allowed IPs from local environment...');
    ipString = process.env.ALLOWED_IPS;
  }

  if (!ipString) {
    console.warn('ALLOWED_IPS is not defined. Denying all access.');
    return [];
  }

  const ips = ipString.split(',').map(ip => ip.trim());
  allowedIps = ips; // キャッシュに保存
  return ips;
}

/**
 * メインのミドルウェア関数
 */
export async function middleware(request: NextRequest) {
  const ipList = await getAllowedIps();

  if (ipList.length === 0) {
    return new NextResponse('Access configuration error.', { status: 500 });
  }

  const xff = request.headers.get('x-forwarded-for');
  const clientIp = xff ? xff.split(',')[0].trim() : request.ip;

  if (!clientIp) {
    return new NextResponse('Could not determine client IP.', { status: 401 });
  }

  const isAllowed = ipList.some(ip => {
    if (ip.endsWith('.')) {
      return clientIp.startsWith(ip); // プレフィックスマッチ
    } else {
      return clientIp === ip; // 完全一致
    }
  });

  if (isAllowed) {
    return NextResponse.next();
  }

  console.log(`Forbidden access from IP: ${clientIp}`);
  return new NextResponse(`Access denied for IP: ${clientIp}`, { status: 403 });
}

/**
 * ミドルウェアが適用されるパスを指定
 */
export const config = {
  matcher: [
    /*
     * 静的ファイルとNext.js内部パスを除く、すべてのAPIとページルートに適用
     */
    '/((?!_next/static|_next/image|favicon.ico).*)/',
  ],
};