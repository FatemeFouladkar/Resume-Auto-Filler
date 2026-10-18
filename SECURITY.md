# Security

## Reporting a vulnerability

Please report security issues privately to the repository owner instead of opening a public issue. Include reproduction steps and the affected version. Do not include real résumés, API keys, passwords, access tokens, or session data.

## Secret handling

- Never commit `.env` files, API keys, credentials, résumé files, browser profiles, or built archives containing secrets.
- Every user should configure their own restricted OpenRouter key in the extension.
- The extension stores the key and imported résumé profiles in `chrome.storage.local`.
- Jobinja and JobVision authentication remains in the website session; the extension does not collect those passwords.
