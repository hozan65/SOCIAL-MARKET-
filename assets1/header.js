// =========================
// SETTINGS (Dark mode + Language) + remove header logout
// =========================
(function initHeaderSettings() {
    // 1) Header'daki logout'u kaldır (profilde zaten var dediğin için)
    const logoutBtn = document.querySelector('a[href*="logout"], button.logout, .logoutBtn, #logoutBtn');
    if (logoutBtn) logoutBtn.remove();

    // 2) Sağ tarafa settings butonu ekle
    const right = document.querySelector(".topbar-right") || document.querySelector(".headerRight") || document.querySelector("#headerRight");
    if (!right) return;

    // Eğer zaten ekliyse tekrar ekleme
    if (document.getElementById("settingsBtn")) return;

    right.insertAdjacentHTML("beforeend", `
    <div class="settingsWrap" id="settingsWrap">
      <button class="settingsBtn" id="settingsBtn" type="button" aria-label="Settings">⚙️</button>

      <div class="settingsMenu" id="settingsMenu">
        <div class="settingsItem">
          <div class="settingsLabel">Dark Mode</div>
          <label class="switch">
            <input type="checkbox" id="darkToggle">
            <span class="slider"></span>
          </label>
        </div>

        <div class="settingsItem">
          <div class="settingsLabel">Language</div>
          <select id="langSelect" class="settingsSelect">
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
      </div>
    </div>
  `);

    const menu = document.getElementById("settingsMenu");
    const btn = document.getElementById("settingsBtn");
    const darkToggle = document.getElementById("darkToggle");
    const langSelect = document.getElementById("langSelect");

    // 3) Kayıtlı ayarları yükle
    const savedTheme = localStorage.getItem("sm_theme") || "light";
    document.documentElement.classList.toggle("dark", savedTheme === "dark");
    darkToggle.checked = savedTheme === "dark";

    const savedLang = localStorage.getItem("sm_lang") || "en";
    langSelect.value = savedLang;

    // 4) Menü aç/kapat
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("open");
    });

    document.addEventListener("click", () => menu.classList.remove("open"));

    // 5) Dark mode toggle
    darkToggle.addEventListener("change", () => {
        const isDark = darkToggle.checked;
        document.documentElement.classList.toggle("dark", isDark);
        localStorage.setItem("sm_theme", isDark ? "dark" : "light");
    });

    // 6) Language select (şimdilik sadece kaydediyoruz; textleri sonra bağlarız)
    langSelect.addEventListener("change", () => {
        localStorage.setItem("sm_lang", langSelect.value);
        // İstersen burada sayfayı yenileyebiliriz:
        // location.reload();
    });
})();
