export function viewForPath(pathname = "/") {
  const path = normalizePath(pathname);
  if (path === "/") return "home";
  if (path === "/app" || path.startsWith("/app/")) return "console";
  return "console";
}

export function consolePath() {
  return "/app";
}

function normalizePath(pathname) {
  const value = String(pathname || "/").trim();
  if (!value) return "/";
  const pathOnly = value.split(/[?#]/)[0] || "/";
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) return pathOnly.slice(0, -1);
  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}
