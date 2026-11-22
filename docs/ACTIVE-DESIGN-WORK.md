# HAMSAT Active Design Work

This is the persistent working pointer for HAMSAT ongoing development.

- Repository: https://github.com/ayaay4213-ops/hamsat-partner-project
- Permanent active development branch: `work/hamsat-reference-redo-2026-11-21`
- Branch URL: https://github.com/ayaay4213-ops/hamsat-partner-project/tree/work/hamsat-reference-redo-2026-11-21
- Production branch: `main` — do not modify or merge into it without the owner's explicit approval.
- Deployment target: Vercel Preview only until the owner explicitly approves a Production release.
- Rule: all future HAMSAT code/design edits continue on the active development branch above. Fetch the latest branch head and current file SHA before every edit; never overwrite newer work.
- Keep this branch as the ongoing development workspace. Do not replace it with a new branch unless the owner explicitly requests that.
- Current latest room fix: settings save now calls the shared close handler; the duplicate older close handler that reopened the owner tools menu was removed.
- Latest preview deployment: https://hamsat-preview-ewlg7xpqz-hamsat.vercel.app (READY at the time of recording; preview only).
- PWA foundation exists: manifest, service worker, app icons, and Android install prompt are present. Actual installation and offline behavior still require testing on a real Android phone.
- Do not delete existing features or rebuild the app. Verify preview build and actual UI before claiming completion.
- Treat code presence, static validation, successful deployment, and real-device acceptance as separate evidence levels.
