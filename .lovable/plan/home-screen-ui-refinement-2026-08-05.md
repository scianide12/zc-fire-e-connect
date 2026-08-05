# Home screen UI refinement

Visual-only pass on the main screen: calmer header, clearer warning state, and tabs that read as selected without shouting.

## 1. Header
- Drop the red header fill; header uses the app dark background with a subtle bottom border so it still reads as a bar.
- The 911 card stays solid emergency red (currently a translucent black panel inside the red bar) so it is the single brightest element on screen.
- More vertical padding around "Region 9 Emergency Contacts".

## 2. Offline banner
- New amber warning tokens in the design system (`--warning`, `--warning-foreground`).
- Banner becomes muted amber with near-black text for high contrast.

## 3. Category tabs
- Active tab keeps the same dark card background as inactive tabs.
- Active tab gets a bright red 1px border plus red icon and label; inactive tabs keep muted text and a transparent border (so nothing shifts when switching).

## 4. Spacing
- Larger bottom margin under the "Call nearest station" and "Call by selection" section headers.

## 5. Buttons and icons
- "Try next nearest" border lightened to a more visible neutral stroke.
- Phone icons in the call buttons use the same stroke weight as the 911 card icon (explicit `strokeWidth` on both so they match at their different sizes).

## Technical notes
- Files: `src/styles.css` (add warning tokens + `@theme inline` mapping), `src/routes/index.tsx` (header, banner, tabs, spacing, icon props).
- No changes to data loading, geolocation, offline caching, or phone-number logic.
