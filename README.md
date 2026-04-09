# WhatsApp Automation Extension

Professional WhatsApp automation with DOM-based sending and queue management.

## 🚀 GitHub Automation (CI/CD)
This project is configured with **GitHub Actions**. Every time you push code to the `main` or `master` branch:
1. GitHub will automatically install dependencies.
2. It will build the extension using Vite.
3. It will upload a **zip artifact** containing the `dist` folder.

### How to download the automated build:
1. Go to your GitHub repository.
2. Click on the **Actions** tab.
3. Click on the latest workflow run (e.g., "Build Chrome Extension").
4. Scroll down to the **Artifacts** section.
5. Download the `whatsapp-automation-extension` zip file.
6. Unzip it and load it into Chrome via `chrome://extensions/` -> **Load unpacked**.

## 🛠️ Local Development
1. Install dependencies: `npm install`
2. Build locally: `npm run build`
3. Load the `dist` folder into Chrome.

## 📁 Project Structure
- `src/`: React dashboard code.
- `public/`: Static assets (manifest, background, content scripts).
- `dist/`: The final extension (generated after build).
