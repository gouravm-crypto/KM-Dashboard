# CaratLane Kano Model dashboard

Stores search by name, code or email and see their monthly Kano Model report:
score, CCL score, points deducted, every PPT / Video call / CCTV observation,
and a comparison with the previous month.

## Publish on GitHub Pages
1. Create a repository and upload everything in this folder (keep the folder structure).
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Direct links work too, so you can send each store its own page:
- Store overview: `.../#/s/CFMYSNXM`
- A specific month: `.../#/s/CFMYSNXM/2026-10`
- An audit: `.../#/s/CFMYSNXM/2026-10/vc` (`ppt`, `vc` or `cctv`)

## Adding a new month
1. Create a folder in `source/` named `YYYY-MM` (e.g. `source/2026-11`).
2. Add two CSV files with the same headers as the existing months:
   - `summary.csv`: one row per store (score, CCL score, points deducted, VC link, CCTV details, date sent).
   - `observations.csv`: one row per observation, same columns as the email table plus `Store Code`.
3. Run `pip install pandas openpyxl` once, then `python tools/build_data.py` from the repo root.
4. Commit the updated `data/` folder. The new month appears in the month menu automatically
   and becomes the default; the previous month is used for comparison.

The script warns if a store code isn't in `store_details.xlsx`, or if the observation
points don't add up to the summary's "Points Deducted".

To update the store list, replace `source/store_details.xlsx` and run the script again.

## Files
- `index.html`, `assets/` — the site (styles, logic, logos).
- `data/` — generated files the site reads. Don't edit by hand.
- `source/` — your inputs. `tools/build_data.py` turns them into `data/`.
- To change the "Raise a concern" form link, edit `CONCERN_FORM` at the top of `assets/app.js`.
