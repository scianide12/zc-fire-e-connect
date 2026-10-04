# Adjust app icon edge spacing

## Change
- Scale the green ZC FIRE E-CONNECT emblem down slightly within the existing white square canvas.
- Keep the artwork, colors, wording, background, icon dimensions, and filenames unchanged.
- Apply the safer inset consistently to the favicon, Apple touch icon, and 192 px / 512 px install icons so phone splash-screen masking does not cut the green edges.

## Verification
- Inspect every regenerated icon at full size and thumbnail size for complete green edges and even white spacing.
- Confirm the manifest still references valid icons and the app build remains clean.
- Check the installed-app splash presentation at a phone-sized viewport; existing installations may need an update or reinstall before the operating system refreshes the cached icon.
