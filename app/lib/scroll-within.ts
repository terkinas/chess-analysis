// Keeps a highlighted move visible inside its own scrolling list without ever
// moving the page. `element.scrollIntoView()` scrolls every scrollable
// ancestor, the window included, so on a phone (where the move list sits below
// the board) each move used to drag the whole page down.

/**
 * How far to scroll a container (positive = down) so that a child lies inside
 * its visible area; 0 when it already does. Edges are viewport coordinates.
 */
export function scrollDeltaToReveal(
  containerTop: number,
  containerBottom: number,
  childTop: number,
  childBottom: number,
): number {
  if (childTop < containerTop) return childTop - containerTop;
  if (childBottom > containerBottom) return childBottom - containerBottom;
  return 0;
}

/** Scrolls `container` (and only it) just enough to show `child`. */
export function revealInContainer(
  container: HTMLElement,
  child: HTMLElement,
): void {
  const c = container.getBoundingClientRect();
  const e = child.getBoundingClientRect();
  container.scrollTop += scrollDeltaToReveal(c.top, c.bottom, e.top, e.bottom);
}
