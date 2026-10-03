# VOTEWATCH 2027

Scenario-intelligence dashboard for Kenya's 2027 election: ward-level voter data, county map, turnout/transfer scenarios and an exportable executive report. (v4.6)

## Structure

```
index.html            page markup
css/styles.css        styles (incl. print styles)
js/app.js             application logic
data/wards.js         ward-level dataset  (const WD)
data/counties.js      county dataset      (const CO)
data/transport.js     transfer/road data  (const TR)
data/county-geojson.js embedded county boundaries
```

## Run

No build step. Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

Leaflet and html2canvas load from CDNs, so an internet connection is needed.

Deployed via GitHub Pages (see `.github/workflows/pages.yml`).
