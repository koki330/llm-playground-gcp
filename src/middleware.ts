import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // In development, skip the IP check entirely
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Get the allowed IPs from environment variables.
  // Fallback to an empty array if the variable is not set.
  const allowedIps = (process.env.LLM_GCP_ALLOWED_IPS || '').split(',').map(ip => ip.trim());

  // Get the request's IP address.
  // We read the 'x-forwarded-for' header, which is the standard for identifying
  // the originating IP address of a client connecting through a proxy server.
  const forwardedFor = req.headers.get('x-forwarded-for');
  // The header can contain a comma-separated list of IPs. The first one is the client's.
  const requestIp = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined;

  // If the IP is not available or not in the allowed list, deny access.
  if (!requestIp || !allowedIps.includes(requestIp)) {
    console.warn(`Forbidden: IP address ${requestIp} is not in the allowed list.`);
    // Return a simple HTML response for forbidden access.
    return new NextResponse('<h1>403 Forbidden</h1><p>You are not authorized to access this page.</p>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // If the IP is in the allowed list, proceed with the request.
  return NextResponse.next();
}

// Configure the middleware to run on all paths except for specific ones.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes, which have their own logic)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     *
     * This prevents the middleware from interfering with static assets and API calls.
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
