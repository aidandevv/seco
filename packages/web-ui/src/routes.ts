export function sessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/session\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]!) : null;
}
