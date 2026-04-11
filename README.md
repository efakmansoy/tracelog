# Takip

React + Vite tabanli tek sayfa takip panosu.

## Calistirma

1. `npm install`
2. `.env.example` dosyasini `.env` olarak kopyala
3. Supabase kullanacaksan `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` degerlerini gir
4. `npm run dev`

Supabase degiskenleri bos birakilirsa uygulama yerel modda calisir ve verileri tarayici `localStorage` icinde tutar.

## Supabase kurulum notlari

- [supabase/schema.sql](/d:/takip/supabase/schema.sql) dosyasini SQL Editor'de calistir
- Auth provider olarak email magic link ac
- Push kullanmak icin `VITE_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` tanimla
- Gunluk ozet fonksiyonu: [supabase/functions/daily-summary/index.ts](/d:/takip/supabase/functions/daily-summary/index.ts)

## Ucretsiz plan notu

Bu kurgu ucretli bir Supabase ozelligine dayanmaz. Yine de Free plan dusuk aktiviteli projelerde pause olabilecegi icin gunluk push ozeti her zaman garanti degildir.
