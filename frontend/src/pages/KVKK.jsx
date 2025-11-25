// src/pages/KVKK.jsx
import React from "react";
import { Helmet } from "react-helmet-async";

export default function KVKK() {
  const today = new Date().toLocaleDateString("tr-TR");
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "24px auto",
        padding: "0 16px",
        fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
        lineHeight: 1.6,
        color: "#222",
      }}
    >
      <Helmet>
        <title>KVKK Aydınlatma Metni | Kule Sapanca</title>
        <meta
          name="description"
          content="Eler Elektrik Ltd. Şti. - Kule Sapanca İşletmesi için KVKK aydınlatma metni."
        />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        KVKK Aydınlatma Metni
      </h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>Güncelleme tarihi: {today}</p>

      <p>
        Bu aydınlatma metni, 6698 sayılı <strong>Kişisel Verilerin Korunması Kanunu</strong>
        (“<strong>KVKK</strong>”) uyarınca, veri sorumlusu sıfatıyla hareket eden
        <strong> Eler Elektrik Ltd. Şti. – Kule Sapanca İşletmesi</strong> tarafından,
        web sitemiz ve çevrim içi/çevrim dışı kanallar üzerinden yürütülen faaliyetler
        kapsamında kişisel verilerin hangi amaçlarla, hangi hukuki sebeplere dayanılarak
        işlendiği, kimlere aktarılabileceği, saklama süreleri ve ilgili kişi hakları
        hakkında bilgi vermek amacıyla hazırlanmıştır.
      </p>

      <h2>1) Veri Sorumlusu ve İletişim</h2>
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          background: "#fafafa",
        }}
      >
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <strong>Unvan:</strong> Eler Elektrik LTD. ŞTİ. — Kule Sapanca İşletmesi
          </li>
          <li>
            <strong>Adres:</strong> Yenigün Mah. Sakarya Cad. No:55 Adapazarı / Sakarya
          </li>
          <li>
            <strong>E-posta:</strong>{" "}
            <a href="mailto:kulesapanca@gmail.com">kulesapanca@gmail.com</a>
          </li>
          <li>
            <strong>Telefon:</strong> <a href="tel:+905431665454">0543 166 54 54</a>
          </li>
          <li>
            <strong>KEP:</strong> elerelektrik@hs06.kep.tr
          </li>
        </ul>
      </div>

      <h2>2) Hangi Kişisel Verileri İşliyoruz?</h2>
      <p>Faaliyetlerimize göre işlenen başlıca veri kategorileri şunlardır:</p>
      <ul>
        <li>
          <strong>Kimlik ve iletişim:</strong> ad-soyad, telefon, e-posta, sosyal medya
          kullanıcı adı/bağlantısı (ör. Instagram), adres bilgisi (varsa).
        </li>
        <li>
          <strong>Rezervasyon ve işletme etkileşimi:</strong> talep edilen giriş-çıkış
          tarihleri, yetişkin/çocuk sayısı, mesaj/tespit/şikâyet içerikleri.
        </li>
        <li>
          <strong>İşlem güvenliği ve teknik veriler:</strong> IP adresi, tarayıcı/cihaz
          bilgileri, çerez/oturum kayıtları, loglar.
        </li>
        <li>
          <strong>Hukuki işlem/muhasebe:</strong> fatura/ödeme bilgisi (varsa), talep ve
          başvuru kayıtları, sözleşme ve yazışmalar.
        </li>
      </ul>

      <h2>3) Kişisel Verileri Hangi Yöntemlerle ve Hukuki Sebeplerle Topluyoruz?</h2>
      <p>
        Verileriniz; web sitemizdeki formlar (ör. rezervasyon talebi), telefon/e-posta
        iletişimleri, sosyal medya yönlendirmeleri ve müşteri ilişkileri süreçleri
        aracılığıyla elektronik ve/veya fiziki ortamlarda toplanır.
      </p>
      <p>KVKK m.5 ve m.6 uyarınca başlıca hukuki sebepler:</p>
      <ul>
        <li>
          <strong>Bir sözleşmenin kurulması/ifası için gerekli olması</strong> (KVKK
          m.5/2-c) – rezervasyon talebi ve iletişim süreçleri.
        </li>
        <li>
          <strong>Hukuki yükümlülüğümüzün yerine getirilmesi</strong> (KVKK m.5/2-ç) –
          mali/muhasebesel kayıtlar, resmi mercilere bildirimler.
        </li>
        <li>
          <strong>Hakların tesisi, kullanılması veya korunması için zorunlu olması</strong>{" "}
          (KVKK m.5/2-e) – uyuşmazlık ve itiraz süreçleri.
        </li>
        <li>
          <strong>Meşru menfaatlerimiz</strong> (KVKK m.5/2-f) – hizmet kalitesi,
          güvenlik, dolandırıcılığın önlenmesi, istatistik ve raporlama.
        </li>
        <li>
          <strong>Açık rıza</strong> (KVKK m.5/1) – pazarlama/ileti onayı, analitik
          çerezler veya yurt dışı aktarım gereken haller (gerekiyorsa).
        </li>
      </ul>

      <h2>4) İşleme Amaçlarımız</h2>
      <ul>
        <li>Rezervasyon taleplerinin alınması, değerlendirilmesi ve yanıtlanması,</li>
        <li>Misafir ilişkileri ve müşteri destek süreçlerinin yürütülmesi,</li>
        <li>Hizmetlerimizin planlanması, geliştirilmesi ve operasyonel yönetimi,</li>
        <li>Finans ve muhasebe işlemleri, kayıtların tevsiki ve denetimi,</li>
        <li>
          Hukuki yükümlülüklerin yerine getirilmesi ve yetkili mercilerin taleplerine yanıt
          verilmesi,
        </li>
        <li>Güvenlik, dolandırıcılık ve kötüye kullanımın önlenmesi,</li>
        <li>
          Açık rızanız varsa kampanya/bilgilendirme iletişimlerinin gönderilmesi, analitik
          ve kişiselleştirme çalışmaları.
        </li>
      </ul>

      <h2>5) Çerezler (Cookies)</h2>
      <p>
        Sitemizde teknik olarak zorunlu çerezler kullanılmaktadır. Açık rızanız
        bulunmadıkça istatistik/performans veya pazarlama çerezleri çalıştırılmaz.
        Tarayıcı ayarlarınızdan çerez tercihlerinizi yönetebilirsiniz. Gömülü üçüncü
        taraf bileşenleri (ör. Instagram bağlantıları) kendi çerezlerini ayarlayabilir;
        bu durumda ilgili üçüncü tarafın politikaları geçerlidir.
      </p>

      <h2>6) Verilerin Aktarılması</h2>
      <p>
        Kişisel verileriniz; BT/hosting hizmet sağlayıcıları, e-posta/SMS operatörleri,
        danışmanlar (hukuk, mali müşavir), gerektiğinde ödeme/finans kuruluşları ve
        yalnızca gerekliyse yetkili kamu kurumlarıyla paylaşılabilir. Bu paylaşım
        <em>amaçla sınırlı</em> ve <em>gerekli olduğu kadar</em> yapılır.
      </p>
      <p>
        Sunucularımız Türkiye’dedir. Bazı bulut hizmetleri yurt dışındaki veri
        merkezlerini kullanabilir. Böyle bir durumda, KVKK m.9 kapsamındaki şartlar
        sağlanmadan yurt dışına aktarım yapılmaz; gerekli açık rıza/taahhütler veya
        Kurulca belirlenen yeterlilik kararları aranır.
      </p>

      <h2>7) Saklama Süreleri</h2>
      <ul>
        <li>Rezervasyon/iletişim kayıtları: <strong>10 yıl</strong> (TTK ve TBK süreleri),</li>
        <li>Şikâyet/başvuru kayıtları: <strong>3–5 yıl</strong> (zamanaşımı/yasal yükümlülük),</li>
        <li>Teknik loglar: <strong>2 yıl</strong> (genel uygulama),</li>
        <li>Pazarlama izinleri: <strong>izin geri çekilene kadar</strong> veya azami 3 yıl.</li>
      </ul>
      <p>
        Süre dolduğunda veriler; silinir, anonim hale getirilir veya kanuni yükümlülük
        gereğince daha uzun süre saklanır.
      </p>

      <h2>8) İlgili Kişi Haklarınız (KVKK m.11)</h2>
      <p>
        KVKK kapsamındaki haklarınız: kişisel verilerinizin{" "}
        <em>işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını ve
        aktarım yapılan üçüncü kişileri öğrenme, verilerin düzeltilmesini/silinmesini
        veya yok edilmesini isteme, itiraz etme ve zararın giderilmesini talep etme</em>.
      </p>

      <h2>9) Başvuru Yöntemi</h2>
      <p>
        Haklarınıza ilişkin taleplerinizi; kimliğinizi tevsik edecek şekilde
        <strong> yazılı olarak</strong> veya KVKK’ya uygun diğer yöntemlerle aşağıdaki
        kanallar üzerinden iletebilirsiniz:
      </p>
      <ul>
        <li>
          <strong>KEP:</strong> elerelektrik@hs06.kep.tr
        </li>
        <li>
          <strong>E-posta:</strong>{" "}
          <a href="mailto:kulesapanca@gmail.com">kulesapanca@gmail.com</a>{" "}
          (güvenli elektronik imza/mobil imza ile)
        </li>
        <li>
          <strong>Posta:</strong> Yenigün Mah. Sakarya Cad. No:55 Adapazarı / Sakarya
        </li>
      </ul>
      <p>
        Başvurularınız, niteliğine göre en geç <strong>30 gün</strong> içinde sonuçlandırılır.
        Ücret alınması gerekirse Kurul’un tarifesi uygulanır.
      </p>

      <h2>10) Pazarlama İletileri ve Rıza</h2>
      <p>
        Ticari elektronik iletiler yalnızca açık rızanız varsa gönderilir. İstediğiniz
        zaman ücretsiz olarak ileti onayınızı geri çekebilirsiniz.
      </p>

      <h2>11) Değişiklikler</h2>
      <p>
        İşbu aydınlatma metni güncellenebilir. En güncel sürüm her zaman bu sayfada
        yayımlanır.
      </p>

      <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid #eee" }} />
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        
      </p>
    </main>
  );
}
