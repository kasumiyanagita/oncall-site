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
