import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

// Use default secret if not provided (for development only)
const AUTH_SECRET = process.env.AUTH_SECRET || "default-dev-secret-change-in-production";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ping endpoint for health checks
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Allow all auth routes to pass through without authentication
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // Try to get token, but don't block if it fails
  let token = null;
  try {
    token = await getToken({
      req: request,
      secret: AUTH_SECRET,
      secureCookie: !isDevelopmentEnvironment,
    });
  } catch (error) {
    // Token retrieval failed - will redirect to guest auth
    console.warn("Token retrieval failed:", error);
  }

  // If no token, redirect to guest authentication
  if (!token) {
    // Prevent redirect loops
    if (!pathname.startsWith("/api/auth/guest")) {
      const redirectUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
      );
    }
    // If already on guest route, allow it through
    return NextResponse.next();
  }

  // User is authenticated - check if they should be redirected
  const isGuest = guestRegex.test(token?.email ?? "");

  // Redirect authenticated users away from login/register pages
  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id*",
    "/api/:path*",
    "/login",
    "/register",
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
