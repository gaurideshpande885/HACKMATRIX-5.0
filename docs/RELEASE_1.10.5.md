# FIN 1.10.5

FIN 1.10.5 is a corrective UI release following the v1.10.4 performance redesign.

## Fixed

- Removed `content-visibility` and paint-containment rules from interactive cards.
- Restored normal popup hide/show behavior so an invisible overlay cannot block controls.
- Removed global scale transforms from buttons and navigation items.
- Removed the experimental navigation pseudo-element.
- Restored stable button hit areas, card layout, scrolling, and sheet interaction.

## Retained safely

- Lightweight glass gradients, borders, and highlights.
- Limited blur on fixed navigation surfaces.
- Simple transform-and-opacity popup entrance animation.
- Android hardware acceleration.
- Active-view canvas drawing and frame-coalesced redraws.
- A 2× canvas density cap and reduced-motion support.

## Regression protection

The web checks now reject the unstable WebView patterns that caused the v1.10.4 UI regression.
