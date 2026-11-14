import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

// Standard Payload logout: clears the admin session and lands on the site index.
export function GET(request: NextRequest) {
  const host = request.headers.get('host')
  const viewerOrigin = host ? `${request.nextUrl.protocol}//${host}` : undefined
  const origin = process.env.PAYLOAD_PUBLIC_SERVER_URL || viewerOrigin
  const logoutRedirect = new URL('/', origin).toString()

  // Logout is a collection endpoint, so its path uses the Admins collection slug.
  redirect(`/api/admins/logout?redirect=${encodeURIComponent(logoutRedirect)}`)
}
