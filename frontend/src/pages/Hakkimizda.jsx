// frontend/src/pages/Hakkimizda.jsx
// Hakkımızda sayfası — kullanıcı dostu bloklar, ikonlu değer önerileri ve 4 adımlı süreç

import React from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import {
  FaShieldHalved,
  FaCircleCheck,
  FaMapLocationDot,
  FaStar,
  FaCircleInfo,
  FaFileLines,
  FaUserCheck,
  FaBolt,
  FaChartLine,
  FaLock,
} from "react-icons/fa6";

export default function Hakkimizda() {
  const navigate = useNavigate();
  return (
    <div style={styles.page}>
      <Helmet>
        <title>Hakkımızda — E‑Doğrula</title>
        <meta name="description" content="E‑Doğrula: Belgeler, veri güvenliği, gerçek yorumlar ve şeffaflık ilkesiyle Türkiye'nin dijital doğrulama platformu." />
      </Helmet>

      <style>{css}</style>

      <header className="header glass">
        <div className="header-inner">
          <h1>Hakkımızda</h1>
          <div className="actions">
            <button className="link ghost-pill" onClick={() => navigate("/")}>Ana sayfa</button>
            <button className="link ghost-pill" onClick={() => navigate("/apply")}>İşletmeni doğrula</button>
            <button className="link ghost-pill" onClick={() => navigate("/report")}>Şikayet / İhbar</button>
          </div>
        </div>
      </header>

      <main className="stack">
        {/* Kahraman metin */}
        <section className="hero glass">
          <h2>Türkiye’nin Dijital Doğrulama Platformu</h2>
          <p>
            e‑Doğrula; belge kontrolleri, veri güvenliği, gerçek yorumlar ve şeffaflık ilkesiyle
            güveni görünür kılar. Onaylanan işletmelere verilen <b>doğrulama rozeti</b>, ziyaretçiye
            hızlı ve doğru karar desteği sunar. İşletmeler için basit başvuru süreci, tek profilde
            kapsamlı vitrin, sürekli güncelleme ve raporlama imkânı sağlar.
          </p>
          <div className="cta">
            <Link to="/apply" className="btn primary">İşletmeni Doğrula</Link>
            <Link to="/report" className="btn subtle">Şikayet / İhbar</Link>
          </div>
        </section>

        {/* 4 ana değer */}
        <section className="values">
          <div className="value glass"><FaShieldHalved /> <span>KVKK uyumlu ve şeffaf süreç</span></div>
          <div className="value glass"><FaCircleCheck /> <span>Doğrulanmış belge ve kimlik kontrolleri</span></div>
          <div className="value glass"><FaMapLocationDot /> <span>Bölge bazlı keşif ve filtreleme</span></div>
          <div className="value glass"><FaStar /> <span>Gerçek konuk yorumları ve puanlama</span></div>
        </section>

        {/* e‑Doğrula nedir? */}
        <section id="nedir" className="card glass">
          <h3>e‑Doğrula Nedir?</h3>
          <p>
            e‑Doğrula, turizm ve konaklama başta olmak üzere birçok sektörde işletme güvenilirliğini
            görünür kılan bir doğrulama ve vitrin platformudur. Belgeler, ruhsatlar, resmi kayıtlar,
            gerçek ziyaretçi yorumları ve işletme faaliyet sinyalleri bir araya getirilir; tek bir
            doğrulama rozeti ile ziyaretçiye sunulur. Böylece misafirler güvenle karar verir,
            işletmeler ise güvenini kanıtlar ve öne çıkar.
          </p>
        </section>

        {/* Değer önerileri */}
        <section id="neden" className="grid">
          <article className="tile glass">
            <div className="icon"><FaCircleCheck /></div>
            <h4>Doğrulama Rozeti</h4>
            <p>İşletmeler; lisans, vergi levhası, faaliyet belgesi vb. evraklarla onaylanır. Ziyaretçi tek bakışta güvenir.</p>
          </article>
          <article className="tile glass">
            <div className="icon"><FaFileLines /></div>
            <h4>Tek Panel, Tek Gerçek</h4>
            <p>Belgeler, fotoğraflar, harita, yorumlar ve iletişim tek profilde birleşir.</p>
          </article>
          <article className="tile glass">
            <div className="icon"><FaBolt /></div>
            <h4>Hızlı & Basit Süreç</h4>
            <p>Başvuru → Belgeleri yükle → İnceleme → Yayın.</p>
          </article>
          <article className="tile glass">
            <div className="icon"><FaChartLine /></div>
            <h4>Şeffaflık Puanı</h4>
            <p>Eksiksiz bilgi, güncellik, yanıt oranı ve olumlu deneyimler skorlanır.</p>
          </article>
          <article className="tile glass">
            <div className="icon"><FaLock /></div>
            <h4>Veri Güvenliği</h4>
            <p>KVKK uyumlu, SSL korumalı ve erişim kontrollü altyapı.</p>
          </article>
        </section>

        {/* Nasıl çalışır? */}
        <section id="nasil" className="card glass">
          <h3>Nasıl Çalışır? (4 Adım)</h3>
          <ol className="steps">
            <li><b>Başvuru</b> – İşletme kendini tanıtır ve belgelerini sisteme yükler.</li>
            <li><b>İnceleme</b> – Uzman ekip ve otomatik kontroller uygunluğu doğrular.</li>
            <li><b>Rozet & Profil</b> – Onaylanan işletmeye e‑Doğrula Rozeti verilir, profil sayfası açılır.</li>
            <li><b>Sürekli Takip</b> – Güncellemeler, raporlar ve geri bildirimlerle güven güncel tutulur.</li>
          </ol>
        </section>

        {/* Hedef kitleler */}
        <section id="kimler" className="card glass">
          <h3>Kimler İçin?</h3>
          <ul className="bullets">
            <li><b>Misafirler / Müşteriler:</b> Güvenle rezervasyon yapmak isteyenler.</li>
            <li><b>İşletmeler:</b> Güvenini kanıtlamak ve görünürlüğünü artırmak isteyenler.</li>
            <li><b>Bölge Platformları & Topluluklar:</b> Bölgesel güven haritası oluşturmak isteyen kurum ve inisiyatifler.</li>
          </ul>
        </section>

        {/* Güvenlik & Uyum */}
        <section id="guvenlik" className="card glass">
          <h3>Güvenlik, Uyum ve Şeffaflık</h3>
          <ul className="bullets">
            <li><b>KVKK Uyumlu Süreçler:</b> Kişisel veriler sadece doğrulama amacıyla ve mevzuat çerçevesinde işlenir.</li>
            <li><b>SSL & Erişim Kontrolü:</b> Tüm trafik şifrelenir; yetkilendirme katmanları ile korunur.</li>
            <li><b>Şeffaflık İlkesi:</b> Doğrulama kriterleri ve tarihçesi profilde özetlenir.</li>
          </ul>
        </section>

        {/* Sorumluluk beyanı */}
        <section className="disclaimer glass">
          <FaCircleInfo />
          <p>
            <b>Sorumluluk Beyanı:</b> e‑Doğrula; doğrulama ve bilgilendirme sunar, ticari ilişkilerin
            tarafı değildir.
          </p>
        </section>
      </main>

      <footer className="footer">
        <Link className="foot" to="/kvkk">kvkk</Link>
        <Link className="foot" to="/gizlilik">gizlilik sözleşmesi</Link>
        <Link className="foot" to="/hakkimizda">hakkımızda</Link>
        <Link className="foot" to="/sss">sss</Link>
      </footer>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg)",
    color: "var(--fg)",
    fontFamily: "Roboto, Arial, sans-serif",
  },
};

const css = `
.stack { width: min(960px, 94vw); margin: 0 auto 72px; }
.header { position: sticky; top: 0; z-index: 10; padding: 10px 0; margin-bottom: 18px; }
.header-inner { display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 10px 14px; border-radius: 14px; border:1px solid var(--border); background:#fff; }
.header h1 { margin:0; font-size: 22px; letter-spacing: .2px; }
.actions { display:flex; gap:8px; }

.hero { border:1px solid var(--border); border-radius: 16px; padding: 24px; background: linear-gradient(180deg, var(--card), #f8fafc); }
.hero h2 { margin: 0 0 10px; font-size: 24px; letter-spacing:.2px; }
.hero p { margin: 6px 0 14px; color: var(--fg-2); line-height: 1.6; }
.hero .cta { display:flex; gap:10px; flex-wrap: wrap; }

.values { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap:12px; margin: 14px 0; }
.value { display:flex; gap:12px; align-items:center; padding:14px 16px; border:1px solid var(--border); border-radius: 14px; background:#fff; box-shadow: 0 6px 14px rgba(0,0,0,.04); }
.value svg { width:18px; height:18px; opacity:.9; }
.value span { font-weight: 800; color: var(--fg-2); }

.card { border:1px solid var(--border); border-radius: 16px; padding: 16px 18px; background:#fff; box-shadow: 0 8px 20px rgba(0,0,0,.04); }
.card h3 { margin: 2px 0 12px; font-size: 18px; letter-spacing:.1px; }

.grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap:16px; margin-top: 14px; }
.tile { padding:16px; border: 1px solid var(--border); border-radius: 16px; background:#fff; transition: transform .16s ease, box-shadow .16s ease; }
.tile:hover { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(0,0,0,.06); }
.tile .icon { width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:12px; background: var(--muted); margin-bottom:8px; }
.tile h4 { margin: 4px 0 6px; font-size: 16px; }
.tile p { margin:0; color: var(--fg-2); line-height:1.6; }

.steps { margin: 8px 0 0 18px; color: var(--fg-2); line-height:1.6; }
.bullets { margin: 8px 0 0 18px; color: var(--fg-2); line-height:1.6; }

.disclaimer { display:flex; gap:10px; align-items:flex-start; padding: 12px; border:1px solid var(--border); border-radius: 12px; margin-top: 14px; background:#fff; }
.disclaimer svg { width:18px; height:18px; margin-top: 3px; }

/* ⬇️ Footer artık sabit DEĞİL — sayfanın en altında, modern görünüm */
.footer { margin-top: 32px; display:flex; gap:24px; align-items:center; justify-content:center; padding:18px 12px; border-top: 1px solid var(--border); background: transparent; }
.foot { color: var(--fg-2); text-decoration: none; font-weight:800; opacity:.9; }
.foot:hover { text-decoration: underline; opacity:1; }
`;
