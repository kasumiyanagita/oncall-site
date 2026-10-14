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
