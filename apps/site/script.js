(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header scroll shadow ---------- */

  var header = document.getElementById("site-header");
  function onScroll() {
    var scrolled = (window.scrollY || 0) > 14;
    header.classList.toggle("is-scrolled", scrolled);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- reveal on scroll ---------- */

  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
    // Safety net: reveal everything left over after a while, in case an element
    // never crosses the observer threshold (e.g. unusual viewport/layout).
    setTimeout(function () {
      revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    }, 4000);
  }

  /* ---------- professions panel ---------- */

  var liveTag = { text: "Available now", cls: "tag--live" };
  var soonTag = { text: "Coming soon", cls: "tag--soon" };

  var professions = [
    {
      name: "Exercise Physiology",
      live: true,
      desc: "Outcome measures, functional change and goal-linked progress documentation. Open and explorable today.",
      stages: [
        ["Baseline", "412 m", false],
        ["Current", "487 m", false],
        ["Change", "+75 m · +18.2%", true],
        ["Goal", "Community walking endurance", false],
        ["Documentation", "Drafted · awaiting review", false]
      ]
    },
    {
      name: "Physiotherapy",
      live: false,
      desc: "Assessment findings, functional outcomes and change across an episode of care.",
      stages: [
        ["Assessment", "Recorded", false],
        ["Functional outcome", "Structured", false],
        ["Change", "Calculated", true],
        ["Goal", "Linked", false]
      ]
    },
    {
      name: "Occupational Therapy",
      live: false,
      desc: "Capacity, daily function and the change that supports a functional goal.",
      stages: [
        ["Capacity", "Recorded", false],
        ["Daily function", "Structured", false],
        ["Change", "Calculated", true],
        ["Goal", "Linked", false]
      ]
    },
    {
      name: "Speech Pathology",
      live: false,
      desc: "Assessment, outcome and progress carried through to documentation.",
      stages: [
        ["Assessment", "Recorded", false],
        ["Outcome", "Structured", false],
        ["Progress", "Calculated", true],
        ["Documentation", "Drafted", false]
      ]
    },
    {
      name: "Psychology",
      live: false,
      desc: "Assessment, measure and progress held alongside the clinical context.",
      stages: [
        ["Assessment", "Recorded", false],
        ["Measure", "Structured", false],
        ["Progress", "Calculated", true],
        ["Clinical context", "Linked", false]
      ]
    },
    {
      name: "More allied health",
      live: false,
      desc: "The same evidence layer continues beyond the professions listed here.",
      stages: [
        ["Evidence", "Recorded", false],
        ["Measure", "Structured", false],
        ["Change", "Calculated", true],
        ["Documentation", "Drafted", false]
      ]
    }
  ];

  var professionItems = Array.prototype.slice.call(document.querySelectorAll(".profession-item"));
  var panel = document.getElementById("profession-panel");
  var panelTag = panel.querySelector("[data-panel-tag]");
  var panelName = panel.querySelector("[data-panel-name]");
  var panelDesc = panel.querySelector("[data-panel-desc]");
  var panelStages = panel.querySelector("[data-panel-stages]");
  var panelCta = panel.querySelector("[data-panel-cta]");
  var panelSoon = panel.querySelector("[data-panel-soon]");

  function renderPanel(index) {
    var p = professions[index];
    var tag = p.live ? liveTag : soonTag;

    panel.classList.toggle("profession-panel--live", p.live);
    panel.style.background = p.live ? "" : "var(--bg-alt)";

    panelTag.textContent = tag.text;
    panelTag.className = "tag " + tag.cls;
    panelName.textContent = p.name;
    panelDesc.textContent = p.desc;

    panelStages.innerHTML = "";
    p.stages.forEach(function (stage) {
      var row = document.createElement("div");
      row.className = "stage-row" + (stage[2] ? " stage-row--highlight" : "");
      var label = document.createElement("span");
      label.className = "stage-label";
      label.textContent = stage[0];
      var value = document.createElement("span");
      value.className = "stage-value";
      value.textContent = stage[1];
      row.appendChild(label);
      row.appendChild(value);
      panelStages.appendChild(row);
    });

    panelCta.hidden = !p.live;
    panelSoon.hidden = !!p.live;
  }

  function setActiveProfession(index) {
    professionItems.forEach(function (item, i) {
      item.classList.toggle("is-active", i === index);
    });
    renderPanel(index);
  }

  professionItems.forEach(function (item, i) {
    item.addEventListener("mouseenter", function () { setActiveProfession(i); });
    item.addEventListener("focus", function () { setActiveProfession(i); });
    item.addEventListener("click", function () {
      setActiveProfession(i);
      if (professions[i].live) {
        var target = document.getElementById("exercise-physiology");
        if (target) {
          target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
        }
      }
    });
  });

  /* ---------- provenance hover ---------- */

  var provSpans = Array.prototype.slice.call(document.querySelectorAll(".prov-span"));
  var provChips = Array.prototype.slice.call(document.querySelectorAll(".prov-chip"));
  var provenanceSentence = document.getElementById("provenance-sentence");

  function setActiveProvenance(key) {
    provSpans.forEach(function (span) {
      span.classList.toggle("is-active", span.getAttribute("data-prov") === key);
    });
    provChips.forEach(function (chip) {
      chip.classList.toggle("is-active", chip.getAttribute("data-prov-chip") === key);
    });
  }

  provSpans.forEach(function (span) {
    var key = span.getAttribute("data-prov");
    span.addEventListener("mouseenter", function () { setActiveProvenance(key); });
    span.addEventListener("focus", function () { setActiveProvenance(key); });
  });
  provChips.forEach(function (chip) {
    var key = chip.getAttribute("data-prov-chip");
    chip.addEventListener("mouseenter", function () { setActiveProvenance(key); });
    chip.addEventListener("focus", function () { setActiveProvenance(key); });
  });
  if (provenanceSentence) {
    provenanceSentence.addEventListener("mouseleave", function () { setActiveProvenance(null); });
  }

  /* ---------- words hover ---------- */

  var wordRows = Array.prototype.slice.call(document.querySelectorAll(".word-row"));
  wordRows.forEach(function (row) {
    row.addEventListener("mouseenter", function () { row.classList.add("is-active"); });
    row.addEventListener("focus", function () { row.classList.add("is-active"); });
    row.addEventListener("mouseleave", function () { row.classList.remove("is-active"); });
    row.addEventListener("blur", function () { row.classList.remove("is-active"); });
  });
})();
