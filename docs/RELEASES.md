# Mailer Desktop Release Guide (Windows, macOS, Linux)

Mailer packages as a standalone native desktop app using **Electron** and **Next.js Standalone**. Users do not need Node.js or any command line to install or run the app.

---

## Output Formats by Operating System

| Operating System | Output Files | Description |
| :--- | :--- | :--- |
| **Windows** | `dist-electron/Mailer Setup 0.1.0.exe`<br>`dist-electron/Mailer 0.1.0.exe` | Standard NSIS Windows installer + portable `.exe` (runs directly without installation). |
| **macOS** | `dist-electron/Mailer-0.1.0.dmg`<br>`dist-electron/Mailer-0.1.0-mac.zip` | Apple Disk Image (`.dmg`) and zip archive with universal support (Intel `x64` & Apple Silicon `arm64`). |
| **Linux** | `dist-electron/Mailer-0.1.0.AppImage`<br>`dist-electron/mailer_0.1.0_amd64.deb` | Self-contained `.AppImage` (runs on Ubuntu, Fedora, Debian, Arch, etc.) + `.deb` Debian/Ubuntu package. |

---

## 1. Automated GitHub Releases (Recommended)

A GitHub Actions workflow is configured in `.github/workflows/release.yml`.

### Creating a release automatically:
Whenever you push a git tag starting with `v` (e.g. `v0.1.0`):
```bash
git tag v0.1.0
git push origin v0.1.0
```
GitHub Actions will automatically launch runners for `windows-latest`, `macos-latest`, and `ubuntu-latest`, compile the standalone bundle, build the desktop binaries for all 3 operating systems, and publish them directly to your repository's **GitHub Releases** page.

### Manual trigger:
Go to your GitHub repository -> **Actions** -> **Build and Release Desktop Apps** -> **Run workflow**.

---

## 2. Building Locally

### Windows
```bash
npm run electron:build:win
```
The installer (`.exe`) and portable binary will be generated in `dist-electron/`.

### macOS (on a Mac)
```bash
npm run electron:build:mac
```
Generates `.dmg` and `.zip` in `dist-electron/`.

### Linux (on Linux or WSL)
```bash
npm run electron:build:linux
```
Generates `.AppImage` and `.deb` in `dist-electron/`.

---

## Data Persistence & Storage

In the desktop app, user settings, SMTP credentials, uploaded images, and email queue logs are automatically stored in the standard OS application data folder:
- **Windows:** `%APPDATA%\Mailer\data`
- **macOS:** `~/Library/Application Support/Mailer/data`
- **Linux:** `~/.config/mailer/data`

Data persists across app updates and uninstalls.
