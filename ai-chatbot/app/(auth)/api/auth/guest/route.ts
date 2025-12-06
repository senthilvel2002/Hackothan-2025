import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

// Use default secret if not provided (for development only)
const AUTH_SECRET = process.env.AUTH_SECRET || "default-dev-secret-change-in-production";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const redirectUrl = searchParams.get("redirectUrl") || "/";

    // Check if user already has a token
    let token = null;
    try {
      token = await getToken({
        req: request,
        secret: AUTH_SECRET,
        secureCookie: !isDevelopmentEnvironment,
      });
    } catch (error) {
      // Token check failed, continue with guest sign-in
      console.warn("Token check failed:", error);
    }

    // If already authenticated, redirect to intended URL
    if (token) {
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    // Sign in as guest
    // NextAuth v5 signIn with redirect: true returns a Response
    const result = await signIn("guest", { 
      redirect: true,
      redirectTo: redirectUrl 
    });

    // signIn should return a Response when redirect is true
    if (result instanceof Response) {
      return result;
    }

    // Fallback: redirect manually
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (error) {
    console.error("Guest authentication error:", error);
    // On error, try to redirect to home
    try {
      return NextResponse.redirect(new URL("/", request.url));
    } catch {
      // If redirect fails completely, return a simple HTML response
      return new NextResponse(
        '<html><body><h1>Authentication Error</h1><p>Please refresh the page.</p><script>setTimeout(() => window.location.href = "/", 2000);</script></body></html>',
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }
      );
    }
  }
}
