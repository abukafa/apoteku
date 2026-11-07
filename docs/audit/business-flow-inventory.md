# Inventaris Alur Bisnis dan Cakupan Audit

## 1. Ringkasan sistem

**Apoteku** adalah monorepo aplikasi manajemen apotek multi-cabang (*Point of Sale* / POS & *Enterprise Resource Planning* / ERP Farmasi) yang dibangun menggunakan **Bun** dan **Turborepo** (`package.json`, `turbo.json`), terdiri atas empat workspace:
1. **Aplikasi Client/Web (`apps/web` — `@apoteku/web`)**: Progressive Web App (PWA) berbasis **SvelteKit 2 + Svelte 5 (Runes) + Tailwind CSS + Vite**, di-deploy menggunakan `@sveltejs/adapter-vercel` (`apps/web/svelte.config.js:1-18`). Rute sensitif client-only (`/pos` dan `/login`) menonaktifkan SSR (`ssr = false` di `apps/web/src/routes/pos/+page.ts:1` dan `apps/web/src/routes/login/+page.ts:1`).
2. **Server Backend/API (`apps/backend` — `@apoteku/backend`)**: REST API berbasis **Bun + Elysia.js + TypeBox + Swagger** (`apps/backend/src/index.ts:1-91`) yang berjalan di port default `3001`, melayani 36 endpoint HTTP di bawah `/health`, `/api/*`, dan penyajian berkas statis `/uploads/*`.
3. **Pustaka Domain Inti (`packages/core` — `@apoteku/core`)**: Fungsi murni kalkulasi keranjang POS (`packages/core/src/calculations/totals.ts:16-59`), pemilihan batch FEFO (*First-Expired, First-Out*) (`packages/core/src/fefo/selection.ts:24-51`), dan pembangun byte struk termal ESC/POS (`packages/core/src/hardware/escpos.ts:15-52`).
4. **Lapisan Penyimpanan Data (`packages/db` — `@apoteku/db`)**:
   - **Database Server (PostgreSQL + Drizzle ORM)**: 25 tabel relasional yang didefinisikan pada `packages/db/src/schema/{auth,products,inventory,procurement,sales}.ts` dan diakses melalui singleton `db` / `queryClient` (`packages/db/src/client.ts:10-16`).
   - **Penyimpanan Lokal Browser (IndexedDB + Dexie.js & `localStorage`)**: Database lokal `ApotekuLocalDB` versi 3 dengan 5 tabel (`products`, `branchStocks`, `batchStocks`, `pendingSales`, `staffAuth`) di `packages/db/src/client-indexeddb.ts:71-90`, ditambah 3 kunci `localStorage` (`apoteku_session_user`, `apoteku_session_token`, `apoteku_saved_accounts`).
   - **Penyimpanan Berkas Lokal**: Direktori `<repo-root>/uploads/{prescriptions,invoices,general}` yang ditulis dengan `Bun.write` (`apps/backend/src/modules/media/media.routes.ts:24-42`).
   - **Proses ETL / Migrasi Data Legacy**: Tiga skrip CLI (`migrate-master-data.ts`, `migrate-purchases.ts`, `migrate-sales.ts` di `packages/db/src/scripts/`) untuk mengimpor CSV hasil ekstraksi database Firebird warisan `GAMPANGAPOTEKZ.FDB` (`legacy_database/*.csv`).

**Layanan Eksternal & Proses Latar:**
- **Integrasi Eksternal**: Hanya Google OAuth 2.0 (`https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/tokeninfo`, `https://www.googleapis.com/oauth2/v3/userinfo`) pada `apps/backend/src/modules/auth/auth.routes.ts:328-643` dan `apps/web/src/routes/login/+page.svelte:344`. Pembayaran QRIS pada POS bersifat simulasi timer client-side tanpa integrasi payment gateway eksternal (`apps/web/src/routes/pos/+page.svelte:75-96`).
- **Proses Latar & Mode Offline**: `NetworkState` (`apps/web/src/lib/stores/networkStore.svelte.ts:15-37`) memantau event browser `online`/`offline` dan menjalankan `setInterval` setiap 30 detik untuk menyinkronkan antrean penjualan offline (`localDb.pendingSales`) ke `POST /api/pos/sync-sales`. Tidak ada background worker/cron job di sisi server.

**Batasan Pemahaman & Area yang Tidak Dapat Diverifikasi dari Kode Saja:**
- Kondisi data aktual di dalam instance PostgreSQL produksi/lokal (apakah hasil migrasi CSV `GAMPANGAPOTEKZ.FDB` sudah dijalankan penuh atau sebagian) tidak diperiksa dengan query mutasi; verifikasi didasarkan pada skema Drizzle, file migrasi SQL (`packages/db/drizzle/0000_absurd_johnny_storm.sql`), dan skrip ETL.
- Kebijakan *Row-Level Security* (RLS) PostgreSQL yang disebutkan di `dokumen_plan.md` tidak ditemukan sama sekali pada file migrasi SQL maupun kode koneksi backend.
- Perangkat keras fisik printer termal ESC/POS / laci kasir RJ11 tidak terhubung ke Web Serial/WebUSB API karena pemanggilan `EscPosBuilder` belum diimplementasikan di komponen UI mana pun.

---

## 2. Peta komponen

| Lapisan | Komponen | Tanggung jawab | Bukti kode |
|---|---|---|---|
| **UI Layout & Navigasi** | `+layout.svelte`, `Navbar.svelte`, `Sidebar.svelte`, `Footer.svelte`, `portal.ts` | Kerangka aplikasi, deteksi rute standalone (`/login`, `/register`, `/pos`), pembatasan menu role `GUEST`, jam real-time, menu profil/logout, portal modal. | `apps/web/src/routes/+layout.svelte:1-54`, `apps/web/src/lib/components/Navbar.svelte:1-337`, `apps/web/src/lib/components/Sidebar.svelte:1-249`, `apps/web/src/lib/actions/portal.ts:1-31` |
| **UI Komponen Dashboard & Shared** | `HeroBanner`, `KpiCards`, `SalesChart`, `LowStockTable`, `RecentTransactionsTable`, `NotificationsCard`, `QuickMenuGrid`, `ui/{Badge,DataTable,MetricCard,Modal,PageHeader,SearchableSelect,Select}` | Komponen visual dashboard dan komponen tabel/input/modal generik di seluruh halaman. | `apps/web/src/lib/components/*.svelte`, `apps/web/src/lib/components/ui/*.svelte` |
| **UI Halaman Operasional & Backoffice** | 13 rute halaman SvelteKit (`/`, `/login`, `/register`, `/pos`, `/stok`, `/pelanggan`, `/supplier`, `/pelayanan`, `/pembelian`, `/pengiriman`, `/penjualan`, `/retur`, `/keuangan`, `/laporan`, `/pengaturan`) | Antarmuka pengguna untuk kasir POS, stok/opname, pelayanan resep/PIO, pengadaan PBF/SP/konsinyasi, mutasi cabang, retur, buku kas/shift, laporan/SIPNAP, dan pengaturan. | `apps/web/src/routes/**/+page.svelte` |
| **Client State & Stores** | `AuthStore` (`authStore.svelte.ts`), `NetworkState` (`networkStore.svelte.ts`) | Manajemen sesi login/PIN/Google di `localStorage`, auto-fallback sesi, deteksi jaringan online/offline, simulasi offline, antrean `localDb.pendingSales`, dan sinkronisasi periodik 30 detik. | `apps/web/src/lib/stores/authStore.svelte.ts:1-319`, `apps/web/src/lib/stores/networkStore.svelte.ts:1-188` |
| **Client API & Adapter Layer** | `apiFetch` & `api` (`api.ts`), `MockApiService` (`mock-api.ts`) | Pembungkus HTTP `fetch` ke backend (`api.ts`) dan lapisan in-memory cache/fallback (`mock-api.ts`) yang menjembatani bootstrap POS, shift, pencarian obat, dan checkout kasir. | `apps/web/src/lib/services/api.ts:1-354`, `apps/web/src/lib/services/mock-api.ts:1-534` |
| **Domain Core Library** | `calculateCartTotals`, `selectFefoBatches`, `EscPosBuilder` (`@apoteku/core`) | Perhitungan subtotal/diskon/PPN/pembulatan/kembalian, alokasi batch FEFO, dan builder byte ESC/POS. | `packages/core/src/calculations/totals.ts:1-59`, `packages/core/src/fefo/selection.ts:1-51`, `packages/core/src/hardware/escpos.ts:1-52` |
| **API Server & Context Derivation** | `app` (`apps/backend/src/index.ts`), `tenantMiddleware` (`tenant.ts`) | Server HTTP Elysia, CORS, Swagger (`/swagger`), static file `/uploads`, healthcheck `/health`. Catatan: `tenant.ts` tidak pernah di-mount (dead code); tiap route memakai `.derive()` lokal. | `apps/backend/src/index.ts:1-91`, `apps/backend/src/middleware/tenant.ts:1-30` |
| **Backend Modules (Routes & Services)** | `authRoutes`, `posRoutes`/`PosService`, `shiftRoutes`/`ShiftService`, `prescriptionRoutes`/`PrescriptionService`, `erpRoutes`, `transferRoutes`/`TransferService`, `returnsRoutes`/`ReturnsService`, `financeRoutes`/`FinanceService`, `reportsRoutes`, `mediaRoutes` | Handler endpoint REST, validasi skema TypeBox, logika bisnis, pembentukan nomor dokumen, dan eksekusi query Drizzle/in-memory. | `apps/backend/src/modules/**/*.{routes,service,schema}.ts` |
| **Database Server (PostgreSQL)** | `db`, `queryClient`, `schema` (`@apoteku/db`) | Koneksi pool `postgres` (max 10) dan definisi 25 tabel Drizzle ORM beserta migrasi SQL. | `packages/db/src/client.ts:1-24`, `packages/db/src/schema/*.ts`, `packages/db/drizzle/0000_absurd_johnny_storm.sql` |
| **Penyimpanan Browser & File** | `ApotekuDexieDB` (`localDb`), `localStorage`, Direktori `uploads/` | Tabel IndexedDB (`products`, `branchStocks`, `batchStocks`, `pendingSales`, `staffAuth`), sesi browser, dan penyimpanan fisik foto resep/faktur. | `packages/db/src/client-indexeddb.ts:71-90`, `apps/backend/src/modules/media/media.routes.ts:6-42` |
| **CLI / ETL Migration Scripts** | `migrate-master-data.ts`, `migrate-purchases.ts`, `migrate-sales.ts` | Impor CSV legacy (`CABANG`, `LOKASI`, `RAK`, `SUPPLIER`, `PELANGGAN`, `DESKRIPSIBARANG`, `BARANG`, `STOKAKHIR`, `PEMBELIAN`, `DETAILPEMBELIAN`, `PENJUALAN`, `DETAILPENJUALAN`) ke PostgreSQL. | `packages/db/src/scripts/migrate-master-data.ts:1-578`, `packages/db/src/scripts/migrate-purchases.ts:1-217`, `packages/db/src/scripts/migrate-sales.ts:1-265` |

---

## 3. Urutan alur bisnis

Urutan alur bisnis disusun mengikuti siklus operasional nyata di dalam kode:
- **Kelompok A (Identitas, Akses, Konteks Cabang & Konfigurasi):** `BF-001` s/d `BF-006`
- **Kelompok B (Inisialisasi Data, Bootstrap POS & Master Data):** `BF-007` s/d `BF-010`
- **Kelompok C (Operasional Shift Kasir, Transaksi POS, Sinkronisasi Offline & Pelayanan Resep):** `BF-011` s/d `BF-016`
- **Kelompok D (Pengadaan PBF, Hutang Dagang & Konsinyasi):** `BF-017` s/d `BF-020`
- **Kelompok E (Persediaan, Mutasi Antar Cabang, Retur & Penyesuaian/Opname):** `BF-021` s/d `BF-024`
- **Kelompok F (Keuangan, Buku Kas, Pelaporan, Analitik & Administrasi):** `BF-025` s/d `BF-028`

---

### BF-001 — Inisialisasi Sesi Otomatis, Guard Layout, dan Pergantian Konteks Cabang
- **Posisi dalam urutan bisnis:** 1 (Fondasi identitas & konteks sebelum halaman mana pun diakses).
- **Tujuan dan aktor/role:** Memuat sesi pengguna dari penyimpanan browser saat aplikasi dibuka, membatasi navigasi untuk role `GUEST`, dan memungkinkan `SUPERADMIN`/`OWNER` mengganti konteks cabang aktif.
- **Pemicu dan prasyarat:** Pengguna membuka rute mana pun di `apps/web` atau memilih cabang pada dropdown header (`/pos`, `/stok`, `/pelayanan`, `/pembelian`, `/pengiriman`, `/retur`, `/keuangan`, `/laporan`).
- **Status implementasi:** **Sebagian** (berjalan di client, namun mengandung auto-login `DEFAULT_SUPERADMIN`, tanpa route guard untuk sesi kosong, dan tanpa pengiriman header konteks ke sebagian besar API).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Browser memuat aplikasi (`+layout.svelte`) atau pengguna mengubah nilai dropdown cabang.
  2. **State dan validasi di client:** Konstruktor `AuthStore` (`authStore.svelte.ts:55-81`) membaca `localStorage.getItem("apoteku_session_user")` dan `localStorage.getItem("apoteku_session_token")`. Jika `apoteku_session_user` kosong atau gagal di-parse, konstruktor **otomatis menginisialisasi sesi sebagai `DEFAULT_SUPERADMIN`** (`id: "usr-superadmin"`, `role: "SUPERADMIN"`, `branchId: "1"`, `pin: "123456"`, `permissions: ["*"]`) dan menyimpannya ke `localStorage` (`authStore.svelte.ts:69-77`). Di SSR (`!browser`), `this.user` juga disetel ke `DEFAULT_SUPERADMIN` (`L79`).
  3. **Client/service/API:** Saat ` +layout.svelte` dirender, `$effect` (`apps/web/src/routes/+layout.svelte:20-31`) memeriksa apakah `authStore.user?.role === "GUEST"`. Jika ya dan path bukan `/login`, `/register`, atau `/pengaturan`, pengguna diarahkan ke `goto("/pengaturan?tab=profil")`.
  4. **Handler dan validasi server:** Tidak ada pemanggilan validasi token sesi ke backend saat inisialisasi layout.
  5. **Business logic/perhitungan/aturan status:** Saat `authStore.switchBranch(branchId, branchName)` dipanggil (`authStore.svelte.ts:282-292`), objek `this.user` diperbarui di memori dan ditulis ulang ke `localStorage["apoteku_session_user"]`.
  6. **Database:** Membaca dan menulis `localStorage["apoteku_session_user"]` dan `localStorage["apoteku_session_token"]`.
  7. **Respons dan efek ke UI:** `Sidebar.svelte` (`L184-194`) menyembunyikan menu operasional jika `role === "GUEST"`, atau menampilkan seluruh 13 menu untuk role selain `GUEST` (tanpa memfilter menu per permission role seperti `CASHIER`, `FINANCE`, `INVENTORY`).
  8. **Efek samping/integrasi:** Saat pengguna menekan tombol **Keluar (Logout)** di `Navbar.svelte:107-110, 317-318`, `authStore.clearSession()` menghapus kunci `localStorage` dan mengarahkan ke `/login`.
- **Jalur alternatif dan kegagalan:**
  - **Sesi kosong (`user === null`) setelah Logout:** Karena `+layout.svelte:20-31` hanya memeriksa `authStore.user?.role === "GUEST"`, jika pengguna yang sudah logout mengetik URL `/pos` atau `/keuangan` (atau menekan tombol Back tanpa me-refresh halaman penuh), tidak ada redirect ke `/login`. Jika pengguna me-refresh halaman penuh (`F5`), konstruktor `AuthStore` justru otomatis meloginkan kembali pengguna sebagai `DEFAULT_SUPERADMIN` (`authStore.svelte.ts:69-74`).
  - **Kunci layar terminal POS (`isTerminalLocked`):** Di `apps/web/src/routes/pos/+page.svelte:163-197`, tombol gembok membuka modal PIN, namun fungsi `verifyPin()` (`L187-197`) menggunakan kondisi `if (pinInput === "123456" || pinInput.length === 6)`, sehingga **kombinasi 6 digit angka apa pun selalu membuka kunci layar**.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan proteksi rute untuk `authStore.user === null` di `+layout.svelte:20-31`.
  - Auto-seeding `DEFAULT_SUPERADMIN` di `authStore.svelte.ts:32-45, 69-80`.
  - Bypass verifikasi PIN kunci layar kasir di `apps/web/src/routes/pos/+page.svelte:187`.
  - Ketiadaan pengiriman header `Authorization`, `x-tenant-id`, dan `x-user-id` di `apps/web/src/lib/services/api.ts:15-43`.
- **Bukti kode:** `apps/web/src/lib/stores/authStore.svelte.ts:29-99, 282-316`, `apps/web/src/routes/+layout.svelte:13-31`, `apps/web/src/lib/components/Sidebar.svelte:184-237`, `apps/web/src/lib/components/Navbar.svelte:107-110`, `apps/web/src/routes/pos/+page.svelte:163-197`.
- **Kesenjangan/pertanyaan terbuka:**
  - `dokumen_plan.md` Bagian 7.1 & 9 mensyaratkan JWT Access Token (15 menit) + `HttpOnly` Refresh Token Cookie + silent refresh `/api/auth/refresh`, namun fitur tersebut belum ada di kode.

---

### BF-002 — Login Staf via PIN (Online & Offline) dan Login Cepat Akun Tersimpan
- **Posisi dalam urutan bisnis:** 2 (Autentikasi staf operasional kasir/apoteker/admin).
- **Tujuan dan aktor/role:** Mengautentikasi staf menggunakan kombinasi akun (username/email) dan 6 digit PIN baik saat online maupun offline, atau memilih kartu akun yang pernah login di perangkat tersebut.
- **Pemicu dan prasyarat:** Pengguna membuka `/login`, memilih tab **PIN Kasir**, memilih akun dan cabang, lalu memasukkan 6 digit PIN (atau mengklik kartu akun tersimpan pada tab **Google**).
- **Status implementasi:** **Berjalan** (tersambung ke `POST /api/auth/login` dan fallback lokal, namun memiliki celah bypass autentikasi serius).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Saat `/login` dimuat (`apps/web/src/routes/login/+page.svelte:306-333`), `onMount` memanggil `api.users.list()`, `api.branches.list()`, dan `api.auth.getGoogleConfig()`, serta memuat `localStorage["apoteku_saved_accounts"]` (`L125-135`). Pengguna memilih akun di dropdown (`L761-779`), memilih cabang (`L677-686`), dan mengetik 6 digit PIN lewat numpad layar (`L722-753`) atau keyboard fisik (`handleWindowKeydown`, `L240-257`). Saat digit ke-6 masuk, `appendPin` otomatis memanggil `handlePinLogin()` setelah 120ms (`L444-449`).
  2. **State dan validasi di client:** `handlePinLogin` (`L358-438`) memvalidasi `inputPin.length < 4` (`L360-363`). Menentukan `identifier = currentAcc.username || currentAcc.email || currentAcc.id`.
  3. **Client/service/API:** Jika online (`!isOffline`), memanggil `authStore.loginWithApi(identifier, inputPin, selectedBranchId)` (`authStore.svelte.ts:102-137`) yang memanggil `api.auth.login({ identifier, pin })` -> `POST /api/auth/login` (`api.ts:115-120`).
  4. **Handler dan validasi server:** `POST /api/auth/login` (`apps/backend/src/modules/auth/auth.routes.ts:7-107`) memvalidasi body `{ identifier: t.String(), pin: t.String() }`.
  5. **Business logic/perhitungan/aturan status:**
     - Mencari pengguna di tabel `users` (LEFT JOIN `branches`) dengan kondisi `LOWER(username) = identifier OR LOWER(email) = identifier` (`auth.routes.ts:20-45`).
     - Memeriksa `user.isActive` (`L51-54`) dan mencocokkan `if (user.pin && user.pin !== pin)` (`L56-59` — **catatan**: jika kolom `user.pin` bernilai `null` atau string kosong di DB, pengecekan ini dilewati dan PIN apa pun diterima!).
     - Memetakan `role` ke daftar `permissions` statis (`L61-76`) dan membuat string token semu `demo-token-${user.id}-${Date.now()}`.
  6. **Database:** Server membaca tabel `users` dan `branches` (`auth.routes.ts:20-45`). Client menyimpan sesi ke `localStorage["apoteku_session_user"]`, `localStorage["apoteku_session_token"]`, dan memperbarui `localStorage["apoteku_saved_accounts"]` (`login/+page.svelte:137-165`). (Catatan: tabel IndexedDB `localDb.staffAuth` yang didefinisikan di `packages/db/src/client-indexeddb.ts:62-69, 86` **tidak pernah dibaca atau ditulis** oleh kode login).
  7. **Respons dan efek ke UI:** Mengarahkan pengguna (`redirectAfterLogin`, `login/+page.svelte:208-216`): role `GUEST` ke `/pengaturan?tab=profil`, role `CASHIER` ke `/pos`, dan role lain ke `/`.
  8. **Efek samping/integrasi:** Menyimpan profil akun beserta PIN (`acc.pin`) ke `localStorage["apoteku_saved_accounts"]`.
- **Jalur alternatif dan kegagalan:**
  - **Klik Kartu Akun Tersimpan saat Online (`handleAccountCardClick` -> `handleSelectSavedAccount`, `login/+page.svelte:167-238`):** Jika perangkat sedang online (`!isOffline`), mengklik kartu akun tersimpan pada tab Google **langsung meloginkan pengguna tanpa meminta PIN dan tanpa memvalidasi token ke backend** (`L167-225`).
  - **Fallback saat `POST /api/auth/login` mengembalikan HTTP 401 (`authStore.svelte.ts:130-136`):** Karena `apiFetch` melempar `Error` untuk semua status non-2xx (termasuk 401 PIN salah), blok `catch` di `authStore.loginWithApi` menangkap error tersebut dan memanggil `this.loginWithCredentials(identifier, pin, branchId)` -> `this.loginWithPin(pin, branchId)` (`L233-280`). Di `loginWithPin`, jika PIN yang diketik cocok dengan salah satu PIN default pada `rolePinMap` (`123456`, `888888`, `112233`, `654321`, `777777`, `999999`), pengguna **tetap berhasil login secara lokal** meskipun backend menolak PIN tersebut!
  - **Login saat Offline (`isOffline === true`, `login/+page.svelte:390-414`):** Membandingkan `inputPin` dengan `currentAcc.pin || rolePinMap[targetRole] || "123456"`. Karena `GET /api/users` (`auth.routes.ts:830`) mengirimkan plaintext `pin` seluruh user ke frontend saat halaman dimuat, pencocokan dilakukan di memori browser.
- **Data dan aturan bisnis yang harus diaudit:**
  - Kebocoran plaintext `pin` semua user pada respons `GET /api/users` (`auth.routes.ts:830`).
  - Kondisi `if (user.pin && user.pin !== pin)` di `auth.routes.ts:56` ketika `user.pin` bernilai `null`.
  - Fallback `catch` pada `authStore.loginWithApi` (`authStore.svelte.ts:130-136`) yang menerima PIN default `rolePinMap` saat API mengembalikan 401.
  - Bypass autentikasi 1-klik pada `handleSelectSavedAccount` (`login/+page.svelte:167-225`).
- **Bukti kode:** `apps/web/src/routes/login/+page.svelte:59-266, 358-455`, `apps/web/src/lib/stores/authStore.svelte.ts:102-137, 233-280`, `apps/backend/src/modules/auth/auth.routes.ts:7-107, 795-843`.
- **Kesenjangan/pertanyaan terbuka:**
  - Tabel IndexedDB `localDb.staffAuth` (`pinHash`, `passwordHash`) di `packages/db/src/client-indexeddb.ts:62-69` sama sekali belum dipakai; penyimpanan akun offline saat ini menggunakan `localStorage["apoteku_saved_accounts"]` dalam bentuk JSON plaintext.

---

### BF-003 — Login dan Registrasi Otomatis via Google OAuth 2.0
- **Posisi dalam urutan bisnis:** 3 (Autentikasi SSO & onboarding pengguna baru).
- **Tujuan dan aktor/role:** Mengautentikasi pengguna melalui akun Google; jika email/username belum terdaftar di database, otomatis membuat akun baru (`SUPERADMIN` jika pengguna pertama di sistem, atau `GUEST` jika sudah ada pengguna lain).
- **Pemicu dan prasyarat:** Pengguna mengklik tombol **Lanjutkan dengan Akun Google** di `/login` (`apps/web/src/routes/login/+page.svelte:629-646`).
- **Status implementasi:** **Berjalan** (alur redirect OAuth 2.0 ke `/api/auth/google/callback` maupun endpoint `POST /api/auth/google` terimplementasi).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Pengguna mengklik tombol Google (`handleGoogleButtonClick`, `login/+page.svelte:335-356`).
  2. **State dan validasi di client:** Mengambil `googleClientId` (dari hasil `GET /api/auth/google/config` atau fallback hardcoded `<GOOGLE_CLIENT_ID>` di `L52-55`) dan mengarahkan browser ke `https://accounts.google.com/o/oauth2/v2/auth` dengan `redirect_uri = "http://localhost:5173/api/auth/google/callback"` (`L343`).
  3. **Client/service/API:** Google mengarahkan browser kembali ke `GET /api/auth/google/callback?code=...` (yang di-proxy oleh Vite ke `http://localhost:3001/api/auth/google/callback`).
  4. **Handler dan validasi server:** Handler `GET /api/auth/google/callback` (`apps/backend/src/modules/auth/auth.routes.ts:564-792`) memeriksa `query.error` dan `query.code`, menukar `code` ke `https://oauth2.googleapis.com/token` menggunakan `clientId` dan `clientSecret` (dengan fallback secret hardcoded di `L585-587`), lalu mengambil profil dari `https://www.googleapis.com/oauth2/v3/userinfo` (`L622-643`).
  5. **Business logic/perhitungan/aturan status:**
     - Mencari `users` berdasarkan `LOWER(email) = googleEmail OR LOWER(username) = emailPrefix` (`L659-684`).
     - Jika ditemukan: memeriksa `isActive` (`L687-689`), memperbarui `avatarUrl` jika berubah (`L692-701`).
     - Jika belum ditemukan: menghitung total baris di `users` (`L708-711`). Jika `totalUsers === 0`, memberi role `"SUPERADMIN"`, selain itu `"GUEST"` (`L712`), dengan PIN default `"123456"` (`L714`) dan `branchId` cabang pertama (`L704-706`).
  6. **Database:** Membaca `tenants`, `branches`, `users`; melakukan `INSERT INTO users` (pengguna baru) atau `UPDATE users SET avatar_url` (pengguna lama) (`auth.routes.ts:648-751`).
  7. **Respons dan efek ke UI:** Server mengembalikan HTTP 302 Redirect ke `${frontendUrl}/login?google_success=true&token=${sessionToken}&user_data=${encodeURIComponent(JSON.stringify(userData))}` (`L779-782`). Di `/login`, `onMount` (`login/+page.svelte:273-304`) membaca query param `google_success`, memanggil `authStore.setUserSession(...)`, menyimpan akun ke `apoteku_saved_accounts`, menghapus query URL dengan `window.history.replaceState`, dan memanggil `redirectAfterLogin(userObj.role)`.
  8. **Efek samping/integrasi:** Pemanggilan HTTP eksternal ke Google OAuth API.
- **Jalur alternatif dan kegagalan:**
  - **Jalur `POST /api/auth/google` (`auth.routes.ts:309-561`):** Mendukung pengiriman `accessToken` atau `idToken`/`credential` secara langsung via POST (`authStore.loginWithGoogle` di `authStore.svelte.ts:186-230`), namun UI `/login` saat ini menggunakan alur redirect `GET /api/auth/google/callback`.
  - **Kegagalan OAuth / Pembatalan:** Jika Google mengembalikan `error` atau penukaran token gagal, server me-redirect ke `/login?google_error=...` (`auth.routes.ts:575, 617, 788`), yang ditampilkan oleh `/login` sebagai pesan `errorMessage` (`login/+page.svelte:269-272`).
- **Data dan aturan bisnis yang harus diaudit:**
  - Hardcoded Google Client Secret di `apps/backend/src/modules/auth/auth.routes.ts:587`.
  - Hardcoded `redirectUri = "http://localhost:5173/api/auth/google/callback"` di `apps/web/src/routes/login/+page.svelte:343` (akan gagal di domain produksi kecuali diubah).
  - Pengiriman objek `user_data` (termasuk `pin`) di dalam URL query string pada redirect `GET /api/auth/google/callback` (`auth.routes.ts:775-782`).
  - Tidak adanya validasi klaim `aud` (Client ID) saat memverifikasi `idToken` melalui `tokeninfo` di `POST /api/auth/google` (`auth.routes.ts:352-377`).
- **Bukti kode:** `apps/web/src/routes/login/+page.svelte:52-55, 268-304, 335-356`, `apps/web/src/lib/stores/authStore.svelte.ts:186-230`, `apps/backend/src/modules/auth/auth.routes.ts:280-792`.
- **Kesenjangan/pertanyaan terbuka:**
  - Rute `/register` (`apps/web/src/routes/register/+page.svelte:1-34`) hanya halaman redirect otomatis ke `/login` setelah 1 detik; endpoint `POST /api/auth/register` (`auth.routes.ts:138-277`) dan `GET /api/auth/status` (`auth.routes.ts:110-135`) serta metode `authStore.register()` (`authStore.svelte.ts:140-183`) tersedia di kode tetapi **tidak dipanggil oleh halaman UI mana pun**.

---

### BF-004 — Pembaruan Profil Pribadi dan PIN Saya (Termasuk Onboarding Role `GUEST`)
- **Posisi dalam urutan bisnis:** 4 (Manajemen identitas mandiri pasca-login).
- **Tujuan dan aktor/role:** Memungkinkan pengguna yang sedang login (terutama pengguna baru berstatus `GUEST` yang terkunci di tab profil, maupun staf aktif) untuk mengubah nama lengkap, email, nomor telepon, dan PIN 4–6 digit mereka.
- **Pemicu dan prasyarat:** Pengguna membuka `/pengaturan?tab=profil` dan menekan tombol **Simpan Profil & PIN Saya** (`apps/web/src/routes/pengaturan/+page.svelte:629-637`).
- **Status implementasi:** **Berjalan** (tersambung penuh ke `PUT /api/users/:id`).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Pengguna mengisi form `#my-fullname`, `#my-email`, `#my-phone`, `#my-pin`, `#my-pin-confirm` (`pengaturan/+page.svelte:526-615`) dan menekan tombol simpan (`handleSaveMyProfile`, `L64-113`).
  2. **State dan validasi di client:** Memvalidasi `myProfileForm.fullName.trim()` tidak kosong (`L66-69`), panjang PIN antara 4 s/d 6 karakter (`L72-75`), dan `myProfileForm.pin === myProfileForm.confirmPin` (`L76-79`).
  3. **Client/service/API:** Memanggil `api.users.update(authStore.user.id, updatePayload)` -> `PUT /api/users/:id` (`apps/web/src/lib/services/api.ts:161-166`).
  4. **Handler dan validasi server:** Handler `PUT /api/users/:id` (`apps/backend/src/modules/auth/auth.routes.ts:898-948`) memvalidasi `params.id` dan body opsional `{ role, branchId, fullName, email, phone, pin, isActive }`.
  5. **Business logic/perhitungan/aturan status:** Menyusun objek kolom yang berubah (`updateData`) dan mengeksekusi `UPDATE users SET ... WHERE id = :id`.
  6. **Database:** Mengubah baris pada tabel `users` (`auth.routes.ts:914-918`).
  7. **Respons dan efek ke UI:** Jika sukses, frontend memperbarui sesi di `authStore.setUserSession(...)` (`pengaturan/+page.svelte:93-102`) dan memanggil ulang `loadSettingsData()` (`GET /api/branches` & `GET /api/users`).
  8. **Efek samping/integrasi:** Memperbarui `localStorage["apoteku_session_user"]`.
- **Jalur alternatif dan kegagalan:**
  - **Jika `authStore.user.id` adalah ID sintetis lokal (mis. `"usr-superadmin"` atau `"usr-local-..."` dari `DEFAULT_SUPERADMIN` / login PIN offline):** Query `UPDATE users WHERE id = 'usr-superadmin'` di PostgreSQL akan gagal karena kolom `users.id` bertipe `uuid` (melempar error sintaks UUID dengan status HTTP 500), yang ditampilkan di `myProfileError` (`pengaturan/+page.svelte:109`).
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan otorisasi pada `PUT /api/users/:id` (`auth.routes.ts:898-948`): pengguna mana pun (termasuk `GUEST`) dapat mengirim field `role: "SUPERADMIN"` pada body request ke endpoint tersebut untuk menaikkan hak aksesnya sendiri.
  - Kegagalan update profil ketika sesi aktif berasal dari `DEFAULT_SUPERADMIN` (`id: "usr-superadmin"`, bukan UUID valid).
- **Bukti kode:** `apps/web/src/routes/pengaturan/+page.svelte:38-113, 402-642`, `apps/web/src/lib/services/api.ts:161-166`, `apps/backend/src/modules/auth/auth.routes.ts:898-948`.
- **Kesenjangan/pertanyaan terbuka:** Tidak ada mekanisme bagi pengguna `GUEST` untuk mengajukan permintaan aktivasi role selain menghubungi admin secara manual di luar aplikasi.

---

### BF-005 — Manajemen Staf, Role, Penugasan Cabang, dan Reset PIN oleh Admin
- **Posisi dalam urutan bisnis:** 5 (Administrasi hak akses pengguna & penugasan cabang).
- **Tujuan dan aktor/role:** Menambah akun staf baru, mengubah role (`SUPERADMIN`, `OWNER`, `PHARMACIST`, `CASHIER`, `INVENTORY`, `FINANCE`, `GUEST`), memindahkan cabang tugas staf, mengubah PIN staf, atau menghapus akun staf. Aktor yang dituju: `SUPERADMIN` / `OWNER`.
- **Pemicu dan prasyarat:** Pengguna membuka `/pengaturan` tab **Staf, Akun & PIN Kasir** (`activeTab === "pengguna"`, `apps/web/src/routes/pengaturan/+page.svelte:743-867`).
- **Status implementasi:** **Berjalan** (CRUD penuh ke `/api/users` di PostgreSQL).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Tambah pengguna: klik **+ Tambah Pengguna** (`openAddUserModal`, `L173-178`), isi modal (`L1072-1195`), klik **Simpan Pengguna Baru** (`handleCreateUserSubmit`, `L199-241`).
     - Ubah role di baris tabel: ubah `<select>` role (`handleUpdateUserRole`, `L132-143`).
     - Ubah cabang di baris tabel: ubah `<select>` cabang (`handleUpdateUserBranch`, `L145-157`).
     - Ubah PIN staf: klik tombol **Ubah PIN** (`openChangePinModal`, `L124-130`), isi modal (`L1010-1069`), klik **Simpan PIN** (`handleSaveNewPin`, `L180-197`).
     - Hapus staf: klik tombol hapus (`handleDeleteUser`, `L159-171`).
  2. **State dan validasi di client:**
     - Pada tambah staf: memvalidasi `username`, `fullName`, dan `pin.length >= 4` (`L201-210`).
     - Pada ubah PIN: memvalidasi `newPinValue.trim().length >= 4` (`L182-185`).
     - Pada hapus staf: mencegah penghapusan akun yang sedang dipakai login (`if (userId === authStore.user?.id)`, `L160-163`) dan meminta `confirm(...)` (`L164`).
  3. **Client/service/API:** Memanggil `api.users.list()` (`GET /api/users`), `api.users.create()` (`POST /api/users`), `api.users.update()` (`PUT /api/users/:id`), dan `api.users.delete()` (`DELETE /api/users/:id`) (`apps/web/src/lib/services/api.ts:152-171`).
  4. **Handler dan validasi server:** Di `apps/backend/src/modules/auth/auth.routes.ts`:
     - `GET /api/users` (`L795-843`)
     - `POST /api/users` (`L846-895`)
     - `PUT /api/users/:id` (`L898-948`)
     - `DELETE /api/users/:id` (`L951-981`)
  5. **Business logic/perhitungan/aturan status:** `POST /api/users` mengambil `tenant` pertama dari tabel `tenants` (`L852`), menyimpan PIN secara plaintext di kolom `users.pin` (default `"123456"`), dan mengaktifkan user (`isActive: true`).
  6. **Database:** Membaca `tenants`, `branches`, `users`; melakukan `INSERT`, `UPDATE`, dan `DELETE` pada tabel `users`.
  7. **Respons dan efek ke UI:** Memperbarui state `users` di halaman `/pengaturan` dan menampilkan banner `saveSuccess`.
  8. **Efek samping/integrasi:** Jika staf yang diubah adalah pengguna yang sedang login di sesi browser saat ini, `authStore.setUserSession` ikut diperbarui (`pengaturan/+page.svelte:139-141, 152-154, 192-194`).
- **Jalur alternatif dan kegagalan:**
  - Jika `username` duplikat dalam tenant yang sama pada `POST /api/users`, constraint unik PostgreSQL `uq_user_tenant_username` (`packages/db/src/schema/auth.ts:65`) akan melempar error yang ditangkap dan dikembalikan sebagai HTTP 500 (`auth.routes.ts:873-876`).
- **Data dan aturan bisnis yang harus diaudit:**
  - Tidak ada pemeriksaan role/autentikasi di backend maupun di UI `/pengaturan` untuk tab `pengguna`: role `CASHIER`, `PHARMACIST`, `INVENTORY`, atau `FINANCE` dapat membuka `/pengaturan`, melihat PIN seluruh staf, mengubah role, atau menghapus user.
  - Tidak ada filter `tenant_id` pada `GET /api/users`, `PUT /api/users/:id`, dan `DELETE /api/users/:id` (`auth.routes.ts:799, 917, 956`).
- **Bukti kode:** `apps/web/src/routes/pengaturan/+page.svelte:124-241, 743-867, 1010-1195`, `apps/web/src/lib/services/api.ts:152-171`, `apps/backend/src/modules/auth/auth.routes.ts:795-981`, `packages/db/src/schema/auth.ts:44-68`.
- **Kesenjangan/pertanyaan terbuka:** Kolom `users.passwordHash` tidak diisi pada `POST /api/users` (`auth.routes.ts:855-866`), berbeda dengan `POST /api/auth/register` (`L197`).

---

### BF-006 — Konfigurasi Profil Cabang, Perangkat Keras Printer, dan Diagnostik Penyimpanan Offline
- **Posisi dalam urutan bisnis:** 6 (Konfigurasi cabang & perangkat operasional).
- **Tujuan dan aktor/role:** Mengubah identitas cabang (nama, alamat, telepon, header/footer struk, SIA, SIPA, APA), mengatur parameter printer termal ESC/POS, dan memantau/menyinkronkan ulang penyimpanan lokal IndexedDB.
- **Pemicu dan prasyarat:** Pengguna membuka `/pengaturan` pada tab **Profil Apotek & Cabang** (`cabang`), **Printer Thermal & Laci Kasir** (`printer`), atau **Storage Offline & Sync** (`diagnostik`).
- **Status implementasi:** **Sebagian** (Tab `cabang` tersambung sebagian ke `PUT /api/branches/:id`; Tab `printer` dan Tab `diagnostik` **100% statis/simulasi**).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Tab `cabang` (`pengaturan/+page.svelte:645-740`): memilih cabang (`selectedBranchId`), mengubah input `#br-name`, `#br-phone`, `#br-sia`, `#br-apa`, `#br-sipa`, `#br-addr`, lalu menekan **Simpan Perubahan** di header (`handleSaveSettings`, `L273-285`).
     - Tab `printer` (`L870-932`): mengubah opsi koneksi/ukuran kertas/baud rate dan menekan **Uji Cetak Struk & Tes Buka Laci** (`L924`).
     - Tab `diagnostik` (`L935-1006`): menekan **Sinkronkan Ulang Katalog dari Cloud** (`handleResyncMaster`, `L287-292, 998`).
  2. **State dan validasi di client:** Pada tab `cabang`, input `#br-name`, `#br-phone`, `#br-sia`, `#br-apa`, `#br-addr` terikat (`bind:value`) ke objek `selectedBranch`. Namun input `#br-sipa` (`L721`) hanya memiliki atribut statis `value="500.16.7.2/0289/SIPA/DPMPTSP/II/2026"` tanpa `bind:value`. Pada tab `printer`, keempat input (`#pr-type`, `#pr-width`, `#pr-baud`, `#pr-drawer`) tidak memiliki `bind:value` sama sekali.
  3. **Client/service/API:** `handleSaveSettings` memanggil `api.branches.update(selectedBranch.id, selectedBranch)` -> `PUT /api/branches/:id` (`api.ts:177-182`). Tab `printer` dan `diagnostik` tidak memanggil API apa pun.
  4. **Handler dan validasi server:** `GET /api/branches` (`auth.routes.ts:984-1026`) dan `PUT /api/branches/:id` (`auth.routes.ts:1029-1074`).
  5. **Business logic/perhitungan/aturan status:** `PUT /api/branches/:id` hanya memperbarui kolom `name`, `address`, `phone`, `receiptHeader`, dan `receiptFooter` (`auth.routes.ts:1034-1040`). Field `siaNumber` dan `pharmacistName` diabaikan karena tidak ada kolomnya di tabel `branches`; saat `GET /api/branches` dipanggil (`L1012-1013`), server mengembalikan string hardcoded `siaNumber: "503/044/SIA/DPMPTSP/2024"` dan `pharmacistName: "apt. Ghina Nadhifah, S.Farm."`.
  6. **Database:** `UPDATE branches SET ... WHERE id = :id` (`auth.routes.ts:1042-1045`).
  7. **Respons dan efek ke UI:** Menampilkan notifikasi `saveSuccess` selama 3 detik (`pengaturan/+page.svelte:278-279`).
  8. **Efek samping/integrasi:** Tombol uji printer hanya memunculkan `alert(...)` (`L924`); tombol sinkronisasi ulang di tab diagnostik hanya menampilkan teks `resyncMessage` palsu selama 3,5 detik tanpa menyentuh `localDb` atau `api.pos.getBootstrap` (`L287-292`).
- **Jalur alternatif dan kegagalan:**
  - Perubahan nomor SIA, SIPA, dan nama Apoteker Penanggung Jawab (APA) pada tab `cabang` akan kembali ke nilai hardcoded semula begitu halaman di-refresh karena tidak disimpan di tabel `branches`.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketidaksesuaian skema tabel `branches` (`packages/db/src/schema/auth.ts:24-42`) yang belum memiliki kolom `sia_number`, `sipa_number`, dan `pharmacist_name` padahal UI `/pengaturan`, `/pembelian` (cetak SP), dan `/laporan` (SIPNAP) membutuhkannya.
  - Angka metrik diagnostik IndexedDB (`48.2 MB`, `82 record`, `145 batch`, `4 debitur`, `0 antrean` di `pengaturan/+page.svelte:952-991`) yang 100% hardcoded.
- **Bukti kode:** `apps/web/src/routes/pengaturan/+page.svelte:273-292, 645-740, 870-1006`, `apps/backend/src/modules/auth/auth.routes.ts:984-1074`, `packages/db/src/schema/auth.ts:24-42`.
- **Kesenjangan/pertanyaan terbuka:** Apakah konfigurasi printer termal seharusnya disimpan di `localStorage` per terminal kasir dan dihubungkan ke `EscPosBuilder` (`packages/core/src/hardware/escpos.ts`)?

---

### BF-007 — Migrasi ETL Data Legacy Firebird (CSV) ke PostgreSQL
- **Posisi dalam urutan bisnis:** 7 (Seeding & konversi data awal sistem dari database warisan `GAMPANGAPOTEKZ.FDB`).
- **Tujuan dan aktor/role:** Mengimpor master cabang, lokasi, rak, supplier PBF, pelanggan, katalog produk multi-satuan, stok akhir, riwayat faktur pembelian, dan riwayat transaksi penjualan dari direktori `legacy_database/*.csv` ke PostgreSQL. Aktor: Administrator/Developer melalui CLI.
- **Pemicu dan prasyarat:** Eksekusi perintah CLI `bun --filter @apoteku/db run migrate:master`, `migrate:purchases`, dan `migrate:sales` (`packages/db/package.json:20-22`). Prasyarat: file CSV tersedia di `<root>/legacy_database/` dan skema PostgreSQL sudah di-push/migrate.
- **Status implementasi:** **Berjalan sebagian** (ketiga skrip berjalan ke PostgreSQL, namun memiliki celah krusial pada migrasi batch, stok batch, dan idempotensi re-run).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Eksekusi CLI non-UI.
  2. **State dan validasi di client:** Tidak ada (skrip berjalan langsung di runtime Bun server).
  3. **Client/service/API:** Menggunakan `db` (`packages/db/src/client.ts`) dan `Papa.parse` (`papaparse`) untuk membaca file CSV.
  4. **Handler dan validasi server:** Tidak melalui HTTP handler.
  5. **Business logic/perhitungan/aturan status:**
     - **Tahap 1 (`migrate-master-data.ts:25-572`):**
       - Memastikan tenant `"AHF"` (*Apotek Hafidz Farma*, PPN `11.00%`) ada di tabel `tenants` (`L33-54`).
       - Mengimpor `CABANG.csv` ke `branches` dan mencatat pemetaan ID lama ke `legacy_id_map` (`L58-111`).
       - Mengimpor `LOKASI.csv` ke `inventory_locations` dan membuat lokasi fallback `"DEPO-UTAMA"` untuk setiap cabang yang belum memiliki lokasi (`L116-194`).
       - Mengimpor `SUPPLIER.csv` ke `suppliers` + `legacy_id_map` (`L208-251`) dan `PELANGGAN.csv` ke `customers` + `legacy_id_map` (`L256-299`).
       - Membaca `RAK.csv` (`L198-203`) dan `DESKRIPSIBARANG.csv` (`L305-322`), lalu mengimpor `BARANG.csv` (`L327-505`): memisahkan baris induk (`parentRows`) dan baris satuan turunan (`childRows` berdasarkan `ID_SATUAN_DARI`), menginferensi `drugClass` dari nama obat/kode jenis (`L354-365`), membuat satuan dasar & satuan beli di `product_units`, serta menggabungkan `childRows` sebagai satuan konversi tambahan pada produk induk (`L461-505`).
       - Membaca `STOKAKHIR.csv` dan mengisi `branch_stocks` dengan `totalQtyBase = qty` dan `unbatchedQtyBase = qty` (`L523-558`).
     - **Tahap 2 (`migrate-purchases.ts:29-211`):**
       - Menghapus seluruh data lama di `purchase_invoice_items`, `purchase_invoices`, dan `legacy_id_map` (`source_table = 'PEMBELIAN'`) milik tenant aktif (`L70-72`).
       - Membaca `PEMBELIAN.csv` dan `DETAILPEMBELIAN.csv`, memetakan relasi lewat `legacy_id_map`, dan melakukan batch insert ke `purchase_invoices` (per 200 baris), `purchase_invoice_items` (per 500 baris), dan `legacy_id_map` (`L103-201`).
     - **Tahap 3 (`migrate-sales.ts:42-259`):**
       - Menghapus seluruh data lama di `sales_transaction_items` dan `sales_transactions` milik tenant aktif (`L101-102`).
       - Membaca `BARANG.csv`, `DETAILPENJUALAN.csv`, dan `PENJUALAN.csv`, memetakan metode bayar (`mapPaymentMethod`, `L25-40`), lalu melakukan batch insert ke `sales_transactions` (per 1.000 baris) dan `sales_transaction_items` (per 500 baris) (`L137-250`).
  6. **Database:**
     - Dibaca: `tenants`, `branches`, `legacy_id_map`.
     - Ditulis/diubah: `tenants`, `branches`, `inventory_locations`, `suppliers`, `customers`, `products`, `product_units`, `branch_stocks`, `purchase_invoices`, `purchase_invoice_items`, `sales_transactions`, `sales_transaction_items`, `legacy_id_map`.
  7. **Respons dan efek ke UI:** Output log terminal dan `process.exit(0)`.
  8. **Efek samping/integrasi:** Tidak ada.
- **Jalur alternatif dan kegagalan:**
  - **Bug Re-run `migrate-master-data.ts` (`L394-397`):** Saat menginsert `products`, skrip memakai `.onConflictDoNothing().returning({ id: schema.products.id })`. Jika skrip dijalankan untuk kedua kalinya, `inserted` bernilai `undefined` sehingga `productMap` kosong; akibatnya seluruh satuan turunan (`childRows`) dan seluruh saldo stok (`STOKAKHIR.csv`) gagal dipetakan dan dilewati!
  - **Dead Code `FASTBATCH.csv` (`migrate-master-data.ts:511-520`):** Skrip membaca `FASTBATCH.csv` ke dalam Map `fastbatchMap`, tetapi variabel `fastbatchMap` **tidak pernah dipakai** untuk menginsert ke `product_batches` maupun `branch_batch_stocks`. Akibatnya, database hasil migrasi memiliki **0 baris** di `product_batches` dan `branch_batch_stocks`.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan populasi tabel `product_batches`, `branch_batch_stocks`, dan `stock_ledger` pada ketiga skrip migrasi (menyebabkan alokasi FEFO di POS tidak memiliki batch dari data migrasi).
  - Hardcode `batchId: null` pada `migrate-purchases.ts:165` dan `migrate-sales.ts:192`.
  - Perilaku destruktif `DELETE FROM` tanpa transaksi database (`db.transaction`) pada `migrate-purchases.ts:70-72` dan `migrate-sales.ts:101-102`.
- **Bukti kode:** `packages/db/src/scripts/migrate-master-data.ts:1-578`, `packages/db/src/scripts/migrate-purchases.ts:1-217`, `packages/db/src/scripts/migrate-sales.ts:1-265`.
- **Kesenjangan/pertanyaan terbuka:** `dokumen_plan.md` Bagian 11 menyebutkan migrasi stok masuk (`STOKMASUK.csv`) dan alokasi stok batch (`ALOKASISTOK.csv` / `FASTBATCH.csv`) ke `product_batches` dan `branch_batch_stocks`, namun belum diimplementasikan di `migrate-master-data.ts`.

---

### BF-008 — Bootstrap Katalog & Stok Cabang ke Client (`GET /api/pos/bootstrap`) serta Delta Sync
- **Posisi dalam urutan bisnis:** 8 (Sinkronisasi data prasyarat dari server ke memori browser & IndexedDB sebelum transaksi operasional).
- **Tujuan dan aktor/role:** Mengunduh data tenant, cabang, daftar cabang, daftar pelanggan, shift kasir aktif, katalog produk beserta multi-satuan harga, saldo stok cabang, dan saldo batch FEFO ke client.
- **Pemicu dan prasyarat:** Dipanggil oleh `mockApi.ensureDataLoaded(branchId)` (`apps/web/src/lib/services/mock-api.ts:195-260`) setiap kali halaman `/pos`, `/stok`, `/pelanggan`, `/supplier`, `/pelayanan`, `/pembelian`, `/pengiriman`, `/retur`, `/keuangan`, atau `/laporan` dimuat, serta dipanggil langsung oleh `syncOfflineBootstrap()` di `apps/web/src/routes/pos/+page.svelte:262-295`.
- **Status implementasi:** **Sebagian** (Endpoint `GET /api/pos/bootstrap` dan `GET /api/pos/sync-delta` berjalan di backend, namun penyimpanan ke IndexedDB di client hanya menyimpan `products`, cache in-memory `mockApi` mengunci cabang pertama, dan `getDelta` tidak pernah dipanggil di frontend).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Halaman `/pos` (atau halaman lain yang memanggil `mockApi.ensureDataLoaded`) dimuat di browser.
  2. **State dan validasi di client:**
     - Jalur 1 (`mockApi.ensureDataLoaded`, `mock-api.ts:195-260`): Jika `this.isLoadedFromApi` sudah `true`, fungsi langsung keluar (`return` di `L196`) meskipun `branchId` berubah!
     - Jalur 2 (`syncOfflineBootstrap` di `pos/+page.svelte:262-295`): Jika `networkStore.effectiveOnline` bernilai `true`, memanggil `api.pos.getBootstrap(selectedBranchId)`.
  3. **Client/service/API:** `api.pos.getBootstrap(branchId)` (`apps/web/src/lib/services/api.ts:47-50`) mengirim `GET /api/pos/bootstrap?branch_id=...` dengan header `x-branch-id: branchId`.
  4. **Handler dan validasi server:** `posRoutes` (`apps/backend/src/modules/pos/pos.routes.ts:29-44`) memvalidasi query dengan `BootstrapQuerySchema` (`pos.schema.ts:3-5`), menurunkan default `tenantId = "01931818-8000-7000-8000-000000000001"` dan `branchId = "01931818-8000-7000-8000-000000000002"` jika header tidak ada, lalu memanggil `posService.getBootstrap(tenantId, targetBranchId)` (`pos.service.ts:224-477`).
  5. **Business logic/perhitungan/aturan status:**
     - Jika `tenantId` atau `branchId` tidak ditemukan di DB, server otomatis mengambil baris pertama dari tabel `tenants` dan `branches` (`pos.service.ts:235-258`).
     - Mengambil shift aktif (`cashier_shifts` dengan `isOpen = true`), seluruh `products` & `product_units` milik tenant, seluruh `branches`, hingga 500 `customers`, serta `branch_stocks` dan `branch_batch_stocks` (LEFT JOIN `product_batches`) milik `branchId`.
     - Jika tabel `branch_batch_stocks` kosong (seperti yang terjadi pasca-migrasi CSV di `BF-007`), `mockApi.ensureDataLoaded` (`mock-api.ts:222-242`) memeriksa `branchBatches` dari respons; jika tidak ada batch untuk suatu produk tetapi `branchStocks` memiliki `totalQtyBase > 0`, `mockApi` membuat 1 batch sintetis `BATCH-REG` (`id: "b-def-${p.id}"`, `expiryDate: "2027-12-31"`) di memori client (`L224-241`).
  6. **Database:**
     - **Server (Read):** `tenants`, `branches`, `cashier_shifts`, `products`, `product_units`, `customers`, `branch_stocks`, `branch_batch_stocks`, `product_batches` (`pos.service.ts:229-399`).
     - **Client IndexedDB (Write):** Di `pos/+page.svelte:271-290`, `syncOfflineBootstrap()` memanggil `localDb.products.bulkPut(mappedProducts)`. **Catatan penting:** Tabel IndexedDB `localDb.branchStocks` dan `localDb.batchStocks` **tidak pernah diisi (`bulkPut`)** oleh `syncOfflineBootstrap()` maupun kode lain di frontend!
  7. **Respons dan efek ke UI:** Mengisi katalog produk, daftar cabang, dan pelanggan di memori `mockApi` serta IndexedDB `localDb.products`.
  8. **Efek samping/integrasi:** Tidak ada.
- **Jalur alternatif dan kegagalan:**
  - **Fallback jika DB kosong atau query gagal (`pos.service.ts:428-476`):** Mengembalikan `DEFAULT_PRODUCTS` (5 obat statis `pos.service.ts:7-218`) dengan stok 250 per produk, tanpa field `branches` dan `customers`.
  - **Bug Pergantian Cabang di `mockApi.ensureDataLoaded` (`mock-api.ts:196, 237, 450`):** Karena `isLoadedFromApi` menghentikan pemuatan ulang dan setiap batch yang dimuat pertama kali diberi `branchId: branchId || d.branch?.id || "1"`, ketika pengguna mengganti cabang di UI, `mockApi.searchProducts({ branchId })` memfilter `p.batches.filter(b => b.branchId === branchId)` (`L450`) dan menghasilkan **stok 0 untuk semua cabang selain cabang pertama**!
  - **Endpoint Delta Sync (`GET /api/pos/sync-delta`, `pos.routes.ts:60-78`, `pos.service.ts:732-844`):** Terimplementasi di backend dan `api.pos.getDelta` ada di `api.ts:58-62`, tetapi **tidak pernah dipanggil di mana pun di frontend**.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan penulisan ke `localDb.branchStocks` dan `localDb.batchStocks` di `apps/web/src/routes/pos/+page.svelte:262-295`.
  - Penguncian `this.isLoadedFromApi` lintas cabang di `apps/web/src/lib/services/mock-api.ts:196`.
  - Hardcode `categoryId: "cat-1"` (`"Obat Bebas & Alkes"`) untuk semua produk di `mock-api.ts:211-212`.
  - Pembatasan `.limit(500)` tanpa paginasi pada pengambilan `customers` di `pos.service.ts:353`.
- **Bukti kode:** `apps/backend/src/modules/pos/pos.routes.ts:29-44, 60-78`, `apps/backend/src/modules/pos/pos.service.ts:224-477, 732-844`, `apps/web/src/lib/services/mock-api.ts:195-260, 423-456`, `apps/web/src/routes/pos/+page.svelte:262-359`.
- **Kesenjangan/pertanyaan terbuka:** Ketika kasir berada dalam mode offline (`!networkStore.effectiveOnline`), `fetchProducts()` di `pos/+page.svelte:328-358` membaca `localDb.products.toArray()` dan **memalsukan stok semua obat menjadi 100 (`stock: 100`, batch `BTC-LOKAL`)** (`L339-348`) karena `localDb.branchStocks` dan `localDb.batchStocks` tidak pernah diisi saat bootstrap.

---

### BF-009 — Pengelolaan Katalog Master Obat & Multi-Satuan (`/stok`)
- **Posisi dalam urutan bisnis:** 9 (Pengelolaan data master produk & harga).
- **Tujuan dan aktor/role:** Melihat katalog obat, harga multi-satuan, lokasi rak, stok per cabang, serta menambah atau mengubah data master obat. Aktor: Apoteker (`PHARMACIST`), Staf Gudang (`INVENTORY`), atau Admin (`SUPERADMIN`/`OWNER`).
- **Pemicu dan prasyarat:** Pengguna membuka `/stok` tab **Katalog & Master Obat** (`activeTab === "katalog"`, `apps/web/src/routes/stok/+page.svelte:1114-1241`) dan menekan tombol **+ Tambah Obat Baru** (`openAddProductModal`, `L740-764`) atau tombol **Edit** pada baris obat (`openEditProductModal`, `L766-796`).
- **Status implementasi:** **Sebagian (Read berjalan dari API; Create/Update 100% simulasi state lokal tanpa backend)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat halaman dimuat (`onMount`, `stok/+page.svelte:88-116`), memanggil `fetchProducts()` yang memuat produk via `mockApi.searchProducts({ branchId: selectedBranchId, query: searchQuery, categoryId: selectedCategory })`.
     - Pengguna membuka modal tambah/edit obat (`isProductModalOpen`, `L1959-2137`), mengisi SKU, barcode, nama obat, zat aktif, kategori, golongan obat, rak, stok minimum, satuan dasar, harga beli, harga jual umum/resep/grosir, serta daftar satuan konversi tambahan (`productForm.units`), lalu menekan **Simpan Data Obat** (`saveProductForm`, `L798-907`).
  2. **State dan validasi di client:** `saveProductForm` (`L798-804`) memvalidasi `productForm.name.trim()` dan `productForm.sku.trim()` tidak kosong (`alert` jika kosong).
  3. **Client/service/API:** Untuk pembacaan katalog menggunakan `mockApi.searchProducts` (yang bersumber dari `GET /api/pos/bootstrap`). Untuk penyimpanan form tambah/edit obat (`saveProductForm`), **tidak ada pemanggilan API sama sekali**.
  4. **Handler dan validasi server:** Tidak ada endpoint `POST /api/products`, `PUT /api/products/:id`, atau `DELETE /api/products/:id` di seluruh `apps/backend`.
  5. **Business logic/perhitungan/aturan status:**
     - Jika `isEditMode === true` (`L841-862`): memutasi elemen di array lokal `products` (`$state`).
     - Jika tambah baru (`L863-902`): membuat objek `ProductCatalogItem` dengan `id: "prod-" + Date.now()`, membuat 1 batch awal `BATCH-INIT` jika `initialStock > 0`, mendorongnya ke array lokal `products`, dan menambahkan baris ke array lokal `ledgerEntries`.
  6. **Database:** Membaca `products`, `product_units`, `branch_stocks`, `branch_batch_stocks` saat bootstrap awal; **tidak menulis apa pun ke PostgreSQL maupun IndexedDB** saat tambah/edit obat.
  7. **Respons dan efek ke UI:** Menutup modal dan menampilkan item baru/terubah di tabel selama halaman belum di-refresh.
  8. **Efek samping/integrasi:** Semua perubahan master obat hilang saat halaman di-refresh (`F5`).
- **Jalur alternatif dan kegagalan:**
  - Filter kategori obat pada `/stok` (`selectedCategory`, `L1135-1143`) memfilter berdasarkan `cat-1` s/d `cat-5`. Karena `mockApi.ensureDataLoaded` (`mock-api.ts:211`) menetapkan `categoryId: "cat-1"` untuk semua produk dari DB, memilih kategori `cat-2` s/d `cat-5` akan selalu menampilkan 0 produk (kecuali produk yang baru ditambahkan secara lokal di memori).
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan endpoint CRUD `products` dan `product_units` di `apps/backend`.
  - Ketiadaan penyimpanan kategori obat di skema PostgreSQL `products` (`packages/db/src/schema/products.ts:17-50` hanya memiliki `drugClass` dan `dosageForm`, tidak ada `categoryId`).
- **Bukti kode:** `apps/web/src/routes/stok/+page.svelte:73-116, 740-907, 1114-1241, 1959-2137`, `apps/web/src/lib/services/mock-api.ts:207-244`, `packages/db/src/schema/products.ts:17-74`.
- **Kesenjangan/pertanyaan terbuka:** Apakah pembuatan/pengubahan master obat harus dibatasi hanya untuk role `SUPERADMIN`/`OWNER`/`PHARMACIST` di tingkat API saat endpoint CRUD dibuat?

---

### BF-010 — Pengelolaan Direktori Pelanggan & Direktori Supplier PBF (`/pelanggan` & `/supplier`)
- **Posisi dalam urutan bisnis:** 10 (Pengelolaan data master mitra: pasien/pelanggan & distributor PBF).
- **Tujuan dan aktor/role:** Melihat dan mencari daftar pelanggan/member beserta poin loyalitas (`/pelanggan`), melihat direktori PBF beserta TOP (`/supplier`), serta menambah pelanggan atau PBF baru.
- **Pemicu dan prasyarat:** Pengguna membuka `/pelanggan` atau `/supplier`, mencari data di tabel, atau menekan tombol **+ Pelanggan Baru** (`apps/web/src/routes/pelanggan/+page.svelte:177`) / **+ Tambah PBF Baru** (`apps/web/src/routes/supplier/+page.svelte:183`).
- **Status implementasi:** **Sebagian (Read direktori berjalan dari API; Tambah Pelanggan, Tambah PBF, Buku Piutang Pelanggan, dan Buku Hutang di halaman `/supplier` adalah mock/placeholder mati)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Pada `/pelanggan` (`pelanggan/+page.svelte:30-38`): `onMount` memanggil `mockApi.ensureDataLoaded()` dan `mockApi.getCustomers()` (yang mengambil 500 pelanggan dari respons `GET /api/pos/bootstrap`, sedangkan endpoint khusus `GET /api/customers` di `erp.routes.ts:60-83` tidak pernah dipanggil!).
     - Pada `/supplier` (`supplier/+page.svelte:28-36`): `onMount` memanggil `mockApi.getSuppliers()` (`mock-api.ts:321-338`) yang memanggil `api.erp.getSuppliers()` -> `GET /api/suppliers` (`erp.routes.ts:33-57`).
  2. **State dan validasi di client:** Pencarian memfilter array `customers` (`pelanggan/+page.svelte:40-47`) dan `suppliers` (`supplier/+page.svelte:38-45`) secara client-side.
  3. **Client/service/API:**
     - Modal **Tambah Pelanggan Baru** (`pelanggan/+page.svelte:314-402`): Input `#cust-name`, `#cust-phone`, `#cust-tier`, `#cust-addr` **tidak memiliki `bind:value` sama sekali**. Tombol **Simpan Pelanggan** (`L391-394`) hanya menutup modal dan memanggil `alert("Data pelanggan baru berhasil disimpan!")`.
     - Modal **Tambah PBF Baru** (`supplier/+page.svelte:309-397`): Input `#sup-name`, `#sup-phone`, `#sup-term`, `#sup-addr` **tidak memiliki `bind:value` sama sekali**. Tombol **Simpan PBF** (`L386-389`) hanya menutup modal dan memanggil `alert("Distributor PBF baru berhasil ditambahkan!")`.
  4. **Handler dan validasi server:** Hanya tersedia `GET /api/customers` (`erp.routes.ts:60-83`) dan `GET /api/suppliers` (`erp.routes.ts:33-57`, dibatasi `.limit(500)` tanpa filter `tenantId`). Tidak ada endpoint `POST /api/customers` atau `POST /api/suppliers`.
  5. **Business logic/perhitungan/aturan status:** Di `erp.routes.ts:76` dan `pos.service.ts:373`, `customerType` dipetakan secara biner `c.customerType === "MEMBER" ? "member" : "general"`, sehingga tipe pelanggan lain (`"GROSIR"`, `"RESEP"`, `"DELIVERY"`) kehilangan klasifikasi tier harganya.
  6. **Database:** Hanya membaca tabel `customers` dan `suppliers`.
  7. **Respons dan efek ke UI:** Direktori menampilkan hingga 500 pelanggan dan 500 supplier.
  8. **Efek samping/integrasi:** Tombol **Riwayat Medis** di baris pelanggan (`pelanggan/+page.svelte:240-246`) hanya menampilkan `alert(...)`. Tombol **+ Buat SP** di baris supplier (`supplier/+page.svelte:236`) mengarahkan ke `/pembelian`.
- **Jalur alternatif dan kegagalan:**
  - **Tab Buku Piutang & Bon di `/pelanggan` (`pelanggan/+page.svelte:81-102, 255-310, 405-484`):** Menggunakan 2 data statis hardcoded (`deb-01`, `deb-02`); modal terima pembayaran (`handleSaveDebtPayment`, `L53-61`) hanya mengurangi angka di memori lokal.
  - **Tab Buku Hutang Faktur di `/supplier` (`supplier/+page.svelte:79-110, 250-305, 400-480`):** Menggunakan 3 data statis hardcoded (`deb-pbf-01` s/d `03`); modal pelunasan di halaman `/supplier` (`handleSavePbfPayment`, `L51-59`) hanya mengurangi angka di memori lokal dan **tidak memanggil** `api.finance.recordDebtPayment` (berbeda dengan pelunasan hutang di halaman `/pembelian` pada `BF-019` yang sudah memanggil API nyata).
- **Data dan aturan bisnis yang harus diaudit:**
  - Form tambah pelanggan & tambah PBF yang tidak terikat ke state maupun API (`pelanggan/+page.svelte:322-383`, `supplier/+page.svelte:317-378`).
  - Duplikasi UI pelunasan hutang PBF di `/supplier` (mock lokal) vs `/pembelian` (API nyata).
  - Pemetaan `priceTier` di `pos.service.ts:373` dan `erp.routes.ts:76` yang hanya mengenali `MEMBER` vs `general`.
- **Bukti kode:** `apps/web/src/routes/pelanggan/+page.svelte:1-484`, `apps/web/src/routes/supplier/+page.svelte:1-480`, `apps/backend/src/modules/erp/erp.routes.ts:33-83`, `apps/backend/src/modules/pos/pos.service.ts:349-375`.
- **Kesenjangan/pertanyaan terbuka:** Apakah fitur piutang pelanggan (`TEMPO`) seharusnya dihitung dari `sales_transactions` yang memiliki `paymentMethod = 'TEMPO'` dan `paidAmount < grandTotal`?

---

### BF-011 — Pembukaan, Pemantauan, dan Penutupan/Rekonsiliasi Shift Kasir
- **Posisi dalam urutan bisnis:** 11 (Prasyarat operasional kasir sebelum melayani transaksi penjualan tunai/non-tunai).
- **Tujuan dan aktor/role:** Membuka shift kasir baru dengan modal awal (*starting cash*), memantau akumulasi penjualan tunai/non-tunai selama shift berlangsung, serta menutup shift dengan rekonsiliasi uang fisik di laci (*blind/counted cash*) terhadap saldo ekspektasi sistem. Aktor: Kasir (`CASHIER`) di `/pos` dan Manajer/Keuangan (`FINANCE`/`OWNER`/`SUPERADMIN`) di `/keuangan`.
- **Pemicu dan prasyarat:**
  - Di `/pos`: Kasir mengklik badge status shift di header (`apps/web/src/routes/pos/+page.svelte:689-705`) yang membuka modal shift (`isShiftModalOpen`, `L1351-1521`), lalu menekan **Buka Shift Kasir** (`handleOpenShift`, `L130-142`) atau **Tutup Shift & Cetak Rekap** (`handleCloseShift`, `L144-158`).
  - Di `/keuangan`: Pengguna membuka tab **Rekonsiliasi & Tutup Shift Kasir** (`activeTab === "rekonsiliasi_shift"`, `apps/web/src/routes/keuangan/+page.svelte:650-734`), mengklik **Tutup Shift** pada baris berstatus `OPEN` (`openCloseShiftModal`, `L397-402`), mengisi kas aktual di modal (`L871-962`), dan menekan **Konfirmasi & Tutup Shift** (`handleConfirmCloseShift`, `L404-454`).
- **Status implementasi:** **Berjalan** (tersambung ke PostgreSQL `cashier_shifts` melalui `/api/shifts/*`, namun modal shift di `/pos` menampilkan angka ringkasan hardcoded).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Input modal awal (`startingCashInput`) saat buka shift, atau input kas fisik aktual (`shiftActualCash` di `/pos` / `actualCountedCashInput` di `/keuangan`) saat tutup shift.
  2. **State dan validasi di client:** Di `/pos`, `handleOpenShift` (`pos/+page.svelte:130-142`) mengirim `selectedBranchId`, `startingCashInput`, `shiftNumber: 1`, `notes`.
  3. **Client/service/API:**
     - Cek shift aktif: `mockApi.getCurrentShift(branchId)` (`mock-api.ts:340-362`) -> `api.shift.getCurrent(branchId)` -> `GET /api/shifts/current?branch_id=...` (`api.ts:185-188`).
     - Daftar riwayat shift: `api.shift.list(params)` -> `GET /api/shifts` (`api.ts:189-196`).
     - Buka shift: `mockApi.openShift(...)` (`mock-api.ts:364-401`) -> `api.shift.open(...)` -> `POST /api/shifts/open` (`api.ts:197-202`).
     - Tutup shift: `mockApi.closeShift(...)` (`mock-api.ts:403-416`) atau langsung `api.shift.close(...)` (`keuangan/+page.svelte:408-412`) -> `POST /api/shifts/close` (`api.ts:203-208`).
  4. **Handler dan validasi server:** `shiftRoutes` (`apps/backend/src/modules/shift/shift.routes.ts:1-131`) memvalidasi input dengan TypeBox (`initialCash: t.Number({ minimum: 0 })`, `actualCash: t.Number({ minimum: 0 })`, `shiftId: t.String()`) dan memanggil `shiftService` (`apps/backend/src/modules/shift/shift.service.ts:33-301`).
  5. **Business logic/perhitungan/aturan status:**
     - **Buka Shift (`shift.service.ts:100-169`):** Memeriksa apakah cabang valid di `branches` (`L104-112`) dan menolak jika masih ada shift `isOpen = true` di cabang tersebut (`L115-122`). Menghitung nomor urut shift hari itu (`COUNT(*) WHERE branch_id = ... AND DATE(start_time) = CURRENT_DATE`, `L125-135`), lalu menginsert baris baru ke `cashier_shifts` dengan `expectedCash = initialCash`, `isOpen = true`.
     - **Hitung Penjualan Real-Time & Tutup Shift (`shift.service.ts:67-88, 171-242`):** Mengagregasi tabel `sales_transactions` dengan kondisi `branch_id = shift.branchId AND created_at >= shift.startTime`:
       - `cashSales = SUM(CASE WHEN payment_method = 'CASH' THEN grand_total ELSE 0 END)`
       - `nonCashSales = SUM(CASE WHEN payment_method != 'CASH' THEN grand_total ELSE 0 END)`
       - `expectedCash = initialCash + cashSales`
       - `cashDifference = actualCash - expectedCash`
       - Mengupdate `cashier_shifts` (`endTime = new Date()`, `actualCash`, `expectedCash`, `cashDifference`, `totalNonCash`, `totalSales`, `isOpen = false`).
  6. **Database:** Membaca `tenants`, `branches`, `cashier_shifts`, `sales_transactions`; melakukan `INSERT` dan `UPDATE` pada `cashier_shifts`.
  7. **Respons dan efek ke UI:** Memperbarui status `activeShift` di `/pos` dan daftar `shiftRecords` di `/keuangan`.
  8. **Efek samping/integrasi:** Saat shift ditutup dari `/keuangan` (`keuangan/+page.svelte:434-450`), UI menambahkan entri lokal `"Setoran Shift"` ke state `cashEntries` di memori (tidak tersimpan ke DB).
- **Jalur alternatif dan kegagalan:**
  - **Fallback Offline di `mockApi.openShift` / `closeShift` (`mock-api.ts:386-400, 408-415`):** Jika pemanggilan API gagal, `mockApi` membuat objek shift lokal dengan ID `shf-${Date.now()}` (bukan UUID!). Ketika transaksi kasir disinkronkan ke backend menggunakan `cashierShiftId: "shf-..."`, insert ke `sales_transactions.cashier_shift_id` (bertipe `uuid` FK ke `cashier_shifts.id`) akan **gagal karena format UUID tidak valid / FK tidak ada di server**!
- **Data dan aturan bisnis yang harus diaudit:**
  - **Agregasi Penjualan Shift Tidak Memfilter `cashier_shift_id` (`shift.service.ts:75-80, 198-203`):** Query agregasi hanya memfilter `branch_id = shift.branchId AND created_at >= shift.startTime` (tanpa `eq(salesTransactions.cashierShiftId, shift.id)` dan tanpa batas `created_at <= endTime`).
  - **Angka Hardcoded pada Modal Rekonsiliasi Shift di `/pos` (`pos/+page.svelte:120-126, 1396-1479`):** Variabel `shiftInitialCash = 200000`, `shiftCashSales = 1450000`, `shiftQrisSales = 820000`, dan `shiftActualCash = 1650000` di-hardcode di state komponen `/pos`, sehingga kasir di `/pos` selalu melihat angka statis Rp 200.000 / Rp 1.450.000 / Rp 1.650.000 dan mengirim `shiftActualCash` default `1650000` ke backend jika tidak diubah!
  - `shift.service.ts:288` meng-hardcode `cashierName: "Kasir Petugas"` tanpa melakukan JOIN ke tabel `users` pada kolom `cashier_shifts.user_id`.
- **Bukti kode:** `apps/backend/src/modules/shift/shift.routes.ts:1-131`, `apps/backend/src/modules/shift/shift.service.ts:1-304`, `apps/web/src/lib/services/mock-api.ts:340-416`, `apps/web/src/routes/pos/+page.svelte:119-158, 1351-1521`, `apps/web/src/routes/keuangan/+page.svelte:397-454, 650-734, 871-962`.
- **Kesenjangan/pertanyaan terbuka:** `dokumen_plan.md` Bagian 4.2 menyebutkan *Blind Shift Closing* (kasir tidak boleh melihat `expectedCash` sebelum memasukkan `actualCash`), tetapi baik modal di `/pos` (`L1425`) maupun modal di `/keuangan` (`L902`) langsung menampilkan nilai **Ekspektasi Sistem** di layar sebelum kasir mengetik kas aktual.

---

### BF-012 — Transaksi Kasir POS: Pencarian Obat, Multi-Satuan, Alokasi Batch FEFO, Kalkulasi Keranjang, dan Checkout
- **Posisi dalam urutan bisnis:** 12 (Proses transaksi inti penjualan apotek).
- **Tujuan dan aktor/role:** Melayani pembelian obat oleh pelanggan (Umum/Member/Resep/Grosir), memilih satuan jual, mengalokasikan batch secara FEFO, menghitung harga berjenjang (*tiered pricing*), diskon, PPN, pembulatan tunai, menerima pembayaran Tunai/QRIS, dan mencetak struk. Aktor: Kasir (`CASHIER`) / Apoteker (`PHARMACIST`).
- **Pemicu dan prasyarat:** Pengguna membuka `/pos` (`apps/web/src/routes/pos/+page.svelte`), mencari/memilih obat ke keranjang, mengklik **Proses Pembayaran** (`openCheckout`, `L515-521`), memilih metode bayar (`CASH` atau `QRIS`), lalu menekan **Konfirmasi & Cetak Struk** (`handleCheckoutSubmit`, `L523-570`).
- **Status implementasi:** **Sebagian (UI, kalkulasi `@apoteku/core`, dan antrean Dexie berjalan, namun terdapat bug kritis double-queueing saat checkout dan bug duplikasi ID item saat sinkronisasi ke PostgreSQL)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Memilih pelanggan (`SearchableSelect`, `pos/+page.svelte:754-780`) yang menentukan `currentPriceTier` (`"general" | "member" | "resep" | "grosir"`).
     - Mencari obat lewat kolom pencarian (`searchQuery`, `L744-750`) atau filter kategori (`L784-794`).
     - Mengklik kartu obat atau tombol satuan (`addToCart(prod, uIdx)`, `L400-433`), mengubah satuan di keranjang (`updateItemUnit`, `L435-468`), atau mengubah kuantitas (`updateQuantity`, `L489-503`).
     - Membuka modal pembayaran (`openCheckout`, `L515-521`), memilih `CASH` (dengan tombol nominal cepat Rp 50rb/100rb/Uang Pas) atau `QRIS` (timer 5 menit + tombol **Simulasikan Pembayaran Berhasil**, `simulateQrisSuccess`, `L92-96`), lalu menekan submit (`handleCheckoutSubmit`, `L523-570`).
  2. **State dan validasi di client:**
     - **Alokasi FEFO (`allocateBatches`, `L470-487`):** Mengurutkan batch produk berdasarkan `expiryDate` ascending (`L473-475`) dan memanggil `selectFefoBatches(candidates, requiredBaseQty)` dari `@apoteku/core` (`packages/core/src/fefo/selection.ts:24-51`).
     - **Kalkulasi Keranjang (`totals`, `L212-226`):** Memanggil `calculateCartTotals` dari `@apoteku/core` (`packages/core/src/calculations/totals.ts:16-59`) dengan `taxRatePercent: taxRate` (default `0` di `L66`!), `paidAmount: cashReceived`, dan `roundingStep: 100`.
     - **Validasi Checkout (`L516, 524`):** Memastikan `cart.length > 0` dan untuk pembayaran `CASH`, `cashReceived >= grandTotal`.
  3. **Client/service/API:**
     - `handleCheckoutSubmit` (`pos/+page.svelte:523-570`) memanggil `mockApi.checkoutSale(payload)` (`mock-api.ts:485-531`).
     - Di dalam `mockApi.checkoutSale`:
       - Membuat nomor nota `INV/${ymd}/${payload.branchId}/${randomSeq}` (`L489-491`).
       - Memotong stok batch di memori `this.products` (`L495-505`).
       - **Memanggil `await networkStore.queueSale({ id: crypto.randomUUID(), invoiceNo: invoiceNumber, payload })` (`mock-api.ts:511-518`)!**
     - Setelah `mockApi.checkoutSale` selesai, `handleCheckoutSubmit` di `pos/+page.svelte:559-563` **memanggil `await networkStore.queueSale({ id: saleId, invoiceNo: result.invoiceNumber, payload })` UNTUK KEDUA KALINYA** dengan UUID `id` yang berbeda tetapi `invoiceNo` yang sama!
  4. **Handler dan validasi server:** Tidak dipanggil secara langsung oleh `handleCheckoutSubmit`; pengiriman ke server dilakukan secara asinkron oleh `networkStore.syncPendingSales()` pada alur **BF-013**.
  5. **Business logic/perhitungan/aturan status:**
     - Subtotal per item = `qty * unitPrice`.
     - `qtyBase = qty * conversionFactor`.
     - Pembulatan kasir ke ratusan terdekat (`roundingStep: 100`).
  6. **Database:** Menulis **2 baris duplikat** per transaksi ke tabel IndexedDB `localDb.pendingSales` (`networkStore.svelte.ts:76`).
  7. **Respons dan efek ke UI:** Mengosongkan `cart`, menutup modal checkout, membangun pratinjau struk teks (`buildReceiptPreview`, `pos/+page.svelte:572-610`), dan membuka modal struk (`showReceiptModal = true`, `L566`) yang memiliki tombol **Cetak Struk** (`window.print()`, `L1333`).
  8. **Efek samping/integrasi:** Memicu `networkStore.syncPendingSales()` secara otomatis jika `networkStore.effectiveOnline === true` (`networkStore.svelte.ts:80-82`).
- **Jalur alternatif dan kegagalan:**
  - **Stok Batch Tidak Cukup (Oversell):** `selectFefoBatches` mengembalikan `isFullyAllocated: false` dan `remainingRequiredBase > 0`, namun UI `/pos` tidak memblokir penambahan ke keranjang maupun checkout (sesuai prinsip *Never Block the Cashier* di `dokumen_plan.md` Bagian 4.1).
  - **Pergantian Pelanggan Setelah Item di Keranjang:** Mengubah `selectedCustomerId` mengubah `currentPriceTier` (`pos/+page.svelte:75-85`), namun harga item yang sudah terlanjur masuk di `cart` tidak dihitung ulang.
- **Data dan aturan bisnis yang harus diaudit:**
  - **Bug Double-Queueing Transaksi:** Pemanggilan ganda `networkStore.queueSale` di `mock-api.ts:511` DAN `pos/+page.svelte:559` untuk satu kali klik checkout.
  - **Tarif PPN Default 0% di POS (`pos/+page.svelte:66`):** `let taxRate = $state(0)` diinisialisasi `0` dan tidak pernah mengambil `tenant.taxPercent` (`11%`) dari respons bootstrap, serta tidak ada input UI untuk mengubahnya.
  - **Dead Code Shortcut Keyboard & ESC/POS:** Indikator UI menampilkan `F2: Cari` dan `F8: Bayar` (`pos/+page.svelte:643, 748`) tanpa event listener `onkeydown`; `EscPosBuilder` diimpor (`L14`) tetapi tidak pernah dipakai.
- **Bukti kode:** `apps/web/src/routes/pos/+page.svelte:65-96, 212-226, 400-610, 1049-1348`, `apps/web/src/lib/services/mock-api.ts:485-531`, `packages/core/src/calculations/totals.ts:16-59`, `packages/core/src/fefo/selection.ts:24-51`.
- **Kesenjangan/pertanyaan terbuka:** Tombol metode pembayaran di UI modal checkout (`pos/+page.svelte:1081-1104`) hanya menyediakan `CASH` dan `QRIS`; metode `EDC_DEBIT`, `EDC_CREDIT`, `TRANSFER`, dan `TEMPO` yang ada di skema backend (`pos.schema.ts:25-32`) tidak memiliki tombol pilihan di UI `/pos`.

---

### BF-013 — Antrean Penjualan Offline, Sinkronisasi ke Server (`POST /api/pos/sync-sales`), dan Penanganan Defisit Oversell
- **Posisi dalam urutan bisnis:** 13 (Sinkronisasi transaksi POS dari IndexedDB ke PostgreSQL & pemotongan stok server).
- **Tujuan dan aktor/role:** Mengirimkan kumpulan transaksi yang tertunda di IndexedDB (`localDb.pendingSales`) ke server PostgreSQL secara idempoten saat koneksi tersedia, memotong saldo `branch_batch_stocks` dan `branch_stocks`, mencatat buku besar `stock_ledger` (`POS_SALE` atau `DEFICIT_OVERSELL`), dan menandai antrean lokal sebagai tersinkron.
- **Pemicu dan prasyarat:** Dipicu otomatis oleh:
  1. `networkStore.queueSale()` sesaat setelah checkout jika `effectiveOnline === true` (`networkStore.svelte.ts:80-82`),
  2. Event browser `window.addEventListener("online", ...)` (`L19-22`),
  3. Toggle simulasi offline dimatikan (`toggleOfflineSimulation()`, `L52-57`) atau klik tombol **Sync** di header POS (`pos/+page.svelte:682`),
  4. Timer periodik `setInterval` setiap 30 detik (`networkStore.svelte.ts:31-36`).
- **Status implementasi:** **Sebagian (Alur end-to-end terhubung, namun mengandung bug fatal duplikasi UUID item, silent catch pada kegagalan DB di server, dan penandaan `synced: 1` tanpa memeriksa status per transaksi)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Berjalan otomatis di latar belakang atau melalui klik tombol Sync / toggle Online-Offline di header `/pos` (`pos/+page.svelte:668-686`).
  2. **State dan validasi di client:** `networkStore.syncPendingSales()` (`apps/web/src/lib/stores/networkStore.svelte.ts:85-185`) memeriksa `!browser || this.isSyncing || !this.effectiveOnline`. Mengambil semua baris `localDb.pendingSales.where("synced").equals(0).toArray()` (`L92-95`).
  3. **Client/service/API:** Menyusun payload `SyncSalesBodySchema` (`L103-164`) dan memanggil `api.pos.syncSales(syncPayload)` -> `POST /api/pos/sync-sales` (`apps/web/src/lib/services/api.ts:51-57`).
  4. **Handler dan validasi server:** `posRoutes` (`apps/backend/src/modules/pos/pos.routes.ts:45-59`) memvalidasi body terhadap `SyncSalesBodySchema` (`pos.schema.ts:7-63`) dan memanggil `posService.syncSales(tenant.tenantId, body)` (`apps/backend/src/modules/pos/pos.service.ts:483-727`).
  5. **Business logic/perhitungan/aturan status:**
     - Untuk setiap `trx` di `payload.transactions`:
       1. **Cek Idempotensi (`pos.service.ts:508-526`):** Mencari `sales_transactions.id = trx.id`. Jika sudah ada, menambah `duplicateCount` dan mengembalikan status `"ALREADY_EXISTS"`.
       2. **Insert Header & Item (`L530-574`):** Menginsert ke `sales_transactions` dan melakukan loop insert ke `sales_transaction_items`.
       3. **Pemotongan Stok & Penanganan Defisit Oversell (`L576-694`):**
          - Hanya dieksekusi jika `item.batchId` tidak `null` dan ditemukan di `branch_batch_stocks` (`L577-591` — **catatan**: jika `item.batchId` adalah `null` atau tidak ditemukan di `branch_batch_stocks`, stok `branch_stocks` dan `stock_ledger` **sama sekali tidak dipotong**!).
          - Jika `item.qtyBase > currentBatchStock` (*Oversell*): mengupdate `branch_batch_stocks.qtyBase = "0"`, mengupdate `branch_stocks` (`totalQtyBase = totalQtyBase - item.qtyBase`, `unbatchedQtyBase = unbatchedQtyBase + deficitQty`), menginsert `stock_ledger` dengan `mutationType: "DEFICIT_OVERSELL"`, dan mendorong peringatan ke `inventoryAlerts` (`L593-648`).
          - Jika stok cukup (*Normal*): mengurangi `branch_batch_stocks.qtyBase`, mengurangi `branch_stocks.totalQtyBase`, dan menginsert `stock_ledger` dengan `mutationType: "POS_SALE"` (`L649-692`).
  6. **Database:**
     - **Server:** Membaca dan menulis `sales_transactions`, `sales_transaction_items`, `branch_batch_stocks`, `branch_stocks`, `stock_ledger`.
     - **Client:** Mengupdate `localDb.pendingSales.update(item.id, { synced: 1 })` (`networkStore.svelte.ts:169-171`).
  7. **Respons dan efek ke UI:** Memperbarui `networkStore.pendingCount`, `lastSyncTime`, dan `syncMessage` (`networkStore.svelte.ts:172-174`).
  8. **Efek samping/integrasi:** Mengembalikan array `inventoryAlerts` pada respons JSON (tetapi `networkStore.svelte.ts` tidak menampilkan atau menyimpan `inventoryAlerts` tersebut).
- **Jalur alternatif dan kegagalan (Temuan Audit Kritis):**
  1. **Bug Duplikasi Primary Key `sales_transaction_items.id` (`networkStore.svelte.ts:145`):** Saat memetakan item keranjang, `networkStore` menulis `id: "01931818-a000-7000-8000-" + String(idx + 1).padStart(12, "0")`. Karena UUID ini statis berdasarkan indeks array `idx` (`000000000001`, `000000000002`, dst.), transaksi pertama berhasil menginsert item ke-1 dengan PK `01931818-a000-7000-8000-000000000001`, namun **seluruh transaksi berikutnya akan gagal saat menginsert item ke-1 karena pelanggaran Primary Key `sales_transaction_items_pkey` di PostgreSQL**!
  2. **Bug UUID Tidak Valid pada `branchId`, `cashierShiftId`, `cashierUserId`, dan `batchId` (`networkStore.svelte.ts:104-160`):**
     - Jika user login sebagai `DEFAULT_SUPERADMIN`, `branchId` bernilai `"1"` dan `userId` bernilai `"usr-superadmin"` (bukan UUID).
     - Jika batch berasal dari fallback `mockApi`, `batchId` bernilai `"b-def-..."` (bukan UUID).
     - Saat dikirim ke PostgreSQL yang kolom-kolomnya bertipe `uuid`, query `INSERT INTO sales_transactions` langsung gagal dengan error `invalid input syntax for type uuid`.
  3. **Bug Silent Catch di Server (`pos.service.ts:696-706`):** Seluruh blok `INSERT INTO sales_transactions`, `INSERT INTO sales_transaction_items`, dan pemotongan stok dibungkus dalam `try { ... } catch (dbErr) { console.warn("[PosService] DB write error, logging sync memory success:", dbErr); }` diikuti oleh `processedCount++; results.push({ ..., status: "SYNCED" });`! Artinya, **meskipun penyimpanan ke PostgreSQL gagal total, server tetap mengembalikan HTTP 200 dengan `status: "SYNCED"`**, dan client (`networkStore.svelte.ts:169-171`) langsung menandai transaksi di IndexedDB sebagai `synced: 1` sehingga **data transaksi hilang secara permanen** tanpa pernah masuk ke database!
  4. **Tidak Ada Transaksi Database (`db.transaction`):** Jika transaksi memiliki 3 item dan item ke-2 gagal diinsert, header `sales_transactions` dan item ke-1 tetap tersimpan secara parsial tanpa rollback.
  5. **`retryCount` dan `lastError` Tidak Pernah Diperbarui (`networkStore.svelte.ts:175-179`):** Pada blok `catch (err)` ketika koneksi HTTP putus, `retryCount` dan `lastError` di `localDb.pendingSales` tidak pernah diupdate.
- **Data dan aturan bisnis yang harus diaudit:**
  - Pembentukan UUID deterministik pada `networkStore.svelte.ts:145`.
  - Blok `catch (dbErr)` yang menelan error database dan memalsukan status `"SYNCED"` di `apps/backend/src/modules/pos/pos.service.ts:696-706`.
  - Ketiadaan `db.transaction` di `pos.service.ts:529-695`.
  - Pengabaian pemotongan stok apabila `item.batchId` bernilai `null` atau tidak ada di `branch_batch_stocks` (`pos.service.ts:577, 591`).
  - Pengelompokan seluruh item `unsynced` ke satu `branchId` dan `cashierShiftId` milik elemen pertama (`unsynced[0]`) di `networkStore.svelte.ts:104-108`.
- **Bukti kode:** `apps/web/src/lib/stores/networkStore.svelte.ts:59-185`, `apps/backend/src/modules/pos/pos.routes.ts:45-59`, `apps/backend/src/modules/pos/pos.schema.ts:7-63`, `apps/backend/src/modules/pos/pos.service.ts:483-727`.
- **Kesenjangan/pertanyaan terbuka:** Mengapa `pos.service.ts:696` menelan error database dan mengembalikan `"SYNCED"` alih-alih melempar ke blok `catch` luar (`L707`) yang mengembalikan `status: "FAILED"`?

---

### BF-014 — Unggah Berkas Media Resep Dokter & Faktur PBF (`POST /api/uploads`)
- **Posisi dalam urutan bisnis:** 14 (Layanan pendukung pengarsipan fisik resep dokter & bukti transaksi).
- **Tujuan dan aktor/role:** Mengunggah foto resep dokter atau scan faktur/bukti pembayaran ke penyimpanan berkas lokal server (`<repo-root>/uploads/{category}`) dan mendapatkan URL statis (`/uploads/{category}/{filename}`). Aktor: Apoteker/Kasir di `/pelayanan` atau Staf Gudang/Keuangan.
- **Pemicu dan prasyarat:** Pengguna memilih file pada `<input type="file" accept="image/*,application/pdf">` di modal **Input Resep Dokter** pada `/pelayanan` (`apps/web/src/routes/pelayanan/+page.svelte:1381` -> `handlePrescriptionFileChange` di `L308-326`).
- **Status implementasi:** **Berjalan** (endpoint `POST /api/uploads` menyimpan berkas ke disk dan disajikan lewat `@elysiajs/static` di `/uploads/*`).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Pengguna memilih file gambar/PDF di modal resep (`pelayanan/+page.svelte:1381`).
  2. **State dan validasi di client:** `handlePrescriptionFileChange` (`L308-326`) memeriksa keberadaan `input.files?.[0]` dan menyetel `isUploadingPrescription = true`.
  3. **Client/service/API:** Memanggil `api.media.uploadFile(file, "prescriptions")` (`apps/web/src/lib/services/api.ts:65-77`) yang mengirim `FormData` (`file`, `category`) via `POST /api/uploads`.
  4. **Handler dan validasi server:** `mediaRoutes` (`apps/backend/src/modules/media/media.routes.ts:24-80`) memvalidasi body dengan TypeBox: `file: t.File({ maxSize: 10 * 1024 * 1024 })` (batas 10 MB) dan `category: t.Optional(t.Union([t.Literal("prescriptions"), t.Literal("invoices"), t.Literal("general")]))`.
  5. **Business logic/perhitungan/aturan status:**
     - Menentukan direktori target `join(UPLOADS_ROOT, targetCategory)` (`L30`).
     - Membuat direktori dengan `mkdir(uploadDir, { recursive: true })` (`L33`).
     - Menyanitasi nama file dengan `file.name.replace(/[^a-zA-Z0-9.-]/g, "_")` dan menambahkan prefix `${Date.now()}_` (`L35-37`).
     - Menulis file ke disk menggunakan `await Bun.write(filePath, file)` (`L41`).
  6. **Database:** Tidak menulis ke tabel PostgreSQL secara langsung; menulis berkas fisik ke filesystem `<repo-root>/uploads/{category}/{timestamp}_{sanitizedName}`. URL yang dikembalikan kemudian disimpan di `sales_transactions.prescription_image_url` saat resep disubmit (`BF-015`).
  7. **Respons dan efek ke UI:** Mengembalikan `{ success: true, filename, category, size, mimeType, url: "/uploads/..." }` (`L43-50`). UI menyimpan `newResepForm.prescriptionImageUrl = res.url` (`pelayanan/+page.svelte:317`).
  8. **Efek samping/integrasi:** Berkas dapat diakses secara publik tanpa autentikasi melalui `GET /uploads/{category}/{filename}` (`apps/backend/src/index.ts:53-58`).
- **Jalur alternatif dan kegagalan:**
  - Jika ukuran file > 10 MB, TypeBox Elysia menolak request dengan error validasi 400/422. Jika penulisan disk gagal, handler menangkap error dan mengembalikan HTTP 500 (`media.routes.ts:51-57`).
- **Data dan aturan bisnis yang harus diaudit:**
  - **Tidak Ada Validasi Tipe File / Magic Bytes / Ekstensi di Server (`media.routes.ts:24-68`):** Meskipun deskripsi TypeBox menulis `"Image or PDF file"`, `t.File({ maxSize: 10 * 1024 * 1024 })` tidak membatasi `type` (MIME) maupun ekstensi file, sehingga pengguna dapat mengunggah file `.html`, `.js`, atau `.exe` yang kemudian disajikan langsung oleh `@elysiajs/static` di `/uploads/*` (risiko Stored XSS).
  - **Ketidaksesuaian Kontrak dengan `dokumen_plan.md` Bagian 2.4:** Spesifikasi mendefinisikan batas 5 MB, validasi magic bytes (`FF D8 FF`, `89 50 4E 47`, `25 50 44 46`), dan struktur respons `{ success: true, data: { fileUrl: "/storage/..." } }`, sedangkan implementasi mengembalikan `{ success: true, url: "/uploads/..." }` di level top-level.
- **Bukti kode:** `apps/backend/src/modules/media/media.routes.ts:1-80`, `apps/backend/src/index.ts:20-23, 53-58`, `apps/web/src/lib/services/api.ts:65-77`, `apps/web/src/routes/pelayanan/+page.svelte:308-326, 1375-1398`.
- **Kesenjangan/pertanyaan terbuka:** Kategori `"invoices"` sudah didukung di `api.media.uploadFile` dan `media.routes.ts`, namun modal input faktur PBF di `/pembelian` dan modal pelunasan hutang belum memiliki `<input type="file">` untuk memanggil fungsi unggah tersebut.

---

### BF-015 — Pelayanan Resep Dokter, Kalkulasi Racikan, Skrining Klinis, Cetak Etiket, dan PIO (`/pelayanan`)
- **Posisi dalam urutan bisnis:** 15 (Pelayanan farmasi klinis untuk resep dokter non-racikan maupun racikan puyer/kapsul/salep).
- **Tujuan dan aktor/role:** Mencatat antrean resep dokter, menghitung komposisi bahan racikan beserta jasa tuslah & embalase, melakukan skrining klinis (administratif, farmasetis, klinis), mencetak etiket obat (Putih = Obat Dalam, Biru = Obat Luar), dan mendokumentasikan penyerahan obat / Pelayanan Informasi Obat (PIO). Aktor: Apoteker (`PHARMACIST`) / Tenaga Teknis Kefarmasian (TTK).
- **Pemicu dan prasyarat:** Pengguna membuka `/pelayanan` (`apps/web/src/routes/pelayanan/+page.svelte:1-1674`), memilih tab **Antrian Resep Dokter & Racikan** (`resep`), **Generator Etiket Obat** (`etiket`), atau **Dokumentasi PIO & Konseling** (`konseling`).
- **Status implementasi:** **Sebagian (Pembuatan & pembacaan resep terhubung ke `/api/prescriptions`, namun TIDAK memotong stok obat, TIDAK mengalokasikan batch FEFO, sedangkan tindakan Verifikasi Resep dan Dokumentasi PIO 100% hanya mengubah state lokal di memori)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `/pelayanan` dimuat (`onMount`, `L347-378`), memanggil `mockApi.ensureDataLoaded()`, `mockApi.getProducts()`, `mockApi.getCustomers()`, `mockApi.getBranches()`, dan `api.prescription.list()` (`GET /api/prescriptions`).
     - Pengguna mengklik **+ Input Resep & Racikan** (`L688`), memilih pasien & dokter (dari 4 dokter hardcoded `DEFAULT_DOCTORS` di `L35-40`), memilih tipe racikan (`isCompound`), menambahkan komposisi obat (`addDraftItemToResep`, `L447-468`), mengisi signa, aturan pakai, tanggal BUD, tuslah, embalase, mengunggah foto resep (`BF-014`), lalu menekan **Simpan & Buat Antrian Resep** (`submitNewPrescription`, `L474-555`).
  2. **State dan validasi di client:** `submitNewPrescription` (`L475-478`) memvalidasi `patientId`, `doctorId`, dan `items.length > 0`. Menghitung `drugSubtotal = sum(qty * price)` dan `totalPrice = drugSubtotal + tuslah + embalase` (`L483-485`).
  3. **Client/service/API:** Memanggil `api.prescription.create(...)` (`apps/web/src/lib/services/api.ts:218-223`) -> `POST /api/prescriptions`.
  4. **Handler dan validasi server:** `prescriptionRoutes` (`apps/backend/src/modules/prescription/prescription.routes.ts:36-83`) memvalidasi body dengan TypeBox dan memanggil `prescriptionService.createPrescription(...)` (`apps/backend/src/modules/prescription/prescription.service.ts:146-297`).
  5. **Business logic/perhitungan/aturan status:**
     - Membuat nomor resep `RSP-${YYYYMMDD}-${random4Digit}` (`prescription.service.ts:163-165`).
     - Menginsert langsung ke `sales_transactions` dengan `invoiceNo: recipeNumber`, `customerType: "RESEP"`, `paymentMethod: "RESEP"`, `paidAmount: String(grandTotal)` (`L200-221`).
     - Menginsert setiap item obat ke `sales_transaction_items` dengan `conversionFactor: "1"`, `batchId: undefined (null)` (`L178-192, 224-226`).
     - Jika `payload.type === "RACIKAN"`, menginsert header racikan ke `sales_compounds` dan komposisi bahan ke `sales_compound_items` (`L229-261`).
  6. **Database:**
     - **Dibaca (`GET /api/prescriptions`):** `sales_transactions`, `branches`, `sales_transaction_items`, `products`, `sales_compounds` (`prescription.service.ts:49-95`). (Catatan: tabel `sales_compound_items` ditulis saat create tetapi tidak pernah di-SELECT saat read).
     - **Ditulis (`POST /api/prescriptions`):** `sales_transactions`, `sales_transaction_items`, `sales_compounds`, `sales_compound_items` (`L200-260`).
     - **TIDAK DISENTUH:** `branch_stocks`, `branch_batch_stocks`, dan `stock_ledger` **sama sekali tidak diperbarui**!
  7. **Respons dan efek ke UI:** Menambahkan resep baru ke daftar `prescriptions` di UI dengan status `"VERIFIED"` (`prescription.service.ts:285`).
  8. **Efek samping/integrasi:**
     - **Verifikasi Resep (`verifyPrescription`, `pelayanan/+page.svelte:557-572`):** Hanya memutasi `status: "VERIFIED"` di memori browser tanpa memanggil API.
     - **Serahkan & Dokumentasi PIO (`submitPioHandover`, `L590-614`):** Hanya mengubah `status: "DISPENSED"` dan menambah item ke array lokal `counselingRecords` di memori browser tanpa memanggil API (tidak ada tabel PIO/konseling di DB).
     - **Cetak Etiket (`openEtiketForPrescription` `L616-629`, tombol cetak `L1664`):** Membuka dialog cetak browser `window.print()`.
- **Jalur alternatif dan kegagalan:**
  - Jika `api.prescription.create` gagal/offline (`pelayanan/+page.svelte:512-552`), blok `catch` membuat objek resep sintetis lokal dengan `status: "DRAFT"` di memori (hilang saat halaman di-refresh, tidak masuk ke antrean IndexedDB).
- **Data dan aturan bisnis yang harus diaudit:**
  - **Tidak Ada Pemotongan Stok & Batch pada Resep (`prescription.service.ts:146-262`):** Menyimpan resep langsung ke `sales_transactions` sebagai transaksi lunas (`paidAmount = grandTotal`) tanpa memotong `branch_stocks`, `branch_batch_stocks`, maupun mencatat `stock_ledger`.
  - **Kehilangan Metadata Klinis Saat Pembacaan DB (`prescription.service.ts:116-133`):** Karena tabel `sales_transactions` dan `sales_compounds` tidak memiliki kolom untuk `etiketType`, `instruction`, `budDate`, `status` resep, maupun `clinicalScreening`, fungsi `getPrescriptions` meng-hardcode semua resep dari DB sebagai `etiketType: "PUTIH"`, `instruction: "Sesudah Makan"`, `budDate: "2027-12-31"`, `status: "VERIFIED"`, dan `allergyHistory: "Tidak ada"`.
  - **Input `compoundForm` dan `compoundQty` Tidak Ada di Modal UI (`pelayanan/+page.svelte:282-283, 1200-1280`):** Ketika pengguna mencentang resep racikan (`isCompound = true`), tidak ada input di modal untuk memilih bentuk sediaan (`Kapsul`/`Puyer`/`Salep`) maupun jumlah bungkus/kapsul, sehingga selalu mengirim nilai default `compoundForm: "Kapsul"`, `compoundQty: 10`.
- **Bukti kode:** `apps/web/src/routes/pelayanan/+page.svelte:35-40, 238-303, 347-629, 1122-1674`, `apps/backend/src/modules/prescription/prescription.routes.ts:1-83`, `apps/backend/src/modules/prescription/prescription.service.ts:1-300`, `packages/db/src/schema/sales.ts:44-158`.
- **Kesenjangan/pertanyaan terbuka:** Apakah pembuatan resep di `/pelayanan` seharusnya berstatus antrean belum bayar yang diteruskan ke kasir `/pos` untuk pembayaran & pemotongan stok FEFO, atau langsung memotong stok saat diserahkan di `/pelayanan`?

---

### BF-016 — Riwayat Transaksi Penjualan Kasir, Filter Kanal, Rincian Nota, dan Cetak Ulang (`/penjualan`)
- **Posisi dalam urutan bisnis:** 16 (Audit dan penelusuran pasca-transaksi penjualan).
- **Tujuan dan aktor/role:** Menampilkan daftar seluruh transaksi penjualan (Umum, Resep, Grosir, Tempo, Delivery), memfilter dan mencari nomor faktur, melihat rincian item per nota, mengekspor CSV, dan mencetak ulang struk kasir. Aktor: Kasir, Apoteker, Keuangan, Owner.
- **Pemicu dan prasyarat:** Pengguna membuka `/penjualan` (`apps/web/src/routes/penjualan/+page.svelte:1-610`).
- **Status implementasi:** **Sebagian / Rusak di UI (Endpoint `GET /api/sales` berjalan dan dipanggil saat `onMount`, namun ketidakcocokan nama properti pada pemetaan data di `penjualan/+page.svelte` menyebabkan kolom tabel `undefined`/`RpNaN`, status selalu `BELUM LUNAS`, dan fitur pencarian melempar runtime crash)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Halaman `/penjualan` dimuat (`onMount`, `L50-75`), atau pengguna memilih tab kanal (`SEMUA`, `UMUM`, `RESEP`, `GROSIR`, `TEMPO`, `DELIVERY`, `L192-294`), mengetik di kotak pencarian (`searchQuery`), mengklik tombol **Rincian Faktur** (`openDetail(trx)`, `L119-122, 439-446`), **Cetak Ulang Struk** (`L447-454, 591-598`), atau **Ekspor CSV** (`L138-145`).
  2. **State dan validasi di client:**
     - Pada `onMount` (`L51-67`), memanggil `api.erp.getSales(100)` dan memetakan setiap baris ke objek dengan properti:
       `{ id, invoiceNumber, transactionTime, customerName, customerType, transactionType, paymentMethod, totalAmount, status: "SUCCESS", cashierName: "Kasir Shift Pagi", items: [] }`.
     - **Ketidakcocokan Fatal di Template & `$derived` (`L104-116, 330-600`):**
       - Filter pencarian (`L104`) memanggil `item.invoiceNo.toLowerCase()` -> karena yang diset adalah `invoiceNumber` (bukan `invoiceNo`), `item.invoiceNo` bernilai `undefined` dan mengetik huruf apa pun di kotak pencarian langsung memicu **`TypeError: Cannot read properties of undefined (reading 'toLowerCase')`**!
       - Perhitungan `totalFilteredNominal` (`L116`) menjumlahkan `curr.grandTotal` (`undefined`, karena yang diset adalah `totalAmount`), menghasilkan **`RpNaN`** di header tabel (`L330`).
       - Baris tabel merender `{trx.invoiceNo}` (`undefined`, `L349`), `{trx.createdAt}` (`undefined`, `L355`), `{trx.cashierShift}` (`undefined`, `L356`), `{formatRupiah(trx.grandTotal)}` (`RpNaN`, `L422`), dan memeriksa `trx.paymentStatus === "PAID"` (`undefined`, sehingga **semua transaksi diberi badge merah `BELUM LUNAS`** di `L431`).
  3. **Client/service/API:** `api.erp.getSales(100)` (`apps/web/src/lib/services/api.ts:98-100`) -> `GET /api/sales?limit=100`.
  4. **Handler dan validasi server:** `erpRoutes` (`apps/backend/src/modules/erp/erp.routes.ts:86-114`) mengambil hingga `limit` baris dari `sales_transactions` diurutkan berdasarkan `createdAt DESC`.
  5. **Business logic/perhitungan/aturan status:** Server tidak melakukan JOIN ke `customers`, `users`, `cashier_shifts`, maupun `sales_transaction_items` pada `GET /api/sales` (`erp.routes.ts:89-109`).
  6. **Database:** Hanya membaca tabel `sales_transactions` (`erp.routes.ts:90-93`).
  7. **Respons dan efek ke UI:** Tabel merender baris sebanyak jumlah transaksi (maks 100), namun dengan nilai `undefined` / `RpNaN` pada kolom-kolom utama, dan modal rincian faktur selalu menampilkan daftar item kosong (`items: []`).
  8. **Efek samping/integrasi:** Tombol **Ekspor CSV** (`L140`) dan kedua tombol **Cetak Ulang Struk** (`L449, 594`) hanya memanggil `alert(...)` simulasi.
- **Jalur alternatif dan kegagalan:**
  - Tab filter `"TEMPO"` (`penjualan/+page.svelte:100`) memfilter `item.transactionType === "TEMPO"`, padahal `transactionType` diisi dari `s.customerType` (`"UMUM" | "MEMBER" | "RESEP" | "GROSIR" | "DELIVERY"`), sedangkan `"TEMPO"` adalah nilai dari `paymentMethod`.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketidakcocokan nama field hasil pemetaan `onMount` (`invoiceNumber`, `transactionTime`, `totalAmount`, `status`) vs nama field yang dibaca oleh filter dan template (`invoiceNo`, `createdAt`, `grandTotal`, `paymentStatus`, `subtotal`, `taxAmount`, `discountAmount`, `paidAmount`, `changeAmount`) di `apps/web/src/routes/penjualan/+page.svelte:54-66 vs 104-600`.
  - Ketiadaan pengambilan detail item (`sales_transaction_items`) dan nama pelanggan (`customers.name`) pada `GET /api/sales` (`apps/backend/src/modules/erp/erp.routes.ts:86-114`).
- **Bukti kode:** `apps/web/src/routes/penjualan/+page.svelte:36-122, 138-145, 325-610`, `apps/backend/src/modules/erp/erp.routes.ts:86-114`, `apps/web/src/lib/services/api.ts:98-100`.
- **Kesenjangan/pertanyaan terbuka:** Apakah `GET /api/sales/:id` perlu ditambahkan untuk memuat `sales_transaction_items` secara *on-demand* saat modal rincian nota dibuka?

---

### BF-017 — Penerbitan dan Pencetakan Surat Pesanan (SP / Purchase Order) ke PBF (`/pembelian` Tab SP)
- **Posisi dalam urutan bisnis:** 17 (Tahap awal pengadaan stok obat ke distributor PBF).
- **Tujuan dan aktor/role:** Membuat dokumen Surat Pesanan (SP Reguler, Prekursor, OOT, Psikotropika, Narkotika) ke PBF rekanan dan mencetak dokumen SP resmi 4 rangkap yang ditandatangani Apoteker Penanggung Jawab (APA). Aktor: Apoteker (`PHARMACIST`) / Staf Pengadaan (`INVENTORY`).
- **Pemicu dan prasyarat:** Pengguna membuka `/pembelian` (`apps/web/src/routes/pembelian/+page.svelte`), memilih tab **Surat Pesanan (SP Resmi)** (`activeTab === "sp"`, `L906-990`) atau menekan tombol **+ Buat Surat Pesanan (SP)** (`openAddSpModal`, `L552-571`), mengisi form di modal (`L1507-1673`), lalu menekan **Simpan & Terbitkan SP Resmi** (`handleCreateSp`, `L573-607`).
- **Status implementasi:** **Sebagian (Pembacaan daftar SP saat `onMount` memanggil `GET /api/purchase-orders`, dan endpoint `POST /api/purchase-orders` tersedia di backend, tetapi fungsi `handleCreateSp` di UI TIDAK memanggil API tersebut dan hanya menyimpan SP ke state lokal memori)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `/pembelian` dimuat (`onMount`, `L124-177`), memanggil `api.erp.getPurchaseOrders(100)` (`GET /api/purchase-orders?limit=100`) dan mengisi state `purchaseOrders` (`L145-156`).
     - Untuk membuat SP baru, pengguna membuka modal `isAddSpModalOpen`, memilih cabang, memilih PBF tujuan, memilih jenis SP (`REGULER | PREKURSOR | OOT | PSIKOTROPIKA | NARKOTIKA`), menambahkan daftar item obat beserta jumlah & satuan (`newSpItems`), lalu menekan submit (`handleCreateSp`, `L573-607`).
  2. **State dan validasi di client:** `handleCreateSp` (`L574-579`) memvalidasi `validItems.length > 0`, menghitung `estimatedTotal`, membuat nomor `SP-${prefix}-${YYYYMM}-${seq}` dengan tanggal hardcoded `orderDate: "2025-10-28"` (`L596`), lalu langsung melakukan `purchaseOrders = [createdSp, ...purchaseOrders]` di memori (`L605`).
  3. **Client/service/API:**
     - Read: `api.erp.getPurchaseOrders(100)` (`apps/web/src/lib/services/api.ts:104-106`) -> `GET /api/purchase-orders`.
     - Create: Meskipun `api.erp.createPurchaseOrder(payload)` (`api.ts:107-112` -> `POST /api/purchase-orders`) sudah ditulis, **`handleCreateSp` di `pembelian/+page.svelte:573-607` sama sekali tidak memanggilnya**!
  4. **Handler dan validasi server:**
     - `GET /api/purchase-orders` (`apps/backend/src/modules/erp/erp.routes.ts:166-209`): Mengambil `purchase_orders` LEFT JOIN `suppliers` dan `branches`, tetapi meng-hardcode `pharmacistName: "apt. Ghina Nadhifah, S.Farm."`, `sipa: "500.16.7.2/0289/SIPA/DPMPTSP/II/2026"`, dan `totalItems: 5` (`L200-202`) tanpa mengembalikan array `items`!
     - `POST /api/purchase-orders` (`erp.routes.ts:212-243`): Tanpa validasi TypeBox (`body: any`), menginsert header ke tabel `purchase_orders` dengan `status: "ORDERED"` dan menyimpan `orderType` di kolom `notes`.
  5. **Business logic/perhitungan/aturan status:** Status SP di UI memiliki nilai `"SENT" | "RECEIVED" | "CANCELLED"`, sedangkan default di backend adalah `"ORDERED"`.
  6. **Database:** Tabel `purchase_orders` (`packages/db/src/schema/procurement.ts:43-68`). **Catatan Skema:** Tidak ada tabel `purchase_order_items` di skema Drizzle untuk menyimpan rincian item obat yang dipesan dalam sebuah SP!
  7. **Respons dan efek ke UI:** SP baru tampil di tabel selama halaman belum di-refresh. Saat halaman di-refresh, SP baru hilang.
  8. **Efek samping/integrasi:** Klik tombol **Cetak SP** (`openPrintSpModal` di `L609-612`, tombol cetak di `L1722`) membuka pratinjau SP 4 rangkap dan memanggil `window.print()`. (Untuk SP yang dimuat dari `GET /api/purchase-orders`, karena `onMount` di `L155` memetakan `items: []`, cetakan SP untuk data dari DB akan memiliki tabel item kosong).
- **Jalur alternatif dan kegagalan:** Tidak ada pemanggilan API saat pembuatan SP.
- **Data dan aturan bisnis yang harus diaudit:**
  - `handleCreateSp` (`pembelian/+page.svelte:573-607`) yang tidak memanggil `api.erp.createPurchaseOrder`.
  - Ketiadaan tabel `purchase_order_items` di `packages/db/src/schema/procurement.ts` untuk menyimpan rincian obat pada SP.
  - Hardcode `totalItems: 5` dan `items: []` pada `GET /api/purchase-orders` (`erp.routes.ts:202` dan `pembelian/+page.svelte:155`).
- **Bukti kode:** `apps/web/src/routes/pembelian/+page.svelte:145-156, 552-612, 906-990, 1507-1733`, `apps/backend/src/modules/erp/erp.routes.ts:166-243`, `apps/web/src/lib/services/api.ts:104-112`, `packages/db/src/schema/procurement.ts:43-68`.
- **Kesenjangan/pertanyaan terbuka:** Regulasi BPOM mengharuskan SP Narkotika hanya memuat 1 item zat aktif Narkotika per lembar SP (`dokumen_plan.md` Bagian 10.7); validasi aturan ini belum ada di UI maupun backend.

---

### BF-018 — Penerimaan Barang & Input Faktur Pembelian PBF (`/pembelian` Tab Faktur)
- **Posisi dalam urutan bisnis:** 18 (Penerimaan fisik barang dari PBF, pencatatan batch/ED baru, penambahan stok gudang/depo, dan timbulnya hutang dagang AP).
- **Tujuan dan aktor/role:** Mencatat faktur pembelian dari distributor PBF (baik konversi dari SP maupun input langsung), mencatat nomor batch dan tanggal kedaluwarsa (ED) tiap item, menambah saldo stok cabang, dan mencatat kewajiban hutang jatuh tempo (TOP). Aktor: Staf Gudang (`INVENTORY`) / Apoteker (`PHARMACIST`) / Keuangan (`FINANCE`).
- **Pemicu dan prasyarat:** Pengguna membuka `/pembelian` tab **Faktur Pembelian PBF** (`activeTab === "faktur"`, `apps/web/src/routes/pembelian/+page.svelte:791-903`), mengklik **+ Input Faktur PBF Masuk** (`openAddInvoiceModal`, `L353-373`) atau mengklik **Terima Barang -> Faktur** dari baris SP (`openReceiveSpIntoInvoice`, `L433-455`), mengisi modal (`L1073-1348`), lalu menekan **Simpan Faktur & Tambah Stok** (`handleSaveNewInvoice`, `L387-431`).
- **Status implementasi:** **Sebagian (Read daftar faktur memanggil `GET /api/purchases`, tetapi penyimpanan faktur baru `handleSaveNewInvoice` 100% hanya mengubah state lokal di memori — TIDAK ada endpoint `POST /api/purchases`, TIDAK disimpan ke PostgreSQL, dan TIDAK menambah stok obat)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `onMount` (`pembelian/+page.svelte:124-177`), memanggil `api.erp.getPurchases(100)` (`GET /api/purchases?limit=100`) untuk menampilkan faktur yang ada di DB (hasil migrasi CSV).
     - Saat menginput faktur baru di modal `isAddInvoiceModalOpen`, pengguna mengisi PBF, cabang, nomor referensi faktur PBF (`newInvoiceSupplierRef`), tanggal terima, syarat bayar (`CREDIT_30`, `CREDIT_45`, `COD`), PPN (`newInvoiceTaxPercent`), serta baris item obat (`productId`, `batchNumber`, `expiryDate`, `qty`, `unit`, `buyPrice`, `discountPercent`), lalu menekan submit (`handleSaveNewInvoice`, `L387-431`).
  2. **State dan validasi di client:** Memvalidasi `newInvoiceSupplierRef.trim()` tidak kosong dan minimal 1 item memiliki `productId` & `qty > 0` (`L388-395`). Menghitung subtotal, diskon, PPN (`invoiceTaxAmount`), dan `invoiceGrandTotal` (`L290-306`).
  3. **Client/service/API:**
     - Read: `api.erp.getPurchases(100)` (`api.ts:101-103`) -> `GET /api/purchases`.
     - Create: **Tidak ada fungsi `createPurchase` di `api.ts` dan tidak ada pemanggilan API di `handleSaveNewInvoice` (`L387-431`)**.
  4. **Handler dan validasi server:** Hanya ada `GET /api/purchases` di `apps/backend/src/modules/erp/erp.routes.ts:117-163`. Tidak ada `POST /api/purchases`.
  5. **Business logic/perhitungan/aturan status:**
     - Di `handleSaveNewInvoice` (`L397-430`), membuat objek `PurchaseInvoiceRecord` lokal dengan `id: "inv-" + Date.now()`, `status: newInvoiceTerm === "COD" ? "PAID" : "UNPAID"`, mendorongnya ke array lokal `invoices`, dan jika terhubung ke nomor SP, mengubah status SP di array lokal `purchaseOrders` menjadi `"RECEIVED"`.
  6. **Database:**
     - Read (`GET /api/purchases`): Membaca `purchase_invoices` LEFT JOIN `suppliers` (`erp.routes.ts:120-141`).
     - Write: **Tidak menulis ke `purchase_invoices`, `purchase_invoice_items`, `product_batches`, `branch_stocks`, `branch_batch_stocks`, maupun `stock_ledger`!**
  7. **Respons dan efek ke UI:** Faktur baru muncul di tabel `/pembelian` selama halaman tidak di-refresh.
  8. **Efek samping/integrasi:** Jika pengguna mencoba membayar hutang atas faktur yang baru dibuat di sesi tersebut (`id: "inv-..."`), `POST /api/finance/debt-payments` akan gagal di PostgreSQL karena `inv-...` bukan UUID dan tidak ada di tabel `purchase_invoices`!
- **Jalur alternatif dan kegagalan:**
  - **Bug Pemetaan Cabang pada `onMount` (`pembelian/+page.svelte:158-175`):** Karena `GET /api/purchases` (`erp.routes.ts:121-134`) tidak mengembalikan `branchId` dan `supplierId`, `onMount` meng-hardcode semua faktur dari DB dengan `branchId: "1"`, `supplierId: "supp-1"`, dan `itemsCount: 1`. Akibatnya, jika pengguna memilih filter cabang selain `"1"` atau `"ALL"`, seluruh faktur dari database hilang dari tampilan!
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan endpoint `POST /api/purchases` untuk menyimpan `purchase_invoices` + `purchase_invoice_items`, membuat `product_batches`, mengupdate `branch_stocks` & `branch_batch_stocks`, dan menulis `PURCHASE_RECEIPT` ke `stock_ledger` dalam satu transaksi DB.
  - Ketiadaan kolom `branchId`, `supplierId`, dan jumlah item pada query `GET /api/purchases` (`erp.routes.ts:117-163`).
- **Bukti kode:** `apps/web/src/routes/pembelian/+page.svelte:124-177, 290-455, 791-903, 1073-1348`, `apps/backend/src/modules/erp/erp.routes.ts:117-163`, `packages/db/src/schema/procurement.ts:70-134`.
- **Kesenjangan/pertanyaan terbuka:** `dokumen_plan.md` Bagian 10.4 & 10.7 mewajibkan setiap penerimaan faktur PBF memperbarui HPP/harga beli batch (`branch_batch_stocks.buy_price`) dan menambah stok secara atomik; seluruh bagian tulis ini belum diimplementasikan di backend.

---

### BF-019 — Pelunasan Hutang Dagang Faktur PBF (`POST /api/finance/debt-payments`) dan Riwayat RLH
- **Posisi dalam urutan bisnis:** 19 (Penyelesaian kewajiban hutang usaha / *Accounts Payable* ke distributor PBF).
- **Tujuan dan aktor/role:** Mencatat pembayaran angsuran atau pelunasan penuh atas faktur pembelian PBF yang belum lunas, memperbarui sisa hutang faktur, dan melihat riwayat pelunasan hutang (RLH). Aktor: Keuangan (`FINANCE`) / Owner (`OWNER`) / Admin (`SUPERADMIN`).
- **Pemicu dan prasyarat:** Di `/pembelian` tab **Faktur Pembelian PBF** (`apps/web/src/routes/pembelian/+page.svelte:791-903`), pengguna mengklik tombol **Bayar** pada faktur yang belum lunas (`openDebtPayment(inv)`, `L476-480`) -> mengisi nominal & metode bayar di modal (`L1422-1504`) -> menekan **Konfirmasi Pembayaran** (`handleSavePayment`, `L482-549`); atau mengklik tombol **Detail & RLH** (`openInvoiceDetail(inv)`, `L457-474`).
- **Status implementasi:** **Berjalan** (tersambung penuh ke `POST /api/finance/debt-payments`, `GET /api/finance/debt-payments`, dan `GET /api/finance/debt-summary`).
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Pengguna membuka modal pembayaran hutang (`isPayDebtModalOpen`), memasukkan `paymentAmountInput`, memilih metode (`TRANSFER_BCA`, `TRANSFER_MANDIRI`, `GIRO`, `CASH`), mengisi catatan referensi (`paymentRefInput`), dan menekan submit (`handleSavePayment`, `L482-549`).
  2. **State dan validasi di client:** Memvalidasi `selectedInvoiceForPay` ada dan `paymentAmountInput > 0` (`L483`).
  3. **Client/service/API:**
     - Catat pembayaran: `api.finance.recordDebtPayment(...)` (`apps/web/src/lib/services/api.ts:265-279`) -> `POST /api/finance/debt-payments`.
     - Lihat riwayat RLH per faktur: `api.finance.getDebtPayments({ invoiceId: inv.id })` (`api.ts:253-260`) -> `GET /api/finance/debt-payments?invoice_id=...`.
  4. **Handler dan validasi server:** `financeRoutes` (`apps/backend/src/modules/finance/finance.routes.ts:11-62, 144-182`) memvalidasi body (`purchaseInvoiceId: t.String()`, `amountPaid: t.Number({ minimum: 1 })`, `paymentMethod: t.String()`) dan memanggil `financeService` (`apps/backend/src/modules/finance/finance.service.ts:24-203`).
  5. **Business logic/perhitungan/aturan status:**
     - `recordDebtPayment` (`finance.service.ts:24-120`) mengambil baris `purchase_invoices` berdasarkan `purchaseInvoiceId` (`L27-45`).
     - Menghitung `newPaidAmount = currentPaid + paymentAmount` dan `isPaidOff = newPaidAmount >= grandTotal` (`L55-56`).
     - Membentuk nomor bukti `RLH-${YYYYMMDD}-${random3Digit}` (`L62-64`).
     - Menginsert baris baru ke `debt_payments` (`L71-85`), lalu mengupdate `purchase_invoices` (`paidAmount = String(newPaidAmount)`, `isPaidOff`, `L88-94`).
  6. **Database:** Membaca `tenants`, `purchase_invoices`, `suppliers`, `branches`; menginsert ke `debt_payments`; mengupdate `purchase_invoices`.
  7. **Respons dan efek ke UI:** Setelah POST berhasil, `handleSavePayment` memanggil ulang `api.erp.getPurchases(100)` (`pembelian/+page.svelte:501-520`) dan memperbarui status faktur (`PAID` / `PARTIAL`) di tabel.
  8. **Efek samping/integrasi:** Nilai `totalRemainingDebt` dari `financeService.getDebtSummary()` juga ikut disertakan dalam respons `GET /api/finance/cashflow` (`finance.routes.ts:69, 128`).
- **Jalur alternatif dan kegagalan:**
  - Jika `recordDebtPayment` gagal (misalnya karena faktur dibuat secara lokal dengan ID `"inv-..."`), blok `catch` di `pembelian/+page.svelte:523` hanya melakukan `console.warn` dan tetap melakukan update optimistik di memori lokal (`L526-545`), sehingga pengguna mengira pembayaran sudah tersimpan di server!
- **Data dan aturan bisnis yang harus diaudit:**
  - **Tidak Ada Validasi Kelebihan Bayar (*Overpayment*) di Server (`finance.service.ts:47-56`):** Server tidak menolak jika `paymentAmount > (grandTotal - currentPaid)`, sehingga `paidAmount` di `purchase_invoices` dapat melebihi `grandTotal`.
  - **Tidak Ada `db.transaction` (`finance.service.ts:71-94`):** Insert ke `debt_payments` dan update ke `purchase_invoices` dieksekusi terpisah tanpa transaksi atomik.
  - **Inkonsistensi Halaman `/supplier` Tab Buku Hutang (`supplier/+page.svelte:51-59, 250-305`):** Halaman `/supplier` memiliki tab dan modal pelunasan hutang PBF sendiri yang memakai data statis hardcoded dan tidak terhubung ke `/api/finance/debt-payments`.
- **Bukti kode:** `apps/backend/src/modules/finance/finance.routes.ts:11-62, 144-182`, `apps/backend/src/modules/finance/finance.service.ts:24-203`, `apps/web/src/routes/pembelian/+page.svelte:457-549, 1351-1504`, `apps/web/src/lib/services/api.ts:253-279`.
- **Kesenjangan/pertanyaan terbuka:** Apakah pembayaran hutang PBF secara tunai/transfer seharusnya otomatis mengurangi saldo kas/bank pada halaman `/keuangan`?

---

### BF-020 — Penerimaan dan Penyelesaian Bagi Hasil Barang Konsinyasi (`/pembelian` Tab Konsinyasi)
- **Posisi dalam urutan bisnis:** 20 (Pengelolaan barang titipan supplier/mitra tanpa hutang awal hingga barang terjual).
- **Tujuan dan aktor/role:** Mencatat penerimaan produk titipan (konsinyasi) dari pemilik barang dan melakukan perhitungan/setoran bagi hasil atas unit konsinyasi yang terjual. Aktor: Staf Gudang (`INVENTORY`) / Keuangan (`FINANCE`).
- **Pemicu dan prasyarat:** Pengguna membuka `/pembelian` tab **Konsinyasi Masuk (Titipan)** (`activeTab === "konsinyasi"`, `apps/web/src/routes/pembelian/+page.svelte:993-1069`), menekan **+ Terima Barang Konsinyasi** (`openAddKsnModal`, `L647-657` -> `handleCreateConsignment`, `L625-645`) atau menekan **Setor Bagi Hasil** (`openSettleConsignment`, `L610-613` -> `handleConfirmSettleKsn`, `L614-623`).
- **Status implementasi:** **Mock atau simulasi / Belum tersambung (Tabel database `consignment_*` sudah ada di skema Drizzle, tetapi 0 endpoint API di backend; seluruh aksi di UI hanya memutasi array lokal `consignments` di memori)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Mengisi form penerimaan konsinyasi (`isAddKsnModalOpen`, `L1804-1898`) atau modal setoran bagi hasil (`isSettleKsnModalOpen`, `L1736-1801`).
  2. **State dan validasi di client:** `handleCreateConsignment` (`L625-645`) memvalidasi `newKsnPartner`, `newKsnProduct`, dan `newKsnReceivedQty > 0`, lalu menambahkan objek `ConsignmentRecord` (`id: "ksn-" + Date.now()`, `receivedDate: "2025-10-28"`) ke array lokal `consignments`. `handleConfirmSettleKsn` (`L614-623`) mengubah `status: "SETTLED"` di memori.
  3. **Client/service/API:** Tidak ada metode API konsinyasi di `apps/web/src/lib/services/api.ts`.
  4. **Handler dan validasi server:** Tidak ada route konsinyasi di `apps/backend`.
  5. **Business logic/perhitungan/aturan status:** Tagihan konsinyasi dihitung di UI sebagai `soldQty * netPrice` (`L1034, 1766`).
  6. **Database:** Empat tabel di `packages/db/src/schema/procurement.ts:163-266` (`consignment_receipts`, `consignment_receipt_items`, `consignment_settlements`, `consignment_settlement_items`) **sama sekali tidak pernah diakses oleh kode mana pun**.
  7. **Respons dan efek ke UI:** Data konsinyasi awalnya kosong (`[]` di `L111`) dan setiap item yang diinput hilang saat halaman di-refresh.
  8. **Efek samping/integrasi:** Tidak menambah stok obat di katalog/POS.
- **Jalur alternatif dan kegagalan:** Tidak ada.
- **Data dan aturan bisnis yang harus diaudit:**
  - Keempat tabel konsinyasi (`consignment_receipts`, `consignment_receipt_items`, `consignment_settlements`, `consignment_settlement_items`) di `packages/db/src/schema/procurement.ts:163-266` yang belum memiliki implementasi backend sesuai kontrak `dokumen_plan.md` Bagian 2.3 & 10.9.
- **Bukti kode:** `apps/web/src/routes/pembelian/+page.svelte:111, 610-657, 993-1069, 1736-1898`, `packages/db/src/schema/procurement.ts:163-266`.
- **Kesenjangan/pertanyaan terbuka:** `dokumen_plan.md` Bagian 2.3 mensyaratkan endpoint `POST /api/procurement/consignment/receive` dan `POST /api/procurement/consignment/settle`; keduanya belum dibuat.

---

### BF-021 — Pengiriman / Mutasi Stok Antar Cabang (RKB) dan Verifikasi Penerimaan Cabang Tujuan (RTB) (`/pengiriman`)
- **Posisi dalam urutan bisnis:** 21 (Distribusi dan pemerataan persediaan antar cabang apotek).
- **Tujuan dan aktor/role:** Menerbitkan Surat Jalan pengiriman mutasi stok dari cabang asal ke cabang tujuan (`RKB`), memberangkatkan kurir (`IN_TRANSIT`), serta memverifikasi kuantitas fisik yang diterima di cabang tujuan (`RTB` — cocok penuh `RECEIVED` atau selisih `RECEIVED_DISCREPANCY`). Aktor: Staf Gudang (`INVENTORY`) / Apoteker (`PHARMACIST`).
- **Pemicu dan prasyarat:** Pengguna membuka `/pengiriman` (`apps/web/src/routes/pengiriman/+page.svelte:1-1189`).
- **Status implementasi:** **Sebagian (Terhubung penuh ke `/api/inventory/transfers/*` dan menulis ke `stock_transfers`, `stock_transfer_items`, serta `stock_ledger`, TETAPI backend sama sekali tidak memotong `branch_stocks`/`branch_batch_stocks` di cabang asal dan tidak menambah `branch_stocks`/`branch_batch_stocks` di cabang tujuan)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `onMount` (`pengiriman/+page.svelte:75-105`), memanggil `api.transfer.list()` (`GET /api/inventory/transfers`).
     - **Aksi 1 — Buat Surat Jalan Baru (`submitNewTransfer`, `L274-334`):** Pengguna membuka modal `isAddTransferModalOpen` (`L740-948`), memilih cabang asal (`sourceBranchId`), cabang tujuan (`destBranchId`), kurir, menambahkan item obat + batch + jumlah, lalu menekan **Terbitkan Surat Jalan & Kirim** (`L940`).
     - **Aksi 2 — Berangkatkan Permintaan (`dispatchRequestedTransfer`, `L337-349`):** Pada dokumen berstatus `REQUESTED`, menekan tombol **Kirim Barang** (`L713`).
     - **Aksi 3 — Terima & Verifikasi Barang (`submitReceiveVerification`, `L382-450`):** Pada dokumen berstatus `IN_TRANSIT`, menekan **Terima Barang** (`openReceiveModal`, `L368-380`), mengisi jumlah fisik diterima (`qtyReceived`) dan alasan selisih di modal `isReceiveModalOpen` (`L953-1080`), lalu menekan **Konfirmasi Penerimaan & Tambah Stok** (`L1068`).
  2. **State dan validasi di client:** `submitNewTransfer` memvalidasi `sourceBranchId !== destBranchId` dan `items.length > 0` (`L275-282`).
  3. **Client/service/API:**
     - `api.transfer.list()` -> `GET /api/inventory/transfers` (`api.ts:226-232`)
     - `api.transfer.create()` -> `POST /api/inventory/transfers` (`api.ts:233-238`)
     - `api.transfer.dispatch()` -> `POST /api/inventory/transfers/:id/dispatch` (`api.ts:245-250`)
     - `api.transfer.receive()` -> `POST /api/inventory/transfers/:id/receive` (`api.ts:239-244`)
  4. **Handler dan validasi server:** `transferRoutes` (`apps/backend/src/modules/inventory/transfer.routes.ts:1-139`) memvalidasi parameter & body dengan TypeBox dan memanggil `transferService` (`apps/backend/src/modules/inventory/transfer.service.ts:116-459`).
  5. **Business logic/perhitungan/aturan status:**
     - **Create (`transfer.service.ts:225-347`):** Memastikan `fromBranchId !== toBranchId`, mengambil/membuat lokasi default `DEPO-UTAMA` (`getDefaultLocation`, `L46-81`), membuat nomor `RKB-${YYYYMMDD}-${random3Digit}`, menginsert `stock_transfers`, mencari/membuat `product_batches` (`getOrCreateBatch`, `L83-114`), menginsert `stock_transfer_items` (`qtySentBase = String(qtySent)`), dan menginsert `stock_ledger` (`mutationType: "TRANSFER_OUT"`, `quantityBase: String(-qtySent)`).
     - **Dispatch (`transfer.service.ts:443-459`):** Mengupdate `stock_transfers.status = "IN_TRANSIT"`, `shippedAt = new Date()`.
     - **Receive (`transfer.service.ts:349-441`):** Menolak jika status sudah `RECEIVED` / `RECEIVED_DISCREPANCY` (`L360-366`). Untuk tiap item, menghitung `diff = recQty - sentQty`, mengupdate `stock_transfer_items` (`qtyReceivedBase`, `discrepancyQtyBase`, `discrepancyReason`), menginsert `stock_ledger` (`mutationType: "TRANSFER_IN"`, `quantityBase: String(recQty)` ke cabang tujuan), dan mengupdate `stock_transfers.status` menjadi `"RECEIVED_DISCREPANCY"` (jika ada `diff !== 0`) atau `"RECEIVED"`.
  6. **Database:**
     - Dibaca & Ditulis: `stock_transfers`, `stock_transfer_items`, `inventory_locations`, `product_batches`, `stock_ledger`.
     - **TIDAK DISENTUH:** `branch_stocks` dan `branch_batch_stocks`!
  7. **Respons dan efek ke UI:** Memperbarui daftar `transfers` dan menampilkan banner notifikasi (`notificationBanner`).
  8. **Efek samping/integrasi:** Modal detail surat jalan (`isDetailModalOpen`, `L1085-1189`) menyediakan tombol **Cetak Surat Jalan** (`window.print()`, `L1180`).
- **Jalur alternatif dan kegagalan:**
  - Jika API gagal saat buat/terima transfer, blok `catch` di `pengiriman/+page.svelte:304-329, 427-446` memutasi array `transfers` secara lokal di memori.
- **Data dan aturan bisnis yang harus diaudit:**
  - **Pelanggaran Invariant Stok (`transfer.service.ts:263-307, 378-414`):** `createTransfer` dan `receiveTransfer` mencatat mutasi di `stock_ledger`, tetapi **tidak pernah mengurangi atau menambah `branch_stocks` dan `branch_batch_stocks`**, sehingga saldo stok yang tampil di POS dan halaman `/stok` tidak pernah berubah akibat mutasi antar cabang!
  - **Mutasi `TRANSFER_OUT` Dicatat Saat Status `REQUESTED` (`transfer.service.ts:240, 287-301`):** Jika transfer dibuat dengan `status: "REQUESTED"`, `createTransfer` langsung menulis `TRANSFER_OUT` ke `stock_ledger` sebelum barang dikirim.
  - **Pengabaian Konversi Satuan (`transfer.service.ts:271, 279`):** `qtySentBase` langsung diisi dengan `it.qty` tanpa dikalikan `product_units.conversion_factor`.
  - **Status `REQUESTED` Tidak Dapat Dibuat dari UI (`pengiriman/+page.svelte:286`):** `submitNewTransfer` selalu mengirim `status: "IN_TRANSIT"`, sehingga tab *Permintaan Mutasi* (`requested`) tidak dapat diisi dari UI.
- **Bukti kode:** `apps/backend/src/modules/inventory/transfer.routes.ts:1-139`, `apps/backend/src/modules/inventory/transfer.service.ts:1-462`, `apps/web/src/routes/pengiriman/+page.svelte:1-1189`, `apps/web/src/lib/services/api.ts:226-250`.
- **Kesenjangan/pertanyaan terbuka:** Ketika terjadi selisih pengiriman (`RECEIVED_DISCREPANCY`, misalnya dikirim 10 tetapi diterima 8), apakah selisih 2 unit harus otomatis dicatat sebagai kerugian/klaim kurir pada buku besar?

---

### BF-022 — Retur Penjualan Pelanggan dan Retur Pembelian ke Distributor PBF (`/retur`)
- **Posisi dalam urutan bisnis:** 22 (Penanganan pengembalian barang dari pasien/pelanggan maupun pengembalian barang rusak/ED ke PBF).
- **Tujuan dan aktor/role:** Mencatat retur penjualan dari pelanggan (kondisi `LAYAK_JUAL` atau `KARANTINA`, kompensasi `REFUND_TUNAI` atau `TUKAR_BARANG`) dan retur pembelian ke PBF (penyelesaian `NOTA_KREDIT` atau `TUKAR_BATCH`), serta menyelesaikan klaim retur PBF saat Nota Kredit (CN) diterima. Aktor: Kasir/Apoteker/Gudang.
- **Pemicu dan prasyarat:** Pengguna membuka `/retur` (`apps/web/src/routes/retur/+page.svelte:1-1200`), memilih tab **Retur Penjualan** (`penjualan`) atau **Retur Pembelian** (`pembelian`), menekan **+ Buat Pengajuan Retur** (`openAddReturModal`, `L219-246`), mengisi form di modal (`L737-994`), lalu menekan **Simpan & Eksekusi Retur** (`handleSaveNewRetur`, `L248-357`).
- **Status implementasi:** **Sebagian / Volatile di Server (Endpoint `/api/returns/*` terhubung ke UI dan menulis baris `ADJUSTMENT` ke `stock_ledger`, TETAPI dokumen retur hanya disimpan di variabel array RAM `ReturnsService` yang hilang saat server restart, dan tidak pernah memperbarui `branch_stocks`, `branch_batch_stocks`, maupun saldo hutang `purchase_invoices`)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `onMount` (`retur/+page.svelte:117-155`), memanggil `api.returns.getCustomerReturns()`, `api.returns.getSupplierReturns()`, `api.erp.getSuppliers()`, `mockApi.getProducts()`, `mockApi.getCustomers()`, `mockApi.getBranches()`.
     - **Aksi 1 — Buat Retur (`handleSaveNewRetur`, `L248-357`):** Memilih kategori `PENJUALAN` atau `PEMBELIAN`, memilih produk, jumlah, disposisi stok / jenis penyelesaian, dan alasan, lalu menekan submit.
     - **Aksi 2 — Setujui Retur Pelanggan (`approveCustomerReturn`, `L359-363`):** Mengklik tombol setujui di baris tabel (hanya mengubah state lokal).
     - **Aksi 3 — Selesaikan Klaim Retur PBF (`handleConfirmResolvePbf`, `L372-395`):** Membuka modal `isResolvePbfModalOpen` (`L997-1074`), memasukkan nomor Nota Kredit (`resolveCreditNoteNo`), dan menekan **Konfirmasi Klaim Selesai** (`L1066`).
  2. **State dan validasi di client:** `handleSaveNewRetur` (`L249-252`) memvalidasi `productId` dan `qty > 0`.
  3. **Client/service/API:**
     - `api.returns.getCustomerReturns()` -> `GET /api/returns/customer` (`api.ts:294-300`)
     - `api.returns.createCustomerReturn()` -> `POST /api/returns/customer` (`api.ts:301-320`)
     - `api.returns.getSupplierReturns()` -> `GET /api/returns/supplier` (`api.ts:321-327`)
     - `api.returns.createSupplierReturn()` -> `POST /api/returns/supplier` (`api.ts:328-346`)
     - `api.returns.resolveSupplierReturn()` -> `POST /api/returns/supplier/:id/resolve` (`api.ts:347-352`)
  4. **Handler dan validasi server:** `returnsRoutes` (`apps/backend/src/modules/returns/returns.routes.ts:1-170`) memvalidasi payload dengan TypeBox dan memanggil `returnsService` (`apps/backend/src/modules/returns/returns.service.ts:63-263`).
  5. **Business logic/perhitungan/aturan status:**
     - **Retur Pelanggan (`returns.service.ts:63-148`):** Membuat nomor `RET-JL-${YYYYMMDD}-${random3Digit}`. Jika `stockDisposition === "LAYAK_JUAL"`, mencari `productId` di `products` dan menginsert baris `ADJUSTMENT` positif (`+qty`) ke `stock_ledger` (`L79-119`). Menyimpan objek retur ke array memori `this.customerReturnsList` (`L141`).
     - **Retur Supplier (`returns.service.ts:150-231`):** Membuat nomor `RET-BL-${YYYYMMDD}-${random3Digit}`, menginsert baris `ADJUSTMENT` negatif (`-qty`) ke `stock_ledger` (`L165-203`), dan menyimpan objek retur ke array memori `this.supplierReturnsList` (`L224`).
     - **Resolve Retur Supplier (`returns.service.ts:249-263`):** Mencari item di `this.supplierReturnsList` dan mengubah `item.status = "RESOLVED"`.
  6. **Database:**
     - Dibaca: `tenants`, `branches`, `inventory_locations`, `products`.
     - Ditulis: Hanya `stock_ledger` (1 baris `ADJUSTMENT`). **Tidak ada tabel `customer_returns` atau `supplier_returns` di PostgreSQL**, dan **tidak mengupdate `branch_stocks`, `branch_batch_stocks`, maupun `purchase_invoices`**.
  7. **Respons dan efek ke UI:** Menampilkan item retur di tabel `/retur`.
  8. **Efek samping/integrasi:** Modal cetak nota retur (`isDetailModalOpen`, `L1077-1200`) memanggil `window.print()` (`L1189`).
- **Jalur alternatif dan kegagalan:**
  - **Dropdown Faktur PBF Referensi Selalu Kosong (`retur/+page.svelte:72, 827-838`):** Variabel `let purchaseInvoices = $state<any[]>([])` dideklarasikan di baris 72 tetapi **tidak pernah diisi di `onMount`**, sehingga dropdown *"No. Faktur PBF Referensi"* pada pembuatan retur pembelian selalu kosong!
- **Data dan aturan bisnis yang harus diaudit:**
  - Penyimpanan data retur di RAM proses backend (`this.customerReturnsList` & `this.supplierReturnsList` di `returns.service.ts:39-40`) yang hilang setiap kali backend direstart.
  - Tidak diperbaruinya `branch_stocks` dan `branch_batch_stocks` saat retur masuk/keluar (`returns.service.ts:103, 188`).
  - Tidak terhubungnya penyelesaian Nota Kredit PBF (`resolveSupplierReturn`) dengan pengurangan hutang di `purchase_invoices`.
- **Bukti kode:** `apps/backend/src/modules/returns/returns.routes.ts:1-170`, `apps/backend/src/modules/returns/returns.service.ts:1-266`, `apps/web/src/routes/retur/+page.svelte:72, 117-401, 737-1200`.
- **Kesenjangan/pertanyaan terbuka:** Apakah retur pelanggan dan retur supplier perlu dibuatkan tabel khusus di skema Drizzle atau disimpan di `stock_adjustments` + `stock_adjustment_items`?

---

### BF-023 — Stok Opname Fisik, Penyesuaian Selisih, Kartu Stok, dan Peringatan ED & Defekta (`/stok`)
- **Posisi dalam urutan bisnis:** 23 (Pengendalian mutu persediaan, rekonsiliasi fisik stok opname, audit mutasi kartu stok, dan pemantauan obat mendekati kedaluwarsa / stok menipis).
- **Tujuan dan aktor/role:** Melakukan stok opname fisik (mode satuan maupun mode lembar kerja massal / *worksheet*), menelusuri buku besar mutasi keluar/masuk per obat (*Kartu Stok*), melihat riwayat koreksi opname, dan memantau daftar obat defekta (stok < minimum) serta mendekati tanggal kedaluwarsa (ED 30/60/90 hari). Aktor: Apoteker (`PHARMACIST`) / Staf Gudang (`INVENTORY`).
- **Pemicu dan prasyarat:** Pengguna membuka `/stok` (`apps/web/src/routes/stok/+page.svelte:1-2137`) pada tab **Kartu Stok** (`kartu_stok`), **Riwayat Opname** (`riwayat_opname`), **Peringatan ED & Defekta** (`ed_defekta`), atau menekan tombol **Mulai Stok Opname** (`openOpnameModal`, `L492-542`).
- **Status implementasi:** **Mock atau simulasi di Client (Tabel `stock_adjustments`, `stock_adjustment_items`, dan `stock_ledger` ada di PostgreSQL, namun belum ada endpoint API untuk opname maupun pembacaan kartu stok; seluruh opname, riwayat opname, dan kartu stok di `/stok` hanya beroperasi pada array lokal di memori browser)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - **Stok Opname (`isOpnameModalOpen`, `stok/+page.svelte:1638-1954`):** Pengguna memilih mode *Opname Satuan (Per Batch)* (`single`) atau *Lembar Kerja Massal (Worksheet)* (`worksheet`), memasukkan stok fisik aktual (`actualQty` / `actualStockInput`), memilih alasan koreksi, lalu menekan **Simpan & Sesuaikan Stok** (`submitStockOpname`, `L576-734`).
     - **Kartu Stok (`activeTab === "kartu_stok"`, `L1246-1413`):** Memilih obat, tipe mutasi, dan rentang tanggal untuk melihat mutasi masuk/keluar/saldo.
     - **Riwayat Opname (`activeTab === "riwayat_opname"`, `L1418-1557`):** Melihat daftar berita acara opname (`RJK-...`).
     - **ED & Defekta (`activeTab === "ed_defekta"`, `L1562-1632`):** Melihat tabel obat stok menipis (`lowStockProducts`) dan batch mendekati ED (`expiringBatches`).
  2. **State dan validasi di client:**
     - `submitStockOpname` (`L576-734`) menghitung `diff = actualQty - systemQty`, mengubah `batch.stock = actualQty` langsung pada array `products` di memori, menambahkan berita acara `RJK-202510-...` ke array `opnameHistory` di memori, dan menambahkan baris mutasi `OPNAME` ke array `ledgerEntries` di memori.
     - Perhitungan `expiringBatches` (`L454-469`) membandingkan `batch.expiryDate` terhadap **tanggal referensi yang di-hardcode `new Date("2025-10-27")`** (`L464`), bukan tanggal hari ini (`new Date()`)!
     - Perhitungan `lowStockProducts` (`L471-476`) menggunakan ambang batas statis `totalStock < 50` (mengabaikan field `minStock` masing-masing produk!).
  3. **Client/service/API:** Tidak ada pemanggilan API untuk opname, kartu stok, maupun riwayat opname.
  4. **Handler dan validasi server:** Tidak ada endpoint untuk `stock_adjustments` maupun pembacaan `stock_ledger` di `apps/backend`.
  5. **Business logic/perhitungan/aturan status:** Seluruh mutasi opname hanya terjadi di RAM browser dan hilang saat halaman di-refresh.
  6. **Database:** Tabel PostgreSQL `stock_adjustments` dan `stock_adjustment_items` (`packages/db/src/schema/inventory.ts:162-209`) **tidak pernah diakses sama sekali di kode backend**; tabel `stock_ledger` (`L72-98`) hanya pernah di-`INSERT` tetapi **tidak pernah di-`SELECT`** oleh endpoint mana pun.
  7. **Respons dan efek ke UI:** Tabel katalog, kartu stok, dan riwayat opname terupdate secara reaktif di memori browser selama sesi halaman berlangsung.
  8. **Efek samping/integrasi:** Tombol **Buat SP Defekta** atau aksi di tab ED/Defekta mengarahkan pengguna ke halaman terkait.
- **Jalur alternatif dan kegagalan:** Semua data kartu stok awal (`ledgerEntries`, `L172-248`) dan riwayat opname awal (`opnameHistory`, `L251-332`) adalah data statis hardcoded bulan Oktober 2025.
- **Data dan aturan bisnis yang harus diaudit:**
  - Ketiadaan endpoint `POST /api/inventory/adjustments`, `GET /api/inventory/adjustments`, dan `GET /api/inventory/ledger` di `apps/backend`.
  - Penggunaan tanggal statis `new Date("2025-10-27")` pada kalkulasi peringatan ED di `apps/web/src/routes/stok/+page.svelte:464`.
  - Penggunaan angka statis `< 50` alih-alih `product.minStock` pada penentuan defekta di `stok/+page.svelte:474`.
- **Bukti kode:** `apps/web/src/routes/stok/+page.svelte:172-384, 454-734, 1246-1954`, `packages/db/src/schema/inventory.ts:72-98, 162-209`.
- **Kesenjangan/pertanyaan terbuka:** `dokumen_plan.md` Bagian 10.8 mendefinisikan `stock_adjustments` dan `stock_adjustment_items` dengan persetujuan APA (`approved_by`); alur backend-nya belum diimplementasikan.

---

### BF-024 — Pencatatan Buku Kas Harian, Biaya Operasional (Petty Cash), dan Penarikan Dana (Payout) QRIS (`/keuangan`)
- **Posisi dalam urutan bisnis:** 24 (Manajemen arus kas masuk/keluar harian, pengeluaran operasional apotek, dan pencairan saldo non-tunai).
- **Tujuan dan aktor/role:** Memantau saldo kas laci kasir, rekening bank (BCA/Mandiri), saldo tertahan QRIS, mencatat pengeluaran kas kecil (*petty cash* / operasional) atau kas masuk non-penjualan, serta mencairkan (*settlement/payout*) dana QRIS ke rekening bank. Aktor: Keuangan (`FINANCE`) / Owner (`OWNER`).
- **Pemicu dan prasyarat:** Pengguna membuka `/keuangan` (`apps/web/src/routes/keuangan/+page.svelte:1-1035`) pada tab **Buku Kas & Mutasi Harian** (`buku_kas`), menekan **+ Catat Kas Keluar / Masuk** (`isAddExpenseModalOpen`, `L738-868` -> `handleSaveExpense`, `L336-365`) atau **Tarik Dana QRIS** (`isPayoutModalOpen`, `L965-1035` -> `handlePayoutSubmit`, `L367-395`).
- **Status implementasi:** **Mock atau simulasi (Endpoint `GET /api/finance/cashflow` di backend mengembalikan angka dan array transaksi yang 100% di-hardcode kecuali `totalDebt`, sementara pencatatan kas kecil dan penarikan QRIS hanya memutasi state lokal di memori browser)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `onMount` (`keuangan/+page.svelte:227-271`), memanggil `api.finance.getCashflow()` (`GET /api/finance/cashflow`) dan `api.shift.list()` (`GET /api/shifts`).
     - Untuk mencatat mutasi kas (`handleSaveExpense`, `L336-365`), pengguna memilih tipe (`OUT` / `IN`), kategori, metode akun (`CASH` / `TRANSFER_BCA` / `TRANSFER_MANDIRI`), nominal, dan deskripsi di modal, lalu menekan **Simpan Mutasi Kas** (`L859`).
     - Untuk mencairkan saldo QRIS (`handlePayoutSubmit`, `L367-395`), pengguna memasukkan `payoutAmount` di modal dan menekan **Tarik Dana Sekarang** (`L1026`).
  2. **State dan validasi di client:** `handleSaveExpense` memvalidasi `amount > 0` dan `description.trim()` (`L337`). `handlePayoutSubmit` memvalidasi `payoutAmount > 0 && payoutAmount <= qrisBalance` (`L368`).
  3. **Client/service/API:**
     - Read: `api.finance.getCashflow()` (`apps/web/src/lib/services/api.ts:280-282`) -> `GET /api/finance/cashflow`.
     - Write: Tidak ada pemanggilan API pada `handleSaveExpense` maupun `handlePayoutSubmit`.
  4. **Handler dan validasi server:** `GET /api/finance/cashflow` (`apps/backend/src/modules/finance/finance.routes.ts:66-142`) memanggil `financeService.getDebtSummary()` untuk `totalDebt`, namun **meng-hardcode `kasLaci = 15850000`, `bcaBalance = 142500000`, `mandiriBalance = 68750000`, dan 4 item array `entries` (`cf-1` s/d `cf-4`)** (`L72-119`)!
  5. **Business logic/perhitungan/aturan status:**
     - Di `keuangan/+page.svelte:252-267`, keempat entri dari `/api/finance/cashflow` dipetakan dengan nilai hardcoded `branchId: "1"`, `branchName: "Apotek Hafidz Farma 1"`, `balance: 5000000`, dan `operator: "Sistem Keuangan"`.
     - `handleSaveExpense` dan `handlePayoutSubmit` menyisipkan objek baru dengan tanggal hardcoded `"2025-10-28 11:30"` / `"2025-10-28 11:40"` ke state lokal `cashEntries`.
  6. **Database:** Hanya membaca `purchase_invoices` (melalui `getDebtSummary` di dalam `/api/finance/cashflow`). Tidak ada tabel buku kas / jurnal umum / pengeluaran operasional di skema Drizzle (`packages/db/src/schema/`).
  7. **Respons dan efek ke UI:** Mutasi kas baru dan pengurangan `qrisBalance` tampil di layar sampai halaman di-refresh.
  8. **Efek samping/integrasi:** Simulasi `setTimeout` 1,5 detik pada penarikan QRIS (`L390-394`).
- **Jalur alternatif dan kegagalan:** Memilih cabang selain `"1"` atau `"ALL"` pada filter cabang di `/keuangan` akan mengosongkan seluruh tabel Buku Kas karena `branchId` hasil pemetaan `onMount` di-hardcode ke `"1"` (`L255`).
- **Data dan aturan bisnis yang harus diaudit:**
  - Data hardcoded di `apps/backend/src/modules/finance/finance.routes.ts:72-119`.
  - Ketiadaan tabel database dan endpoint API untuk pencatatan biaya operasional / mutasi kas harian (yang berdampak pula pada estimasi biaya operasional di laporan laba rugi `BF-026`).
- **Bukti kode:** `apps/backend/src/modules/finance/finance.routes.ts:65-142`, `apps/web/src/routes/keuangan/+page.svelte:79-156, 217-395, 587-647, 738-868, 965-1035`.
- **Kesenjangan/pertanyaan terbuka:** Apakah buku kas harian akan disimpan pada tabel khusus `cash_ledger` / `expenses` atau dihitung dari gabungan `cashier_shifts`, `sales_transactions`, dan `debt_payments`?

---

### BF-025 — Ringkasan Eksekutif & Statistik Dashboard Utama (`/`)
- **Posisi dalam urutan bisnis:** 25 (Pemantauan ikhtisar operasional harian oleh manajemen/staf).
- **Tujuan dan aktor/role:** Menampilkan kartu KPI utama (Penjualan Hari Ini, Total Transaksi, Stok Menipis, Pelanggan), grafik tren penjualan 7 hari, tabel 5 transaksi terbaru, tabel obat stok menipis, dan kartu notifikasi sistem. Aktor: Semua staf selain `GUEST`.
- **Pemicu dan prasyarat:** Pengguna membuka halaman utama `/` (`apps/web/src/routes/+page.svelte:1-83`).
- **Status implementasi:** **Sebagian (Total transaksi, total pelanggan, dan 5 transaksi terbaru diambil dari API nyata `GET /api/stats` & `GET /api/sales?limit=5`, sedangkan Penjualan Hari Ini, Grafik Penjualan, Tabel Stok Menipis, dan Notifikasi adalah 100% statis/hardcoded)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Halaman `/` dimuat di browser.
  2. **State dan validasi di client:** `totalTransactions` diinisialisasi `"125.402"` (`+page.svelte:13`) dan `customerCount` `"366"` (`L14`).
  3. **Client/service/API:**
     - `onMount` di `+page.svelte:16-28` memanggil `api.erp.getStats()` (`GET /api/stats`, `api.ts:89-91`).
     - `onMount` di komponen anak `RecentTransactionsTable.svelte:14-36` memanggil `api.erp.getSales(5)` (`GET /api/sales?limit=5`, `api.ts:98-100`).
  4. **Handler dan validasi server:**
     - `GET /api/stats` (`apps/backend/src/modules/erp/erp.routes.ts:7-30`): Menjalankan 6 query `SELECT count(*)`: `products`, `product_units`, `customers`, `suppliers`, `sales_transactions`, `purchase_invoices`.
     - `GET /api/sales` (`erp.routes.ts:86-114`): Mengambil 5 baris terbaru dari `sales_transactions`.
  5. **Business logic/perhitungan/aturan status:**
     - Prop `salesToday="Rp 4.850.000"`, `salesTrend="12% dari kemarin"`, `lowStockCount="5 item"`, `transactionTrend="8% dari bulan lalu"`, dan `customerTrend="+24 bulan ini"` dikirim sebagai **string statis hardcoded** di `+page.svelte:40-48`!
     - `SalesChart.svelte:5-13` merender 7 batang grafik statis (`"21 Okt"` s/d `"27 Okt"`).
     - `LowStockTable.svelte:4-10` merender 5 baris obat statis.
     - `NotificationsCard.svelte:4-26` (serta lonceng notifikasi di `Navbar.svelte:31-62`) merender 3 notifikasi statis.
  6. **Database:** Membaca `products`, `product_units`, `customers`, `suppliers`, `sales_transactions`, `purchase_invoices`.
  7. **Respons dan efek ke UI:** Mengupdate angka Total Transaksi, Total Pelanggan, dan 5 baris Transaksi Terbaru jika API merespons.
  8. **Efek samping/integrasi:** Tautan `"Lihat Detail"` / `"Lihat"` pada `KpiCards.svelte:77` (`href="#stok-menipis"`), `LowStockTable.svelte:20` (`href="#stok"`), dan `NotificationsCard.svelte:39` (`href="#notifikasi"`) mengarah ke anchor hash yang tidak ada di halaman.
- **Jalur alternatif dan kegagalan:** Jika `GET /api/stats` atau `GET /api/sales?limit=5` gagal, UI tetap menampilkan nilai default hardcoded tanpa pesan error.
- **Data dan aturan bisnis yang harus diaudit:**
  - `GET /api/stats` (`erp.routes.ts:7-30`) tidak memfilter berdasarkan `tenant_id` atau `branch_id` dan tidak menghitung omzet hari ini maupun jumlah produk di bawah stok minimum.
  - Komponen `SalesChart.svelte`, `LowStockTable.svelte`, `NotificationsCard.svelte`, dan kolom pencarian global di `Navbar.svelte:145-149` yang masih berupa mockup statis.
- **Bukti kode:** `apps/web/src/routes/+page.svelte:1-83`, `apps/web/src/lib/components/KpiCards.svelte:1-100`, `apps/web/src/lib/components/SalesChart.svelte:1-209`, `apps/web/src/lib/components/LowStockTable.svelte:1-49`, `apps/web/src/lib/components/RecentTransactionsTable.svelte:1-84`, `apps/web/src/lib/components/NotificationsCard.svelte:1-61`, `apps/backend/src/modules/erp/erp.routes.ts:7-30`.
- **Kesenjangan/pertanyaan terbuka:** Apakah grafik penjualan dan KPI dashboard harus mengikuti cabang yang sedang dipilih pada `authStore.user.branchId`?

---

### BF-026 — Laporan Omzet/Laba Rugi, Laporan Regulasi SIPNAP Kemenkes, Analisis Pareto ABC, dan Ekspor CSV (`/laporan`)
- **Posisi dalam urutan bisnis:** 26 (Pelaporan manajerial, audit keuangan, dan pelaporan kepatuhan regulasi Kemenkes/BPOM).
- **Tujuan dan aktor/role:** Menampilkan laporan omzet & laba kotor per shift/periode, menyusun laporan bulanan mutasi Narkotika, Psikotropika, dan Prekursor (SIPNAP Kemenkes), menampilkan klasifikasi produk Pareto ABC (80/15/5), serta mengekspor laporan ke CSV atau mencetaknya. Aktor: Apoteker (`PHARMACIST`), Keuangan (`FINANCE`), Owner (`OWNER`).
- **Pemicu dan prasyarat:** Pengguna membuka `/laporan` (`apps/web/src/routes/laporan/+page.svelte:1-1024`), memilih tab **Laporan Omzet & Shift** (`penjualan`), **Laporan SIPNAP Kemenkes** (`sipnap`), atau **Analisis Pareto ABC** (`pareto`), serta menekan **Export Excel / CSV** (`exportActiveReportCsv`, `L444-486`) atau **Cetak PDF** (`L546, 1013`).
- **Status implementasi:** **Mock atau simulasi (Tab Omzet & Tab Pareto di UI 100% memakai array statis hardcoded dan tidak memanggil `GET /api/reports/financial`; Tab SIPNAP memanggil `GET /api/reports/sipnap`, tetapi backend memalsukan angka stok awal/masuk/keluar/akhir menggunakan rumus indeks loop `idx` dan memasukkan antibiotik Amoxicillin ke laporan narkotika/prekursor)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:**
     - Saat `onMount` (`laporan/+page.svelte:304-341`), memanggil `mockApi.ensureDataLoaded()`, `mockApi.getBranches()`, dan `api.reports.getSipnap()` (`GET /api/reports/sipnap`).
     - Pengguna mengganti filter cabang (`selectedBranchId`), filter periode (`selectedPeriod`, `L503-513`), berpindah tab (`penjualan`, `sipnap`, `pareto`), membuka modal detail kartu stok SIPNAP (`openSipnapDetail`, `L439-442`), mengekspor CSV (`exportActiveReportCsv`, `L444-486`), atau mencetak (`window.print()`, `L1014`).
  2. **State dan validasi di client:**
     - `salesShiftRecords` (`L95-152`, 4 baris) dan `paretoRecords` (`L231-302`, 5 baris) adalah data statis Oktober 2025 yang tidak pernah diperbarui dari API.
     - Dropdown filter periode (`selectedPeriod`, `L74, 503-513`) **sama sekali tidak dipakai di dalam `$derived` filter data tabel mana pun** (`L344-403`); mengubah periode bulan tidak mengubah isi tabel maupun memicu request API.
  3. **Client/service/API:**
     - `api.reports.getSipnap(category)` (`apps/web/src/lib/services/api.ts:288-291`) -> `GET /api/reports/sipnap?category=...` (dipanggil saat `onMount`).
     - `api.reports.getFinancialSummary()` (`api.ts:285-287`) -> `GET /api/reports/financial` (**terdefinisi di `api.ts`, tetapi TIDAK PERNAH dipanggil di halaman `/laporan` maupun halaman lain!**).
  4. **Handler dan validasi server:**
     - `GET /api/reports/financial` (`apps/backend/src/modules/reports/reports.routes.ts:7-57`): Mengagregasi `SUM(grand_total)` dari `sales_transactions` dan `purchase_invoices`, lalu **mengestimasi HPP secara statis sebesar 78% dari omzet (`Math.round(revenue * 0.78)`) dan biaya operasional sebesar 8% dari omzet (`Math.round(revenue * 0.08)`)** (`L34-37`).
     - `GET /api/reports/sipnap` (`reports.routes.ts:60-136`): Mencari produk di tabel `products` yang cocok dengan `ILIKE '%narkotika%'`, `'%psikotropika%'`, `'%prekursor%'`, `'%oot%'`, `'%codein%'`, `'%diazepam%'`, `'%alprazolam%'`, `'%pseudoephedrine%'`, `'%tramadol%'`, **atau `'%amoxicillin%'`** (`L76-88`).
  5. **Business logic/perhitungan/aturan status:**
     - Di `GET /api/reports/sipnap` (`reports.routes.ts:103-106`), server **tidak membaca `stock_ledger` maupun `branch_stocks`**, melainkan mengarang angka mutasi stok dari indeks baris `idx`:
       - `initialStock = 20 + ((idx * 7) % 50)`
       - `stockIn = 10 + ((idx * 3) % 30)`
       - `stockOut = 5 + ((idx * 4) % 25)`
       - `finalStock = initialStock + stockIn - stockOut`
     - Di `laporan/+page.svelte:321-338`, hasil dari `/api/reports/sipnap` dipetakan dengan `branchId: "1"`, `period: "2026-11"`, `recipeCount: Math.ceil(s.stockOut / 2)`, dan `verifiedBy: "apt. Ghina Nadhifah, S.Farm."`.
  6. **Database:** `GET /api/reports/sipnap` hanya membaca tabel `products` (`reports.routes.ts:65-89`).
  7. **Respons dan efek ke UI:** Menampilkan daftar obat di tab SIPNAP dan menghasilkan file unduhan CSV (`Blob` UTF-8 BOM di `laporan/+page.svelte:476-485`) saat tombol Export CSV diklik.
  8. **Efek samping/integrasi:** Unduhan file `Laporan_{activeTab}_{selectedPeriod}.csv` di browser dan dialog cetak `window.print()`.
- **Jalur alternatif dan kegagalan:** Jika pengguna memilih filter cabang selain `"1"` atau `"ALL"` pada tab SIPNAP, tabel SIPNAP menjadi kosong karena semua baris dari API diberi `branchId: "1"` (`laporan/+page.svelte:323`).
- **Data dan aturan bisnis yang harus diaudit:**
  - **Pemalsuan Data Regulasi SIPNAP (`apps/backend/src/modules/reports/reports.routes.ts:86, 103-106`):** Pencantuman `%amoxicillin%` (antibiotik, bukan narkotika/psikotropika/prekursor) dan rumus stok sintetis berbasis `idx` sangat berbahaya jika diekspor sebagai laporan resmi SIPNAP Kemenkes.
  - **Rumus HPP (78%) & OpEx (8%) Hardcoded di `GET /api/reports/financial` (`reports.routes.ts:34-37`)** serta tidak dipanggilnya endpoint tersebut oleh UI.
  - **Filter Periode (`selectedPeriod`) yang Tidak Berfungsi (`laporan/+page.svelte:503-513`).**
- **Bukti kode:** `apps/backend/src/modules/reports/reports.routes.ts:1-136`, `apps/web/src/routes/laporan/+page.svelte:74-341, 444-550, 629-1024`, `apps/web/src/lib/services/api.ts:285-291`.
- **Kesenjangan/pertanyaan terbuka:** Perhitungan SIPNAP yang benar harus mengagregasi saldo awal, pemasukan (`PURCHASE_RECEIPT` / `TRANSFER_IN`), dan pengeluaran (`POS_SALE` / resep dokter / `TRANSFER_OUT`) per periode bulan dari `stock_ledger` untuk produk bergolongan `NARKOTIKA`, `PSIKOTROPIKA`, dan `PREKURSOR`.

---

### BF-027 — Pemeriksaan Kesehatan Sistem & Koneksi Database (`GET /health`)
- **Posisi dalam urutan bisnis:** 27 (Observabilitas dan pemeriksaan ketersediaan layanan backend/database).
- **Tujuan dan aktor/role:** Memeriksa apakah server backend Elysia hidup dan apakah koneksi ke PostgreSQL berfungsi.
- **Pemicu dan prasyarat:** Pemanggilan `GET /health` secara langsung atau melalui `api.system.checkHealth()` (`apps/web/src/lib/services/api.ts:78-84`).
- **Status implementasi:** **Berjalan di Backend (`GET /health` mengeksekusi `SELECT 1` ke PostgreSQL, namun `api.system.checkHealth()` belum pernah dipanggil oleh komponen UI atau `networkStore` mana pun)**.
- **Rangkaian utama:**
  1. **UI/aksi pengguna:** Request HTTP ke `/health`.
  2. **State dan validasi di client:** `api.system.checkHealth()` (`api.ts:78-84`) menangkap error jaringan dan mengembalikan `{ status: "offline" }`.
  3. **Client/service/API:** `GET /health` (di-proxy oleh Vite ke `http://localhost:3001/health` saat development, `apps/web/vite.config.ts:15-18`).
  4. **Handler dan validasi server:** Handler `.get("/health", ...)` di `apps/backend/src/index.ts:59-75`.
  5. **Business logic/perhitungan/aturan status:** Menjalankan `await queryClient\`SELECT 1\``; jika berhasil `dbStatus = "connected"`, jika gagal `dbStatus = "disconnected"`.
  6. **Database:** Query `SELECT 1` ke PostgreSQL (`packages/db/src/client.ts:10`).
  7. **Respons dan efek ke UI:** Mengembalikan JSON `{ status: "ok", db: "connected" | "disconnected", service: "apoteku-backend", engine: "Bun + Elysia.js", timestamp }`.
  8. **Efek samping/integrasi:** Tidak ada.
- **Jalur alternatif dan kegagalan:** Jika PostgreSQL mati, `/health` tetap mengembalikan HTTP 200 dengan `status: "ok"` dan `db: "disconnected"`.
- **Data dan aturan bisnis yang harus diaudit:**
  - `networkStore.svelte.ts` hanya mengandalkan `navigator.onLine` (yang hanya mengecek koneksi LAN/Wi-Fi lokal, bukan keterjangkauan server backend) dan tidak pernah memanggil `api.system.checkHealth()`.
- **Bukti kode:** `apps/backend/src/index.ts:59-75`, `apps/web/src/lib/services/api.ts:78-84`, `apps/web/src/lib/stores/networkStore.svelte.ts:17-26`.
- **Kesenjangan/pertanyaan terbuka:** Apakah `networkStore` perlu melakukan heartbeat ke `api.system.checkHealth()` untuk mendeteksi kondisi ketika Wi-Fi terhubung tetapi server/database sedang down?

---

## 4. Inventaris halaman, API, dan proses

### 4.1 Halaman / Route & Komponen UI (`apps/web`)

| Permukaan | Route/komponen/endpoint/job | Alur BF-XXX terkait | Data/API yang dipakai | Status sumber data | Bukti |
|---|---|---|---|---|---|
| **Layout Root** | `src/routes/+layout.svelte` | `BF-001` | `authStore.user`, `$page.url.pathname` | State lokal + `localStorage` | `apps/web/src/routes/+layout.svelte:1-54` |
| **Halaman Dashboard** | `src/routes/+page.svelte` | `BF-025` | `GET /api/stats`, `GET /api/sales?limit=5` | Campuran (2 metrik + 5 transaksi dari API; omzet hari ini, grafik, stok menipis, notifikasi statis hardcoded) | `apps/web/src/routes/+page.svelte:1-83` |
| **Halaman Login** | `src/routes/login/+page.svelte`, `+page.ts` | `BF-002`, `BF-003` | `GET /api/users`, `GET /api/branches`, `GET /api/auth/google/config`, `POST /api/auth/login`, Google OAuth redirect, `localStorage["apoteku_saved_accounts"]` | Berjalan (API + `localStorage` fallback) | `apps/web/src/routes/login/+page.svelte:1-818`, `apps/web/src/routes/login/+page.ts:1` |
| **Halaman Register** | `src/routes/register/+page.svelte` | `BF-003` | Tidak memanggil API (redirect `goto("/login")` setelah 1 detik) | Placeholder redirect | `apps/web/src/routes/register/+page.svelte:1-34` |
| **Halaman Kasir POS** | `src/routes/pos/+page.svelte`, `+page.ts` | `BF-001`, `BF-008`, `BF-011`, `BF-012`, `BF-013` | `GET /api/pos/bootstrap`, `GET /api/shifts/current`, `POST /api/shifts/open`, `POST /api/shifts/close`, `POST /api/pos/sync-sales`, `localDb.products`, `localDb.pendingSales` | Berjalan sebagian (terhubung API & Dexie; bug double-queueing & duplikasi ID item; ringkasan shift hardcoded) | `apps/web/src/routes/pos/+page.svelte:1-1595`, `apps/web/src/routes/pos/+page.ts:1` |
| **Halaman Stok & Inventori** | `src/routes/stok/+page.svelte` | `BF-008`, `BF-009`, `BF-023` | `GET /api/pos/bootstrap`, `GET /api/branches` (via `mockApi`) | Sebagian (Tab Katalog & ED/Defekta baca dari API; Tambah/Edit Obat, Stok Opname, Kartu Stok, Riwayat Opname 100% state memori lokal) | `apps/web/src/routes/stok/+page.svelte:1-2137` |
| **Halaman Pelanggan** | `src/routes/pelanggan/+page.svelte` | `BF-008`, `BF-010` | `GET /api/pos/bootstrap` (via `mockApi.getCustomers()`) | Sebagian (Direktori baca dari bootstrap; Form Tambah Pelanggan & Tab Piutang 100% mock/dead UI) | `apps/web/src/routes/pelanggan/+page.svelte:1-484` |
| **Halaman Supplier PBF** | `src/routes/supplier/+page.svelte` | `BF-010` | `GET /api/suppliers` (via `mockApi.getSuppliers()`) | Sebagian (Direktori baca dari API; Form Tambah PBF & Tab Buku Hutang di halaman ini 100% mock/dead UI) | `apps/web/src/routes/supplier/+page.svelte:1-480` |
| **Halaman Pelayanan Resep** | `src/routes/pelayanan/+page.svelte` | `BF-008`, `BF-014`, `BF-015` | `GET /api/prescriptions`, `POST /api/prescriptions`, `POST /api/uploads`, `mockApi` | Sebagian (List/Create Resep & Upload Foto ke API; Verifikasi Resep, Dokter, dan Dokumentasi PIO 100% state memori lokal) | `apps/web/src/routes/pelayanan/+page.svelte:1-1674` |
| **Halaman Pembelian PBF** | `src/routes/pembelian/+page.svelte` | `BF-017`, `BF-018`, `BF-019`, `BF-020` | `GET /api/purchases`, `GET /api/purchase-orders`, `GET /api/suppliers`, `GET /api/finance/debt-payments`, `POST /api/finance/debt-payments`, `mockApi` | Sebagian (Read Faktur/SP & Bayar Hutang PBF ke API; Buat Faktur Baru, Buat SP Baru, dan Konsinyasi 100% state memori lokal) | `apps/web/src/routes/pembelian/+page.svelte:1-1898` |
| **Halaman Pengiriman/Mutasi** | `src/routes/pengiriman/+page.svelte` | `BF-021` | `GET /api/inventory/transfers`, `POST /api/inventory/transfers`, `POST /api/inventory/transfers/:id/dispatch`, `POST /api/inventory/transfers/:id/receive`, `mockApi` | Sebagian (Semua aksi ke API & `stock_ledger`, tetapi backend tidak mengubah `branch_stocks`/`branch_batch_stocks`) | `apps/web/src/routes/pengiriman/+page.svelte:1-1189` |
| **Halaman Riwayat Penjualan** | `src/routes/penjualan/+page.svelte` | `BF-016` | `GET /api/sales?limit=100` | Sebagian / Rusak (Data diambil dari API tetapi salah pemetaan properti di UI; Ekspor CSV & Cetak Ulang hanya `alert()`) | `apps/web/src/routes/penjualan/+page.svelte:1-610` |
| **Halaman Retur** | `src/routes/retur/+page.svelte` | `BF-022` | `GET /api/returns/customer`, `POST /api/returns/customer`, `GET /api/returns/supplier`, `POST /api/returns/supplier`, `POST /api/returns/supplier/:id/resolve`, `GET /api/suppliers`, `mockApi` | Sebagian / Volatile (Terhubung ke API, tetapi server menyimpan daftar retur di RAM dan hanya menulis `stock_ledger`) | `apps/web/src/routes/retur/+page.svelte:1-1200` |
| **Halaman Keuangan & Kas** | `src/routes/keuangan/+page.svelte` | `BF-011`, `BF-024` | `GET /api/shifts`, `POST /api/shifts/close`, `GET /api/finance/cashflow`, `mockApi` | Sebagian (List & Tutup Shift ke DB nyata; `/api/finance/cashflow` mengembalikan mock statis; Catat Kas Kecil & Payout QRIS 100% state memori lokal) | `apps/web/src/routes/keuangan/+page.svelte:1-1035` |
| **Halaman Laporan & Analitik** | `src/routes/laporan/+page.svelte` | `BF-026` | `GET /api/reports/sipnap`, `mockApi`, Client CSV `Blob` | Mock/Simulasi (Tab Omzet & Pareto 100% array statis; Tab SIPNAP dari API tetapi angkanya hasil rumus indeks `idx`) | `apps/web/src/routes/laporan/+page.svelte:1-1024` |
| **Halaman Pengaturan** | `src/routes/pengaturan/+page.svelte` | `BF-004`, `BF-005`, `BF-006` | `GET /api/branches`, `PUT /api/branches/:id`, `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` | Sebagian (Tab Profil, Cabang, Pengguna ke API; Tab Printer & Diagnostik 100% statis/simulasi) | `apps/web/src/routes/pengaturan/+page.svelte:1-1195` |
| **Komponen Navigasi & Dashboard** | `Navbar.svelte`, `Sidebar.svelte`, `HeroBanner.svelte`, `KpiCards.svelte`, `SalesChart.svelte`, `LowStockTable.svelte`, `RecentTransactionsTable.svelte`, `NotificationsCard.svelte`, `QuickMenuGrid.svelte`, `Footer.svelte` | `BF-001`, `BF-025` | `authStore`, `GET /api/sales?limit=5` (hanya di `RecentTransactionsTable`) | Campuran (`RecentTransactionsTable` dari API; Search bar `Navbar`, Notifikasi, `SalesChart`, `LowStockTable` 100% statis) | `apps/web/src/lib/components/*.svelte` |
| **Komponen UI Generik** | `Badge.svelte`, `DataTable.svelte`, `MetricCard.svelte`, `Modal.svelte`, `PageHeader.svelte`, `SearchableSelect.svelte`, `Select.svelte`, `portal.ts` | Lintas semua alur (`BF-001` s/d `BF-026`) | Props komponen | Komponen UI murni | `apps/web/src/lib/components/ui/*.svelte`, `apps/web/src/lib/actions/portal.ts:1-31` |

---

### 4.2 Endpoint API Backend (`apps/backend`)

| Permukaan | Route/komponen/endpoint/job | Alur BF-XXX terkait | Data/API yang dipakai | Status sumber data | Bukti |
|---|---|---|---|---|---|
| **System Health** | `GET /health` | `BF-027` | Query `SELECT 1` via `queryClient` | PostgreSQL nyata (tidak pernah dipanggil oleh UI) | `apps/backend/src/index.ts:59-75` |
| **Swagger Docs** | `GET /swagger` | Dokumentasi API | OpenAPI generator (`@elysiajs/swagger`) | Berjalan | `apps/backend/src/index.ts:40-52` |
| **Static Media** | `GET /uploads/*` | `BF-014`, `BF-015` | Filesystem `<repo-root>/uploads` (`@elysiajs/static`) | Filesystem lokal nyata | `apps/backend/src/index.ts:53-58` |
| **Auth — Login PIN** | `POST /api/auth/login` | `BF-002` | `SELECT` dari `users` LEFT JOIN `branches` | PostgreSQL nyata (token respons berupa string semu `demo-token-...`) | `apps/backend/src/modules/auth/auth.routes.ts:7-107` |
| **Auth — Status** | `GET /api/auth/status` | **Belum dipetakan ke UI** (tersedia di `api.auth.getStatus`, tidak pernah dipanggil) | `SELECT count(*)::int FROM users` | PostgreSQL nyata (tidak terpakai di UI) | `apps/backend/src/modules/auth/auth.routes.ts:110-135` |
| **Auth — Register** | `POST /api/auth/register` | **Belum dipetakan ke UI** (`/register` hanya redirect ke `/login`, tidak pernah dipanggil) | `SELECT` `tenants`, `users`, `branches`; `INSERT INTO users` | PostgreSQL nyata (tidak terpakai di UI) | `apps/backend/src/modules/auth/auth.routes.ts:138-277` |
| **Auth — Google Config** | `GET /api/auth/google/config` | `BF-003` | `process.env.GOOGLE_CLIENT_ID` atau fallback hardcoded | Konfigurasi / hardcoded | `apps/backend/src/modules/auth/auth.routes.ts:280-306` |
| **Auth — Google Token POST** | `POST /api/auth/google` | `BF-003` (jalur alternatif) | Google API + `SELECT`/`INSERT`/`UPDATE` `users` | PostgreSQL + Google API (UI `/login` memakai jalur redirect callback) | `apps/backend/src/modules/auth/auth.routes.ts:309-561` |
| **Auth — Google Callback** | `GET /api/auth/google/callback` | `BF-003` | Google OAuth Token & Userinfo + `SELECT`/`INSERT`/`UPDATE` `users` | PostgreSQL + Google API nyata | `apps/backend/src/modules/auth/auth.routes.ts:564-792` |
| **Users — List** | `GET /api/users` | `BF-002`, `BF-004`, `BF-005` | `SELECT` `users` LEFT JOIN `branches` | PostgreSQL nyata (membocorkan kolom `pin`) | `apps/backend/src/modules/auth/auth.routes.ts:795-843` |
| **Users — Create** | `POST /api/users` | `BF-005` | `SELECT` `tenants`; `INSERT INTO users` | PostgreSQL nyata | `apps/backend/src/modules/auth/auth.routes.ts:846-895` |
| **Users — Update** | `PUT /api/users/:id` | `BF-004`, `BF-005` | `UPDATE users WHERE id = :id` | PostgreSQL nyata | `apps/backend/src/modules/auth/auth.routes.ts:898-948` |
| **Users — Delete** | `DELETE /api/users/:id` | `BF-005` | `DELETE FROM users WHERE id = :id` | PostgreSQL nyata | `apps/backend/src/modules/auth/auth.routes.ts:951-981` |
| **Branches — List** | `GET /api/branches` | `BF-002`, `BF-006`, `BF-008` | `SELECT` dari `branches` (`siaNumber` & `pharmacistName` hardcoded) | PostgreSQL nyata + field hardcoded | `apps/backend/src/modules/auth/auth.routes.ts:984-1026` |
| **Branches — Update** | `PUT /api/branches/:id` | `BF-006` | `UPDATE branches WHERE id = :id` | PostgreSQL nyata (mengabaikan SIA/SIPA/APA) | `apps/backend/src/modules/auth/auth.routes.ts:1029-1074` |
| **POS — Bootstrap** | `GET /api/pos/bootstrap` | `BF-008`, `BF-009`, `BF-010`, `BF-012` | `SELECT` `tenants`, `branches`, `cashier_shifts`, `products`, `product_units`, `customers`, `branch_stocks`, `branch_batch_stocks`, `product_batches` | PostgreSQL nyata (dengan fallback `DEFAULT_PRODUCTS` jika DB kosong/error) | `apps/backend/src/modules/pos/pos.routes.ts:29-44`, `pos.service.ts:224-477` |
| **POS — Sync Sales** | `POST /api/pos/sync-sales` | `BF-013` | `SELECT`/`INSERT` `sales_transactions`, `sales_transaction_items`; `UPDATE` `branch_batch_stocks`, `branch_stocks`; `INSERT` `stock_ledger` | PostgreSQL nyata (namun error DB ditelan oleh `catch (dbErr)` di `L696`) | `apps/backend/src/modules/pos/pos.routes.ts:45-59`, `pos.service.ts:483-727` |
| **POS — Delta Sync** | `GET /api/pos/sync-delta` | `BF-008` (**Belum dipanggil di UI**) | `SELECT` `products`, `product_units`, `branch_stocks`, `branch_batch_stocks` (`updated_at > since`) | PostgreSQL nyata (tidak pernah dipanggil oleh frontend) | `apps/backend/src/modules/pos/pos.routes.ts:60-78`, `pos.service.ts:732-844` |
| **Media — Upload** | `POST /api/uploads` | `BF-014` | `Bun.write` ke `<repo-root>/uploads/{category}` | Filesystem lokal nyata | `apps/backend/src/modules/media/media.routes.ts:24-80` |
| **ERP — Stats** | `GET /api/stats` | `BF-025` | `SELECT count(*)` dari `products`, `product_units`, `customers`, `suppliers`, `sales_transactions`, `purchase_invoices` | PostgreSQL nyata | `apps/backend/src/modules/erp/erp.routes.ts:7-30` |
| **ERP — Suppliers** | `GET /api/suppliers` | `BF-010`, `BF-017`, `BF-018`, `BF-022` | `SELECT` dari `suppliers` (`LIMIT 500`) | PostgreSQL nyata | `apps/backend/src/modules/erp/erp.routes.ts:33-57` |
| **ERP — Customers** | `GET /api/customers` | `BF-010` (**Tidak pernah dipanggil oleh UI**; UI memakai pelanggan dari `/api/pos/bootstrap`) | `SELECT` dari `customers` (`LIMIT 500`) | PostgreSQL nyata (tidak terpakai di UI) | `apps/backend/src/modules/erp/erp.routes.ts:60-83` |
| **ERP — Sales History** | `GET /api/sales` | `BF-016`, `BF-025` | `SELECT` dari `sales_transactions` (`LIMIT :limit`) | PostgreSQL nyata (tanpa detail item) | `apps/backend/src/modules/erp/erp.routes.ts:86-114` |
| **ERP — Purchases** | `GET /api/purchases` | `BF-018`, `BF-019` | `SELECT` dari `purchase_invoices` LEFT JOIN `suppliers` (`LIMIT :limit`) | PostgreSQL nyata | `apps/backend/src/modules/erp/erp.routes.ts:117-163` |
| **ERP — Purchase Orders List** | `GET /api/purchase-orders` | `BF-017` | `SELECT` dari `purchase_orders` LEFT JOIN `suppliers`, `branches` | PostgreSQL nyata (`totalItems: 5` & `pharmacistName` hardcoded) | `apps/backend/src/modules/erp/erp.routes.ts:166-209` |
| **ERP — Purchase Orders Create** | `POST /api/purchase-orders` | `BF-017` (**Tidak pernah dipanggil oleh UI** karena `handleCreateSp` hanya mengubah state lokal) | `INSERT INTO purchase_orders` | PostgreSQL nyata (diabaikan oleh UI `/pembelian`) | `apps/backend/src/modules/erp/erp.routes.ts:212-243` |
| **Shifts — List** | `GET /api/shifts` | `BF-011`, `BF-024` | `SELECT` dari `cashier_shifts` LEFT JOIN `branches` | PostgreSQL nyata | `apps/backend/src/modules/shift/shift.routes.ts:12-40`, `shift.service.ts:244-301` |
| **Shifts — Current** | `GET /api/shifts/current` | `BF-011` | `SELECT` dari `cashier_shifts` + agregasi `sales_transactions` | PostgreSQL nyata | `apps/backend/src/modules/shift/shift.routes.ts:43-66`, `shift.service.ts:33-98` |
| **Shifts — Open** | `POST /api/shifts/open` | `BF-011` | `INSERT INTO cashier_shifts` | PostgreSQL nyata | `apps/backend/src/modules/shift/shift.routes.ts:69-103`, `shift.service.ts:100-169` |
| **Shifts — Close** | `POST /api/shifts/close` | `BF-011`, `BF-024` | Agregasi `sales_transactions` + `UPDATE cashier_shifts` | PostgreSQL nyata | `apps/backend/src/modules/shift/shift.routes.ts:106-131`, `shift.service.ts:171-242` |
| **Prescriptions — List** | `GET /api/prescriptions` | `BF-015` | `SELECT` `sales_transactions`, `sales_transaction_items`, `sales_compounds` | PostgreSQL nyata (metadata klinis/etiket hardcoded) | `apps/backend/src/modules/prescription/prescription.routes.ts:11-33`, `prescription.service.ts:40-144` |
| **Prescriptions — Create** | `POST /api/prescriptions` | `BF-015` | `INSERT` `sales_transactions`, `sales_transaction_items`, `sales_compounds`, `sales_compound_items` | PostgreSQL nyata (tanpa potong stok/batch) | `apps/backend/src/modules/prescription/prescription.routes.ts:36-83`, `prescription.service.ts:146-297` |
| **Transfers — List** | `GET /api/inventory/transfers` | `BF-021` | `SELECT` `stock_transfers`, `stock_transfer_items`, `branches`, `products`, `product_batches` | PostgreSQL nyata | `apps/backend/src/modules/inventory/transfer.routes.ts:11-33`, `transfer.service.ts:116-223` |
| **Transfers — Create** | `POST /api/inventory/transfers` | `BF-021` | `INSERT` `stock_transfers`, `stock_transfer_items`, `product_batches`, `stock_ledger` | PostgreSQL nyata (tanpa potong `branch_stocks`) | `apps/backend/src/modules/inventory/transfer.routes.ts:36-74`, `transfer.service.ts:225-347` |
| **Transfers — Receive** | `POST /api/inventory/transfers/:id/receive` | `BF-021` | `UPDATE` `stock_transfer_items`, `stock_transfers`; `INSERT` `stock_ledger` | PostgreSQL nyata (tanpa tambah `branch_stocks`) | `apps/backend/src/modules/inventory/transfer.routes.ts:77-112`, `transfer.service.ts:349-441` |
| **Transfers — Dispatch** | `POST /api/inventory/transfers/:id/dispatch` | `BF-021` | `UPDATE stock_transfers SET status = 'IN_TRANSIT'` | PostgreSQL nyata | `apps/backend/src/modules/inventory/transfer.routes.ts:115-139`, `transfer.service.ts:443-459` |
| **Returns — Customer List** | `GET /api/returns/customer` | `BF-022` | Membaca array RAM `this.customerReturnsList` | **Volatile RAM di server** | `apps/backend/src/modules/returns/returns.routes.ts:12-34`, `returns.service.ts:233-239` |
| **Returns — Customer Create** | `POST /api/returns/customer` | `BF-022` | `INSERT` `stock_ledger` (jika `LAYAK_JUAL`) + push ke array RAM `this.customerReturnsList` | Campuran (`stock_ledger` di DB; dokumen retur di RAM server) | `apps/backend/src/modules/returns/returns.routes.ts:37-74`, `returns.service.ts:63-148` |
| **Returns — Supplier List** | `GET /api/returns/supplier` | `BF-022` | Membaca array RAM `this.supplierReturnsList` | **Volatile RAM di server** | `apps/backend/src/modules/returns/returns.routes.ts:77-99`, `returns.service.ts:241-247` |
| **Returns — Supplier Create** | `POST /api/returns/supplier` | `BF-022` | `INSERT` `stock_ledger` + push ke array RAM `this.supplierReturnsList` | Campuran (`stock_ledger` di DB; dokumen retur di RAM server) | `apps/backend/src/modules/returns/returns.routes.ts:102-138`, `returns.service.ts:150-231` |
| **Returns — Supplier Resolve** | `POST /api/returns/supplier/:id/resolve` | `BF-022` | Mutasi objek di array RAM `this.supplierReturnsList` | **Volatile RAM di server** | `apps/backend/src/modules/returns/returns.routes.ts:141-170`, `returns.service.ts:249-263` |
| **Finance — Debt Payments List** | `GET /api/finance/debt-payments` | `BF-019` | `SELECT` `debt_payments` LEFT JOIN `purchase_invoices`, `suppliers`, `branches` | PostgreSQL nyata | `apps/backend/src/modules/finance/finance.routes.ts:12-39`, `finance.service.ts:122-170` |
| **Finance — Debt Summary** | `GET /api/finance/debt-summary` | `BF-019`, `BF-024` | Agregasi `SUM`/`COUNT` pada `purchase_invoices` | PostgreSQL nyata (dipanggil internal oleh `/cashflow`; tidak dipanggil langsung oleh UI) | `apps/backend/src/modules/finance/finance.routes.ts:42-62`, `finance.service.ts:172-203` |
| **Finance — Cashflow** | `GET /api/finance/cashflow` | `BF-024` | `getDebtSummary()` + saldo kas/bank & 4 transaksi **hardcoded** | **Mock statis di backend** (kecuali field `totalDebt`) | `apps/backend/src/modules/finance/finance.routes.ts:65-142` |
| **Finance — Record Debt Payment** | `POST /api/finance/debt-payments` | `BF-019` | `INSERT INTO debt_payments` + `UPDATE purchase_invoices` | PostgreSQL nyata | `apps/backend/src/modules/finance/finance.routes.ts:145-182`, `finance.service.ts:24-120` |
| **Reports — Financial Summary** | `GET /api/reports/financial` | `BF-026` (**Tidak pernah dipanggil oleh UI**) | Agregasi `sales_transactions` & `purchase_invoices` + rumus HPP 78% & OpEx 8% | Sebagian nyata + rumus estimasi statis (tidak terpakai di UI) | `apps/backend/src/modules/reports/reports.routes.ts:7-57` |
| **Reports — SIPNAP** | `GET /api/reports/sipnap` | `BF-026` | `SELECT` dari `products` + angka mutasi stok palsu berbasis indeks `idx` | **Mock perhitungan di backend** | `apps/backend/src/modules/reports/reports.routes.ts:60-136` |

---

### 4.3 Proses Non-UI, Timer, Middleware, dan Skrip CLI

| Permukaan | Route/komponen/endpoint/job | Alur BF-XXX terkait | Data/API yang dipakai | Status sumber data | Bukti |
|---|---|---|---|---|---|
| **Timer Sinkronisasi Offline (Client)** | `setInterval` 30 detik & event `online` di `NetworkState` | `BF-013` | `localDb.pendingSales` -> `POST /api/pos/sync-sales` | Berjalan di browser | `apps/web/src/lib/stores/networkStore.svelte.ts:19-36` |
| **Middleware Tenant Context** | `tenantMiddleware` (`apps/backend/src/middleware/tenant.ts`) | **Belum dipetakan / Dead Code** | Membaca header `x-tenant-id`, `x-branch-id`, `x-user-id` | **Tidak pernah di-import di `apps/backend`** | `apps/backend/src/middleware/tenant.ts:1-30` |
| **Builder Byte Printer ESC/POS** | `EscPosBuilder` & `ESC_POS` (`packages/core/src/hardware/escpos.ts`) | **Belum dipetakan / Dead Code** | Mengonversi teks struk menjadi `Uint8Array` ESC/POS | **Di-import di `pos/+page.svelte:14` tetapi tidak pernah dipanggil** | `packages/core/src/hardware/escpos.ts:1-52` |
| **CLI Migrasi Master Data** | `packages/db/src/scripts/migrate-master-data.ts` (`migrate:master`) | `BF-007` | CSV `CABANG`, `LOKASI`, `RAK`, `SUPPLIER`, `PELANGGAN`, `DESKRIPSIBARANG`, `BARANG`, `FASTBATCH` (dead), `STOKAKHIR` -> PostgreSQL | Berjalan (skrip CLI) | `packages/db/src/scripts/migrate-master-data.ts:1-578` |
| **CLI Migrasi Pembelian** | `packages/db/src/scripts/migrate-purchases.ts` (`migrate:purchases`) | `BF-007` | CSV `PEMBELIAN`, `DETAILPEMBELIAN` -> `purchase_invoices`, `purchase_invoice_items` | Berjalan (skrip CLI) | `packages/db/src/scripts/migrate-purchases.ts:1-217` |
| **CLI Migrasi Penjualan** | `packages/db/src/scripts/migrate-sales.ts` (`migrate:sales`) | `BF-007` | CSV `BARANG`, `DETAILPENJUALAN`, `PENJUALAN` -> `sales_transactions`, `sales_transaction_items` | Berjalan (skrip CLI) | `packages/db/src/scripts/migrate-sales.ts:1-265` |

---

## 5. Inventaris data dan dampak

### 5.1 Tabel Database Server (PostgreSQL — `packages/db/src/schema/*.ts`)

| Entitas/tabel/store | Dibaca oleh alur | Ditulis/diubah oleh alur | Kunci/relasi penting | Risiko atau aturan yang harus diaudit | Bukti |
|---|---|---|---|---|---|
| `tenants` | `BF-003`, `BF-005`, `BF-007`, `BF-008`, `BF-011`, `BF-015`, `BF-017`, `BF-019`, `BF-021`, `BF-022` | `BF-007` (`migrate-master-data.ts`) | PK `id` (UUID), Unique `code` | Semua service backend mengambil `SELECT id FROM tenants LIMIT 1` karena header `x-tenant-id` tidak pernah dikirim oleh client; isolasi multi-tenant belum aktif. | `packages/db/src/schema/auth.ts:15-22` |
| `branches` | `BF-002`, `BF-003`, `BF-005`, `BF-006`, `BF-007`, `BF-008`, `BF-011`, `BF-015`, `BF-017`, `BF-019`, `BF-021`, `BF-022` | `BF-006` (`PUT /api/branches/:id`), `BF-007` | PK `id`, FK `tenant_id`, Unique `(tenant_id, code)` | Tidak memiliki kolom `sia_number`, `sipa_number`, `pharmacist_name` (di-hardcode di API). | `packages/db/src/schema/auth.ts:24-42` |
| `users` | `BF-002`, `BF-003`, `BF-004`, `BF-005`, `BF-017` | `BF-003`, `BF-004`, `BF-005` (`POST/PUT/DELETE /api/users`, `/api/auth/register`) | PK `id`, FK `tenant_id`, FK `branch_id`, Unique `(tenant_id, username)` | `pin` disimpan plaintext & dikembalikan oleh `GET /api/users`; `password_hash` berisi PIN/password plaintext; jika `pin` null maka login PIN apa pun lolos. | `packages/db/src/schema/auth.ts:44-68`, `auth.routes.ts:56, 197, 830` |
| `inventory_locations` | `BF-007`, `BF-021`, `BF-022` | `BF-007`, `BF-021` (auto-insert `DEPO-UTAMA`) | PK `id`, FK `tenant_id`, FK `branch_id`, Unique `(branch_id, code)` | `returns.service.ts` hanya mencari lokasi `is_default = true`; jika tidak ada, penulisan `stock_ledger` dilewati tanpa error. | `packages/db/src/schema/auth.ts:70-88`, `transfer.service.ts:46-81`, `returns.service.ts:49-61` |
| `legacy_id_map` | `BF-007` (hanya skrip ETL) | `BF-007` (`migrate-master-data`, `migrate-purchases`) | PK `id`, Unique `(tenant_id, source_database, source_table, legacy_key)` | **Tidak dipakai di `apps/backend`**. `migrate-sales.ts` tidak mencatat pemetaan penjualan ke tabel ini. | `packages/db/src/schema/auth.ts:90-116` |
| `cashier_shifts` | `BF-008`, `BF-011`, `BF-024` | `BF-011`, `BF-024` (`POST /api/shifts/open`, `/close`) | PK `id`, FK `tenant_id`, FK `branch_id` (`user_id` tidak memiliki FK ke `users`) | Rekonsiliasi penjualan shift (`shift.service.ts:75-80, 198-203`) memfilter berdasarkan waktu `created_at >= start_time` di cabang, bukan berdasarkan `cashier_shift_id`. | `packages/db/src/schema/auth.ts:118-144`, `shift.service.ts:67-80` |
| `products` | `BF-007`, `BF-008`, `BF-009`, `BF-015`, `BF-021`, `BF-022`, `BF-025`, `BF-026` | `BF-007` (`migrate-master-data.ts`) | PK `id`, FK `tenant_id`, Unique `(tenant_id, sku)` | **Read-only di `apps/backend`**; belum ada endpoint tambah/ubah produk dari UI `/stok`. | `packages/db/src/schema/products.ts:17-50` |
| `product_units` | `BF-008`, `BF-025` | `BF-007` (`migrate-master-data.ts`) | PK `id`, FK `tenant_id`, FK `product_id`, Unique `(product_id, unit_name)` | **Read-only di `apps/backend`**; faktor konversi tidak dibaca saat mutasi transfer (`BF-021`) atau resep (`BF-015`). | `packages/db/src/schema/products.ts:52-74` |
| `product_batches` | `BF-008`, `BF-021` | `BF-021` (`transfer.service.ts:getOrCreateBatch`) | PK `id`, FK `tenant_id`, FK `product_id`, Unique `(tenant_id, product_id, batch_no, expired_date)` | **Tidak diisi oleh `migrate-master-data.ts` (`BF-007`)** meskipun `FASTBATCH.csv` dibaca! Pencarian di `getOrCreateBatch` (`transfer.service.ts:95-100`) tidak memfilter `expired_date`. | `packages/db/src/schema/products.ts:76-103`, `migrate-master-data.ts:511-520` |
| `branch_stocks` | `BF-008` | `BF-007`, `BF-013` (`pos.service.ts:syncSales`) | PK `id`, FK `branch_id`, FK `location_id`, FK `product_id`, Unique `(location_id, product_id)` | **Tidak diupdate pada Resep (`BF-015`), Faktur Pembelian (`BF-018`), Mutasi Transfer (`BF-021`), Retur (`BF-022`), maupun Opname (`BF-023`)!** Bahkan di `syncSales` (`BF-013`), hanya diupdate jika `item.batchId` ada di `branch_batch_stocks`. | `packages/db/src/schema/inventory.ts:17-40`, `pos.service.ts:577-676` |
| `branch_batch_stocks` | `BF-008`, `BF-013` | `BF-013` (`pos.service.ts:syncSales`) | PK `id`, FK `branch_id`, FK `location_id`, FK `product_id`, FK `batch_id`, Unique `(location_id, product_id, batch_id)` | **Tidak pernah di-INSERT oleh kode mana pun di repo** (baik skrip migrasi maupun endpoint backend), sehingga tabel ini selalu kosong kecuali diisi manual via SQL! | `packages/db/src/schema/inventory.ts:42-69` |
| `stock_ledger` | **Tidak pernah dibaca (`SELECT`) oleh alur mana pun** | `BF-013` (`syncSales`), `BF-021` (`createTransfer`, `receiveTransfer`), `BF-022` (`recordCustomerReturn`, `recordSupplierReturn`) | PK `id`, FK `branch_id`, FK `product_id`, FK `location_id`, FK `batch_id` | **Write-only di backend**; Tab Kartu Stok di `/stok` (`BF-023`) dan Laporan SIPNAP (`BF-026`) sama sekali tidak membaca tabel ini. | `packages/db/src/schema/inventory.ts:72-98` |
| `stock_transfers` | `BF-021` (`GET /api/inventory/transfers`, `receiveTransfer`) | `BF-021` (`createTransfer`, `dispatchTransfer`, `receiveTransfer`) | PK `id`, FK `source_branch_id`, FK `dest_branch_id`, Unique `(tenant_id, transfer_number)` | Berjalan, namun mutasi tidak disertai pembaruan saldo `branch_stocks` / `branch_batch_stocks`. | `packages/db/src/schema/inventory.ts:101-134`, `transfer.service.ts:116-459` |
| `stock_transfer_items` | `BF-021` | `BF-021` | PK `id`, FK `transfer_id`, FK `product_id`, FK `batch_id`, Unique `(transfer_id, line_no)` | `qty_sent_base` diisi langsung dari `qty` input tanpa konversi satuan. | `packages/db/src/schema/inventory.ts:136-159` |
| `stock_adjustments` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `branch_id`, FK `location_id`, Unique `(tenant_id, adjustment_number)` | **Tabel yatim (unused)**: fitur Stok Opname di `/stok` (`BF-023`) hanya berjalan di memori browser. | `packages/db/src/schema/inventory.ts:162-186` |
| `stock_adjustment_items` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `adjustment_id`, FK `product_id`, Unique `(adjustment_id, line_no)` | **Tabel yatim (unused)**. | `packages/db/src/schema/inventory.ts:188-209` |
| `suppliers` | `BF-010`, `BF-017`, `BF-018`, `BF-019`, `BF-022`, `BF-025` | `BF-007` (`migrate-master-data.ts`) | PK `id`, FK `tenant_id`, Unique `(tenant_id, code)` | **Read-only di `apps/backend`**; modal tambah PBF di `/supplier` tidak terhubung ke API. | `packages/db/src/schema/procurement.ts:18-41` |
| `purchase_orders` | `BF-017` (`GET /api/purchase-orders`) | `BF-017` (`POST /api/purchase-orders` — tidak dipanggil oleh UI) | PK `id`, FK `branch_id`, FK `supplier_id`, Unique `(tenant_id, po_number)` | Tidak memiliki tabel detail item (`purchase_order_items`); tombol buat SP di UI `/pembelian` tidak memanggil endpoint POST. | `packages/db/src/schema/procurement.ts:43-68` |
| `purchase_invoices` | `BF-018`, `BF-019`, `BF-024`, `BF-025`, `BF-026` | `BF-007` (`migrate-purchases.ts`), `BF-019` (`recordDebtPayment` mengupdate `paid_amount` & `is_paid_off`) | PK `id`, FK `branch_id`, FK `supplier_id`, FK `purchase_order_id` | Tidak ada endpoint `POST /api/purchases` untuk menginsert faktur baru dari UI `/pembelian` (`BF-018`). | `packages/db/src/schema/procurement.ts:70-105` |
| `purchase_invoice_items` | **Tidak pernah dibaca di `apps/backend`** | `BF-007` (`migrate-purchases.ts`) | PK `id`, FK `invoice_id`, FK `product_id`, Unique `(invoice_id, line_no)` | Diisi oleh skrip migrasi ETL, namun tidak pernah di-SELECT oleh endpoint mana pun di `apps/backend`. | `packages/db/src/schema/procurement.ts:107-134` |
| `debt_payments` | `BF-019` (`GET /api/finance/debt-payments`) | `BF-019` (`POST /api/finance/debt-payments`) | PK `id`, FK `branch_id`, FK `purchase_invoice_id` | Tidak ada validasi batas pembayaran maksimum (`amount_paid <= remaining_debt`) dan tidak dibungkus transaksi DB dengan `purchase_invoices`. | `packages/db/src/schema/procurement.ts:136-160`, `finance.service.ts:24-120` |
| `consignment_receipts` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `branch_id`, FK `supplier_id`, Unique `(tenant_id, receipt_number)` | **Tabel yatim (unused)**: fitur konsinyasi (`BF-020`) hanya di memori browser. | `packages/db/src/schema/procurement.ts:163-189` |
| `consignment_receipt_items` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `receipt_id`, FK `product_id`, FK `batch_id` | **Tabel yatim (unused)**. | `packages/db/src/schema/procurement.ts:191-212` |
| `consignment_settlements` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `branch_id`, FK `supplier_id`, Unique `(tenant_id, settlement_number)` | **Tabel yatim (unused)**. | `packages/db/src/schema/procurement.ts:214-243` |
| `consignment_settlement_items` | **Tidak dipakai** | **Tidak dipakai** | PK `id`, FK `settlement_id`, FK `product_id` | **Tabel yatim (unused)**. | `packages/db/src/schema/procurement.ts:245-266` |
| `customers` | `BF-008`, `BF-010`, `BF-025` | `BF-007` (`migrate-master-data.ts`) | PK `id`, FK `tenant_id`, Unique `(tenant_id, code)` | **Read-only di `apps/backend`**; modal tambah pelanggan di `/pelanggan` tidak terhubung ke API; `point_balance` tidak pernah diupdate saat transaksi POS. | `packages/db/src/schema/sales.ts:18-41` |
| `sales_transactions` | `BF-011`, `BF-013`, `BF-015`, `BF-016`, `BF-024`, `BF-025`, `BF-026` | `BF-007` (`migrate-sales.ts`), `BF-013` (`syncSales`), `BF-015` (`createPrescription`) | PK `id` (tanpa `defaultRandom()`), FK `branch_id`, FK `cashier_shift_id`, FK `customer_id`, Unique `(tenant_id, invoice_no)` | Error insert pada `syncSales` ditelan oleh `catch (dbErr)` (`pos.service.ts:696`); pembuatan resep (`BF-015`) langsung masuk ke tabel ini tanpa shift kasir dan tanpa potong stok. | `packages/db/src/schema/sales.ts:44-82` |
| `sales_transaction_items` | `BF-015` (`GET /api/prescriptions`) | `BF-007` (`migrate-sales.ts`), `BF-013` (`syncSales`), `BF-015` (`createPrescription`) | PK `id` (tanpa `defaultRandom()`), FK `transaction_id`, FK `product_id`, Unique `(transaction_id, line_no)` | `networkStore.svelte.ts:145` mengirim PK `id` statis `01931818-a000-7000-8000-000000000001` untuk item pertama di setiap transaksi, menyebabkan tabrakan PK pada transaksi ke-2 dst.! | `packages/db/src/schema/sales.ts:84-110`, `networkStore.svelte.ts:145` |
| `sales_compounds` | `BF-015` (`GET /api/prescriptions`) | `BF-015` (`POST /api/prescriptions`) | PK `id`, FK `tenant_id`, FK `transaction_id` | Hanya menyimpan `compound_name`, `dosage_form`, `quantity`, `tuslah_amount`, `embalase_amount`, `subtotal`, `dosage_rules` (tanpa BUD, etiket, skrining klinis). | `packages/db/src/schema/sales.ts:113-134` |
| `sales_compound_items` | **Tidak pernah dibaca (`SELECT`)** | `BF-015` (`POST /api/prescriptions`) | PK `id`, FK `compound_id`, FK `product_id`, Unique `(compound_id, line_no)` | Ditulis saat membuat resep racikan (`prescription.service.ts:259`), tetapi tidak pernah di-SELECT saat membaca resep. | `packages/db/src/schema/sales.ts:136-158` |

---

### 5.2 Penyimpanan Browser (IndexedDB / `localStorage`), Penyimpanan File, dan Memori Server

| Entitas/tabel/store | Dibaca oleh alur | Ditulis/diubah oleh alur | Kunci/relasi penting | Risiko atau aturan yang harus diaudit | Bukti |
|---|---|---|---|---|---|
| **IndexedDB `localDb.products`** | `BF-012` (pencarian obat offline di `pos/+page.svelte:328`) | `BF-008` (`syncOfflineBootstrap` di `pos/+page.svelte:289`) | PK `id`, Index `sku, barcode, name, activeSubstance, rackLocation, drugClass, isActive, updatedAt` | Saat dibaca dalam mode offline (`pos/+page.svelte:339-348`), setiap produk diberi stok palsu `100` dan batch `BTC-LOKAL`. | `packages/db/src/client-indexeddb.ts:72, 81`, `apps/web/src/routes/pos/+page.svelte:262-358` |
| **IndexedDB `localDb.branchStocks`** | **Tidak pernah dibaca** | **Tidak pernah ditulis** | PK `[locationId+productId]` | **Tabel Dexie yatim (unused)**: didefinisikan di `client-indexeddb.ts`, namun tidak pernah diisi saat bootstrap maupun dibaca saat offline. | `packages/db/src/client-indexeddb.ts:73, 82` |
| **IndexedDB `localDb.batchStocks`** | **Tidak pernah dibaca** | **Tidak pernah ditulis** | PK `id`, Index `[locationId+productId+expiredDate]` | **Tabel Dexie yatim (unused)**: menyebabkan alokasi FEFO offline tidak memiliki data batch nyata di IndexedDB. | `packages/db/src/client-indexeddb.ts:74, 83` |
| **IndexedDB `localDb.pendingSales`** | `BF-013` (`refreshPendingCount`, `syncPendingSales`) | `BF-012` (`queueSale`), `BF-013` (`update(id, { synced: 1 })`) | PK `id`, Index `invoiceNo, createdAt, synced, retryCount` | Diisi **2 kali** per transaksi checkout (`mock-api.ts:511` & `pos/+page.svelte:559`); ditandai `synced: 1` secara buta tanpa memeriksa `results[].status`; `retryCount` & `lastError` tidak pernah diupdate. | `packages/db/src/client-indexeddb.ts:75, 85`, `apps/web/src/lib/stores/networkStore.svelte.ts:40-185` |
| **IndexedDB `localDb.staffAuth`** | **Tidak pernah dibaca** | **Tidak pernah ditulis** | PK `userId`, Index `username` | **Tabel Dexie yatim (unused)**: login offline menggunakan `localStorage["apoteku_saved_accounts"]` plaintext, bukan `localDb.staffAuth`. | `packages/db/src/client-indexeddb.ts:76, 86` |
| **`localStorage["apoteku_session_user"]`** | `BF-001` (`AuthStore.constructor`) | `BF-001` (auto-seed `DEFAULT_SUPERADMIN`, `switchBranch`, `clearSession`), `BF-002`, `BF-003`, `BF-004`, `BF-005` | JSON `UserProfile` (termasuk `role`, `permissions`, `pin`) | Dapat dimodifikasi langsung dari DevTools browser untuk mengubah `role` karena backend tidak memverifikasi token sesi. | `apps/web/src/lib/stores/authStore.svelte.ts:29, 60-99` |
| **`localStorage["apoteku_session_token"]`** | `BF-001` (`AuthStore.constructor`) | `BF-002`, `BF-003`, `BF-004` (`setUserSession`, `clearSession`) | String token | **Tidak pernah dibaca oleh `api.ts`** dan tidak pernah dikirim sebagai header `Authorization` ke server. | `apps/web/src/lib/stores/authStore.svelte.ts:30, 61-99`, `apps/web/src/lib/services/api.ts:15-43` |
| **`localStorage["apoteku_saved_accounts"]`** | `BF-002` (`loadSavedAccounts` di `login/+page.svelte:125`) | `BF-002`, `BF-003` (`saveAccountToDevice`, `removeSavedAccount`) | Array JSON akun tersimpan beserta `pin` plaintext | Memungkinkan login 1-klik tanpa PIN saat online (`handleSelectSavedAccount`, `login/+page.svelte:167-225`). | `apps/web/src/routes/login/+page.svelte:49, 125-225` |
| **In-Memory Cache `MockApiService` (`mockApi`)** | `BF-008`, `BF-009`, `BF-010`, `BF-011`, `BF-012`, `BF-015`, `BF-017`, `BF-018`, `BF-021`, `BF-022`, `BF-023`, `BF-024`, `BF-026` | `BF-008` (`ensureDataLoaded`), `BF-011` (`openShift`, `closeShift`), `BF-012` (`checkoutSale`) | Properti `products`, `branches`, `customers`, `suppliers`, `shifts` | `isLoadedFromApi` mengunci hasil bootstrap pertama sehingga pergantian cabang gagal memuat batch cabang lain (`mock-api.ts:196, 237, 450`). | `apps/web/src/lib/services/mock-api.ts:181-534` |
| **In-Memory Volatile Server Store (`ReturnsService`)** | `BF-022` (`getCustomerReturns`, `getSupplierReturns`) | `BF-022` (`recordCustomerReturn`, `recordSupplierReturn`, `resolveSupplierReturn`) | `this.customerReturnsList`, `this.supplierReturnsList` | **Hilang seluruhnya setiap kali proses backend Bun direstart** karena tidak disimpan di tabel PostgreSQL. | `apps/backend/src/modules/returns/returns.service.ts:39-40` |
| **Filesystem `<repo-root>/uploads/{category}`** | `BF-014`, `BF-015` (`GET /uploads/*`) | `BF-014` (`POST /api/uploads` via `Bun.write`) | Path `/uploads/{prescriptions\|invoices\|general}/{timestamp}_{name}` | Tidak ada validasi MIME/magic bytes/ekstensi pada saat unggah; disajikan langsung secara statis tanpa autentikasi. | `apps/backend/src/modules/media/media.routes.ts:6-42`, `apps/backend/src/index.ts:53-58` |

---

## 6. Cross-cutting concerns

### 6.1 Autentikasi, Otorisasi, Role/Permission, Tenant, dan Isolasi Data
- **Ketiadaan Verifikasi Token & Otorisasi di Backend:** Seluruh 36 endpoint di `apps/backend` (termasuk `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`, `PUT /api/branches/:id`, `POST /api/pos/sync-sales`, `POST /api/finance/debt-payments`) **tidak memeriksa header `Authorization` dan tidak memvalidasi role pemanggil**. Token yang dihasilkan saat login (`demo-token-${user.id}-${Date.now()}` di `auth.routes.ts:79`) tidak pernah disimpan di server dan tidak pernah dikirim oleh `apiFetch` (`apps/web/src/lib/services/api.ts:15-43`).
  - *Alur terdampak:* Semua alur (`BF-001` s/d `BF-027`).
- **Bypass Autentikasi di Client:**
  1. `AuthStore` (`authStore.svelte.ts:69-79`) otomatis membuat sesi `DEFAULT_SUPERADMIN` jika `localStorage` kosong.
  2. `+layout.svelte:20-31` hanya memblokir role `GUEST`, bukan sesi `null`.
  3. Klik kartu akun tersimpan saat online di `/login` (`login/+page.svelte:167-225`) langsung meloginkan pengguna tanpa PIN.
  4. Fallback `catch` pada `authStore.loginWithApi` (`authStore.svelte.ts:130-136`) tetap meloginkan pengguna jika PIN cocok dengan `rolePinMap` meskipun API mengembalikan 401.
  5. Kunci layar kasir di `/pos` (`pos/+page.svelte:187`) terbuka dengan 6 digit angka apa pun (`pinInput.length === 6`).
  - *Alur terdampak:* `BF-001`, `BF-002`, `BF-012`.
- **Isolasi Multi-Tenant & Konteks Cabang Belum Aktif:**
  - `apps/backend/src/middleware/tenant.ts` adalah dead code.
  - `apiFetch` di `apps/web/src/lib/services/api.ts:26-28` tidak pernah dipanggil dengan `tenantId` atau `userId`, dan hanya mengirim `x-branch-id` pada 3 fungsi `api.pos.*`.
  - Di backend, `erp.routes.ts` (`/api/stats`, `/api/suppliers`, `/api/customers`, `/api/sales`, `/api/purchases`, `/api/purchase-orders`), `reports.routes.ts` (`/api/reports/financial`, `/api/reports/sipnap`), dan `auth.routes.ts` (`/api/users`, `/api/branches`) bahkan tidak memfilter query berdasarkan `tenant_id`!
  - *Alur terdampak:* `BF-002` s/d `BF-026`.

### 6.2 Validasi Input serta Konsistensi Tipe/Kontrak UI–API–DB
- **Ketidakcocokan Kontrak UI vs API di `/penjualan` (`BF-016`):** `penjualan/+page.svelte:54-66` memetakan respons `GET /api/sales` ke `invoiceNumber` dan `totalAmount`, sedangkan template & filter (`L104-600`) membaca `invoiceNo`, `grandTotal`, `paymentStatus`, `createdAt`, mengakibatkan tampilan `undefined` / `RpNaN` dan crash saat mencari.
- **Ketidakcocokan Enum `paymentMethod` (`BF-012`, `BF-013`, `BF-015`):**
  - `pos/+page.svelte:52` mendeklarasikan `"CASH" | "QRIS" | "DEBIT" | "TRANSFER"`, sedangkan `SyncSalesBodySchema` (`pos.schema.ts:25-32`) menerima `"CASH" | "QRIS" | "EDC_DEBIT" | "EDC_CREDIT" | "TRANSFER" | "TEMPO"`, dan `prescription.service.ts:209` menginsert `"RESEP"`.
- **Endpoint Tanpa Skema Validasi TypeBox:** `POST /api/purchase-orders` (`erp.routes.ts:212`) menerima `{ body }: { body: any }` tanpa validasi skema.
- **Ketidakcocokan Tipe ID Sintetis vs Kolom `uuid` PostgreSQL:** Sesi default/offline memakai ID non-UUID (`"usr-superadmin"`, `"1"`, `"shf-..."`, `"b-def-..."`, `"inv-..."`, `"sp-..."`), sedangkan kolom-kolom kunci di PostgreSQL (`users.id`, `branches.id`, `cashier_shifts.id`, `sales_Transactions.cashier_user_id`, `product_batches.id`, `purchase_invoices.id`) bertipe native `uuid`.
  - *Alur terdampak:* `BF-004`, `BF-011`, `BF-013`, `BF-018`, `BF-019`.

### 6.3 Transaksi Database, Konsistensi, Idempotensi, Duplikasi, dan Rollback
- **Nol Penggunaan `db.transaction` di Seluruh Backend:** Tidak ada satu pun service di `apps/backend` yang membungkus operasi multi-tabel dengan `db.transaction(async (tx) => ...)`.
  - Pada `pos.service.ts:530-694` (`BF-013`), `prescription.service.ts:200-260` (`BF-015`), `transfer.service.ts:244-307, 385-428` (`BF-021`), dan `finance.service.ts:71-94` (`BF-019`), kegagalan di tengah eksekusi meninggalkan data yatim/inkonsisten tanpa rollback.
- **Duplikasi Antrean & Tabrakan Primary Key Item pada Sinkronisasi POS (`BF-012`, `BF-013`):**
  - Checkout POS memanggil `networkStore.queueSale` dua kali dengan UUID transaksi berbeda tetapi `invoiceNo` sama (`mock-api.ts:511` & `pos/+page.svelte:559`).
  - `networkStore.svelte.ts:145` menghasilkan UUID item statis `01931818-a000-7000-8000-000000000001` untuk item pertama di setiap transaksi.
  - `pos.service.ts:696-706` menangkap error database (`catch (dbErr)`) lalu tetap mengembalikan `status: "SYNCED"`, menyebabkan kehilangan data permanen saat sinkronisasi gagal.

### 6.4 Uang, Pembulatan, Tanggal/Waktu/Timezone, Kuantitas, Satuan, dan Aturan Perhitungan
- **Aritmetika Floating-Point IEEE 754 vs `numeric(24,8)`:** Walaupun skema PostgreSQL menggunakan `numeric(24,8)` sesuai `dokumen_plan.md` Bagian 10.1, seluruh kode backend dan frontend mengonversi nilai dengan `Number(...)` sebelum menjumlahkan/mengalikan.
- **Pengabaian `conversionFactor` Multi-Satuan di Backend:** Pada pembuatan resep (`prescription.service.ts:184-186`), pengiriman mutasi (`transfer.service.ts:271, 279`), dan retur (`returns.service.ts:110, 195`), kuantitas yang dikirim pengguna langsung ditulis ke `qty_base` / `quantity_base` dengan `conversionFactor = 1` tanpa mengalikan faktor konversi satuan dari `product_units`.
  - *Alur terdampak:* `BF-015`, `BF-021`, `BF-022`.
- **Ketidaksinkronan Cache Stok (`branch_stocks` & `branch_batch_stocks`) terhadap `stock_ledger`:**
  - `transfer.service.ts` (`BF-021`) dan `returns.service.ts` (`BF-022`) menulis mutasi ke `stock_ledger` tetapi tidak memperbarui `branch_stocks` maupun `branch_batch_stocks`.
  - `prescription.service.ts` (`BF-015`) menulis penjualan ke `sales_transactions` tetapi tidak menyentuh `stock_ledger`, `branch_stocks`, maupun `branch_batch_stocks`.
- **Tanggal Referensi Hardcoded di Kode:**
  - Peringatan ED di `stok/+page.svelte:464` menggunakan `new Date("2025-10-27")` sebagai tanggal hari ini.
  - Pembuatan SP (`pembelian/+page.svelte:596`), Konsinyasi (`pembelian/+page.svelte:636`), Kas Kecil (`keuangan/+page.svelte:355`), dan PIO (`pelayanan/+page.svelte:599`) meng-hardcode tanggal Oktober 2025.

### 6.5 Status dan Transisi Status
- **Resep (`BF-015`):** UI mengenal `DRAFT -> VERIFIED -> DISPENSED`, tetapi `prescription.service.ts:125, 285` selalu mengembalikan `"VERIFIED"` dan tidak ada kolom status di DB.
- **Surat Pesanan (`BF-017`):** UI menggunakan `"SENT" | "RECEIVED" | "CANCELLED"`, sedangkan DB menggunakan default `"ORDERED"`.
- **Mutasi Antar Cabang (`BF-021`):** Skema DB memiliki default `"DISPATCHED"`, sedangkan service & UI menggunakan `"REQUESTED" -> "IN_TRANSIT" -> "RECEIVED" | "RECEIVED_DISCREPANCY"`, namun UI tidak menyediakan tombol untuk membuat status `"REQUESTED"`.

### 6.6 Audit Trail, Privasi, serta Retensi Data
- **Audit User ID Acak:** `transfer.service.ts:241, 375`, `returns.service.ts:114, 199`, dan `finance.service.ts:67` menghasilkan `crypto.randomUUID()` baru untuk kolom `shipped_by`, `received_by`, `created_by`, dan `paid_by` karena `x-user-id` tidak dikirim oleh frontend! Akibatnya, jejak audit pelaku transaksi di database berisi UUID acak yang tidak merujuk ke baris mana pun di tabel `users`.
- **Privasi Kredensial:** `GET /api/users` (`auth.routes.ts:830`) dan redirect URL `GET /api/auth/google/callback` (`auth.routes.ts:775-782`) mengekspos PIN plaintext pengguna.

### 6.7 Offline, Cache, Retry, Konflik, dan Sinkronisasi
- Hanya tabel `localDb.products` dan `localDb.pendingSales` yang dipakai di IndexedDB; `localDb.branchStocks`, `localDb.batchStocks`, dan `localDb.staffAuth` tidak pernah diisi atau dibaca (`BF-008`, `BF-012`).
- `networkStore.syncPendingSales()` (`BF-013`) tidak memeriksa status per item pada `res.results` (`"SYNCED"` vs `"FAILED"`), tidak memperbarui `retryCount`/`lastError`, dan menggabungkan semua transaksi tertunda ke `branchId` & `cashierShiftId` milik transaksi pertama di antrean (`networkStore.svelte.ts:104-108`).

### 6.8 Error Handling, Logging, Observability, dan Pemulihan
- Mayoritas endpoint di `shift.routes.ts`, `prescription.routes.ts`, `erp.routes.ts`, `transfer.routes.ts`, `returns.routes.ts`, `finance.routes.ts`, dan `reports.routes.ts` menangkap error di blok `catch (err)` dan mengembalikan `{ success: false, error: err.message }` **dengan status HTTP 200 OK** (karena tidak menyetel `set.status = 400/500`). Akibatnya, `apiFetch` (`api.ts:35`: `if (!res.ok)`) menganggap request berhasil!
- Di sisi frontend, banyak aksi (`pembelian/+page.svelte:523`, `pengiriman/+page.svelte:304, 427`, `pelayanan/+page.svelte:512`) menangkap kegagalan API lalu memalsukan keberhasilan dengan memutasi state lokal di memori browser.

### 6.9 Performa/Paginasi serta Data Besar
- Paginasi di `DataTable.svelte` pada seluruh halaman hanya bersifat visual atau memfilter array yang sudah dimuat penuh di memori browser (`limit = 50` s/d `500` tanpa parameter `offset`/`cursor` di API).
- `pos.service.ts:302-341` memuat seluruh `products` dan seluruh `product_units` milik tenant lalu melakukan `.filter(u => u.productId === p.id)` secara $O(N \times M)$ di memori JS.

### 6.10 Migrasi, Seed, Kompatibilitas Data Lama, dan Impor/Ekspor
- Skrip `migrate-master-data.ts` (`BF-007`) gagal memetakan satuan turunan dan stok akhir jika dijalankan ulang (karena `.onConflictDoNothing().returning()` mengembalikan kosong saat produk sudah ada) dan tidak mengimpor `FASTBATCH.csv` ke `product_batches` / `branch_batch_stocks`.
- Ekspor CSV hanya terimplementasi nyata di `/laporan` (`BF-026`, `laporan/+page.svelte:444-486`), sedangkan tombol Ekspor CSV di `/penjualan` (`BF-016`, `penjualan/+page.svelte:140`) hanya memunculkan `alert()`.

### 6.11 Keamanan Unggahan, Akses Berkas, dan Integrasi Eksternal
- `POST /api/uploads` (`BF-014`, `media.routes.ts:24-80`) tidak memvalidasi MIME type atau magic bytes file dan menyajikannya secara publik melalui `/uploads/*`.
- `auth.routes.ts:587` menyimpan fallback Google OAuth Client Secret secara hardcoded di dalam kode sumber.

---

## 7. Matriks kelengkapan

Matriks ini memverifikasi bahwa setiap permukaan kode (15 halaman/layout, 36 endpoint backend, 9 service/modul backend, 3 modul `@apoteku/core`, 25 tabel PostgreSQL, 5 tabel IndexedDB, 3 kunci `localStorage`, dan 3 skrip CLI) telah terpetakan ke alur `BF-XXX` atau dijelaskan statusnya:

| Kategori Permukaan | Total Ditemukan | Terpetakan ke Alur Aktif (`BF-001`..`BF-027`) | Belum Terhubung / Dead Code / Tabel Yatim | Rincian Item yang Belum Terhubung / Yatim |
|---|---|---|---|---|
| **Halaman & Layout UI (`apps/web/src/routes`)** | 15 (`+layout` + 14 halaman) | 15 | 0 (Namun `/register` hanya redirect ke `/login` pada `BF-003`) | `/register/+page.svelte` tidak memanggil `POST /api/auth/register`. |
| **Endpoint API Backend (`apps/backend`)** | 36 endpoint | 31 dipanggil oleh UI | 5 endpoint tidak pernah dipanggil oleh UI | 1. `GET /api/auth/status` (`BF-003`)<br>2. `POST /api/auth/register` (`BF-003`)<br>3. `GET /api/pos/sync-delta` (`BF-008`)<br>4. `GET /api/customers` (`BF-010`, UI memakai bootstrap)<br>5. `POST /api/purchase-orders` (`BF-017`, diabaikan oleh `handleCreateSp`)<br>6. `GET /api/reports/financial` (`BF-026`, tidak dipanggil oleh `/laporan`)<br>*(Catatan: `GET /health` pada `BF-027` dan `GET /api/finance/debt-summary` pada `BF-019`/`BF-024` ada di `api.ts` tetapi tidak dipanggil langsung oleh komponen UI).* |
| **Middleware & Service Backend** | 1 middleware + 9 modul route/service | 9 modul route/service | 1 middleware dead code | `apps/backend/src/middleware/tenant.ts` (`tenantMiddleware`) tidak pernah di-import di mana pun. |
| **Modul `@apoteku/core`** | 3 (`totals.ts`, `selection.ts`, `escpos.ts`) | 2 (`calculateCartTotals`, `selectFefoBatches` di `BF-012`) | 1 (`EscPosBuilder` / `ESC_POS`) | `packages/core/src/hardware/escpos.ts` di-import di `pos/+page.svelte:14` tetapi tidak pernah dipanggil. |
| **Tabel PostgreSQL (`packages/db/src/schema`)** | 25 tabel | 17 tabel diakses oleh `apps/backend` (15 read/write, 2 write-only `stock_ledger` & `sales_compound_items`) + 2 tabel hanya di ETL (`legacy_id_map`, `purchase_invoice_items`) | 6 tabel sama sekali tidak pernah dipakai di mana pun | 1. `stock_adjustments` (`BF-023`)<br>2. `stock_adjustment_items` (`BF-023`)<br>3. `consignment_receipts` (`BF-020`)<br>4. `consignment_receipt_items` (`BF-020`)<br>5. `consignment_settlements` (`BF-020`)<br>6. `consignment_settlement_items` (`BF-020`) |
| **Tabel IndexedDB (`packages/db/src/client-indexeddb.ts`)** | 5 tabel Dexie | 2 (`products` di `BF-008`/`BF-012`, `pendingSales` di `BF-012`/`BF-013`) | 3 tabel Dexie tidak pernah ditulis/dibaca | 1. `localDb.branchStocks` (`BF-008`)<br>2. `localDb.batchStocks` (`BF-008`)<br>3. `localDb.staffAuth` (`BF-002`) |
| **Skrip CLI / ETL (`packages/db/src/scripts`)** | 3 skrip | 3 (`BF-007`) | 0 | `migrate-master-data.ts`, `migrate-purchases.ts`, `migrate-sales.ts` (namun `FASTBATCH.csv` di `migrate-master-data.ts:511` adalah dead code). |

---

## 8. Prioritas audit lanjutan

Berikut adalah rekomendasi prioritas audit dan perbaikan lanjutan berdasarkan tingkat dampak terhadap integritas data, transaksi keuangan/stok, dan keamanan lintas pengguna:

### Prioritas P0 — Risiko Kehilangan/Kerusakan Data Transaksi, Korupsi Saldo, atau Bypass Akses Kritis

1. **P0-1: Kehilangan Data Transaksi POS akibat Silent Catch DB Error, Duplikasi Primary Key Item, dan Double-Queueing (`BF-012`, `BF-013`)**
   - **Alasan prioritas:** Setiap checkout POS saat ini memasukkan 2 record duplikat ke `localDb.pendingSales` (`mock-api.ts:511` & `pos/+page.svelte:559`), menggunakan UUID item statis `01931818-a000-7000-8000-000000000001` (`networkStore.svelte.ts:145`) yang melanggar Primary Key `sales_transaction_items` pada transaksi ke-2 dst., dan `pos.service.ts:696-706` menelan error DB (`catch (dbErr)`) lalu tetap mengembalikan `status: "SYNCED"`, membuat transaksi di IndexedDB ditandai selesai padahal gagal masuk ke PostgreSQL.
   - **Bukti kode:** `apps/web/src/lib/services/mock-api.ts:511-518`, `apps/web/src/routes/pos/+page.svelte:553-563`, `apps/web/src/lib/stores/networkStore.svelte.ts:104-174`, `apps/backend/src/modules/pos/pos.service.ts:529-706`.
   - **Prasyarat audit/perbaikan:** Pastikan `id` pengguna, cabang, shift, dan batch berupa UUID valid di database dan IndexedDB sebelum menguji sinkronisasi end-to-end.

2. **P0-2: Ketiadaan Autentikasi/Otorisasi API, Auto-Login Superadmin, Kebocoran PIN, dan Bypass Login (`BF-001`, `BF-002`, `BF-003`, `BF-004`, `BF-005`)**
   - **Alasan prioritas:** Seluruh endpoint mutasi data (`/api/users`, `/api/branches`, `/api/pos/sync-sales`, `/api/finance/debt-payments`, dll.) terbuka tanpa pemeriksaan token atau role; `GET /api/users` mengembalikan PIN semua staf dalam plaintext; `AuthStore` otomatis meloginkan pengunjung tanpa sesi sebagai `DEFAULT_SUPERADMIN`; klik akun tersimpan saat online langsung login tanpa PIN; dan kunci layar POS terbuka dengan 6 digit angka apa pun.
   - **Bukti kode:** `apps/web/src/lib/stores/authStore.svelte.ts:32-45, 69-80, 130-136`, `apps/web/src/routes/+layout.svelte:20-31`, `apps/web/src/routes/login/+page.svelte:167-225`, `apps/web/src/routes/pos/+page.svelte:187`, `apps/backend/src/modules/auth/auth.routes.ts:56, 79, 587, 795-981`, `apps/web/src/lib/services/api.ts:15-43`.
   - **Prasyarat audit/perbaikan:** Desain skema sesi/JWT yang disepakati (apakah mengikuti JWT + Refresh Cookie pada `dokumen_plan.md` Bagian 7.1) serta hashing PIN/password di tabel `users`.

3. **P0-3: Ketiadaan Transaksi Database Atomik (`db.transaction`) di Seluruh Operasi Multi-Tabel (`BF-013`, `BF-015`, `BF-019`, `BF-021`)**
   - **Alasan prioritas:** Operasi kritis seperti sinkronisasi penjualan + potong stok (`pos.service.ts:530-694`), pelunasan hutang + update faktur (`finance.service.ts:71-94`), pembuatan resep + racikan (`prescription.service.ts:200-260`), dan mutasi stok (`transfer.service.ts:244-307, 385-428`) dieksekusi tanpa `db.transaction`, berisiko meninggalkan state parsial/korup saat terjadi kegagalan di tengah proses.
   - **Bukti kode:** `apps/backend/src/modules/pos/pos.service.ts:530-694`, `apps/backend/src/modules/finance/finance.service.ts:71-94`, `apps/backend/src/modules/prescription/prescription.service.ts:200-260`, `apps/backend/src/modules/inventory/transfer.service.ts:244-307, 385-428`.
   - **Prasyarat audit/perbaikan:** Tidak ada; `db.transaction` didukung langsung oleh Drizzle `postgres-js` (`packages/db/src/client.ts`).

---

### Prioritas P1 — Inkonsistensi Saldo Stok, Aturan Bisnis Inti yang Putus, dan Ketidakcocokan Kontrak

1. **P1-1: Terputusnya Pembaruan Saldo Stok (`branch_stocks` & `branch_batch_stocks`) pada Alur Pembelian, Mutasi, Pelayanan Resep, Retur, dan Migrasi Batch (`BF-007`, `BF-015`, `BF-018`, `BF-021`, `BF-022`, `BF-023`)**
   - **Alasan prioritas:**
     - `migrate-master-data.ts:511-520` membaca `FASTBATCH.csv` tetapi tidak pernah mengisinya ke `product_batches` / `branch_batch_stocks`.
     - Input faktur pembelian PBF di `/pembelian` (`BF-018`) hanya di memori browser (tidak ada `POST /api/purchases`).
     - Mutasi antar cabang (`BF-021`) dan Retur (`BF-022`) menulis `stock_ledger` tetapi tidak memperbarui `branch_stocks` / `branch_batch_stocks`.
     - Pelayanan resep (`BF-015`) membuat `sales_transactions` tanpa memotong stok sama sekali.
     - Stok opname (`BF-023`) hanya berjalan di memori browser tanpa menyentuh `stock_adjustments` maupun `branch_stocks`.
   - **Bukti kode:** `packages/db/src/scripts/migrate-master-data.ts:510-558`, `apps/web/src/routes/pembelian/+page.svelte:387-431`, `apps/backend/src/modules/inventory/transfer.service.ts:263-307, 378-414`, `apps/backend/src/modules/returns/returns.service.ts:79-119, 165-203`, `apps/backend/src/modules/prescription/prescription.service.ts:146-262`, `apps/web/src/routes/stok/+page.svelte:576-734`.
   - **Prasyarat audit/perbaikan:** Standarisasi fungsi mutasi inventori terpusat di backend yang wajib memperbarui `stock_ledger`, `branch_stocks`, dan `branch_batch_stocks` (dengan konversi `conversion_factor` satuan) di dalam satu `db.transaction`.

2. **P1-2: Kerusakan Pemetaan Data & Crash Pencarian pada Halaman Riwayat Penjualan `/penjualan` (`BF-016`)**
   - **Alasan prioritas:** Halaman `/penjualan` menampilkan `undefined` untuk nomor nota & waktu, `RpNaN` untuk total harga, badge `BELUM LUNAS` untuk semua transaksi, item kosong di modal detail, dan langsung crash (`TypeError`) saat pengguna mengetik di kolom pencarian.
   - **Bukti kode:** `apps/web/src/routes/penjualan/+page.svelte:54-66, 104-116, 330-600`, `apps/backend/src/modules/erp/erp.routes.ts:86-114`.
   - **Prasyarat audit/perbaikan:** Selaraskan struktur objek di `penjualan/+page.svelte` dengan respons `GET /api/sales` serta sertakan `sales_transaction_items` dan `customers.name`.

3. **P1-3: Pemalsuan Angka Mutasi & Pencantuman Amoxicillin pada Laporan Regulasi SIPNAP Kemenkes (`BF-026`)**
   - **Alasan prioritas:** `GET /api/reports/sipnap` (`reports.routes.ts:60-136`) memasukkan `%amoxicillin%` ke daftar narkotika/prekursor dan menghasilkan angka stok awal, masuk, keluar, dan akhir dari rumus matematika indeks array `idx`, bukan dari mutasi nyata di database.
   - **Bukti kode:** `apps/backend/src/modules/reports/reports.routes.ts:76-107`, `apps/web/src/routes/laporan/+page.svelte:304-341`.
   - **Prasyarat audit/perbaikan:** Perbaikan pencatatan `stock_ledger` (`P1-1`) agar query SIPNAP dapat menghitung saldo nyata per periode.

4. **P1-4: Penyimpanan Dokumen Retur di RAM Volatile Server & Pengabaian Endpoint SP `POST /api/purchase-orders` (`BF-017`, `BF-022`)**
   - **Alasan prioritas:** Seluruh data retur di `ReturnsService` (`returns.service.ts:39-40`) hilang saat server restart; pembuatan SP di `pembelian/+page.svelte:573-607` tidak memanggil `api.erp.createPurchaseOrder` dan skema DB belum memiliki tabel `purchase_order_items`.
   - **Bukti kode:** `apps/backend/src/modules/returns/returns.service.ts:39-40`, `apps/web/src/routes/pembelian/+page.svelte:573-607`, `packages/db/src/schema/procurement.ts:43-68`.
   - **Prasyarat audit/perbaikan:** Penambahan skema tabel untuk retur dan detail item SP (`purchase_order_items`).

5. **P1-5: Rekonsiliasi Shift Kasir Tidak Memfilter `cashier_shift_id` dan Modal Shift `/pos` Menampilkan Angka Hardcoded (`BF-011`)**
   - **Alasan prioritas:** `shift.service.ts:75-80, 198-203` menjumlahkan semua transaksi cabang sejak `startTime` tanpa memfilter `cashier_shift_id` dan termasuk transaksi `RESEP` yang dibuat dari `/pelayanan`; sementara modal shift di `pos/+page.svelte:120-126` menampilkan angka statis hardcoded.
   - **Bukti kode:** `apps/backend/src/modules/shift/shift.service.ts:67-97, 191-213`, `apps/web/src/routes/pos/+page.svelte:120-158, 1396-1479`.
   - **Prasyarat audit/perbaikan:** Hubungkan state modal shift di `/pos` ke hasil `api.shift.getCurrent(selectedBranchId)` dan perketat filter SQL di `shift.service.ts`.

---

### Prioritas P2 — Alur Pendukung, Penyimpanan Offline IndexedDB, Keamanan Berkas, dan Pengalaman Multi-Cabang

1. **P2-1: Penguncian Cache `mockApi` pada Cabang Pertama & Hardcode `branchId: "1"` di Halaman Backoffice (`BF-008`, `BF-018`, `BF-024`, `BF-026`)**
   - **Alasan prioritas:** `mockApi.ensureDataLoaded` (`mock-api.ts:196`) tidak memuat ulang data ketika cabang diganti, dan pemetaan `onMount` di `/pembelian` (`L164`), `/keuangan` (`L255`), serta `/laporan` (`L323`) meng-hardcode `branchId: "1"`, sehingga pemilihan cabang selain cabang pertama membuat stok atau tabel menjadi kosong.
   - **Bukti kode:** `apps/web/src/lib/services/mock-api.ts:195-260, 450`, `apps/web/src/routes/pembelian/+page.svelte:164`, `apps/web/src/routes/keuangan/+page.svelte:255`, `apps/web/src/routes/laporan/+page.svelte:323`.
   - **Prasyarat audit/perbaikan:** Simpan cache per `branchId` dan sertakan `branchId` asli pada respons `/api/purchases`, `/api/finance/cashflow`, dan `/api/reports/sipnap`.

2. **P2-2: Kelengkapan Mode Offline IndexedDB (`localDb.branchStocks`, `localDb.batchStocks`, `localDb.staffAuth`) (`BF-002`, `BF-008`, `BF-012`)**
   - **Alasan prioritas:** Ketiga tabel Dexie tersebut belum pernah diisi saat bootstrap, sehingga saat offline `/pos` memalsukan stok menjadi 100 (`BTC-LOKAL`) dan login offline mengandalkan plaintext `localStorage`.
   - **Bukti kode:** `packages/db/src/client-indexeddb.ts:71-90`, `apps/web/src/routes/pos/+page.svelte:262-358`.
   - **Prasyarat audit/perbaikan:** Isi `localDb.branchStocks` dan `localDb.batchStocks` di `syncOfflineBootstrap()` serta gunakan `api.pos.getDelta` untuk sinkronisasi delta.

3. **P2-3: Validasi Tipe Berkas Unggahan (`POST /api/uploads`) dan Penanganan HTTP Status Error di Backend (`BF-014`, Lintas Alur)**
   - **Alasan prioritas:** `media.routes.ts:24-80` belum membatasi MIME/magic bytes file yang diunggah, dan mayoritas route backend mengembalikan HTTP 200 saat terjadi error (`{ success: false, error }`).
   - **Bukti kode:** `apps/backend/src/modules/media/media.routes.ts:24-80`, `apps/backend/src/modules/shift/shift.routes.ts:25-27`, `apps/web/src/lib/services/api.ts:35-40`.
   - **Prasyarat audit/perbaikan:** Tambahkan pengecekan magic bytes/MIME pada `media.routes.ts` dan pemeriksaan `if (json?.success === false)` atau penetapan `set.status` di backend.

4. **P2-4: Penyambungan Fitur yang Masih 100% Mock/Simulasi (Konsinyasi `BF-020`, Buku Kas `BF-024`, Form Tambah Pelanggan/PBF `BF-010`, tambah/edit Master Obat `BF-009`)**
   - **Alasan prioritas:** Pengguna dapat mengisi form dan melihat pesan sukses di layar, padahal tidak ada data yang dikirim ke server.
   - **Bukti kode:** `apps/web/src/routes/stok/+page.svelte:798-907`, `apps/web/src/routes/pelanggan/+page.svelte:314-484`, `apps/web/src/routes/supplier/+page.svelte:309-480`, `apps/web/src/routes/pembelian/+page.svelte:610-657`, `apps/backend/src/modules/finance/finance.routes.ts:65-142`.
   - **Prasyarat audit/perbaikan:** Implementasi endpoint CRUD terkait di `apps/backend`.

---

### Prioritas P3 — Kualitas Kode, Pembersihan Dead Code, dan Penyempurnaan Non-Kritis

1. **P3-1: Pembersihan atau Pengaktifan Dead Code (`tenant.ts`, `EscPosBuilder`, Shortcut `F2`/`F8`, Anchor Link Dashboard)**
   - **Alasan prioritas:** Mengurangi kebingungan pemeliharaan kode antara fitur yang tampak ada di UI/import tetapi belum aktif.
   - **Bukti kode:** `apps/backend/src/middleware/tenant.ts:1-30`, `packages/core/src/hardware/escpos.ts:1-52`, `apps/web/src/routes/pos/+page.svelte:14, 643, 748`, `apps/web/src/lib/components/Navbar.svelte:145-149`, `apps/web/src/lib/components/KpiCards.svelte:77`.
   - **Prasyarat audit/perbaikan:** Keputusan produk apakah fitur Web Serial ESC/POS dan shortcut keyboard POS akan diaktifkan pada iterasi berikutnya.
