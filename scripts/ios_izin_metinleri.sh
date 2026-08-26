#!/bin/bash
# =============================================================================
# Akora iOS — izin (ATT) metinlerini uygulamanın diline eşitle
# -----------------------------------------------------------------------------
# NEDEN VAR: 2026-08-12'de Apple 1.9.4'ü "Guideline 4.0.0 Design" ile REDDETTİ.
# Gerekçe: "the app includes permissions requests that are not written in the
# same language as the app's localization". İnceleyicinin iPad'i İngilizce'ydi,
# uygulama arayüzü İngilizce açıldı, ama ATT (izleme izni) kutusunun alt metni
# codemagic.yaml'a TÜRKÇE gömülüydü ("Sana daha uygun reklamlar...").
#
# ÇÖZÜM İKİ KATMANLI (biri patlarsa diğeri kurtarır):
#   1) TEMEL: Info.plist'teki NSUserTrackingUsageDescription artık İNGİLİZCE.
#      App Store listelemesi zaten yalnız en-US olduğu için bu tek başına
#      kuralı karşılar. Bu adım asla patlamaz.
#   2) TAKVİYE: 20 dilin <dil>.lproj/InfoPlist.strings dosyaları üretilir ve
#      Xcode projesine kaydedilir → cihaz hangi dildeyse izin kutusu da o dilde
#      çıkar (uygulama arayüzü zaten cihaz dilini takip ediyor).
#      Bu adım patlarsa .lproj klasörleri SİLİNİR ve build İngilizce metinle
#      devam eder — yani "yarım kalmış çokdillilik" riski yok.
# =============================================================================
set -u
PLIST="ios/App/App/Info.plist"
APPDIR="ios/App/App"
PROJ="ios/App/App.xcodeproj"

EN_ATT="This lets Akora show ads that are more relevant to you. Your focus sessions and statistics always stay on your device."

# ---- 1) TEMEL: Info.plist İngilizce -----------------------------------------
/usr/libexec/PlistBuddy -c "Set :NSUserTrackingUsageDescription $EN_ATT" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :NSUserTrackingUsageDescription string $EN_ATT" "$PLIST"
echo "✅ Temel ATT metni İngilizce yazıldı."

# ---- 2) TAKVİYE: 20 dilin InfoPlist.strings dosyaları ------------------------
# Diller www/js/i18n.js ile birebir aynı (zh → zh-Hans, zh-Hant ayrı).
yaz() {  # yaz <lproj-dili> <metin>
  mkdir -p "$APPDIR/$1.lproj"
  printf '"NSUserTrackingUsageDescription" = "%s";\n' "$2" > "$APPDIR/$1.lproj/InfoPlist.strings"
}

yaz en      "$EN_ATT"
yaz tr      "Bu izin, Akora'ın sana daha uygun reklamlar göstermesini sağlar. Odak seansların ve istatistiklerin her zaman cihazında kalır."
yaz de      "So kann Akora dir relevantere Werbung zeigen. Deine Fokus-Sitzungen und Statistiken bleiben immer auf deinem Gerät."
yaz es      "Esto permite que Akora te muestre anuncios más relevantes. Tus sesiones de enfoque y estadísticas siempre permanecen en tu dispositivo."
yaz fr      "Cela permet à Akora de vous proposer des publicités plus pertinentes. Vos sessions de focus et vos statistiques restent toujours sur votre appareil."
yaz it      "Questo permette ad Akora di mostrarti annunci più pertinenti. Le tue sessioni di focus e le statistiche restano sempre sul tuo dispositivo."
yaz nl      "Hiermee kan Akora relevantere advertenties tonen. Je focussessies en statistieken blijven altijd op je apparaat."
yaz pt      "Isso permite que o Akora mostre anúncios mais relevantes para você. Suas sessões de foco e estatísticas permanecem sempre no seu dispositivo."
yaz pl      "Dzięki temu Akora może pokazywać bardziej trafne reklamy. Twoje sesje skupienia i statystyki zawsze pozostają na Twoim urządzeniu."
yaz ru      "Это позволяет Akora показывать более релевантную рекламу. Ваши сессии фокуса и статистика всегда остаются на устройстве."
yaz uk      "Це дозволяє Akora показувати доречнішу рекламу. Твої сесії фокусу та статистика завжди залишаються на пристрої."
yaz ar      "يتيح هذا لتطبيق Akora عرض إعلانات أكثر ملاءمة لك. تبقى جلسات تركيزك وإحصاءاتك دائمًا على جهازك."
yaz hi      "इससे Akora आपको अधिक प्रासंगिक विज्ञापन दिखा पाता है। आपके फ़ोकस सेशन और आंकड़े हमेशा आपके डिवाइस पर ही रहते हैं।"
yaz id      "Ini memungkinkan Akora menampilkan iklan yang lebih relevan untukmu. Sesi fokus dan statistikmu selalu tersimpan di perangkatmu."
yaz ja      "これにより、Akora はあなたに関連性の高い広告を表示できます。フォーカスセッションと統計は常に端末内に保存されます。"
yaz ko      "이를 통해 Akora가 더 관련성 높은 광고를 표시할 수 있습니다. 집중 세션과 통계는 항상 기기에만 저장됩니다."
yaz th      "สิ่งนี้ช่วยให้ Akora แสดงโฆษณาที่ตรงกับคุณมากขึ้น เซสชันโฟกัสและสถิติของคุณจะอยู่ในอุปกรณ์ของคุณเสมอ"
yaz vi      "Điều này giúp Akora hiển thị quảng cáo phù hợp hơn với bạn. Các phiên tập trung và thống kê của bạn luôn được lưu trên thiết bị."
yaz zh-Hans "这样 Akora 可以向你展示更相关的广告。你的专注记录和统计始终保存在你的设备上。"
yaz zh-Hant "這樣 Akora 可以向你顯示更相關的廣告。你的專注紀錄與統計一律保存在你的裝置中。"

DILLER="en,tr,de,es,fr,it,nl,pt,pl,ru,uk,ar,hi,id,ja,ko,th,vi,zh-Hans,zh-Hant"

# ---- 3) Xcode projesine kaydet (yoksa kopyalanmaz) --------------------------
gem list -i xcodeproj >/dev/null 2>&1 || gem install xcodeproj --no-document >/dev/null 2>&1 || true

AKIS_DILLER="$DILLER" ruby -e '
  require "xcodeproj"
  proj = Xcodeproj::Project.open("ios/App/App.xcodeproj")
  target = proj.targets.find { |t| t.name == "App" } || proj.targets.first
  grp = proj.main_group.find_subpath("App", true)
  langs = ENV["AKIS_DILLER"].split(",")
  eklenen = 0
  langs.each do |l|
    rel = "#{l}.lproj/InfoPlist.strings"
    next if grp.files.any? { |f| f.path == rel }
    ref = grp.new_reference(rel)
    ref.last_known_file_type = "text.plist.strings"
    target.resources_build_phase.add_file_reference(ref, true)
    eklenen += 1
  end
  proj.root_object.known_regions = (proj.root_object.known_regions + langs + ["Base"]).uniq
  proj.save
  puts "✅ Xcode projesine #{eklenen} dil dosyası kaydedildi (toplam #{langs.size} dil)."
' || {
  echo "⚠️  Xcode kaydı yapılamadı → çokdilli izin metinleri geri alınıyor, build İngilizce metinle devam ediyor."
  for d in $(echo "$DILLER" | tr ',' ' '); do rm -rf "$APPDIR/$d.lproj"; done
}

echo "--- Info.plist ATT metni (son hâl) ---"
/usr/libexec/PlistBuddy -c "Print :NSUserTrackingUsageDescription" "$PLIST" || true
ls -d "$APPDIR"/*.lproj 2>/dev/null || echo "(lproj klasörü yok — yalnız İngilizce)"
