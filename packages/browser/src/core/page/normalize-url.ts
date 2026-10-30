export const normalizeEventUrl = (url: string): string => {
  const parsed = new URL(url, location.href)
  return parsed.origin + parsed.pathname
}
