import { useEffect } from 'react';

export const SITE_TITLE = 'MahaGuru AI | Career clarity and personalised learning for students';

const ROUTE_TITLES: [RegExp, string][] = [
  [/^\/reflect(\/|$)/, 'StudentGPT'],
  [/^\/learn\/new\/?$/, 'New classroom'],
  [/^\/learn\/[^/]+\/lesson\//, 'Lesson'],
  [/^\/learn(\/|$)/, 'Classroom'],
  [/^\/dashboard\/?$/, 'Dashboard'],
  [/^\/login\/?$/, 'Log in'],
  [/^\/signup\/?$/, 'Sign up'],
  [/^\/account\/?$/, 'Account'],
  [/^\/safety\/?$/, 'Safety and support'],
  [/^\/privacy\/?$/, 'Privacy'],
  [/^\/research\/?$/, 'Research'],
  [/^\/about\/?$/, 'About'],
];

/** The browser tab title for a path, so tabs and history entries are distinguishable. */
export function titleForPath(pathname: string): string {
  if (pathname === '/') return SITE_TITLE;
  const match = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  return `${match ? match[1] : 'Page not found'} · MahaGuru AI`;
}

/** Lets a page with its own name (a classroom, a lesson) replace the generic title once loaded. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · MahaGuru AI`;
  }, [title]);
}
