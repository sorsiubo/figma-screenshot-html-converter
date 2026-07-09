# Figma Screenshot to Clean HTML Converter

A static, browser-based app for converting Figma screenshots into clean HTML using OCR.

## Features

- Drag-and-drop or button-based upload for PNG, JPG, and PDF files
- Interactive screenshot preview
- Drag-to-select a bounding box before conversion
- Tag whitelist controls for `h2`, `h3`, `h4`, `p`, `ul`, and `li`
- Styled heading output:
  - `<h2 class="subheading-large font-indigo">`
  - `<h3 class="subheading-medium">`
  - `<h4 class="subheading-small">`
- Optional `<br/>` insertion after each generated element
- Syntax-highlighted clean HTML output
- Copy-to-clipboard action with confirmation

## How It Works

The app runs fully in the browser. It loads OCR and PDF rendering libraries from CDNs:

- Tesseract.js for OCR
- PDF.js for rendering the first page of uploaded PDFs

No server backend is required.

## GitHub Pages Setup

1. Upload these files to the root of your GitHub repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `LICENSE`
   - `.gitignore`
2. In GitHub, open the repository settings.
3. Go to **Pages**.
4. Set source to **Deploy from a branch**.
5. Choose branch `main` and folder `/root`.
6. Save.

Your site should become available at:

```text
https://sorsiubo.github.io/figma-screenshot-html-converter/
```

## Local Preview

From this folder, run:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```

## License

MIT
