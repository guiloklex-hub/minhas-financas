import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const secretKey = process.env.JWT_SECRET || "minhas_financas_dev_secret_key_123!";
const key = new TextEncoder().encode(secretKey);

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Valida a assinatura do token
    await jwtVerify(sessionCookie, key);
    return NextResponse.next();
  } catch (error) {
    // Se for inválido, expirado ou forjado, redireciona para login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// Configura o middleware para proteger todas as rotas
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
