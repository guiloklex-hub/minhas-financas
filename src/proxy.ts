import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { JWT_SECRET_KEY } from '@/lib/jwt-secret'

export async function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Valida a assinatura do token
    await jwtVerify(sessionCookie, JWT_SECRET_KEY);
    return NextResponse.next();
  } catch {
    // Se for inválido, expirado ou forjado, redireciona para login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// Configura o proxy (antigo middleware) para proteger todas as rotas
// EXCLUINDO: /login, /registro, api (se público), estáticos do next, imagens
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - login
     * - registro
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|login|registro).*)',
  ],
}
