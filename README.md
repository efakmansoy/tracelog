# TraceLog - Project Tracker

TraceLog is a modern, offline-first task and project tracking application built with React, TypeScript, and Supabase.

## 🚀 Key Features

- **Multi-Level Tracking:** Manage single tasks or complex series with multiple stages.
- **Offline-First:** Full functionality even without internet, with automatic cloud sync when back online.
- **PWA (Progressive Web App):** Installable on mobile and desktop for a native experience.
- **Dual Auth:** Support for Google OAuth and Magic Link login.
- **Push Notifications:** Daily summaries and task reminders (Supabase Edge Functions).
- **Error Monitoring:** Real-time error tracking with Sentry.

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, TypeScript, React Router 7.
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, RLS).
- **State & Data:** TanStack Query & Custom Repository Pattern.
- **Testing:** Vitest & Playwright.

## 🛠️ Setup

1. **Clone the repo:**
   ```bash
   git clone <repo-url>
   cd takip
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file with the following:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SENTRY_DSN`
   - `VITE_WEB_PUSH_PUBLIC_KEY`

4. **Database:**
   Apply the schema in `supabase/schema.sql` to your Supabase project.

5. **Run:**
   ```bash
   npm run dev
   ```

## 🧪 Testing

- **Unit/Integration:** `npm run test`
- **E2E (Playwright):** `npm run e2e`

## 📦 Deployment

The project is configured for GitHub Pages:
```bash
npm run deploy
```

---

# TraceLog - Proje Takip Sistemi

TraceLog; React, TypeScript ve Supabase ile oluşturulmuş, modern ve çevrimdışı öncelikli bir görev ve proje takip uygulamasıdır.

## 🚀 Temel Özellikler

- **Çok Seviyeli Takip:** Tekil görevleri veya çok aşamalı karmaşık serileri yönetin.
- **Çevrimdışı Öncelikli:** İnternet olmasa bile tam işlevsellik; çevrimiçi olduğunuzda otomatik bulut senkronizasyonu.
- **PWA Desteği:** Yerel bir uygulama deneyimi için mobil ve masaüstüne yüklenebilir.
- **Çift Kimlik Doğrulama:** Google OAuth ve Magic Link ile giriş desteği.
- **Anlık Bildirimler:** Günlük özetler ve görev hatırlatıcıları (Supabase Edge Functions).
- **Hata İzleme:** Sentry ile gerçek zamanlı hata takibi.

## 🛠️ Teknoloji Yığını

- **Frontend:** React 19, Vite, TypeScript, React Router 7.
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, RLS).
- **Veri Yönetimi:** TanStack Query & Özel Repository Yapısı.
- **Test:** Vitest & Playwright.

## 🛠️ Kurulum

1. **Repoyu klonlayın:**
   ```bash
   git clone <repo-url>
   cd takip
   ```

2. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

3. **Ortam Değişkenleri:**
   Aşağıdaki bilgileri içeren bir `.env` dosyası oluşturun:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SENTRY_DSN`
   - `VITE_WEB_PUSH_PUBLIC_KEY`

4. **Veritabanı:**
   `supabase/schema.sql` dosyasındaki şemayı Supabase projenize uygulayın.

5. **Çalıştır:**
   ```bash
   npm run dev
   ```

## 🧪 Testler

- **Birim/Entegrasyon:** `npm run test`
- **E2E (Playwright):** `npm run e2e`

## 📦 Yayınlama

Proje GitHub Pages için yapılandırılmıştır:
```bash
npm run deploy
```

