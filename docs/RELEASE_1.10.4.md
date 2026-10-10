# FIN 1.10.4

FIN 1.10.4 introduces a performance-focused glass interface for smoother Android WebView interaction.

## Rendering performance

- Removes expensive backdrop blur from every scrolling card.
- Keeps real glass blur on fixed navigation and modal sheets only.
- Temporarily disables fixed-surface blur while the user is actively scrolling.
- Uses `content-visibility` and paint containment for off-screen cards.
- Draws canvases only for the active view and coalesces redraws with `requestAnimationFrame`.
- Caps canvas density at 2× to control GPU memory and raster cost on high-density devices.
- Enables Android hardware acceleration and binds the WebView renderer while visible.

## Motion and interaction

- Adds spring-like popup entrance and exit transitions using only transform and opacity.
- Adds animated navigation state, button press feedback, view transitions, toast motion, and progress-bar easing.
- Adds smooth internal scrolling, hidden scrollbars, and overscroll containment.
- Honors the operating system reduced-motion preference.

## Verification

- Embedded JavaScript syntax and performance safeguards are checked automatically.
- API, forecasting, planning, learning, statement import, and release checks remain enabled.
