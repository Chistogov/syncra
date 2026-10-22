# Syncra — Modern S3 & MinIO Desktop Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-emerald.svg)](https://github.com/Chistogov/syncra/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-indigo.svg)](https://github.com/Chistogov/syncra/releases)
[![Electron](https://img.shields.io/badge/Electron-33-cyan.svg)](https://www.electronjs.org/)

**Syncra** is a fast, elegant, and cross-platform desktop client for **MinIO**, **AWS S3**, **Ceph**, **Yandex Object Storage**, **Wasabi**, and all S3-compatible cloud storages.

Designed as an open-core desktop application with a clean Plane.so-inspired dark & light user interface.

---

## 🌟 Key Features (Community Edition)

- **Multi-Cloud S3 Profiles**: Connect to MinIO (local & remote), AWS S3, Ceph, Yandex Cloud, Wasabi, and Cloudflare R2.
- **Path-Style & Virtual-Hosted Addressing**: Native support for `s3ForcePathStyle` required for private MinIO instances.
- **Connection Diagnostics**: Instant ping and credential verification (`Test Connection`).
- **Flexible Views**: Switch effortlessly between a compact detail Table and visual Grid cards.
- **Quick Look Drawer**: Instant preview without downloading files to disk:
  - **Images**: PNG, JPG, GIF, WebP, SVG with pan and zoom.
  - **PDF Documents**: Built-in multi-page PDF reader with zoom and print support.
  - **Media**: HTML5 audio and video playback.
  - **Code & Text**: Syntax-highlighted preview for JSON, YAML, XML, SQL, TS/JS, Python, Shell, and Markdown.
- **Transfer Queue Manager**: Background transfers with speed, progress bars, and retry handling.
- **Drag & Drop**: Seamlessly drag files and folders from Windows Explorer directly into the S3 bucket.
- **S3 Object Tagging**: View, manage, batch-tag, and filter objects with boolean logic (`AND`, `OR`, `EXACT`).
- **Embedded Local Web Server**: Access and browse your files from mobile phones or tablets in your local network with secure 6-digit PIN protection.
- **Localization**: Full Russian and English language support with instant switching.
- **Dark & Light Themes**: Carefully crafted modern themes.

---

## 📊 Community vs Pro Edition

Syncra is developed under an **Open-Core** model:

| Feature | Community Edition (Open Source) | Pro Edition (Official Release) |
| :--- | :---: | :---: |
| **License** | Free Forever (MIT) | Commercial / Lifetime |
| **S3 Connection Profiles** | Up to 3 servers | **Unlimited servers** |
| **Full File & Bucket Operations** | ✅ Full access | ✅ Full access |
| **Quick Look & PDF Viewer** | ✅ Full access | ✅ Full access |
| **S3 Object Tagging & Filters** | ✅ Full access | ✅ Full access |
| **Embedded Mobile Web Server** | ✅ Full access | ✅ Full access |
| **Direct Edit-in-Place** *(Auto-sync Ctrl+S from Word/Excel/Photoshop to S3)* | ❌ *(Pro only)* | **✅ Full access** |
| **In-Storage Monaco Code Editor** *(Direct save to S3)* | View only | **✅ Full edit & save** |
| **MinIO IAM & Cluster Admin Panel** *(Users, Groups, Visual Policies)* | ❌ *(Pro only)* | **✅ Full GUI Admin** |
| **Hardware-Locked Offline Licensing** | — | **✅ 1-Click HWID Activation** |

---

## 🚀 Quick Start (Run from Source)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- `npm` or `yarn`

### 1. Clone the repository
```bash
git clone https://github.com/Chistogov/syncra.git
cd syncra
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run in Development Mode
```bash
npm run dev
```

### 4. Build & Run Desktop App
```bash
npm run build
npm start
```

---

## 📦 Download Official Pre-compiled Binaries

If you don't want to build from source, download the latest official installer for Windows, macOS, or Linux from the **[Releases](https://github.com/Chistogov/syncra/releases)** page.

Official releases include a **14-day fully-featured Pro trial** with zero feature restrictions out of the box.

---

## 🛡 Security & Privacy

- All AWS/MinIO credentials (`Access Key`, `Secret Key`) and server endpoints are stored strictly on your local machine using Electron secure stores.
- Credentials are **never** transmitted to any external telemetry or third-party servers.

---

## 📄 License

The Community Edition of Syncra is open-source software licensed under the **[MIT License](LICENSE)**.
