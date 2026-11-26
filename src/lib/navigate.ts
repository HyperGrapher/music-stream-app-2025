/** Full page navigation: server components (navbar, pages) must see a changed session, so no client-side routing. */
export function hardNavigate(path: string) {
  window.location.href = path;
}
