# Resume Auto Filler

A Chrome extension that imports a PDF, DOCX, or TXT résumé, extracts structured data with an LLM, lets the user review it, and fills JobVision and Jobinja.

## What it does

- Activates only on `jobvision.ir` and `jobinja.ir` pages.
- Preserves the original Persian or English résumé and generates the corresponding English and Persian versions without translating technical terms.
- Stores multiple reviewed profiles in Chrome local storage.
- Lets the user edit personal details, summary, skills, languages, certifications, work history, and education.
- Syncs JobVision's English and Persian basic details, about section, work history, education, skills, and languages through the logged-in page API.
- Syncs the complete Jobinja résumé in one operation using the logged-in page's own API.

### Jobinja workflow

Open `https://jobinja.ir/app/cv-builder`, open the extension, review the extracted profile, and click **Fill or sync this résumé page**. Sections are saved concurrently, so this is much faster and less fragile than Selenium or modal-by-modal automation.

Existing work and education entries with the same title/company or field/institution are updated. Missing entries are created. Existing unmatched entries are not deleted. Gregorian dates are converted to Jobinja's Jalali date fields, and the user can choose the English or Persian version. Jobinja currently has no dedicated certificate section, so certificates remain unchanged and the extension reports a warning.

## Develop

### Configure the OpenRouter API key

Each user must supply their own OpenRouter API key:

1. Create a key in the OpenRouter dashboard and give it an appropriate spending limit.
2. Open the extension side panel.
3. Enter the key in **OpenRouter API key** and click **Save key**.

The key is stored in `chrome.storage.local` for that Chrome profile. It is never included in the source code or production bundle. Removing the extension normally removes its local storage as well.

```bash
npm install
npm test
npm run build
```

The production extension is written to `dist/`.

## Load in Chrome

1. Build with `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the `dist` folder.
5. After each rebuild, reload the extension and refresh the résumé-builder tab.

## Current limitations

- Image-only/scanned PDFs require OCR and are not supported yet.
- JobVision skills and certificates remain unchanged until their category-specific mappings are implemented.
- Unusual layouts can need corrections in the review panel.
- Jobinja can change its private web API; failures are reported per section so successful sections are not hidden.

## Privacy

Imported profiles and the user's OpenRouter key are stored in `chrome.storage.local`. Résumé text is sent to OpenRouter for extraction; the key is sent only as OpenRouter authorization. During Jobinja sync, only supported fields are passed to its page; raw source text, email, and portfolio links are excluded. The extension never stores Jobinja or JobVision credentials and uses the session already open in the browser.
