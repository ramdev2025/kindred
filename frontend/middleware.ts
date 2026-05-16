import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute  = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/']);
const isLandingPage  = createRouteMatcher(['/']);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Logged-in user hits the landing page → send them straight to the dashboard
  if (userId && isLandingPage(req)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Every other non-public route requires authentication
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
