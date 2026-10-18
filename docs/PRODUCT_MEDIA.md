# Product specifications and photos

Backend: crm-backend migration 0021 (public Storage bucket `product-images`) plus the existing `product_specifications` and `product_images` tables. API: `src/api/productMedia.ts`.
UI: the **Specifications** and **Photos** sections at the bottom of every product page (`/catalogue/products/:id`), for Admin and Manager.

## Rules (enforced by the backend; the UI mirrors them for fast feedback)

- Photos are **public**: anyone with the address can see them, and they appear on the website once the product is published. Do not upload anything private.
- JPEG, PNG or WebP, at most 2 MB each (Storage enforces it). Files are stored as `products/<product id>/<random>.<ext>`; the random name means addresses cannot be guessed or clash.
- Only active Admin or Manager staff can upload, replace or delete. Anonymous visitors and logins without a staff profile cannot even list files.
- One main photo per product (a database unique index). The main photo is shown first on the website; the rest follow in the order set here.
- A specification is `group` / `name` / `value` / `order`. A name can appear only once per group and product. The website shows them grouped.

## Behaviour worth knowing

- Upload: the file goes to Storage first, then the photo row is created. If the row cannot be created, the file is removed again, so nothing is left behind.
- Delete: the row is removed first (the website stops showing the photo immediately), then the file. A file that cannot be deleted is left behind harmlessly; a row without a file never exists.
- Changing the main photo clears the old one first, then sets the new one (two steps; the page re-reads after any failure).
- Errors are in plain words: wrong type, over 2 MB, no permission, duplicate specification, a product that no longer exists. Zero-row changes fail visibly like everywhere else.
- Descriptions (alt text, up to 200 characters) help search engines and screen readers; the website uses them.

## Verified

Against a **real local Supabase stack with the Storage service** (migrations 0001-0021, disposable users): first photo main and later ones not, order numbers, the public URL serving the exact bytes with no login, primary switching, swapping order, descriptions,
refusal of a GIF, of a file over 2 MB (also by the server) and of a row whose product does not exist (the uploaded file is removed again), deletion of row then file with the public address then failing, and the full specification cycle including the duplicate message and a zero-row edit.
The backend suite (764 assertions) and a separate real-Storage run (16 checks: anonymous list/upload/delete refused, 2 MiB and type limits, traversal names refused, replace and delete by staff) are described in crm-backend `docs/TESTING.md`.
The browser screens ran only against the **stand-in** server in `npm run smoke` (which enforces the same limits).

## Not built

- No image cropping, resizing or automatic compression: staff must shrink photos over 2 MB themselves.
- Variant-specific photos (the table supports `variant_id`, the screens attach photos to the product only).
- Bulk upload and drag-to-reorder (use the arrow buttons).
- Image files are not covered by the database backup scripts.
