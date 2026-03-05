<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy Menu Planner

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Menu Sync (via Auth Service)

1. Deploy the `GOD-Auth-Service` with `MENU_SCRIPT_URL` and `OPENROUTER_API_KEY` configured (optional `MENU_SCRIPT_TOKEN`).
2. Set `VITE_MENU_API_URL` in this app (for local dev, example: `http://127.0.0.1:8080/menu`).
3. (Optional) Set `VITE_MENU_GENERATE_API_URL` to explicitly point to Auth Service `/generate`.
4. Clicking **Generate Menu** now calls Auth Service `/generate` (or `/api/generate`) so OpenRouter key stays server-side.
5. Clicking the sync icon in the menu header POSTs menu data to Auth Service `/menu`.
6. Auth Service forwards that payload to Apps Script and appends the posted payload into `menu_cache.json`.
7. `menu_cache.json` keeps only the latest 6 menu posts (oldest entry is removed when a 7th post is added).
8. Apps Script can still archive old sheet menus in Drive as `.json` files (no Drive-side 6-file limit).
