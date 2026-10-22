# Brand images

All PNGs have a transparent background (cut from the artwork on white / black: the alpha comes from the distance to the background, the colour is un-premultiplied so glows stay soft).

- `logo-light.png` / `logo-dark.png` — full logo (imagotipo) for the light / dark theme: login screen and GitHub README.
- `emblem-light.png` / `emblem-dark.png` — emblem only (isotipo) shown in the header.
- `../favicon-light.png` / `../favicon-dark.png` — tab icons, picked by the browser's colour scheme.
- `../apple-touch-icon.png` — home-screen icon (iOS ignores transparency, so it sits on the dark surface).

Nautix falls back to a built-in vector mark when a file is missing.
