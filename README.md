# 🌍 Blok Dünya Oyna

Modern, şık ve tamamen tarayıcı tabanlı 3D blok (voxel) oyunları koleksiyonu. İndirme gerektirmeden, anında oynanabilir!

🚀 **Hemen Oynamak İçin:** [blok-dunya-oyna.onrender.com](https://blok-dunya-oyna.onrender.com/)

---

## 🎮 Oyunlar

Sitede şu an oynanabilir **4 farklı mod** bulunmaktadır:

*   🧱 **Blok Dünya:** Sonsuz bir küp dünyası. Kaynakları topla, hayatta kal veya yaratıcı modda sınırsız inşa et.
*   🌐 **Blok Dünya: Online:** Arkadaşlarınla veya dünyanın dört bir yanından oyuncularla aynı haritada oyna. (WebSocket destekli 4 kişilik çok oyunculu mod).
*   🔒 **Bedrock Kutu:** Yayıncıya özel, şifre korumalı gizli mod. YouTube canlı sohbetinden gelen komutlarla (TNT, Nuke, Creeper vb.) yayıncıya meydan okuyun!
*   🏫 **Blok Dünya: Okul:** Yeni eklenen okul temalı harita ile keşfe çık, maceraya atıl.

## ✨ Özellikler

*   🌓 **Aydınlık / Karanlık Mod:** Seçimlerinizi `localStorage` ile kaydeder, göz yormayan renk paletleri sunar.
*   🎬 **Sinematik Açılış (Splash Screen):** Temanıza göre (aydınlık/karanlık) açılış videoları oynatılır.
*   📺 **YouTube Canlı Sohbet Entegrasyonu:** Bedrock Kutu oyununda, YouTube API ve SSE (Server-Sent Events) kullanılarak canlı sohbet komutları doğrudan oyuna aktarılır.
*   🛡️ **Güvenli ve Şifreli Oyun:** Bedrock Kutu moduna sadece yetkili kişiler (sunucu şifresiyle) erişebilir.
*   📱 **Tam Mobil Uyumluluk:** Safari ve Chrome başta olmak üzere mobil cihazlarda (iOS/Android) çift tıklama yakınlaştırma sorunları özel olarak engellenmiştir.
*   🎨 **Premium Tasarım (WYUW):** *Web Yapıcı Ultimate Warning* standartlarında; doğal renk tonları, pürüzsüz animasyonlar (cubic-bezier) ve erişilebilirlik (a11y) odaklı arayüz.

## 🛠️ Kurulum ve Çalıştırma (Geliştiriciler İçin)

Projeyi kendi bilgisayarınızda çalıştırmak için Node.js yüklü olmalıdır.

```bash
# Depoyu klonlayın
git clone https://github.com/HereHacksYT/Blok-Dunya-Oyna.git
cd Blok-Dunya-Oyna

# Bağımlılıkları yükleyin
npm install

# Sunucuyu başlatın
node server.js