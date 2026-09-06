/* =========================================================
   رحلاتي — app.js
   All data is read from local /data/*.json files (no API).
   ========================================================= */
(() => {
  "use strict";

  /* ---------- State ---------- */
  const state = {
    cities: [],
    airlines: [],
    agencies: [],
    flights: [],
    tripType: "roundtrip",
    from: null,
    to: null,
    date: null,
    passengers: 1,
    cabin: "economy",
    sort: "best",
    results: [],
    saved: JSON.parse(localStorage.getItem("rahalati_saved") || "[]"),
    activeSuggestField: null,
  };

  const byId = (id) => document.getElementById(id);
  const fmtPrice = (n) => n.toLocaleString("en-US");

  /* ---------- Data loading (local repo files act as the DB) ---------- */
  async function loadData() {
    const [cities, airlines, agencies, flights] = await Promise.all([
      fetch("data/cities.json").then((r) => r.json()),
      fetch("data/airlines.json").then((r) => r.json()),
      fetch("data/agencies.json").then((r) => r.json()),
      fetch("data/flights.json").then((r) => r.json()),
    ]);
    state.cities = cities;
    state.airlines = airlines;
    state.agencies = agencies;
    state.flights = flights;
  }

  const airline = (id) => state.airlines.find((a) => a.id === id);
  const agency = (id) => state.agencies.find((a) => a.id === id);
  const city = (code) => state.cities.find((c) => c.code === code);

  /* ---------- Smart fuzzy search over cities ---------- */
  function normalizeArabic(str) {
    return str
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[\u064B-\u0652]/g, "")
      .toLowerCase()
      .trim();
  }

  function fuzzyScore(query, target) {
    const q = normalizeArabic(query);
    const t = normalizeArabic(target);
    if (!q) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.includes(q)) return 60;
    // subsequence match (typo tolerant)
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length ? 30 : 0;
  }

  function searchCities(query, excludeCode) {
    if (!query) {
      return state.cities.filter((c) => c.code !== excludeCode).slice(0, 6);
    }
    return state.cities
      .map((c) => ({
        c,
        score: Math.max(
          fuzzyScore(query, c.name_ar),
          fuzzyScore(query, c.name_en),
          fuzzyScore(query, c.code)
        ),
      }))
      .filter((r) => r.score > 0 && r.c.code !== excludeCode)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.c);
  }

  /* ---------- Autocomplete UI ---------- */
  function renderSuggestions(field) {
    const input = byId(`field-${field}`);
    const box = byId(`suggest-${field}`);
    const query = input.value;
    const exclude = field === "from" ? state.to?.code : state.from?.code;
    const list = searchCities(query, exclude);

    if (!list.length) {
      box.innerHTML = `<div class="suggest__empty">لا توجد نتائج مطابقة</div>`;
    } else {
      box.innerHTML = list
        .map(
          (c) => `
        <button type="button" class="suggest__item" data-code="${c.code}" data-field="${field}">
          <span class="suggest__flag"><img src="${c.image}" alt="${c.name_ar}" loading="lazy"></span>
          <span class="suggest__text"><b>${c.name_ar}</b><span>${c.country_ar}</span></span>
          <span class="suggest__code">${c.code}</span>
        </button>`
        )
        .join("");
    }
    box.classList.add("is-open");
    state.activeSuggestField = field;
  }

  function closeSuggestions() {
    document.querySelectorAll(".suggest").forEach((s) => s.classList.remove("is-open"));
    state.activeSuggestField = null;
  }

  function selectCity(field, code) {
    const c = city(code);
    state[field] = c;
    byId(`field-${field}`).value = `${c.name_ar} (${c.code})`;
    byId(`field-${field}`).classList.remove("field-error");
    closeSuggestions();
  }

  /* ---------- Trip type / swap / stepper ---------- */
  function initTripType() {
    document.querySelectorAll(".triptype button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".triptype button").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.tripType = btn.dataset.type;
        byId("return-field-wrap").style.display = state.tripType === "roundtrip" ? "" : "none";
      });
    });
  }

  function initSwap() {
    byId("swap-btn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("is-spinning");
      setTimeout(() => btn.classList.remove("is-spinning"), 320);
      const tmp = state.from;
      state.from = state.to;
      state.to = tmp;
      byId("field-from").value = state.from ? `${state.from.name_ar} (${state.from.code})` : "";
      byId("field-to").value = state.to ? `${state.to.name_ar} (${state.to.code})` : "";
    });
  }

  function initStepper() {
    byId("pax-minus").addEventListener("click", () => {
      state.passengers = Math.max(1, state.passengers - 1);
      byId("pax-count").textContent = state.passengers;
    });
    byId("pax-plus").addEventListener("click", () => {
      state.passengers = Math.min(9, state.passengers + 1);
      byId("pax-count").textContent = state.passengers;
    });
    byId("cabin-select").addEventListener("change", (e) => {
      state.cabin = e.target.value;
    });
  }

  /* ---------- Trending destinations ---------- */
  function renderTrending() {
    const wrap = byId("trend-scroll");
    const trending = state.cities.filter((c) => c.trending);
    wrap.innerHTML = trending
      .map(
        (c) => `
      <button type="button" class="trend-card" data-code="${c.code}">
        <span class="trend-card__img"><img src="${c.image}" alt="${c.name_ar}" loading="lazy"></span>
        <span class="trend-card__body"><b>${c.name_ar}</b><span>${c.country_ar}</span></span>
      </button>`
      )
      .join("");
    wrap.querySelectorAll(".trend-card").forEach((el) => {
      el.addEventListener("click", () => {
        if (!state.from) {
          document.querySelector('[data-type="roundtrip"]')?.click();
          byId("field-from").focus();
          return;
        }
        selectCity("to", el.dataset.code);
        if (!state.date) {
          state.date = state.flights.find(f => f.to === el.dataset.code)?.date || null;
          if (state.date) byId("field-date").value = state.date;
        }
        runSearch();
        document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* ---------- Search engine ---------- */
  function scoreFlight(flight, minPrice) {
    // "Best" = weighted blend of price, duration and stops (lower is better), inverted to a 0-100 score
    const priceNorm = flight.minPrice / minPrice; // 1.0 = cheapest
    const durationNorm = flight.duration_minutes / 240;
    const stopsPenalty = flight.stops * 0.35;
    const ratingBonus = (flight.bestRating - 4) * 0.15;
    const raw = priceNorm * 0.55 + durationNorm * 0.35 + stopsPenalty - ratingBonus;
    return raw;
  }

  function runSearch() {
    if (!state.from || !state.to) {
      shakeMissingFields();
      return;
    }
    setLoading(true);

    setTimeout(() => {
      let matches = state.flights.filter(
        (f) => f.from === state.from.code && f.to === state.to.code
      );

      // date proximity: prefer exact date, else nearest upcoming dates
      if (state.date) {
        const target = new Date(state.date).getTime();
        matches = matches
          .map((f) => ({ f, diff: Math.abs(new Date(f.date).getTime() - target) }))
          .sort((a, b) => a.diff - b.diff)
          .map((x) => x.f);
      }

      // enrich with computed fields
      matches = matches.map((f) => {
        const offers = f.offers.filter((o) => o.seats_left >= 1);
        const minPrice = Math.min(...offers.map((o) => o.price));
        const bestRating = Math.max(...offers.map((o) => agency(o.agency_id)?.rating || 4));
        return { ...f, offers, minPrice, bestRating };
      }).filter(f => f.offers.length > 0);

      const globalMin = Math.min(...matches.map((f) => f.minPrice), Infinity);
      matches.forEach((f) => (f.score = scoreFlight(f, globalMin)));

      state.results = matches;
      applySort(state.sort, { skipAnimation: true });
      setLoading(false);
      renderResultsMeta();
    }, 420);
  }

  function shakeMissingFields() {
    ["from", "to"].forEach((f) => {
      if (!state[f]) {
        const el = byId(`field-${f}`);
        el.classList.add("field-error", "shake");
        setTimeout(() => el.classList.remove("shake"), 450);
      }
    });
  }

  function setLoading(isLoading) {
    const btn = byId("search-btn");
    btn.classList.toggle("is-loading", isLoading);
    btn.disabled = isLoading;
    if (isLoading) {
      byId("results-list").innerHTML = Array.from({ length: 3 })
        .map(() => `<li class="skeleton" style="height:150px"></li>`)
        .join("");
      byId("results-section").hidden = false;
    }
  }

  function renderResultsMeta() {
    byId("results-count").innerHTML = `تم العثور على <b>${state.results.length}</b> رحلة من ${state.from.name_ar} إلى ${state.to.name_ar}`;
    byId("results-section").hidden = false;
  }

  /* ---------- Sorting with FLIP animation ---------- */
  const sortFns = {
    best: (a, b) => a.score - b.score,
    cheapest: (a, b) => a.minPrice - b.minPrice,
    fastest: (a, b) => a.duration_minutes - b.duration_minutes,
    earliest: (a, b) => a.departure_time.localeCompare(b.departure_time),
  };

  function applySort(sortKey, opts = {}) {
    state.sort = sortKey;
    document.querySelectorAll(".chip[data-sort]").forEach((c) =>
      c.classList.toggle("is-active", c.dataset.sort === sortKey)
    );

    const list = byId("results-list");
    const firstRects = new Map();
    if (!opts.skipAnimation) {
      list.querySelectorAll(".flightcard").forEach((el) => {
        firstRects.set(el.dataset.id, el.getBoundingClientRect());
      });
    }

    state.results = [...state.results].sort(sortFns[sortKey]);
    renderResults(opts.skipAnimation);

    if (!opts.skipAnimation) {
      requestAnimationFrame(() => {
        list.querySelectorAll(".flightcard").forEach((el) => {
          const first = firstRects.get(el.dataset.id);
          if (!first) return;
          const last = el.getBoundingClientRect();
          const dy = first.top - last.top;
          if (Math.abs(dy) < 1) return;
          el.classList.add("is-moving");
          el.style.transform = `translateY(${dy}px)`;
          el.style.transition = "none";
          requestAnimationFrame(() => {
            el.style.transition = "";
            el.style.transform = "";
          });
          setTimeout(() => el.classList.remove("is-moving"), 340);
        });
      });
    }
  }

  /* ---------- Render flight results ---------- */
  function minutesToLabel(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} س ${m > 0 ? m + " د" : ""}`.trim();
  }

  function flightCardHTML(f, idx) {
    const al = airline(f.airline_id);
    const isSaved = state.saved.some((s) => s.flightId === f.id);
    const urgentOffer = f.offers.some((o) => o.seats_left <= 3);

    const offersHTML = f.offers
      .slice()
      .sort((a, b) => a.price - b.price)
      .map((o, i) => {
        const ag = agency(o.agency_id);
        const msg = buildWhatsAppMessage(f, o, al, ag, city(f.from), city(f.to));
        return `
        <div class="offer" style="animation-delay:${i * 60}ms">
          <div class="offer__avatar">${ag.name_ar.trim()[0]}</div>
          <div class="offer__info">
            <div class="offer__name">${ag.name_ar} ${ag.verified ? verifiedIcon() : ""}</div>
            <div class="offer__meta">
              <span>★ ${ag.rating}</span>
              <span>·</span>
              <span>${ag.response_time_ar}</span>
              ${o.seats_left <= 5 ? `<span class="offer__seats">تبقى ${o.seats_left} مقاعد فقط</span>` : ""}
            </div>
          </div>
          <div style="text-align:center">
            <div class="offer__price">${fmtPrice(o.price)}</div>
            <div style="font-size:10px;color:var(--ink-soft)">د.ع</div>
          </div>
          <a class="wabtn" target="_blank" rel="noopener" href="https://wa.me/${ag.whatsapp}?text=${msg}">
            ${whatsappIcon()}<span>احجز الآن</span>
          </a>
        </div>`;
      })
      .join("");

    return `
    <li class="flightcard enter" data-id="${f.id}" style="transition-delay:${idx * 40}ms">
      <div class="flightcard__top">
        <span class="flightcard__airline"><img src="${al.logo}" alt="${al.name_ar}"></span>
        <span class="flightcard__airline-name">${al.name_ar}</span>
        <div class="flightcard__badges">
          ${f.stops === 0 ? `<span class="badge badge--direct">مباشرة</span>` : `<span class="badge badge--direct">توقف ${f.stops}</span>`}
          ${f.cabin_class === "business" ? `<span class="badge badge--business">درجة رجال أعمال</span>` : ""}
          ${urgentOffer ? `<span class="badge badge--urgent">مقاعد محدودة</span>` : ""}
        </div>
      </div>

      <div class="flightcard__route">
        <div class="flightcard__point">
          <div class="flightcard__time">${f.departure_time}</div>
          <div class="flightcard__city">${city(f.from).code}</div>
        </div>
        <div class="flightcard__mid">
          <div class="flightcard__duration">${minutesToLabel(f.duration_minutes)}</div>
          <div class="flightcard__line"></div>
          <div class="flightcard__stops">${f.stops === 0 ? "رحلة مباشرة" : f.stops + " توقف"}</div>
        </div>
        <div class="flightcard__point">
          <div class="flightcard__time">${f.arrival_time}</div>
          <div class="flightcard__city">${city(f.to).code}</div>
        </div>
      </div>

      <div class="flightcard__bottom">
        <div class="flightcard__pricewrap">
          <span class="flightcard__pricefrom">يبدأ من</span>
          <span class="flightcard__price">${fmtPrice(f.minPrice)}</span>
          <span class="flightcard__currency">د.ع</span>
        </div>
        <div class="flightcard__actions">
          <button type="button" class="iconbtn save-btn ${isSaved ? "is-saved" : ""}" data-id="${f.id}" aria-label="حفظ">
            ${heartIcon()}
          </button>
          <button type="button" class="expandbtn" data-id="${f.id}">
            <span>${f.offers.length} عروض</span>
            ${chevronIcon()}
          </button>
        </div>
      </div>

      <div class="offers">
        <div class="offers__inner">${offersHTML}</div>
      </div>
    </li>`;
  }

  function buildWhatsAppMessage(f, offer, al, ag, fromCity, toCity) {
    const lines = [
      `مرحباً ${ag.name_ar} 👋`,
      `أرغب بحجز رحلة عبر تطبيق رحلاتي:`,
      `✈️ ${al.name_ar} — ${fromCity.name_ar} إلى ${toCity.name_ar}`,
      `📅 التاريخ: ${f.date} | 🕐 الإقلاع: ${f.departure_time}`,
      `👤 عدد المسافرين: ${state.passengers}`,
      `💺 الدرجة: ${f.cabin_class === "business" ? "رجال أعمال" : "اقتصادية"}`,
      `💰 السعر المعروض: ${fmtPrice(offer.price)} د.ع للمقعد الواحد`,
      `رمز الرحلة: ${f.id}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  function renderResults(skipAnimation) {
    const list = byId("results-list");
    if (!state.results.length) {
      list.innerHTML = `
        <li class="empty-state">
          ${emptyIcon()}
          <b>لا توجد رحلات مطابقة</b>
          <span>جرّب تغيير التاريخ أو الوجهة للحصول على نتائج</span>
        </li>`;
      return;
    }
    list.innerHTML = state.results.map((f, i) => flightCardHTML(f, i)).join("");
    if (!skipAnimation) {
      requestAnimationFrame(() => {
        list.querySelectorAll(".flightcard.enter").forEach((el) => {
          requestAnimationFrame(() => el.classList.remove("enter"));
        });
      });
    } else {
      list.querySelectorAll(".flightcard.enter").forEach((el) => el.classList.remove("enter"));
    }
    bindResultEvents();
  }

  function bindResultEvents() {
    document.querySelectorAll(".expandbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".flightcard").classList.toggle("is-expanded");
      });
    });
    document.querySelectorAll(".save-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSave(btn.dataset.id, btn);
      });
    });
  }

  /* ---------- Saved trips (side panel) ---------- */
  function toggleSave(flightId, btnEl) {
    const flight = state.results.find((f) => f.id === flightId) || state.flights.find((f) => f.id === flightId);
    const exists = state.saved.findIndex((s) => s.flightId === flightId);
    if (exists >= 0) {
      state.saved.splice(exists, 1);
      btnEl?.classList.remove("is-saved");
      showToast("تمت الإزالة من حجوزاتي");
    } else {
      const cheapest = [...flight.offers].sort((a, b) => a.price - b.price)[0];
      state.saved.unshift({
        flightId,
        savedAt: Date.now(),
        from: flight.from,
        to: flight.to,
        date: flight.date,
        departure_time: flight.departure_time,
        airline_id: flight.airline_id,
        minPrice: cheapest.price,
      });
      btnEl?.classList.add("is-saved");
      showToast("أُضيفت الرحلة إلى حجوزاتي");
    }
    localStorage.setItem("rahalati_saved", JSON.stringify(state.saved));
    updateTripsBadge();
    renderTripsPanel();
  }

  function updateTripsBadge() {
    const badge = byId("trips-badge");
    const dot = byId("nav-trips-dot");
    badge.textContent = state.saved.length;
    badge.classList.toggle("is-visible", state.saved.length > 0);
    dot.classList.toggle("is-visible", state.saved.length > 0);
  }

  function renderTripsPanel() {
    const body = byId("panel-body");
    if (!state.saved.length) {
      body.innerHTML = `
        <div class="empty-state">
          ${emptyIcon()}
          <b>لا توجد رحلات محفوظة بعد</b>
          <span>اضغط على أيقونة القلب في أي رحلة لحفظها هنا والتواصل مع الوكالة لاحقًا</span>
        </div>`;
      return;
    }
    body.innerHTML = state.saved
      .map((s, i) => {
        const al = airline(s.airline_id);
        const fromC = city(s.from);
        const toC = city(s.to);
        return `
        <div class="trip-item" style="animation-delay:${i * 60}ms">
          <div class="trip-item__top">
            <span class="trip-item__route">${fromC.name_ar} ← ${toC.name_ar}</span>
            <button type="button" class="trip-item__remove" data-id="${s.flightId}">إزالة</button>
          </div>
          <div class="trip-item__meta">${al.name_ar} · ${s.date} · ${s.departure_time}</div>
          <div class="trip-item__bottom">
            <span class="trip-item__price">${fmtPrice(s.minPrice)} د.ع</span>
            <button type="button" class="chip" data-jump="${s.flightId}" style="background:var(--primary-100);color:var(--primary-dark);border-color:transparent">
              عرض الرحلة
            </button>
          </div>
        </div>`;
      })
      .join("");

    body.querySelectorAll(".trip-item__remove").forEach((btn) => {
      btn.addEventListener("click", () => toggleSave(btn.dataset.id, document.querySelector(`.save-btn[data-id="${btn.dataset.id}"]`)));
    });
  }

  function showToast(msg) {
    const toast = byId("toast");
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  /* ---------- Icons (inline, no external assets needed) ---------- */
  const heartIcon = () => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 21s-7-4.6-9.6-9C.4 8.4 2 4.5 6 4a5 5 0 0 1 6 3 5 5 0 0 1 6-3c4 .5 5.6 4.4 3.6 8-2.6 4.4-9.6 9-9.6 9Z"/></svg>`;
  const chevronIcon = () => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>`;
  const whatsappIcon = () => `<svg viewBox="0 0 32 32"><path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.5.73 4.83 2 6.78L4 29l7.4-1.94a11.98 11.98 0 0 0 4.62.92h.01c6.62 0 12-5.4 12-12.02C28.03 8.4 22.65 3 16.02 3Zm7 17c-.3.85-1.72 1.6-2.38 1.7-.6.1-1.4.14-2.26-.14-.52-.17-1.19-.4-2.05-.78-3.6-1.56-5.95-5.2-6.13-5.44-.18-.24-1.47-1.95-1.47-3.72 0-1.77.93-2.64 1.26-3 .32-.35.7-.44.93-.44.24 0 .47 0 .68.01.22.01.51-.08.8.61.3.7 1 2.43 1.09 2.6.1.18.16.4.03.64-.13.24-.2.4-.4.6-.2.22-.4.5-.58.66-.2.18-.4.38-.17.75.22.37 1 1.63 2.15 2.65 1.48 1.31 2.73 1.72 3.1 1.9.37.2.6.16.81-.08.22-.24.9-1.05 1.15-1.4.24-.36.5-.3.83-.18.34.12 2.15 1.02 2.52 1.2.37.2.6.28.7.44.1.16.1.9-.2 1.75Z"/></svg>`;
  const verifiedIcon = () => `<svg viewBox="0 0 24 24" fill="var(--primary)" stroke="none"><path d="M12 2l2.4 2.2 3.2-.5 1 3.1 3 1.3-1 3.1L22 14l-2.2 2.4.5 3.2-3.1 1-1.3 3-3.1-1L10.4 24l-2.4-2.2-3.2.5-1-3.1-3-1.3 1-3.1L0 12l2.2-2.4-.5-3.2 3.1-1 1.3-3 3.1 1L12 2z" opacity="0"/><circle cx="12" cy="12" r="10"/></svg><span class="visually-hidden">موثّق</span>`;
  const emptyIcon = () => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16l6-6 4 4 8-8"/><circle cx="12" cy="12" r="10"/></svg>`;

  /* ---------- Side panel ---------- */
  function initPanel() {
    const open = () => {
      byId("scrim").classList.add("is-open");
      byId("trips-panel").classList.add("is-open");
      document.body.style.overflow = "hidden";
      renderTripsPanel();
    };
    const close = () => {
      byId("scrim").classList.remove("is-open");
      byId("trips-panel").classList.remove("is-open");
      document.body.style.overflow = "";
    };
    byId("appbar-trips").addEventListener("click", open);
    byId("nav-trips").addEventListener("click", open);
    byId("panel-close").addEventListener("click", close);
    byId("scrim").addEventListener("click", close);
  }

  /* ---------- Misc wiring ---------- */
  function initSuggestFields() {
    ["from", "to"].forEach((field) => {
      const input = byId(`field-${field}`);
      input.addEventListener("focus", () => renderSuggestions(field));
      input.addEventListener("input", () => renderSuggestions(field));
      input.addEventListener("click", (e) => e.stopPropagation());
    });
    document.addEventListener("click", (e) => {
      const item = e.target.closest(".suggest__item");
      if (item) {
        selectCity(item.dataset.field, item.dataset.code);
        return;
      }
      if (!e.target.closest(".suggest") && !e.target.closest(".route__field")) {
        closeSuggestions();
      }
    });
  }

  function initSortbar() {
    document.querySelectorAll(".chip[data-sort]").forEach((chip) => {
      chip.addEventListener("click", () => applySort(chip.dataset.sort));
    });
  }

  function initSearchButton() {
    byId("search-btn").addEventListener("click", runSearch);
  }

  function initScrollShadow() {
    window.addEventListener("scroll", () => {
      byId("appbar").classList.toggle("is-scrolled", window.scrollY > 8);
    });
  }

  function initDate() {
    const dateInput = byId("field-date");
    const today = new Date().toISOString().slice(0, 10);
    dateInput.min = today;
    dateInput.value = "2026-09-12";
    state.date = dateInput.value;
    dateInput.addEventListener("change", (e) => {
      state.date = e.target.value;
    });
  }

  function initBottomNavHome() {
    byId("nav-search").addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function init() {
    await loadData();
    renderTrending();
    initTripType();
    initSwap();
    initStepper();
    initSuggestFields();
    initSortbar();
    initSearchButton();
    initScrollShadow();
    initDate();
    initPanel();
    initBottomNavHome();
    updateTripsBadge();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
