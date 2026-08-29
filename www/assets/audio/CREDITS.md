# Ses Künyesi / Lisanslar

Tüm sesler ticari kullanıma uygun; atıf zorunlu değil (yine de kayıt için burada).

## Müzik (gerçek kayıt, KAMU MALI / Public Domain)
- **music-classic-1.mp3** — Erik Satie, *Gymnopédie No.1* (icra: Michael Laucke).
  Kaynak: Wikimedia Commons — Public Domain (hem beste hem kayıt kamu malı).
  https://commons.wikimedia.org/wiki/File:Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac
- **music-classic-2.mp3** — Erik Satie, *Gymnopédie No.2* (icra: Michael Laucke).
  Kaynak: Wikimedia Commons — Public Domain.
  https://commons.wikimedia.org/wiki/File:Satie_Gymnopedie_No_2_performed_by_Michael_Laucke.flac
  (FLAC → mp3 128k'ya ffmpeg ile çevrildi.)
- **music-lofi-1.mp3 / music-lofi-2.mp3** — Loyalty Freak Music, *"CHILL FOR REAL!"*
  (01 Where I'm High / 05 Soft as a dry pillow). **CC0 (kamu malı)** — ticari serbest, atıf gerekmez.
  Kaynak: archive.org — https://archive.org/details/loyalty-freak-music-chill-for-real
  (320k mp3 → 128k'ya küçültüldü.)

## Ortam sesleri — MİXER (birlikte çalınabilir, 2026-07-23)
Gerçek CC0 kayıtlar (Pixabay Content License — ticari serbest, atıf gerekmez), kusursuz loop (kuyruk→baş crossfade, ffmpeg):
- **amb-rain.mp3** — Yağmur, CAM YAĞMURU (Pixabay · "Rain (on the window)" by DonRain, 60 sn)
  🔄 2026-08-29'da değiştirildi: eski kayıtta tiz enerji ana sesin yalnız 5 dB altındaydı
  (ölçüldü), kulakta sürekli bir hışırtı bırakıyordu. Yeni kayıtta bu fark 21 dB.
  Eski dosya `_arsiv/amb-rain-eski.mp3`.
- **amb-fire.mp3** — Şömine / çıtırdayan ateş (Pixabay)
- **amb-birds.mp3** — Kuş / orman kuşları (Pixabay)
- **amb-forest.mp3** — Orman doğası (Pixabay)
- **amb-tick.mp3** — Gerçek saat tik-tak (Pixabay)

## 2026-08-29 — SENTEZ SESLER KALDIRILDI, HEPSİ GERÇEK KAYIT
Kullanıcı "farklı isimler ama hep aynı sesler" dedi; doğruydu. Deniz dalgası,
rüzgâr, gece böcekleri, kafe uğultusu ve brown/white/pink noise KODDAN
üretiliyordu — hepsi tek bir gürültü üretecinin filtresi değiştirilmiş hâliydi.
Hepsi kaldırıldı. Yeni gerçek kayıtlar (Pixabay Content License, 60 sn):
- **amb-wave.mp3** — Kıyıya vuran deniz dalgası
- **amb-wind.mp3** — Uluyan kış rüzgârı ("Howling Wind and Snow")
- **amb-night.mp3** — Cırcır böcekli gece ortamı
- **amb-stream.mp3** — Akarsu (27 sn) · `cafe` yerine geldi; jetonunu kafeye
  vermiş kullanıcılar bunu ücretsiz alır (stats.js)

Kaldırılanlar: brown noise · white noise · pink noise · kafe uğultusu · fırtına
(fırtına adayları kullanıcı tarafından beğenilmedi, hiç eklenmedi).

⚠️ Ses dosyası değiştirirsen `www/js/audio.js › SES_SURUM` damgasını da yükselt;
yoksa güncelleyen kullanıcı eski sesi önbellekten dinlemeye devam eder.

## Arka plan videoları (assets/video/*.mp4, 2026-07-23)
Gerçek CC0 stok video (Pixabay Content License — ticari serbest, atıf gerekmez), kusursuz loop + sessiz + küçültülmüş (ffmpeg):
akvaryum · koi · sualti · okyanus · selale · orman · yagmur · somine · gece · bulut. Kaynak: pixabay.com.
