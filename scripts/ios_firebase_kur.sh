#!/usr/bin/env bash
# ============================================================
#  AKORA iOS — FIREBASE + APPLE GİRİŞİ + PUSH  ·  2026-08-29
#
#  `npx cap add ios` iOS projesini HER BUILD'DE SIFIRDAN üretir.
#  Bu yüzden Firebase yapılandırması, yetkilendirmeler (entitlements)
#  ve Google giriş URL şeması Xcode'da elle ayarlanamaz — her build'de
#  bu betik yeniden kurar. Kalıcı iOS ayarı BURAYA yazılır, yoksa kaybolur.
#
#  Ne yapar:
#    1) GoogleService-Info.plist'i uygulama hedefine kopyalar ve
#       Xcode projesine KAYNAK olarak ekler (yoksa Firebase açılışta çöker)
#    2) App.entitlements üretir: Sign in with Apple + Push (APNs)
#    3) Info.plist'e Google girişinin geri dönüş URL şemasını ekler
#       (REVERSED_CLIENT_ID — plist'ten okunur, elle YAZILMAZ)
#
#  🚨 Yetkilendirmeler yalnız dosyada olmakla yetmez: App ID'de de
#     "Sign in with Apple" ve "Push Notifications" AÇIK olmalı, yoksa
#     `fetch-signing-files --create` bu yetkileri içermeyen bir profil
#     üretir ve imzalama "profile doesn't match entitlements" der.
# ============================================================
set -e

PROJ_DIR="ios/App"
APP_DIR="$PROJ_DIR/App"
PLIST="$APP_DIR/Info.plist"
GS="$APP_DIR/GoogleService-Info.plist"
ENT="$APP_DIR/App.entitlements"

echo "── 1/3 · GoogleService-Info.plist"
if [ ! -f "firebase/GoogleService-Info.plist" ]; then
  echo "🔴 firebase/GoogleService-Info.plist yok — Firebase kurulamaz."; exit 1
fi
cp firebase/GoogleService-Info.plist "$GS"

# Xcode projesine kaynak olarak ekle. Kopyalamak yetmez; hedefin
# "Copy Bundle Resources" listesinde olmazsa .app içine girmez.
ruby - "$PROJ_DIR/App.xcodeproj" <<'RUBY'
require 'xcodeproj'
proj = Xcodeproj::Project.open(ARGV[0])
target = proj.targets.find { |t| t.name == 'App' } || proj.targets.first
grup   = proj.main_group.find_subpath('App', true)

['GoogleService-Info.plist'].each do |ad|
  next if grup.files.any? { |f| f.display_name == ad }
  ref = grup.new_reference(ad)
  target.add_resources([ref])
  puts "  eklendi: #{ad}"
end

# Yetkilendirme dosyasını her yapılandırmaya bağla
target.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
end
proj.save
puts "  Xcode projesi güncellendi"
RUBY

echo "── 2/3 · App.entitlements (Apple girişi + push)"
cat > "$ENT" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
XML
echo "  yazıldı: $ENT"

echo "── 3/3 · Google giriş URL şeması"
# REVERSED_CLIENT_ID'yi plist'ten OKU — elle yazılan değer yanlış projeye
# işaret edip girişi sessizce bozar.
REV=$(/usr/libexec/PlistBuddy -c "Print :REVERSED_CLIENT_ID" "$GS" 2>/dev/null || echo "")
if [ -z "$REV" ]; then
  echo "🟠 REVERSED_CLIENT_ID okunamadı — Google girişi çalışmaz."
else
  # ios_izin_metinleri.sh ve codemagic.yaml zaten CFBundleURLTypes:0'ı
  # (com.asimgokcek.akis) kuruyor; Google şeması İKİNCİ girdi olarak eklenir.
  N=$(/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes" "$PLIST" 2>/dev/null | grep -c "Dict {" || echo 0)
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$N dict" "$PLIST"
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$N:CFBundleURLSchemes array" "$PLIST"
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:$N:CFBundleURLSchemes:0 string $REV" "$PLIST"
  echo "  eklendi: $REV"
fi

echo "✅ Firebase / Apple girişi / push kurulumu tamam"
