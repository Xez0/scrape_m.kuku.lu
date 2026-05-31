# Scrape m.kuku.lu | Xez

🌐 **English:** [Read in English](README.md)

---

Aplikasi pengelola email sementara (*temporary email client*) berbasis CLI yang cepat, ringan, dan interaktif untuk layanan **m.kuku.lu**.

Project ini menggunakan arsitektur HTTP murni tanpa meluncurkan headless browser penuh (seperti Puppeteer/Chromium), menghemat memori RAM (~20MB vs ~300MB) dan ruang penyimpanan secara signifikan.

### ⚡ Fitur Utama

*   **Cepat & Hemat Kuota:** Menggunakan token caching cerdas. Mengurangi unduhan halaman `/id.php` yang berat sehingga menu berjalan instan.
*   **Dynamic Domain Detection:** Otomatis mengambil daftar domain ter-update secara langsung dari server saat aplikasi dijalankan.
*   **Auto-aligning Layout:** Menyesuaikan lebar kolom domain CLI secara otomatis berdasarkan domain terpanjang agar layout kolom sejajar rapi.
*   **Pembersihan Konten Email:** Menyaring tombol navigasi web bawaan (*Reply, Delete, Close*) serta tabel informasi duplikat di bagian atas email.
*   **OTP Highlighter:** Mendeteksi dan memberi warna **hijau tebal** pada kode verifikasi/OTP berupa angka 4-8 digit agar langsung terlihat di terminal.
*   **Auto-Retry & Self-Healing:** Secara otomatis menyegarkan token jika mendeteksi adanya kegagalan otentikasi sesi atau token kedaluwarsa.
*   **Console-Clear UX Loop:** Konsol otomatis dibersihkan di setiap siklus loop utama sehingga riwayat terminal Anda bebas dari spam pencetakan menu berulang.

### 🚀 Persyaratan Sistem

*   [Node.js](https://nodejs.org/) (Versi 16 atau lebih baru sangat disarankan)
*   Koneksi internet aktif

### 📥 Cara Instalasi

1.  Buka terminal atau Command Prompt pada direktori project `m.kuku.lu`.
2.  Pasang dependensi yang dibutuhkan dengan perintah berikut:
    ```bash
    npm install
    ```

### 🎮 Cara Menjalankan

Jalankan script utama menggunakan perintah:
```bash
node email.js
```

### ⚙️ Menu Navigasi

Saat aplikasi berjalan, Anda dapat memilih beberapa opsi menu berikut:
1.  **Generate Random Mail:** Membuat email acak baru dengan masa aktif selamanya (*Infinite Lifecycle*).
2.  **Custom Mail Address:** Membuat email dengan nama pengguna dan domain pilihan Anda dari server.
3.  **Create Temporary Mail:** Membuat alamat email sementara dengan batas waktu kedaluwarsa otomatis.
4.  **Database Safe Locker:** Melihat daftar email yang Anda miliki serta opsi menghapusnya secara lokal maupun dari server cloud.
5.  **Check Central Inbox:** Mengecek kotak masuk dan membaca email masuk dengan layout terminal terformat rapi dan highlight OTP.

---
*-Xez*
