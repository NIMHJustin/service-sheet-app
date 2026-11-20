# VetEquip Service Sheet

Offline-first tablet app for anesthesia machine certifications and vaporizer efficacy tests.
Replaces Service_Sheet_V6.2.xlsm.

- Records, drafts and photos are stored on the tablet (IndexedDB) and survive closing the app.
- When online and signed in, the outbox uploads each record to the Service Records SharePoint site:
  the one-page PDF certificate and attachments to the Service Certificates library
  (`<year>/<facility>/`), a row in Service Records, and one row per part in Parts Used.
- Uploads run in resumable steps, so an interrupted upload never creates duplicates.

## Updating

Every push to `main` is tested, built and published to
https://mango-bay-030880f10.6.azurestaticapps.net by the GitHub Actions workflow.
Installed tablets pick up the new version the next time the app opens online and show an "Update now" banner.

## Where things live

| What | File |
| --- | --- |
| Tenant, app and SharePoint IDs | `src/config.js` |
| Technicians and dropdown suggestions | `src/data/lists.js` |
| Price list (2025) | `src/data/parts.json` |
| Form sections and fields | `src/data/forms.js` |
| Tolerance, pass/fail, tracking numbers | `src/lib/calc.js` |
| SharePoint column mapping | `src/lib/fields.js` |
| Upload steps | `src/lib/upload.js` |
| PDF certificate | `src/lib/pdf.js` |

Images are stored as base64 text in `assets/` and decoded into `public/` before each build.

## Local development

```
npm install
npm test          # logic and upload tests
npm run dev       # local server
node tests/render-samples.mjs /tmp/certs   # sample certificates for checking by eye
```
