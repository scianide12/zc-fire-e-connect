# ZC FIRE E-CONNECT

Build a mobile-friendly web app called "Region 9 Emergency Contacts" for Zamboanga City fire sub-stations, Region IX, Philippines. This app will be accessed via QR code scan on mobile phones, so it must load fast and work well as an installable Progressive Web App (PWA).

Data source: Fetch station data from a published Google Sheets CSV URL: https://docs.google.com/spreadsheets/d/1Q1GpKgj83QsossDgxmbyoCyC8N9F8tGcK1_LhfcObII/edit?usp=sharing On app load, fetch this CSV, parse it, and cache it in a Supabase table (station_name, phone_number, latitude, longitude, category, municipality) so the app works even if the fetch fails, and refresh this cache periodically (e.g. every time the app is opened, or every few hours).

Geocoding: If a station's latitude/longitude is missing from the sheet, automatically geocode it using the free OpenStreetMap Nominatim API (https://nominatim.openstreetmap.org/search?q={station_name},Zamboanga City,Philippines&format=json), and cache the result in Supabase so it isn't re-geocoded every time.

Core features:

Location permission handling: On first load, request the user's device location. If denied, show a friendly prompt explaining it's needed to find the nearest station, with a retry option, and still allow full manual use without it.

Homepage with a prominent emergency banner showing the national emergency hotline (911).

Option 1 — Call Nearest Station: Calculate distance from the user's location to all stations using stored lat/long, show the nearest station's name with a large "Call" button (tel: link), and provide a "Try Next Nearest" button to move down the sorted list if needed.

Option 2 — Call by Selection: A searchable dropdown of all stations (alphabetical) with a "Call" button once selected.

Category tabs (Fire Stations / Police / Barangay) even though only Fire has data now — future-proofing for your planned expansion. Data model should support a category field per contact.

Clean, high-contrast design optimized for fast use under stress: large tap targets, big readable text, minimal steps to complete a call.

Installable/bookmarkable as a PWA with a simple icon and app name.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://zc-fire-e-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/77bcc2d6-ebc5-4174-8ebf-0254aaf1abd7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
