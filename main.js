// 文字を 1 文字ずつ出すアニメーション。
// 各 section の .seq の子要素を上から順に処理する:
//   [data-type] … 1 文字ずつ打つ(中の <span> などの色はそのまま)
//   .fade        … ふわっと出す
// 画面に入った section から始まる。skip ボタンか Esc で、すべてを一度に出す。
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const skipBtn = document.querySelector(".skip");
  let skipAll = reduce;

  const sleep = (ms) => new Promise((r) => setTimeout(r, skipAll ? 0 : ms));

  function textNodes(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  async function typeOut(el) {
    const isCmd = el.classList.contains("cmdline") || el.tagName === "H2";
    const speed = Number(el.dataset.speed) || (isCmd ? 45 : 16);
    const nodes = textNodes(el).map((n) => ({ node: n, text: n.data }));
    nodes.forEach((n) => (n.node.data = ""));
    el.classList.add("started", "typing");

    for (const { node, text } of nodes) {
      // コマンドのプロンプト部分は一度に出す(人が打つのはコマンドだけ)
      if (node.parentElement.classList.contains("ps1")) {
        node.data = text;
        continue;
      }
      for (let i = 0; i < text.length; i++) {
        if (skipAll) { node.data = text; break; }
        node.data += text[i];
        const ch = text[i];
        let wait = speed + (isCmd ? Math.random() * 40 : 0);
        if ("。、．，!?".includes(ch)) wait += 120;
        if (ch !== " " || isCmd) await sleep(wait);
      }
    }
    el.classList.remove("typing");
    await sleep(isCmd ? 380 : 180);
  }

  async function runSection(section) {
    if (section.dataset.ran) return;
    section.dataset.ran = "1";
    const items = section.querySelectorAll(".seq > *");
    let lastTyped = null;
    for (const el of items) {
      if (el.hasAttribute("data-type")) {
        await typeOut(el);
        lastTyped = el;
      } else if (el.classList.contains("fade")) {
        el.classList.add("shown");
        await sleep(140);
      }
    }
    // 最後に打った行にカーソルを残す(ヒーローとインストールの節だけ)
    if (lastTyped && (section.classList.contains("hero") || section.id === "start")) {
      lastTyped.classList.add("caret-on");
    }
  }

  const sections = [...document.querySelectorAll(".screen")];

  // トップページに戻ったときに、最初の打ち込みをもう一度見せる
  window.replayHero = () => {
    const hero = document.querySelector(".hero");
    hero.querySelectorAll(".caret-on").forEach((el) => el.classList.remove("caret-on"));
    hero.querySelectorAll("[data-type]").forEach((el) => el.classList.remove("started", "typing"));
    hero.querySelectorAll(".fade").forEach((el) => el.classList.remove("shown"));
    delete hero.dataset.ran;
    skipAll = reduce;
    runSection(hero);
  };

  if (skipAll) {
    sections.forEach(runSection);
    if (skipBtn) skipBtn.hidden = true;
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          runSection(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  sections.forEach((s) => io.observe(s));

  function skip() {
    skipAll = true;
    io.disconnect();
    sections.forEach(runSection);
    if (skipBtn) skipBtn.hidden = true;
  }
  if (skipBtn) skipBtn.addEventListener("click", skip);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") skip(); });
})();

// 画面の例の窓: 上のタブで、同じ窓の中の画面を切り替える
document.querySelectorAll(".win-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const win = tab.closest(".window");
    win.querySelectorAll(".win-tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    win.querySelectorAll(".win-pane").forEach((p) => (p.hidden = p.dataset.cap !== tab.dataset.cap));
    fitCaps();
  });
});

// 取り込んだ画面の英数字を、ちょうど 1 桁の幅にそろえる。
// ブラウザは文字の幅を整数のピクセルに丸めることがあり、そのままだと 100 桁で数ピクセルずれて、全角の箱と食い違う。
// 実際の幅を測って、足りない分を字間で埋める。
function fitCaps() {
  document.querySelectorAll(".cap-screen").forEach((pre) => {
    if (!pre.offsetWidth) return; // 隠れているタブは、表示したときに合わせる
    pre.style.letterSpacing = "0px";
    const probe = document.createElement("span");
    probe.textContent = "x".repeat(50);
    pre.appendChild(probe);
    const actual = probe.getBoundingClientRect().width / 50;
    probe.remove();
    const style = getComputedStyle(pre);
    const target = parseFloat(style.fontSize) * parseFloat(style.getPropertyValue("--adv"));
    pre.style.letterSpacing = `${target - actual}px`;
    // ● ◆ ★ などは、端末では 1 桁で描かれる。ブラウザが全角の字形で出してはみ出すものは、横に縮めて 1 桁に収める
    pre.querySelectorAll(".w1:not(.bx)").forEach((el) => {
      el.style.transform = "";
      const r = document.createRange();
      r.selectNodeContents(el);
      const natural = r.getBoundingClientRect().width;
      const line = el.classList.contains("hz");
      if (natural && (natural > target * 1.05 || line)) {
        // 横線は少しだけ長くして、隣の桁と重ねる(すき間を出さない)
        el.style.transformOrigin = "left center";
        el.style.transform = `scaleX(${(target * (line ? 1.08 : 1)) / natural})`;
      }
    });
  });
}
fitCaps();
if (document.fonts) document.fonts.ready.then(fitCaps);
window.addEventListener("resize", fitCaps);

// ページの最後のプロンプト(パソコンだけ)。cd ~ でトップページに戻る
(() => {
  const footer = document.querySelector(".footer-term");
  if (!footer) return;
  const input = footer.querySelector(".ft-input");
  const log = footer.querySelector(".ft-log");
  const history = [];
  let hpos = 0;

  // 移れる場所。cd のあとに書く名前と、ページの中の位置
  const PLACES = {
    flow: "#flow",
    "day-one": "#day-one",
    dayone: "#day-one",
    oncall: "#oncall",
    try: "#try",
    features: "#common",
    retro: "#retro",
    clone: "#clone",
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function print(html, cls = "ft-out") {
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = html;
    log.appendChild(div);
  }

  function goTop() {
    print("トップページに戻ります…", "ft-out c-green");
    input.blur();
    window.scrollTo({ top: 0, behavior: "smooth" });
    // スクロールし終えてから、最初の打ち込みを流し直す
    let done = false;
    const replay = () => {
      if (done) return;
      done = true;
      if (window.replayHero) window.replayHero();
    };
    window.addEventListener("scrollend", replay, { once: true });
    setTimeout(replay, 1500);
  }

  function run(line) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    const arg = (args[0] || "").replace(/^(\.\/|~\/)/, "").replace(/\/$/, "");
    switch (cmd) {
      case "cd":
        if (!args.length || ["~", "/", "..", "top"].includes(args[0])) return goTop();
        if (PLACES[arg]) {
          document.querySelector(PLACES[arg]).scrollIntoView({ behavior: "smooth" });
          return print(`${esc(arg)}/ へ移動します`);
        }
        return print(`cd: ${esc(args[0])}: No such file or directory(ls で行き先を確かめられます)`, "ft-err");
      case "top":
        return goTop();
      case "ls":
        return print(Object.keys(PLACES).filter((k) => k !== "dayone").map((k) => `<span class="c-cyan">${k}/</span>`).join("  "));
      case "pwd":
        return print("/home/you/oncall-site");
      case "whoami":
        return print("新人 SRE。");
      case "clear":
        log.innerHTML = "";
        return;
      case "help":
        return print(
          `<div class="ft-help">` +
            [
              ["cd ~", "トップページに戻る(top でも)"],
              ["cd 名前", "その節へ移る(例: cd oncall、cd try)"],
              ["ls", "移れる節の一覧"],
              ["clear", "この欄を消す"],
            ]
              .map(([c, d]) => `<span class="c-cyan">${c}</span><span>${d}</span>`)
              .join("") +
            `</div>`
        );
      case "exit":
        return print("exit はトップページで使えます。cd ~ でトップページに戻れます。", "ft-err");
      case "dayone":
      case "oncall":
        return print(
          `ここはブラウザなので、${cmd} は動きません。<a href="#clone">./clone.sh</a> の手順で入れて、ターミナルで打ってください(<a href="#try">./try.sh</a> ならブラウザで試せます)。`,
          "ft-err"
        );
      default:
        return print(`${esc(cmd)}: command not found(help で使えるコマンドが出ます)`, "ft-err");
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const line = input.value;
      input.value = "";
      if (!line.trim()) return;
      history.push(line);
      hpos = history.length;
      print(`<span class="ps1">you@terminal:~$</span> ${esc(line)}`, "ft-echo");
      run(line);
    } else if (e.key === "ArrowUp") {
      if (hpos > 0) input.value = history[--hpos];
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (hpos < history.length) input.value = history[++hpos] ?? "";
      e.preventDefault();
    }
  });

  // 最後のプロンプトが見えているあいだは、どこにいても文字を打ち始めれば入力欄に入る
  let visible = false;
  new IntersectionObserver((entries) => (visible = entries[0].isIntersecting), { threshold: 0.6 }).observe(footer);
  document.addEventListener("keydown", (e) => {
    if (!visible || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    const t = document.activeElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (getComputedStyle(footer.querySelector(".ft-line")).display === "none") return;
    input.focus({ preventScroll: true });
  });
})();

// 上のメニューの ./app: day-one と oncall を下に並べる。マウスを乗せるか、押すと開く
(() => {
  const app = document.querySelector(".nav-app");
  if (!app) return;
  const btn = app.querySelector(".nav-app-btn");
  const set = (open) => {
    app.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    set(!app.classList.contains("open"));
  });
  app.querySelectorAll(".nav-menu a").forEach((a) => a.addEventListener("click", () => set(false)));
  document.addEventListener("click", (e) => { if (!app.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
})();
