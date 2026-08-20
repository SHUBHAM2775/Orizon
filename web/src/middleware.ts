import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRoleRedirect, type DbUserRole } from "@/lib/auth-utils";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/" || pathname === "/login";

  // Public files / assets are ignored by the matcher below, but just in case
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return supabaseResponse;
  }

  // Not authenticated
  if (!user) {
    if (!isAuthRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // If authenticated, fetch their role
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email)
    .single();

  const role = (userData?.role as DbUserRole) || null;

  if (isAuthRoute) {
    if (role) {
      return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }
    return supabaseResponse;
  }

  // Enforce role access limits
  if (role) {
    const isAnalyst = role === "ANALYST";
    const isL1 = role === "L1_APPROVER";
    const isL2 = role === "L2_APPROVER";
    const isAdmin = role === "ADMIN";

    // Analyst restricted to applications and activity
    if (isAnalyst && !pathname.startsWith("/applications") && !pathname.startsWith("/activity")) {
      return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }

    // L1 restricted to exceptions and activity
    if (isL1 && !pathname.startsWith("/exceptions") && !pathname.startsWith("/activity")) {
      return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }

    // L2 restricted to exceptions and activity
    if (isL2 && !pathname.startsWith("/exceptions") && !pathname.startsWith("/activity")) {
      return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }

    // Admin restricted to admin routes
    if (isAdmin && !pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL(getRoleRedirect(role), request.url));
    }
  } else {
    // Authenticated but no user record in our DB? Force logout/redirect.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
