# Scrape m.kuku.lu | Xez

🌐 **Bahasa Indonesia:** [Baca dalam Bahasa Indonesia](README.id.md)

---

A fast, lightweight, and interactive terminal-based temporary email manager for **m.kuku.lu**.

This project uses a pure HTTP-based architecture instead of running a heavy headless browser (like Puppeteer/Chromium), saving a significant amount of RAM (~20MB vs ~300MB) and disk space.

### ⚡ Key Features

*   **Fast & Bandwidth-Efficient:** Employs smart CSRF token caching. Avoids fetching the heavy index page repeatedly, making command transitions instant.
*   **Dynamic Domain Detection:** Scrapes active domain options in real-time directly from the server when starting up.
*   **Auto-aligning Layout:** Dynamically adjusts CLI layout padding based on the longest domain name to keep columns perfectly aligned.
*   **Clean Email Body Content:** Filters out duplicate headers and browser-only navigation buttons (*Reply, Delete, Close*).
*   **OTP Code Highlighting:** Detects and colors 4-to-8-digit verification/OTP codes in **bold green** for instant readability.
*   **Auto-Retry & Self-Healing:** Seamlessly refreshes credentials and retries operations if a session expires.
*   **Console-Clear UX Loop:** Provides a clean console layout dashboard that prevents command history scroll spam.

### 🚀 Prerequisites

*   [Node.js](https://nodejs.org/) (Version 16 or newer recommended)
*   An active internet connection

### 📥 Installation

1.  Open your terminal in the project directory (`m.kuku.lu`).
2.  Install the required dependencies:
    ```bash
    npm install
    ```

### 🎮 Usage

Run the main CLI interface:
```bash
node email.js
```

### ⚙️ Command Control Panel

Once running, you can access the following menu options:
1.  **Generate Random Mail:** Instantly create a random email with no expiration date (*Infinite Lifecycle*).
2.  **Custom Mail Address:** Create an email address with a custom handle and a domain of your choice.
3.  **Create Temporary Mail:** Generate a time-restricted email with an automatic expiration.
4.  **Database Safe Locker:** View your active email registry and purge records from both the local db and the cloud.
5.  **Check Central Inbox:** Pull recent inbox logs and read emails with formatted clean styling and OTP highlights.

---
*-Xez*
