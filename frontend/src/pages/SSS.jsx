// frontend/src/pages/SSS.jsx
// SSS (FAQ) — kategorili filtre, arama, akordeon, #derin-bağlantı,
// Tümünü Aç/Kapat, bağlantı kopyalama, vuru (highlight), klavye kısayolları

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  FaCircleQuestion,
  FaChevronDown,
  FaChevronUp,
  FaMagnifyingGlass,
  FaFilter,
  FaLink,
} from "react-icons/fa6";

export default function SSS() {
  const navigate = useNavigate();
  const { hash } = useLocation();

  const [openIds, setOpenIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [activeKey, setActiveKey] = useState("all");
  const [toast, setToast] = useState("");
  const inputRef = useRef(null);

  const groups = useMemo(() => FAQ_GROUPS, []);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Arama + kategori filtresi
  const filteredGroups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = activeKey === "all" ? groups : groups.filter((g) => g.key === activeKey);
    if (!term) return base;
    return base
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => [it.q, it.a, g.title].some((t) => t.toLowerCase().includes(term))),
      }))
      .filter((g) => g.items.length);
  }, [q, groups, activeKey]);

  const resultIds = useMemo(() => filteredGroups.flatMap((g) => g.items.map((it) => it.id)), [
    filteredGroups,
  ]);

  // Hash (#id) ile açılış
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, "");
    if (allItems.some((it) => it.id === id)) {
      setOpenIds(new Set([id]));
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }, [hash, allItems]);

  // Kısayollar: / veya Ctrl+K aramaya odak; Esc temizle
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const inField = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if (!inField && (e.key === "/" || (e.key.toLowerCase() === "k" && e.ctrlKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (inField && e.key === "Escape" && q) {
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q]);

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openAll = () => setOpenIds(new Set(resultIds));
  const closeAll = () => setOpenIds(new Set());

  const makeLink = (id) => {
    const u = new URL(window.location.href);
    u.hash = id;
    u.pathname = "/sss"; // uygulama alt yolu olsa bile, SSR dışı SPA'da doğru rota
    return u.toString();
  };

  const copyLink = async (id) => {
    try {
      await navigator.clipboard.writeText(makeLink(id));
      flash("Bağlantı kopyalandı");
    } catch {
      flash("Kopyalama başarısız");
    }
  };

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 1400);
  };

  return (
    <div style={styles.page}>
      <Helmet>
        <title>SSS — E‑Doğrula</title>
        <meta
          name="description"
          content="E‑Doğrula SSS: işletmeler, kullanıcılar, güvenlik & gizlilik, teknik ve genel."
        />
      </Helmet>

      <style>{css}</style>

      <header className="header glass">
        <div className="header-inner">
          <h1>SSS</h1>
          <div className="actions">
            <button className="link ghost-pill" onClick={() => navigate("/")}>Ana sayfa</button>
            <button className="link ghost-pill" onClick={() => navigate("/apply")}>İşletmeni doğrula</button>
            <button className="link ghost-pill" onClick={() => navigate("/report")}>Şikayet / İhbar</button>
          </div>
        </div>
      </header>

      <main className="stack">
        {/* Arama ve grup filtreleri */}
        <div className="toolbar">
          <div className="search glass">
            <FaMagnifyingGlass aria-hidden className="lead" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sorularda ara… örn. doğrulama, belge, kara liste, ücret, uygulama"
              aria-label="SSS'te ara"
            />
          </div>
          <div className="filters" role="tablist" aria-label="SSS kategorileri">
            <span className="filter-title"><FaFilter /> Filtre</span>
            <button role="tab" aria-selected={activeKey === "all"} onClick={() => setActiveKey("all")} className={`pill ${activeKey === "all" ? "active" : ""}`}>Tümü</button>
            {groups.map((g) => (
              <button role="tab" aria-selected={activeKey === g.key} key={g.key} onClick={() => setActiveKey(g.key)} className={`pill ${activeKey === g.key ? "active" : ""}`}>
                {g.title}
              </button>
            ))}
          </div>
          <div className="bulk">
            <button className="ghost small" onClick={openAll}>Tümünü Aç</button>
            <button className="ghost small" onClick={closeAll}>Tümünü Kapat</button>
            <span className="count">{resultIds.length} sonuç</span>
          </div>
        </div>

        {/* Gruplar */}
        {filteredGroups.map((group) => (
          <section key={group.key} className="group">
            <h2 className="group-title" id={`group-${group.key}`}>{group.title}</h2>
            <div className="faq-list">
              {group.items.map((item) => {
                const isOpen = openIds.has(item.id);
                return (
                  <article key={item.id} id={item.id} className="faq-item glass">
                    <div className="faq-row">
                      <button
                        className="faq-head"
                        aria-expanded={isOpen}
                        aria-controls={`panel-${item.id}`}
                        onClick={() => toggle(item.id)}
                      >
                        <span className="icon"><FaCircleQuestion /></span>
                        <span className="q">{highlight(item.q, q)}</span>
                        <span className="chev" aria-hidden>
                          {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                        </span>
                      </button>
                      <button
                        className="mini"
                        title="Bağlantıyı kopyala"
                        aria-label={`Bağlantıyı kopyala: ${item.q}`}
                        onClick={() => copyLink(item.id)}
                      >
                        <FaLink />
                      </button>
                    </div>
                    {isOpen && (
                      <div id={`panel-${item.id}`} className="faq-body" dangerouslySetInnerHTML={{ __html: item.a }} />
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {!filteredGroups.length && (
          <div className="empty glass">Hiç sonuç yok. Başka bir anahtar kelime dene.</div>
        )}
      </main>

      <footer className="footer">
        <Link className="foot" to="/kvkk">kvkk</Link>
        <Link className="foot" to="/gizlilik">gizlilik sözleşmesi</Link>
        <Link className="foot" to="/hakkimizda">hakkımızda</Link>
        <Link className="foot" to="/sss">sss</Link>
      </footer>

      {toast && <div className="toast glass" role="status">{toast}</div>}
    </div>
  );
}

// Yardımcılar
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function highlight(text, term) {
  if (!term) return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(term)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark key={i}>{p}</mark>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

// ——————————————————————————————————————————————————————————————
// İçerik: Yüklenen SSS dokümanından derlendi
const FAQ_GROUPS = [
  {
    key: "biz",
    title: "İşletmeler İçin",
    items: [
      { id: "kayit", q: "e‑Doğrula’ya işletmemi nasıl kaydedebilirim?", a: "İşletmeni <b>edoğrula.org/apply</b> adresindeki başvuru formunu doldurarak kaydedebilirsin. Başvuru sonrasında ekibimiz bilgilerini inceler ve kısa süre içinde sana dönüş yapar." },
      { id: "surec", q: "Doğrulama süreci nasıl işliyor?", a: "Gönderdiğin bilgiler ve belgeler, e‑Doğrula ekibi tarafından <b>KVKK’ya uygun</b> şekilde incelenir. Kimlik, iletişim, konum, sosyal medya ve yorum geçmişi doğrulandıktan sonra uygun görülürse <b>“Doğrulanmış”</b> rozeti verilir." },
      { id: "dogrulanmadi", q: "İşletmem doğrulanmazsa ne olur?", a: "Eksik veya tutarsız bilgi tespit edilirse sana e‑posta ile bildirilir. Gerekli düzeltmeleri yaptıktan sonra yeniden başvuru yapabilirsin." },
      { id: "ucret-rozet", q: "e‑Doğrula rozeti almak ücretli mi?", a: "Hayır, <b>temel doğrulama ücretsizdir</b>. Ancak öne çıkan (sponsorlu) işletmeler için isteğe bağlı tanıtım paketleri sunulabilir." },
      { id: "belgeler", q: "Doğrulama için hangi belgeler gerekiyor?", a: "Genellikle işletme ruhsatı, <b>vergi levhası</b> ve <b>açık adres</b> bilgisi yeterlidir. Özel durumlarda kiracı sözleşmesi, faaliyet belgesi, <b>Ticaret Sicil Gazetesi/Esnaf Odası Kaydı</b> ve <b>İmza Sirküleri</b> (şirketler için) talep edilebilir." },
      { id: "guncelleme", q: "Bilgilerimi sonradan güncelleyebilir miyim?", a: "Evet. Profilin onaylandıktan sonra bize e‑posta ile <b>bilgi güncelleme</b> talebinde bulunabilirsin." },
      { id: "liste-sure", q: "İşletmem ne kadar sürede listelenir?", a: "Başvurular genellikle <b>24–72 saat</b> içinde sonuçlanır. Yoğun dönemlerde bu süre uzayabilir." },
      { id: "profil-ozellestirme", q: "e‑Doğrula profilimi nasıl özelleştirebilirim?", a: "Profil açıklaması ve galeri görselleri eklenebilir; Instagram/web sitesi gibi tanıtım linkleri bağlanabilir. Bize bildirmen yeterli." },
      { id: "yorum-yonetimi", q: "Müşteri yorumlarını kim yönetiyor veya filtreliyor?", a: "Yorumlar e‑Doğrula <b>moderasyon sistemi</b> tarafından kontrol edilir. Hakaret, reklam veya spam içerikler otomatik kaldırılır." },
      { id: "one-cikan", q: "İşletmemi “öne çıkan” olarak listeletebilir miyim?", a: "Evet. Onaylı işletmeler için özel <b>Öne Çıkan/Sponsorlu</b> alanlar vardır. Detaylar için bizimle iletişime geçebilirsin." },
    ],
  },
  {
    key: "users",
    title: "Kullanıcılar (Misafirler) İçin",
    items: [
      { id: "nedir", q: "e‑Doğrula nedir ve bana ne faydası var?", a: "e‑Doğrula, güvenilir işletmeleri doğrulayan <b>dijital bir platformdur</b>. Sahte hesaplardan ve dolandırıcılıklardan korunarak daha güvenli seçim yapmana yardımcı olur." },
      { id: "rozet-nasil-anlarim", q: "Bir işletmenin doğrulanmış olduğunu nasıl anlarım?", a: "Doğrulanmış işletmelerin profilinde <b>“✅ e‑Doğrulandı”</b> rozeti bulunur." },
      { id: "rozet-guvenilir-mi", q: "e‑Doğrula rozeti gerçekten güvenilir mi?", a: "Evet. Rozet yalnızca <b>resmi belgeleri incelenmiş</b>, kimliği doğrulanmış işletmelere verilir ve süreç manuel kontrol edilir." },
      { id: "sikayet", q: "İşletmeden memnun kalmazsam e‑Doğrula’ya şikayet edebilir miyim?", a: "Evet. İşletme profilindeki <b>“Rapor Et”</b> butonundan kanıtlarla birlikte bildirim yapabilirsin. İnceleme sonrası rapor yayınlanır." },
      { id: "rezervasyon", q: "Rezervasyonumu e‑Doğrula üzerinden mi yapıyorum?", a: "Hayır. e‑Doğrula bir <b>rezervasyon platformu değildir</b>. Rezervasyonu işletmenin kendi kanallarından yaparsın." },
      { id: "fiyat-mudahale", q: "e‑Doğrula işletmelerin fiyatlarına veya politikalarına müdahale ediyor mu?", a: "Hayır. Fiyat/politikalar işletmelere aittir; e‑Doğrula yalnızca <b>bilgi doğruluğu ve güncelliğini</b> denetler." },
      { id: "yorumlar-gercek-mi", q: "Listelenen işletmelerin yorumları gerçek mi?", a: "Evet. Yorumlar yalnızca <b>doğrulanmış kullanıcılar</b> tarafından yapılır; şüpheli aktiviteler tespit edilip kaldırılır. (Google yorumları da görüntülenebilir.)" },
      { id: "sahte-bildir", q: "Sahte işletmeleri nasıl bildiririm?", a: "“<b>Şüpheli Bildir</b>” butonunu kullanabilir veya <b>destek@edoğrula.org</b> adresine detay gönderebilirsin. İnceleme sonrası kara listeye alınabilir." },
      { id: "kapsam", q: "e‑Doğrula yalnızca Sapanca’daki işletmeleri mi kapsıyor?", a: "Ağırlıkla Sapanca ve çevresinde odaklıyız; <b>Türkiye geneline</b> yayılım sürüyor." },
      { id: "guncellik", q: "İşletme sayfasındaki bilgiler ne kadar güncel?", a: "Bilgiler düzenli kontrol edilir; ayrıca <b>işletme sahipleri</b> de bilgilerini güncel tutmakla yükümlüdür." },
    ],
  },
  {
    key: "privacy",
    title: "Güvenlik ve Gizlilik",
    items: [
      { id: "veri-koruma", q: "Belgelerim ve kişisel bilgilerim nasıl korunuyor?", a: "Tüm veriler <b>SSL</b> ile korunur ve üçüncü şahıslarla paylaşılmaz." },
      { id: "kvkk-uyum", q: "e‑Doğrula, KVKK’ya uygun mu?", a: "Evet. <b>6698 sayılı KVKK</b>’ya tam uyumluyuz; veriler doğrulama amacıyla ve ilgili hukuki sebeplerle işlenir." },
      { id: "ucuncu-taraf", q: "Üçüncü taraflarla bilgilerimi paylaşıyor musunuz?", a: "Hayır. Yalnızca <b>yasal zorunluluk</b> halinde yetkili mercilerle paylaşım yapılır." },
      { id: "kim-inceliyor", q: "Doğrulama sürecinde gönderilen belgeler kimler tarafından inceleniyor?", a: "Belgeler yalnızca yetkili e‑Doğrula <b>doğrulama ekibi</b> tarafından incelenir. Otomasyon sistemleri ön‑kontrol desteği sağlar." },
      { id: "silme-talebi", q: "Hesabımı veya verilerimi silmek istersem ne yapmalıyım?", a: "Bize e‑posta yoluyla talebini iletebilirsin." },
    ],
  },
  {
    key: "tech",
    title: "Teknik ve Genel",
    items: [
      { id: "giris-var-mi", q: "Platforma giriş yapabiliyor muyum?", a: "Hayır. Platformdaki bilgi ve güncellemeler ekip tarafından sağlanır." },
      { id: "gorunmuyor", q: "İşletmem listelenmiş ama görünmüyor, neden olabilir?", a: "Doğrulama tamamlanmamış veya eksik bilgi olabilir. Destek ekibimizle iletişime geçebilirsin." },
      { id: "isbirligi", q: "e‑Doğrula ile iş birliği veya reklam çalışması yapmak istiyorum, nasıl iletişime geçebilirim?", a: "Kurumsal iş birlikleri için <b>destek@edoğrula.org</b> adresine e‑posta gönderebilirsin." },
      { id: "mobil", q: "Platformunuzun mobil uygulaması var mı?", a: "Evet, <b>App Store</b> ve <b>Google Play</b>’de yayındadır." },
      { id: "bolgeler", q: "Hangi bölgelerde hizmet veriyorsunuz?", a: "Şu anda ağırlıklı olarak <b>Sapanca, Maşukiye, Kartepe</b> ve çevresinde aktifiz. Yeni bölgeler yakında eklenecek." },
      { id: "devlet", q: "e‑Doğrula devlet onaylı bir sistem mi?", a: "e‑Doğrula özel bir doğrulama platformudur; mevzuata <b>tam uyum</b>la çalışır." },
      { id: "nasil-dogruluyor", q: "Sistemde yer alan işletmelerin bilgileri nasıl doğrulanıyor?", a: "Belgeler, resmî kayıtlar ve sosyal medya/vergi gibi açık kaynaklar ile <b>karşılaştırmalı manuel kontrol</b> yapılır." },
      { id: "puan", q: "İşletmemin değerlendirme puanını ne belirliyor?", a: "Misafir yorumları, yanıt oranı ve doğruluk kriterleri gibi unsurlar genel puanı etkiler." },
      { id: "hata-bildir", q: "Hatalı bilgi veya fotoğraf görürsem nasıl bildirebilirim?", a: "Profildeki <b>“Düzeltme Bildir”</b> butonunu kullanabilir veya bize e‑posta atabilirsin." },
    ],
  },
];

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
/* Layout */
.stack { width: min(960px, 94vw); margin: 0 auto 72px; }
.header { position: sticky; top: 0; z-index: 10; padding: 10px 0; margin-bottom: 18px; }
.header-inner { display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 10px 14px; border-radius: 14px; border:1px solid var(--border); background:#fff; }
.header h1 { margin:0; font-size: 22px; letter-spacing: .2px; }
.actions { display:flex; gap:8px; }

.toolbar { display:grid; gap:10px; }

/* Search */
.search { display:flex; align-items:center; gap:12px; padding: 12px 14px; border-radius: 16px; border:1px solid var(--border); background:#fff; box-shadow: 0 8px 20px rgba(0,0,0,.04); }
.search .lead { width:18px; height:18px; opacity:.8; }
.search input { flex:1; height:42px; border:0; outline:0; background:transparent; font-size:16px; color:var(--fg); }
.search input::placeholder{ color: var(--fg-3); }

/* Filters */
.filters { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.filter-title { display:inline-flex; align-items:center; gap:8px; font-weight:800; color:var(--fg-2); }
.pill { padding:8px 12px; border-radius:999px; border:1px solid var(--border); background:var(--muted); color: var(--fg-2); font-weight:800; cursor:pointer; transition:.16s ease; }
.pill:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0,0,0,.06); }
.pill.active { background: linear-gradient(90deg, var(--brand), #3ba8dc); color:#fff; border-color: transparent; box-shadow: 0 10px 24px rgba(26,129,195,.25); }
.pill:focus-visible { outline: 3px solid rgba(26,129,195,.2); }

.bulk { display:flex; gap:8px; align-items:center; }
.bulk .count { margin-left:6px; color:var(--fg-3); font-weight:700; }
.ghost.small { padding:6px 8px; border-radius:999px; border:1px solid var(--border); background:transparent; font-weight:800; }

/* Groups */
.group { margin-top: 20px; }
.group-title { font-size: 18px; font-weight: 900; margin: 14px 0 10px; color: var(--fg-2); letter-spacing:.2px; }

/* FAQ Items */
.faq-list { display:grid; gap:12px; }
.faq-item { border:1px solid var(--border); border-radius:16px; background:#fff; box-shadow: 0 8px 20px rgba(0,0,0,.04); transition: transform .16s ease, box-shadow .16s ease; scroll-margin-top: 90px; }
.faq-item:hover { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(0,0,0,.06); }

.faq-row { display:flex; align-items:center; gap:8px; padding: 0 8px; }

.faq-head { flex:1; display:flex; align-items:center; gap:12px; padding:14px 8px; border:0; background:transparent; text-align:left; cursor:pointer; border-radius:16px; }
.faq-head:focus-visible { outline: 3px solid rgba(26,129,195,.15); }
.faq-head .icon { width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background: var(--muted); }
.faq-head .q { font-weight: 900; color: var(--fg); }
.faq-head .chev { display:inline-flex; margin-left:auto; opacity:.8; }

.mini { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; border:1px solid var(--border); background:#fff; cursor:pointer; }
.mini:hover { box-shadow: 0 8px 20px rgba(0,0,0,.06); transform: translateY(-1px); }

.faq-body { padding: 0 16px 14px; color: var(--fg-2); line-height: 1.6; }
.faq-body ul { margin: 6px 0 6px 18px; }
mark { background: rgba(26,129,195,.18); padding: 0 3px; border-radius: 4px; }

/* Empty state */
.empty { margin-top: 12px; padding: 14px; border:1px solid var(--border); border-radius:12px; background:#fff; color: var(--fg-2); }

/* Footer — sabit değil, sayfanın en altında */
.footer { margin-top: 32px; display:flex; gap:24px; align-items:center; justify-content:center; padding:18px 12px; border-top: 1px solid var(--border); background: transparent; }
.foot { color: var(--fg-2); text-decoration: none; font-weight:800; opacity:.9; }
.foot:hover { text-decoration: underline; opacity:1; }

.toast { position: fixed; bottom: 92px; left: 50%; transform: translateX(-50%); padding: 8px 12px; border-radius: 12px; border:1px solid var(--border); background:#fff; z-index:60; }

@media (max-width: 640px){
  .toolbar { gap:8px; }
  .filters { overflow:auto; white-space: nowrap; scrollbar-width: thin; }
  .filters::-webkit-scrollbar{ height: 8px; }
  .filters::-webkit-scrollbar-thumb{ background: #cbd5e1; border-radius: 999px; }
  .search { padding: 10px 12px; }
  .faq-head { padding:12px 6px; }
}
`;
