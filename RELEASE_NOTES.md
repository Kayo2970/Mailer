# Mailer v0.1.1 — Desktop Release

**Mailer** is a fast, private, local-first email dispatcher and mail merge desktop application. Designed to draft, personalize, and dispatch emails directly from your own computer through your existing mail provider (Gmail, Outlook, Yahoo, AWS SES, or custom SMTP).

> **100% Private & Local:** Your email passwords, recipient lists, message content, and dispatch history remain strictly on your computer and are never uploaded to any cloud server.

---

## 📥 Downloads by Operating System

Choose the plug-and-play download for your operating system:

| Platform | Format | File | How to Run |
| :--- | :--- | :--- | :--- |
| **Windows** | **Installer (`.exe`)** | `Mailer-0.1.1-Windows-Setup.exe` | Double-click to install with desktop & start menu shortcuts. |
| **Windows** | **Portable (`.exe`)** | `Mailer-0.1.1-Windows-Portable.exe` | Standalone plug & play executable. No installation required. |
| **Windows** | **Portable (`.zip`)** | `Mailer-0.1.1-Windows.zip` | Extract and double-click `Mailer.exe`. |
| **macOS** | **Apple Disk Image** | `Mailer-0.1.1-macOS-arm64.dmg`<br>`Mailer-0.1.1-macOS-x64.dmg` | Open `.dmg` and drag Mailer into your `Applications` folder. |
| **macOS** | **Portable Archive** | `Mailer-0.1.1-macOS.zip` | Extract and double-click `Mailer.app`. |
| **Linux** | **AppImage** | `Mailer-0.1.1-Linux.AppImage` | Universal plug & play Linux binary (`chmod +x` and run). |
| **Linux** | **Debian / Ubuntu** | `Mailer-0.1.1-Linux.deb` | Install via `sudo dpkg -i Mailer*.deb`. |
| **Linux** | **Tarball** | `Mailer-0.1.1-Linux.tar.gz` | Extract and run `./mailer`. |

---

## ✨ Key Features

- **Split 2-Pane Email Composer:**
  - **Left Pane (Drafting):** Gmail/Outlook-style envelope headers (`From`, `To`, `Subject`), quick address chips, raw CSV/table bulk editor, and mode switcher (Rich Text, Plain Text, Raw HTML).
  - **Right Pane (Live Preview):** Live rendered HTML and plain-text fallback previews, desktop vs. 375px mobile viewport toggle, and per-recipient mail-merge viewer.
- **Rich Text WYSIWYG Editor:**
  - Headings, bold, italic, underline, strikethrough, inline code, color palettes (including Gold and Bronze), alignment (left, center, right, justify), blockquotes, lists, links, dividers, and inline embedded image placement.
- **Excel & Spreadsheet Data Editor:**
  - Built-in grid table to view and edit recipient columns. Paste tabular data directly from Microsoft Excel, Google Sheets, or CSV files. Every extra column automatically becomes an expandable `{{placeholder}}`.
- **Intelligent Dispatch & Queue Manager:**
  - Background dispatch queue with configurable throttle/rate limits and safety cancel window (e.g. 5 minutes delay to review or cancel batches before they send).
- **Universal SMTP Provider Support:**
  - Pre-configured 1-click profiles for Gmail, Outlook / Office 365, Yahoo Mail, and custom SMTP servers (with TLS/STARTTLS support and instant connection testing).
- **Themes & Visual Polish:**
  - Built-in Light Mode, Dark Mode, and System theme synchronizer with rich gold metallic gradients and interactive WebGL background fibers.
- **Zero-Terminal Plug & Play:**
  - Bundles the full Node.js runtime and application server inside the native desktop wrapper. Launch directly from your application menu or desktop.

---

## 🔒 Security & Data Storage

- Settings, credentials, uploaded letterhead logos, and queue databases are stored locally in your operating system's standard application data directory:
  - **Windows:** `%APPDATA%\Mailer\data`
  - **macOS:** `~/Library/Application Support/Mailer/data`
  - **Linux:** `~/.config/mailer/data`
- Passwords are encrypted on disk with owner-only access permissions.

---

*Created and developed by **Kayomarz Pavri**.*
