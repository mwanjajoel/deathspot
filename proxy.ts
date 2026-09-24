import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Keeps the moderator session fresh (Supabase access tokens expire hourly) and sends
 * signed-out visitors to the login page. Role checks happen server-side in each page/action.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const isLogin = request.nextUrl.pathname === "/admin/login"

  if (!data.user && !isLogin) {
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ["/admin/:path*"],
}
