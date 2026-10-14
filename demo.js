// お試し版: day-one の 1 コマンド(grep)と、oncall の 1 インシデント(深夜の 500 祭り)を、ブラウザの中で体験する。
// 本物は bash で動くが、ここでは JS で書いた小さなシェル(よく使うコマンドとパイプ、> だけ)で動かす。
(() => {
  const root = document.querySelector("#demo");
  if (!root) return;

  // ================= 乱数(開くたびに中身が変わる) =================
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      random: next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      weighted(arr, weights) {
        const total = weights.reduce((s, w) => s + w, 0);
        let r = next() * total;
        for (let i = 0; i < arr.length; i++) if ((r -= weights[i]) < 0) return arr[i];
        return arr[arr.length - 1];
      },
      sample(arr, n) {
        const copy = arr.slice();
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
      },
    };
  }

  // ================= 表示の小道具 =================
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // `code` と **太字** だけを解釈する
  const md = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  // ================= 仮想ファイルシステム =================
  class FS {
    constructor(home) {
      this.home = home;
      this.files = new Map();
      this.dirs = new Set(["/", "/home", home]);
    }
    resolve(cwd, p) {
      if (p === "~" || p.startsWith("~/")) p = this.home + p.slice(1);
      const parts = (p.startsWith("/") ? p : cwd + "/" + p).split("/");
      const out = [];
      for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") out.pop();
        else out.push(part);
      }
      return "/" + out.join("/");
    }
    addDir(path) {
      this.dirs.add(path);
    }
    write(path, content) {
      this.files.set(path, content);
    }
    children(dir) {
      const prefix = dir === "/" ? "/" : dir + "/";
      const names = new Set();
      for (const p of [...this.files.keys(), ...this.dirs]) {
        if (p.startsWith(prefix) && p !== dir) names.add(p.slice(prefix.length).split("/")[0]);
      }
      return [...names].sort();
    }
  }

  // ================= コマンドラインの分解 =================
  function tokenize(line) {
    const tokens = [];
    let cur = "";
    let inTok = false;
    let glob = false;
    const push = () => {
      if (inTok) tokens.push({ word: cur, glob });
      cur = "";
      inTok = false;
      glob = false;
    };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'") {
        const j = line.indexOf("'", i + 1);
        if (j < 0) throw new Error("' が閉じていません。");
        cur += line.slice(i + 1, j);
        inTok = true;
        i = j;
      } else if (c === '"') {
        let j = i + 1;
        for (; j < line.length && line[j] !== '"'; j++) {
          if (line[j] === "\\" && j + 1 < line.length) j++;
          cur += line[j];
        }
        if (j >= line.length) throw new Error('" が閉じていません。');
        inTok = true;
        i = j;
      } else if (c === "\\" && i + 1 < line.length) {
        cur += line[++i];
        inTok = true;
      } else if (/\s/.test(c)) {
        push();
      } else if (c === "|") {
        push();
        tokens.push({ op: "|" });
      } else if (c === ">") {
        push();
        if (line[i + 1] === ">") {
          tokens.push({ op: ">>" });
          i++;
        } else tokens.push({ op: ">" });
      } else if (c === ";" || c === "&" || c === "<" || c === "`" || c === "$" && line[i + 1] === "(") {
        throw new Error(`お試し版のシェルでは「${c}」は使えません。パイプ(|)と > はそのまま使えます。`);
      } else {
        if (c === "*" || c === "?") glob = true;
        cur += c;
        inTok = true;
      }
    }
    push();
    return tokens;
  }

  // ================= 小さなシェル =================
  const linesOf = (text) => {
    if (!text) return [];
    const ls = text.split("\n");
    if (ls[ls.length - 1] === "") ls.pop();
    return ls;
  };
  const joinLines = (ls) => (ls.length ? ls.join("\n") + "\n" : "");

  class Shell {
    constructor(fs, cwd) {
      this.fs = fs;
      this.cwd = cwd;
    }

    prettyCwd() {
      return this.cwd === this.fs.home ? "~" : this.cwd.startsWith(this.fs.home + "/") ? "~" + this.cwd.slice(this.fs.home.length) : this.cwd;
    }

    expand(tokens) {
      const out = [];
      for (const t of tokens) {
        if (t.op) {
          out.push(t);
          continue;
        }
        if (t.glob) {
          const re = new RegExp("^" + t.word.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
          const hits = this.fs.children(this.cwd).filter((n) => re.test(n));
          if (hits.length) {
            hits.forEach((h) => out.push({ word: h }));
            continue;
          }
        }
        out.push({ word: t.word });
      }
      return out;
    }

    // 戻り値: { out, err, redirected, stages }
    run(line) {
      const tokens = this.expand(tokenize(line));
      const stages = [[]];
      let redirect = null;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.op === "|") stages.push([]);
        else if (t.op === ">" || t.op === ">>") {
          const target = tokens[i + 1];
          if (!target || target.op) throw new Error("> のあとに、保存するファイルの名前を書いてください。");
          redirect = { path: target.word, append: t.op === ">>" };
          i++;
        } else stages[stages.length - 1].push(t.word);
      }
      if (stages.some((s) => s.length === 0)) throw new Error("| の前後にコマンドを書いてください。");

      let input = null;
      let err = "";
      for (const argv of stages) {
        const r = this.exec(argv, input);
        input = r.out;
        if (r.err) err += r.err;
      }
      let out = input || "";
      if (redirect) {
        const path = this.fs.resolve(this.cwd, redirect.path);
        const before = redirect.append ? this.fs.files.get(path) || "" : "";
        this.fs.write(path, before + out);
        out = "";
      }
      return { out, err, redirected: !!redirect, stages };
    }

    read(name, cmd) {
      const path = this.fs.resolve(this.cwd, name);
      if (this.fs.dirs.has(path)) return { err: `${cmd}: ${name}: Is a directory\n` };
      if (!this.fs.files.has(path)) return { err: `${cmd}: ${name}: No such file or directory\n` };
      return { text: this.fs.files.get(path) };
    }

    // ファイル引数があればその中身、なければ標準入力
    inputs(files, stdin, cmd) {
      if (!files.length) return { text: stdin || "", err: "" };
      let text = "";
      let err = "";
      for (const f of files) {
        const r = this.read(f, cmd);
        if (r.err) err += r.err;
        else text += r.text;
      }
      return { text, err };
    }

    exec(argv, stdin) {
      const [cmd, ...args] = argv;
      const fn = this["cmd_" + cmd];
      if (fn) return fn.call(this, args, stdin);
      if (["less", "more", "vim", "vi", "nano", "man", "top", "ssh", "sudo"].includes(cmd)) {
        return { out: "", err: `${cmd}: お試し版では使えません。ダウンロード版では本物の bash で動きます。\n` };
      }
      return { out: "", err: `${cmd}: command not found\n` };
    }

    cmd_pwd() {
      return { out: this.cwd + "\n" };
    }

    cmd_cd(args) {
      const target = this.fs.resolve(this.cwd, args[0] || "~");
      if (!this.fs.dirs.has(target)) return { out: "", err: `cd: ${args[0]}: No such file or directory\n` };
      this.cwd = target;
      return { out: "" };
    }

    cmd_ls(args) {
      const long = args.some((a) => /^-[a-zA-Z]*l/.test(a));
      const targets = args.filter((a) => !a.startsWith("-"));
      const dir = this.fs.resolve(this.cwd, targets[0] || ".");
      if (this.fs.files.has(dir)) return { out: (targets[0]) + "\n" };
      if (!this.fs.dirs.has(dir)) return { out: "", err: `ls: cannot access '${targets[0]}': No such file or directory\n` };
      const names = this.fs.children(dir);
      if (!long) return { out: names.length ? names.join("  ") + "\n" : "" };
      const rows = names.map((n) => {
        const p = dir === "/" ? "/" + n : dir + "/" + n;
        const isDir = this.fs.dirs.has(p);
        const size = isDir ? 4096 : new Blob([this.fs.files.get(p)]).size;
        return `${isDir ? "drwxr-xr-x" : "-rw-r--r--"} 1 you you ${String(size).padStart(7)} Oct 14 02:40 ${n}`;
      });
      return { out: `total ${names.length * 4}\n` + joinLines(rows) };
    }

    cmd_cat(args, stdin) {
      const number = args.includes("-n");
      const { text, err } = this.inputs(args.filter((a) => a !== "-n"), stdin, "cat");
      const out = number ? joinLines(linesOf(text).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`)) : text;
      return { out, err };
    }

    countArg(args, def) {
      let n = def;
      const files = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-n") n = parseInt(args[++i], 10);
        else if (/^-n\d+$/.test(a)) n = parseInt(a.slice(2), 10);
        else if (/^-\d+$/.test(a)) n = parseInt(a.slice(1), 10);
        else files.push(a);
      }
      return { n: Number.isFinite(n) ? n : def, files };
    }

    cmd_head(args, stdin) {
      const { n, files } = this.countArg(args, 10);
      const { text, err } = this.inputs(files, stdin, "head");
      return { out: joinLines(linesOf(text).slice(0, n)), err };
    }

    cmd_tail(args, stdin) {
      const { n, files } = this.countArg(args, 10);
      const { text, err } = this.inputs(files, stdin, "tail");
      const ls = linesOf(text);
      return { out: joinLines(n ? ls.slice(-n) : []), err };
    }

    cmd_echo(args) {
      const noNl = args[0] === "-n";
      const s = (noNl ? args.slice(1) : args).join(" ");
      return { out: noNl ? s : s + "\n" };
    }

    cmd_grep(args, stdin) {
      const flags = new Set();
      const rest = [];
      for (const a of args) {
        if (/^-[a-zA-Z]+$/.test(a) && !rest.length) [...a.slice(1)].forEach((f) => flags.add(f));
        else rest.push(a);
      }
      const [pattern, ...files] = rest;
      if (pattern === undefined) return { out: "", err: "使い方: grep [オプション] 言葉 ファイル\n" };
      const re = grepRegex(pattern, flags.has("i"));
      const sources = files.length ? files : [null];
      let out = "";
      let err = "";
      for (const f of sources) {
        let text = stdin || "";
        if (f !== null) {
          const r = this.read(f, "grep");
          if (r.err) {
            err += r.err;
            continue;
          }
          text = r.text;
        }
        const hit = linesOf(text)
          .map((l, i) => [l, i + 1])
          .filter(([l]) => re.test(l) !== flags.has("v"));
        const prefix = files.length > 1 ? `${f}:` : "";
        if (flags.has("c")) out += `${prefix}${hit.length}\n`;
        else out += joinLines(hit.map(([l, n]) => prefix + (flags.has("n") ? `${n}:` : "") + l));
      }
      return { out, err };
    }

    cmd_sort(args, stdin) {
      const flags = new Set();
      let key = 0;
      const files = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-k") key = parseInt(args[++i], 10);
        else if (/^-k\d+/.test(a)) key = parseInt(a.slice(2), 10);
        else if (/^-[a-zA-Z]+$/.test(a)) [...a.slice(1)].forEach((f) => flags.add(f));
        else files.push(a);
      }
      const { text, err } = this.inputs(files, stdin, "sort");
      const field = (l) => (key ? l.trim().split(/\s+/).slice(key - 1).join(" ") : l);
      const num = (l) => {
        const m = field(l).match(/^\s*(-?\d+(\.\d+)?)/);
        return m ? parseFloat(m[1]) : 0;
      };
      let ls = linesOf(text);
      ls.sort((a, b) => {
        if (flags.has("n")) {
          const d = num(a) - num(b);
          if (d) return d;
        }
        const fa = field(a);
        const fb = field(b);
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      });
      if (flags.has("r")) ls.reverse();
      if (flags.has("u")) ls = ls.filter((l, i) => i === 0 || l !== ls[i - 1]);
      return { out: joinLines(ls), err };
    }

    cmd_uniq(args, stdin) {
      const count = args.includes("-c");
      const { text, err } = this.inputs(args.filter((a) => !a.startsWith("-")), stdin, "uniq");
      const out = [];
      let prev = null;
      let n = 0;
      const flush = () => {
        if (prev !== null) out.push(count ? `${String(n).padStart(7)} ${prev}` : prev);
      };
      for (const l of linesOf(text)) {
        if (l === prev) n++;
        else {
          flush();
          prev = l;
          n = 1;
        }
      }
      flush();
      return { out: joinLines(out), err };
    }

    cmd_wc(args, stdin) {
      const flags = new Set();
      const files = [];
      for (const a of args) {
        if (/^-[lwc]+$/.test(a)) [...a.slice(1)].forEach((f) => flags.add(f));
        else files.push(a);
      }
      if (!flags.size) ["l", "w", "c"].forEach((f) => flags.add(f));
      const fmt = (text, name) => {
        const vals = [];
        if (flags.has("l")) vals.push(linesOf(text).length);
        if (flags.has("w")) vals.push(text.split(/\s+/).filter(Boolean).length);
        if (flags.has("c")) vals.push(new Blob([text]).size);
        const nums = vals.length === 1 && name === null ? String(vals[0]) : vals.map((v) => String(v).padStart(7)).join(" ");
        return nums + (name !== null ? " " + name : "") + "\n";
      };
      if (!files.length) return { out: fmt(stdin || "", null) };
      let out = "";
      let err = "";
      for (const f of files) {
        const r = this.read(f, "wc");
        if (r.err) err += r.err;
        else out += fmt(r.text, f);
      }
      return { out, err };
    }

    cmd_cut(args, stdin) {
      let delim = "\t";
      let fields = null;
      const files = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-d") delim = args[++i];
        else if (a.startsWith("-d")) delim = a.slice(2);
        else if (a === "-f") fields = args[++i];
        else if (a.startsWith("-f")) fields = a.slice(2);
        else files.push(a);
      }
      if (!fields) return { out: "", err: "cut: -f で取り出す列を指定してください(例: cut -d' ' -f1)\n" };
      if (delim === undefined || delim.length !== 1) return { out: "", err: "cut: -d には 1 文字を指定します(例: -d' ' や -d,)\n" };
      const wanted = [];
      for (const part of fields.split(",")) {
        const m = part.match(/^(\d*)-(\d*)$/);
        if (m) wanted.push([m[1] ? +m[1] : 1, m[2] ? +m[2] : Infinity]);
        else wanted.push([+part, +part]);
      }
      const { text, err } = this.inputs(files, stdin, "cut");
      const out = linesOf(text).map((l) => {
        if (!l.includes(delim)) return l;
        return l
          .split(delim)
          .filter((_, i) => wanted.some(([lo, hi]) => i + 1 >= lo && i + 1 <= hi))
          .join(delim);
      });
      return { out: joinLines(out), err };
    }

    cmd_awk(args, stdin) {
      let fs = null;
      const rest = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-F") fs = args[++i];
        else if (a.startsWith("-F")) fs = a.slice(2);
        else rest.push(a);
      }
      const [prog, ...files] = rest;
      if (prog === undefined) return { out: "", err: "使い方: awk '条件 {print $列}' ファイル\n" };
      let compiled;
      try {
        compiled = compileAwk(prog);
      } catch (e) {
        return { out: "", err: `awk: ${e.message}\n` };
      }
      const { text, err } = this.inputs(files, stdin, "awk");
      const out = [];
      linesOf(text).forEach((line, idx) => {
        const fields = fs === null ? line.trim().split(/\s+/).filter(Boolean) : line.split(fs);
        const ctx = { line, fields, NR: idx + 1 };
        if (compiled.test(ctx)) out.push(compiled.print(ctx));
      });
      return { out: joinLines(out), err };
    }

    cmd_clear() {
      return { out: "", clear: true };
    }
  }

  function grepRegex(pattern, ignoreCase) {
    // grep の基本の正規表現に近づける(\| などは扱わない)
    try {
      return new RegExp(pattern, ignoreCase ? "i" : "");
    } catch {
      return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "i" : "");
    }
  }

  // awk は「条件 {print ...}」の形だけを扱う
  function compileAwk(prog) {
    const m = prog.trim().match(/^([^{]*?)\s*(?:\{([^{}]*)\})?\s*$/);
    if (!m) throw new Error("お試し版の awk は「条件 {print $列}」の形だけに対応しています。");
    const [, pattern, action] = m;
    if (/^(BEGIN|END)\b/.test(pattern)) throw new Error("お試し版の awk では BEGIN / END は使えません(ダウンロード版では使えます)。");

    const value = (tok, ctx) => {
      tok = tok.trim();
      if (tok === "$0") return ctx.line;
      if (/^\$\d+$/.test(tok)) return ctx.fields[+tok.slice(1) - 1] ?? "";
      if (tok === "NR") return String(ctx.NR);
      if (tok === "NF") return String(ctx.fields.length);
      if (/^".*"$/.test(tok)) return tok.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(tok)) return tok;
      throw new Error(`「${tok}」は、お試し版の awk では使えません。`);
    };
    const isNum = (s) => /^\s*-?\d+(\.\d+)?\s*$/.test(s);

    const atom = (src) => {
      src = src.trim();
      if (!src) return () => true;
      const re = src.match(/^\/(.*)\/$/);
      if (re) {
        const r = new RegExp(re[1]);
        return (ctx) => r.test(ctx.line);
      }
      const c = src.match(/^(.+?)\s*(==|!=|>=|<=|>|<|!~|~)\s*(.+)$/);
      if (!c) throw new Error(`条件「${src}」を読めませんでした。例: $9 == 500`);
      const [, l, op, r] = c;
      value(l, { line: "", fields: [], NR: 0 });
      if (op === "~" || op === "!~") {
        const rr = new RegExp(r.trim().replace(/^\/|\/$/g, ""));
        return (ctx) => rr.test(value(l, ctx)) === (op === "~");
      }
      value(r, { line: "", fields: [], NR: 0 });
      return (ctx) => {
        let a = value(l, ctx);
        let b = value(r, ctx);
        if (isNum(a) && isNum(b)) {
          a = parseFloat(a);
          b = parseFloat(b);
        }
        switch (op) {
          case "==": return a == b; // eslint-disable-line eqeqeq
          case "!=": return a != b; // eslint-disable-line eqeqeq
          case ">=": return a >= b;
          case "<=": return a <= b;
          case ">": return a > b;
          default: return a < b;
        }
      };
    };

    let test;
    if (pattern.includes("&&")) {
      const parts = pattern.split("&&").map(atom);
      test = (ctx) => parts.every((p) => p(ctx));
    } else if (pattern.includes("||")) {
      const parts = pattern.split("||").map(atom);
      test = (ctx) => parts.some((p) => p(ctx));
    } else test = atom(pattern);

    let print = (ctx) => ctx.line;
    if (action !== undefined && action.trim()) {
      const pm = action.trim().replace(/;$/, "").match(/^print\s*(.*)$/);
      if (!pm) throw new Error("お試し版の awk の {} の中では print だけが使えます(ダウンロード版では何でも使えます)。");
      if (pm[1].trim()) {
        const items = pm[1].split(",").map((it) => it.trim().match(/"[^"]*"|\S+/g) || []);
        items.flat().forEach((t) => value(t, { line: "", fields: [], NR: 0 }));
        print = (ctx) => items.map((toks) => toks.map((t) => value(t, ctx)).join("")).join(" ");
      }
    }
    return { test, print };
  }

  // ================= 画面(day-one / oncall で共通) =================
  const MAX_LINES = 300;

  class Term {
    constructor(el) {
      this.el = el;
      this.screen = el.querySelector(".demo-screen");
      this.input = el.querySelector(".demo-input");
      this.prompt = el.querySelector(".demo-prompt");
      this.ops = el.querySelector(".demo-ops");
      this.status = el.querySelector(".demo-status");
      this.history = [];
      this.hpos = 0;
      this.app = null;

      el.querySelector(".demo-body").addEventListener("click", (e) => {
        if (!e.target.closest("a, button") && !window.getSelection().toString()) this.input.focus({ preventScroll: true });
      });
      this.input.addEventListener("keydown", (e) => this.onKey(e));
    }

    onKey(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const line = this.input.value;
        this.input.value = "";
        if (line.trim()) {
          this.history.push(line);
        }
        this.hpos = this.history.length;
        this.app.submit(line);
      } else if (e.key === "ArrowUp") {
        if (this.hpos > 0) this.input.value = this.history[--this.hpos];
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (this.hpos < this.history.length) this.input.value = this.history[++this.hpos] ?? "";
        e.preventDefault();
      } else if (e.key === "Tab") {
        e.preventDefault();
        this.complete();
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        this.clear();
      }
    }

    complete() {
      const v = this.input.value;
      const m = v.match(/(\S*)$/);
      const word = m[1];
      if (!word || !this.app.shell) return;
      const names = this.app.shell.fs.children(this.app.shell.cwd).filter((n) => n.startsWith(word));
      if (names.length === 1) this.input.value = v.slice(0, v.length - word.length) + names[0] + " ";
      else if (names.length > 1) this.html(`<span class="c-dim">${esc(names.join("  "))}</span>`);
    }

    clear() {
      this.screen.innerHTML = "";
    }

    html(h, cls = "") {
      const div = document.createElement("div");
      div.className = "demo-line " + cls;
      div.innerHTML = h;
      this.screen.appendChild(div);
      this.screen.scrollTop = this.screen.scrollHeight;
      return div;
    }

    text(t, cls = "") {
      return this.html(esc(t), cls);
    }

    echo(line) {
      this.html(`${this.prompt.innerHTML} ${esc(line)}`, "demo-echo");
    }

    output(out, highlight) {
      const ls = linesOf(out);
      const shown = ls.slice(0, MAX_LINES);
      let h = esc(joinLines(shown));
      if (highlight) {
        // grep で見つかった言葉に色を付ける(本物の grep --color と同じ)
        h = shown
          .map((l) => {
            try {
              const re = new RegExp(highlight.source, highlight.flags + "g");
              let res = "";
              let last = 0;
              for (const m of l.matchAll(re)) {
                if (!m[0]) break;
                res += esc(l.slice(last, m.index)) + `<span class="c-red">${esc(m[0])}</span>`;
                last = m.index + m[0].length;
              }
              return res + esc(l.slice(last));
            } catch {
              return esc(l);
            }
          })
          .join("\n");
      }
      if (h) this.html(h.replace(/\n$/, ""), "demo-out");
      if (ls.length > MAX_LINES) {
        this.html(`… ほか ${ls.length - MAX_LINES} 行(お試し版では ${MAX_LINES} 行までを表示します。head や grep で絞り込むのがおすすめです)`, "c-dim");
      }
    }

    // シェルでコマンドを実行して表示する。戻り値は Shell.run の結果(失敗したら null)
    runShell(line) {
      const sh = this.app.shell;
      let r;
      try {
        r = sh.run(line);
      } catch (e) {
        this.text(e.message, "c-yellow");
        return null;
      }
      const last = r.stages[r.stages.length - 1];
      if (last[0] === "clear") {
        this.clear();
        return r;
      }
      let hl = null;
      if (last[0] === "grep" && !r.redirected) {
        const flags = last.slice(1).filter((a) => /^-[a-zA-Z]+$/.test(a)).join("");
        const pat = last.slice(1).find((a) => !/^-[a-zA-Z]+$/.test(a));
        if (pat && !/[vc]/.test(flags)) hl = grepRegex(pat, flags.includes("i"));
      }
      this.output(r.out, hl);
      if (r.err) this.text(r.err.replace(/\n$/, ""), "c-red");
      this.setPrompt();
      return r;
    }

    setPrompt() {
      this.prompt.innerHTML = this.app.promptHtml();
    }

    setStatus(h) {
      this.status.innerHTML = h;
    }
  }

  // ================= day-one のお試し: 最初のコマンド pwd =================
  // 文章は day-one の cards/01_pwd.toml と同じ。流れと指摘の文言は lesson.py に合わせてある。
  const PWD_CARD = {
    command: "pwd",
    title: "いまいる場所を表示する",
    summary: "いま作業しているディレクトリ(フォルダ)を、いちばん上の階層からの道順で表示します。",
    when: "移動を繰り返して、自分がどこにいるか分からなくなったとき。ファイルを作ったり消したりする前に、場所を確かめたいとき。",
    syntax: "pwd",
    dirs: ["documents/reports", "documents/letters", "projects/website", "projects/notes", "pictures/trip", "music"],
    places: ["documents/reports", "documents/letters", "projects/website", "projects/notes", "pictures/trip"],
    steps: [
      {
        say: "ターミナルでは、いつも「どこかのディレクトリの中」にいます。`pwd` と打って Enter を押し、いまいる場所を確かめましょう。",
        run: "pwd",
        after: "`/` で区切られた道順(パス)が表示されました。ここは、あなた専用の作業場所である「ホームディレクトリ」です。",
      },
    ],
    challenge: {
      ask: "いま、あなたを別のディレクトリへこっそり移動させました。どこにいるのか、表示して確かめてください。",
      solution: "pwd",
      hints: ["ここで覚えたコマンドを、そのまま打つだけです。", "`pwd` と打って Enter を押します。"],
      done: "`pwd` は print working directory(作業中のディレクトリを表示)の略です。迷ったらまず `pwd`、と覚えておくと安心です。",
    },
  };
  const SUGGEST_HINT_AFTER = 3;

  class DayOne {
    constructor(term) {
      this.term = term;
      term.app = this;
      this.start();
    }

    start() {
      const card = (this.card = PWD_CARD);
      const rng = makeRng(Date.now());
      this.place = rng.pick(card.places);
      const fs = new FS("/home/you");
      for (const d of card.dirs) {
        let p = "/home/you";
        for (const part of d.split("/")) fs.addDir((p += "/" + part));
      }
      this.shell = new Shell(fs, "/home/you");
      this.step = 0; // steps.length 未満 = 打ってみよう、steps.length = お題、それより大きい = 正解
      this.hints = 0;
      this.misses = 0;
      this.feedback = null; // [文, muted か]
      this.term.clear();
      this.term.ops.innerHTML = `<span class="lbl c-cyan">${card.command}</span><i></i><span><span class="c-cyan">hint</span> ヒント │ <span class="c-cyan">card</span> 説明 │ <span class="c-cyan">title</span> 最初から</span>`;
      this.term.setPrompt();
      this.showCard();
      this.render();
    }

    get inChallenge() {
      return this.step === this.card.steps.length;
    }

    get done() {
      return this.step > this.card.steps.length;
    }

    // このカードは「場所を自分で調べる」ので、プロンプトに現在地を出さない(prompt = "plain")
    promptHtml() {
      return `<span class="c-green">$</span>`;
    }

    showCard() {
      const c = this.card;
      this.term.html(
        `<div class="demo-card">` +
          `<div class="demo-card-title"><span class="c-cyan">${c.command}</span> ─ <b>${esc(c.title)}</b></div>` +
          `<div class="demo-card-row"><span class="c-dim">説明</span><span>${md(c.summary)}</span></div>` +
          `<div class="demo-card-row"><span class="c-dim">いつ使う</span><span>${md(c.when)}</span></div>` +
          `<div class="demo-card-row"><span class="c-dim">syntax</span><span class="c-cyan">${esc(c.syntax)}</span></div>` +
          `</div>`
      );
    }

    track() {
      const total = this.card.steps.length;
      if (this.inChallenge || this.done) return `<span class="c-green">${"●".repeat(total)}</span><b>★</b>`;
      const upcoming = "○".repeat(total - this.step - 1) + "☆";
      return `<span class="c-green">${"●".repeat(this.step)}</span><b>●</b><span class="c-dim">${upcoming}</span>`;
    }

    render() {
      const t = this.term;
      if (this.done) {
        t.setStatus(
          `<div><span class="c-purple">▶ 次へ</span></div>` +
            `<div class="indent"><span class="c-cyan">Enter</span> で新しいコマンド <span class="c-cyan">ls</span> へ進む</div>` +
            `<div class="indent"><span class="c-cyan">r</span> もう一度   <span class="c-cyan">title</span> 最初から</div>`
        );
        return;
      }
      let head;
      let body;
      let hints = [];
      if (!this.inChallenge) {
        const s = this.card.steps[this.step];
        head = `▶ 打ってみよう</span> <span class="c-dim">${this.step + 1}/${this.card.steps.length}</span>`;
        body = md(s.say);
        if (this.hints) hints = [`<span class="c-yellow">ヒント</span> ${md(`\`${s.run}\` と打ってみましょう。`)}`];
      } else {
        head = "▶ お題</span>";
        body = md(this.card.challenge.ask);
        const hs = this.card.challenge.hints;
        hints = hs.slice(0, this.hints).map((h, i) => `<span class="c-yellow">ヒント ${i + 1}/${hs.length}</span> ${md(h)}`);
      }
      const fb = this.feedback
        ? `<div class="indent ${this.feedback[1] ? "c-dim" : "c-yellow"}">→ ${md(this.feedback[0])}</div>`
        : "";
      t.setStatus(
        `<div><span class="c-purple">${head}  ${this.track()}</div>` +
          `<div class="indent">${body}</div>` +
          hints.map((h) => `<div class="indent">${h}</div>`).join("") +
          fb
      );
    }

    submit(line) {
      const t = this.term;
      const cmd = line.trim();
      t.echo(line);
      this.feedback = null;
      if (this.done) {
        if (cmd === "r" || cmd === "retry" || cmd === "title") return this.start();
        if (cmd === "") {
          t.html(ctaHtml("dayone"), "demo-cta-wrap");
          return;
        }
        if (cmd === "exit") this.feedback = ["exit はトップページで使えます。", false];
        return this.render();
      }
      if (!cmd) return this.render();
      if (cmd === "title") return this.start();
      if (cmd === "card") {
        this.showCard();
        return this.render();
      }
      if (cmd === "hint") {
        if (this.inChallenge) {
          if (this.hints < this.card.challenge.hints.length) this.hints++;
        } else this.hints = 1;
        return this.render();
      }
      if (cmd === "exit") {
        this.feedback = ["exit はトップページで使えます。お試し版をやめるときは、このまま下へスクロールしてください。", false];
        return this.render();
      }

      const r = t.runShell(line);
      if (!r) return this.render();
      if (!this.inChallenge) this.onStep(cmd);
      else this.onChallenge(r);
      this.render();
    }

    onStep(cmd) {
      const step = this.card.steps[this.step];
      if (cmd.replace(/\s+/g, " ") === step.run) {
        this.term.html(`<span class="c-green">✓</span> ${md(step.after)}`, "demo-after");
        this.step++;
        this.hints = 0;
        if (this.inChallenge) {
          // お題の前に、こっそり別のディレクトリへ移動させる(cd ~/{{place}})
          this.shell.run(`cd ~/${this.place}`);
        }
      } else {
        this.feedback = [`自由に試して大丈夫です。先へ進むには \`${step.run}\` と打ってください。`, true];
      }
    }

    onChallenge(r) {
      const ch = this.card.challenge;
      const ref = new Shell(this.shell.fs, `/home/you/${this.place}`).run(ch.solution).out;
      const tokens = (s) => s.trim().split(/\s+/).join(" ");
      const used = r.stages.some((s) => s[0] === this.card.command);
      const resultOk = !r.err && tokens(r.out) === tokens(ref);
      if (resultOk && used) {
        this.step++;
        const t = this.term;
        t.html(`<span class="c-green"><b>正解!</b></span>  <span class="c-cyan">${this.card.command}</span> <span class="c-green">をおぼえた</span>`, "demo-after");
        t.html(md(ch.done), "indent");
        t.html(`<span class="c-dim">●○○○○  忘れかけた頃にもう一度。次の復習は明日です。</span>`, "indent demo-after");
        return;
      }
      this.misses++;
      if (resultOk) this.feedback = [`結果は合っています。ここでは \`${this.card.command}\` を使って出してみましょう。`, false];
      else if (used) this.feedback = [`${this.card.command} は使えています。お題の答えとは、出力が違うようです。`, false];
      else if (this.misses % SUGGEST_HINT_AFTER === 0) this.feedback = ["行き詰まったら `hint` と打つとヒントが出ます。", true];
    }
  }

  // ================= oncall のお試し: 深夜の 500 祭り =================
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const PREFIXES = ["203.0.113", "198.51.100", "192.0.2", "172.20.14", "172.20.31"];
  const AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
    "okhttp/4.12.0",
    "python-requests/2.32.3",
    "curl/8.5.0",
  ];
  const NORMAL_PATHS = ["/api/v1/orders", "/api/v1/orders/{n}", "/api/v1/users/{n}", "/api/v1/items", "/api/v1/items/{n}", "/api/v1/cart", "/api/v1/search?q=item{n}", "/static/app.js", "/static/app.css", "/"];
  const NORMAL_STATUSES = [200, 201, 204, 301, 304, 400, 401, 403, 404];
  const NORMAL_WEIGHTS = [70, 4, 3, 2, 8, 3, 3, 2, 5];
  const NGINX_CONF = `# /etc/nginx/nginx.conf より抜粋
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;
}
`;
  const WINDOW = 45 * 60;

  // 本物の oncall と同じく、雑な数え方をすると答えがずれる「ひっかけ」を混ぜる
  function generateAccessLog(rng) {
    const ips = new Set();
    while (ips.size < 36) ips.add(`${rng.pick(PREFIXES)}.${rng.int(2, 254)}`);
    const list = rng.sample([...ips], 36);
    const culprits = list.slice(0, 3);
    const [sizeDecoy, urlDecoy, gatewayDecoy] = list.slice(3, 6);
    const bystanders = list.slice(6);
    const monitor = "10.0.0.5";
    const entries = [];
    const size = () => {
      const s = rng.int(120, 9000);
      return s === 500 ? 501 : s;
    };
    const add = (ip, method, path, status, sz, late = false) => {
      const start = late ? Math.floor((WINDOW * 2) / 3) : 0;
      entries.push([rng.int(start, WINDOW - 1), ip, method, path, status, sz, rng.pick(AGENTS)]);
    };
    const addNormal = (ip) => {
      const path = rng.pick(NORMAL_PATHS).replace("{n}", rng.int(1000, 9999));
      add(ip, "GET", path, rng.weighted(NORMAL_STATUSES, NORMAL_WEIGHTS), size());
    };

    [rng.int(130, 170), rng.int(80, 105), rng.int(45, 62)].forEach((count, i) => {
      for (let k = 0; k < count; k++) add(culprits[i], "POST", "/api/v1/checkout", 500, rng.int(140, 190), true);
      for (let k = rng.int(20, 60); k > 0; k--) addNormal(culprits[i]);
    });
    for (let k = rng.int(220, 280); k > 0; k--) add(sizeDecoy, "GET", `/api/v1/items/${rng.int(1000, 9999)}`, 200, 500);
    for (let k = rng.int(180, 230); k > 0; k--) add(urlDecoy, "GET", "/api/v1/coupons/500", 404, size());
    for (let k = rng.int(110, 140); k > 0; k--) add(gatewayDecoy, "POST", "/api/v1/checkout", 502, rng.int(150, 170), true);
    for (let k = rng.int(420, 480); k > 0; k--) add(monitor, "GET", "/healthz", 200, 2);
    for (let k = 0; k < 2600; k++) addNormal(rng.pick(bystanders));
    for (const ip of rng.sample(bystanders, 8)) for (let k = rng.int(1, 14); k > 0; k--) add(ip, "POST", "/api/v1/checkout", 500, rng.int(140, 190), true);
    for (const ip of rng.sample(bystanders, 6)) for (let k = rng.int(3, 20); k > 0; k--) add(ip, "GET", "/api/v1/orders", rng.pick([503, 504]), rng.int(150, 170), true);

    entries.sort((a, b) => a[0] - b[0]);
    const detected = new Date();
    detected.setHours(2, rng.int(10, 55), 0, 0);
    const startMs = detected.getTime() - WINDOW * 1000;
    const p2 = (n) => String(n).padStart(2, "0");
    const lines = entries.map(([off, ip, method, path, status, sz, agent]) => {
      const t = new Date(startMs + off * 1000);
      const stamp = `${p2(t.getDate())}/${MONTHS[t.getMonth()]}/${t.getFullYear()}:${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())} +0900`;
      return `${ip} - - [${stamp}] "${method} ${path} HTTP/1.1" ${status} ${sz} "-" "${agent}"`;
    });

    const counts = new Map();
    for (const e of entries) if (e[4] === 500) counts.set(e[1], (counts.get(e[1]) || 0) + 1);
    const answer = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ip]) => ip);
    return {
      log: lines.join("\n") + "\n",
      answer,
      stringDecoys: [sizeDecoy, urlDecoy, monitor],
      gatewayDecoy,
      incidentId: `INC-${rng.int(1000, 9999)}`,
      detectedAt: `${p2(detected.getHours())}:${p2(detected.getMinutes())}`,
    };
  }

  // 文章は oncall の missions/m01_error_ips/mission.toml と同じ。点数の付け方は scoring.py と同じ。
  const ONCALL_HINTS = [
    {
      cost: 10,
      text: "まずログの形を確かめましょう。`head -3 access.log` で先頭を見て、`nginx.conf` の `log_format` と見比べます。\n\n空白で区切ったとき、ステータスコード(`$status`)は左から何番目の列になるでしょうか。",
    },
    {
      cost: 15,
      text: "`grep 500 access.log` では正しく数えられません。「500」という文字は、レスポンスサイズや URL にも現れるからです。\n\n列を指定して絞り込むには `awk` が向いています。ステータスコードは 9 列目なので、`awk '$9 == 500' access.log` で 500 の行だけを取り出せます。",
    },
    {
      cost: 25,
      text: "「種類ごとに数えて多い順に並べる」定番の形があります。\n\n`awk '$9 == 500 {print $1}' access.log | sort | uniq -c | sort -rn | head -3`\n\nこれで件数と IP が出ます。あとは IP だけを `answer.txt` に保存するだけです(`>` でファイルに書き出せます)。",
    },
  ];
  const ONCALL_DEBRIEF = {
    solution: "awk '$9 == 500 {print $1}' access.log | sort | uniq -c | sort -rn | head -3 | awk '{print $2}' > answer.txt",
    explanation: [
      "パイプでつないだ各段の役割は次のとおりです。",
      "",
      "1. `awk '$9 == 500 {print $1}'`: 9 列目(ステータスコード)が 500 の行だけを選び、1 列目(送信元 IP)を出力します。",
      "2. `sort`: 同じ IP を隣り合わせに並べます。`uniq` は隣り合う行しかまとめないので、先に並べ替えが必要です。",
      "3. `uniq -c`: 同じ行をまとめ、先頭に件数を付けます。",
      "4. `sort -rn`: 件数を数値として(`-n`)大きい順(`-r`)に並べます。",
      "5. `head -3`: 上位 3 行だけを残します。",
      "6. `awk '{print $2}' > answer.txt`: 件数の列を捨てて IP だけをファイルに保存します。",
      "",
      "**なぜ grep 500 ではだめなのか。**このログには、レスポンスサイズがちょうど 500 バイトの正常なリクエストや、URL に `/500` を含むリクエストが大量に混ざっていました。文字列として「500」を探すと、それらも一緒に数えてしまいます。「何列目の値か」を指定して絞り込むのが、ログ調査の基本です。",
      "",
      "`sort | uniq -c | sort -rn | head` は、ログから「多い順ランキング」を作る定番の組み合わせです。障害対応で何度も使うので、手が覚えるまで打っておく価値があります。",
    ],
    alternatives: [
      {
        command: `grep '" 500 ' access.log | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3 | awk '{print $2}' > answer.txt`,
        note: "`grep` でも、リクエスト行を閉じる `\"` の直後という位置まで含めて指定すれば、ステータスコードの 500 だけに絞れます。`cut -d' ' -f1` は空白区切りの 1 列目を取り出します。",
      },
      {
        command: "awk '$9 == 500 {n[$1]++} END {for (ip in n) print n[ip], ip}' access.log | sort -rn | head -3 | cut -d' ' -f2 > answer.txt",
        note: "`awk` の連想配列で IP ごとの件数を数える方法です。`sort | uniq -c` の 2 段を `awk` の中で済ませられ、大きなログでは並べ替えが 1 回で済む分だけ速くなります。",
      },
    ],
    commands: [
      ["grep", "パターンに一致する行を取り出す"],
      ["awk", "行を列に分けて、条件に合う行や列を取り出す"],
      ["sort", "行を並べ替える"],
      ["uniq", "隣り合う同じ行をまとめる"],
      ["head", "先頭の数行だけを表示する"],
    ],
  };
  const PAR_TIME = 420;
  const PAR_COMMANDS = 12;
  const HELPER_COMMANDS = new Set(["mission", "hint", "check", "zukan", "title"]);

  // oncall の scoring.evaluate と同じ計算
  function evaluate({ elapsed, commands, hintCosts, failedChecks }) {
    const penalties = [];
    if (hintCosts.length) penalties.push([`ヒント ${hintCosts.length} 個`, hintCosts.reduce((a, b) => a + b, 0)]);
    if (failedChecks) penalties.push([`判定ミス ${failedChecks} 回`, Math.min(20, failedChecks * 5)]);
    const overTime = Math.max(0, elapsed - PAR_TIME);
    const timePenalty = Math.min(20, Math.floor((overTime / PAR_TIME) * 20));
    if (timePenalty) penalties.push(["目安時間オーバー", timePenalty]);
    const commandPenalty = Math.min(15, Math.max(0, commands - PAR_COMMANDS));
    if (commandPenalty) penalties.push(["目安コマンド数オーバー", commandPenalty]);
    const points = Math.max(0, 100 - penalties.reduce((s, [, p]) => s + p, 0));
    const rank = points >= 95 ? "S" : points >= 80 ? "A" : points >= 60 ? "B" : "C";
    return { points, rank, penalties };
  }
  // oncall の format_duration と同じ(「7 分」「6 分 12 秒」)
  const duration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const sec = Math.floor(seconds) % 60;
    if (sec === 0 && m) return `${m} 分`;
    return m ? `${m} 分 ${sec} 秒` : `${sec} 秒`;
  };

  class Oncall {
    constructor(term) {
      this.term = term;
      term.app = this;
      this.start();
    }

    start() {
      const rng = makeRng(Date.now() ^ 0x5eed);
      this.ctx = generateAccessLog(rng);
      const fs = new FS("/home/you");
      fs.addDir("/home/you/incident");
      fs.write("/home/you/incident/access.log", this.ctx.log);
      fs.write("/home/you/incident/nginx.conf", NGINX_CONF);
      this.shell = new Shell(fs, "/home/you/incident");
      this.hints = 0;
      this.failedChecks = 0;
      this.commands = 0;
      this.startedAt = Date.now();
      this.score = null;
      this.feedback = "";
      const t = this.term;
      t.clear();
      t.ops.innerHTML = `<i></i><span><span class="c-cyan">mission</span> 依頼 │ <span class="c-cyan">hint</span> ヒント │ <span class="c-cyan">check</span> 判定 │ <span class="c-cyan">zukan</span> 図鑑 │ <span class="c-cyan">title</span> 最初から</span>`;
      t.setPrompt();
      this.showTicket();
      this.render();
    }

    promptHtml() {
      return `<span class="c-red">●</span> <span class="c-green">you@prod-api-01</span>:<span class="c-blue">${esc(this.shell.prettyCwd())}</span> <span class="c-green">$</span>`;
    }

    showTicket() {
      const c = this.ctx;
      this.term.html(
        `<div class="demo-panel">` +
          `<div class="demo-panel-title"><span class="c-red">● INCIDENT</span> <b>深夜の 500 祭り</b></div>` +
          `<div>${c.incidentId}   重大度 SEV2   検知 ${c.detectedAt}</div>` +
          `<div>監視システム → オンコール担当(あなた)</div><br>` +
          `<div>api-gateway の 500 エラー率が閾値を超えました。<br>特定のクライアントが異常なリクエストを送り続けている可能性があります。</div><br>` +
          `<div>■ 依頼</div>` +
          `<div class="indent">アクセスログ ~/incident/access.log を調べ、<br>ステータスコード 500 を返されたリクエストが多い送信元 IP を<br>件数の多い順に上位 3 件、~/incident/answer.txt に保存してください。<br>(1 行に 1 つの IP)</div><br>` +
          `<div>■ 資料</div>` +
          `<div class="indent">~/incident/nginx.conf   ログの書式 (log_format)</div>` +
          `<div class="demo-panel-foot c-dim">目安 7 分 / 12 コマンド</div>` +
          `</div>`
      );
    }

    render() {
      this.term.setStatus(
        `<div><span class="c-red">●</span> <span class="c-red">INCIDENT</span> <b>深夜の 500 祭り</b>  <span class="c-dim">目安 7 分 / 12 コマンド</span></div>` +
          (this.score
            ? `<div class="indent"><span class="c-green">解決済み</span>。別解を試すか、下の案内へどうぞ。</div>`
            : `<div class="indent"><span class="c-cyan">mission</span> で依頼をもう一度表示、<span class="c-cyan">check</span> で解決したか判定します。</div>`) +
          (this.feedback ? `<div class="indent c-yellow">→ ${md(this.feedback)}</div>` : "")
      );
    }

    submit(line) {
      const t = this.term;
      const cmd = line.trim();
      t.echo(line);
      if (!cmd) return;
      this.feedback = "";
      const word = cmd.split(/\s+/)[0];
      if (cmd === "title") return this.start();
      if (cmd === "mission") {
        this.showTicket();
        return this.render();
      }
      if (cmd === "exit") {
        this.feedback = "exit はトップページで使えます。お試し版をやめるときは、このまま下へスクロールしてください。";
        return this.render();
      }
      if (word === "zukan") {
        t.html("コマンド図鑑は、ダウンロード版で使えます。", "c-dim");
        return this.render();
      }
      if (cmd === "hint") return this.hint();
      if (cmd === "check") return this.check();
      if (!HELPER_COMMANDS.has(word)) this.commands++;
      t.runShell(line);
      this.render();
    }

    hint() {
      const t = this.term;
      const newly = this.hints < ONCALL_HINTS.length;
      if (newly) this.hints++;
      ONCALL_HINTS.slice(0, this.hints).forEach((h, i) => {
        t.html(
          `<div class="demo-panel">` +
            `<div class="demo-panel-title c-yellow">ヒント ${i + 1}/${ONCALL_HINTS.length}  (-${h.cost}pt)</div>` +
            h.text.split("\n").map((l) => `<div>${l ? md(l) : "&nbsp;"}</div>`).join("") +
            `</div>`
        );
      });
      if (!newly) t.html("ヒントはこれで全部です。", "c-dim");
      else if (this.score) t.html("クリア済みなので減点はありません。", "c-dim");
      this.render();
    }

    check() {
      const t = this.term;
      if (this.score) {
        t.html(`<span class="c-green">このインシデントは解決済みです。</span> title で最初からやり直せます。`);
        return;
      }
      const fail = (msg) => {
        this.failedChecks++;
        this.feedback = msg;
        t.html(`<span class="c-red">✗ まだ解決していません</span>`);
        t.html(md(msg));
        this.render();
      };
      const text = this.shell.fs.files.get("/home/you/incident/answer.txt");
      if (text === undefined) return fail("`~/incident/answer.txt` がまだありません。結果をファイルに保存してください。");
      const lines = linesOf(text).filter((l) => l.trim());
      if (!lines.length) return fail("`answer.txt` が空です。");
      const found = [];
      for (const l of lines) {
        const ips = l.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
        if (ips.length !== 1) return fail(`1 行に 1 つの IP アドレスを書いてください。問題の行: \`${l.trim()}\``);
        found.push(ips[0]);
      }
      const ans = this.ctx.answer;
      if (found.length !== ans.length) return fail(`上位 ${ans.length} 件を ${ans.length} 行で保存してください(いまは ${found.length} 行あります)。`);
      if (!found.every((ip, i) => ip === ans[i])) {
        if ([...found].sort().join() === [...ans].sort().join()) return fail("3 つの IP は合っています。並び順(件数の多い順)を確認してください。");
        if (found.some((ip) => this.ctx.stringDecoys.includes(ip)))
          return fail("ステータスコードが 500 ではない IP が混ざっています。「500」という文字は、ステータスコード以外の場所にも現れていませんか?");
        if (found.includes(this.ctx.gatewayDecoy)) return fail("500 以外のエラー(502 など)まで数えていませんか? 依頼は「ステータスコード 500」だけです。");
        const correct = found.filter((ip) => ans.includes(ip)).length;
        return fail(`${ans.length} 件中 ${correct} 件が正解です。数え方をもう一度確認してください。`);
      }
      const elapsed = (Date.now() - this.startedAt) / 1000;
      this.score = {
        ...evaluate({
          elapsed,
          commands: this.commands,
          hintCosts: ONCALL_HINTS.slice(0, this.hints).map((h) => h.cost),
          failedChecks: this.failedChecks,
        }),
        elapsed,
      };
      this.showResult();
      this.showDebrief();
      this.render();
    }

    showResult() {
      const s = this.score;
      const rankCls = { S: "r-s", A: "r-a", B: "r-b", C: "r-c" }[s.rank];
      const row = (a, b, c = "") => `<span>${a}</span><span>${b}</span><span class="c-dim">${c}</span>`;
      this.term.html(
        `<div class="demo-panel demo-result">` +
          `<div class="demo-panel-title c-green"><b>✓ INCIDENT RESOLVED</b></div>` +
          `<div>ランク <b class="${rankCls}">${s.rank}</b>   ${s.points} pt   <span class="c-dim">初解決</span></div><br>` +
          `<div class="demo-stats">` +
          row("所要時間", duration(s.elapsed), `目安 ${duration(PAR_TIME)}`) +
          row("コマンド数", this.commands, `目安 ${PAR_COMMANDS}`) +
          row("ヒント", this.hints) +
          row("判定ミス", this.failedChecks) +
          `</div>` +
          (s.penalties.length
            ? "<br>" + s.penalties.map(([l, p]) => `<div class="c-dim">-${String(p).padStart(2)}  ${l}</div>`).join("")
            : "") +
          `</div>`
      );
    }

    showDebrief() {
      const t = this.term;
      const d = ONCALL_DEBRIEF;
      t.html(`<span class="c-purple">振り返り</span>`, "demo-rule");
      t.html(`<span class="c-purple">▶ 模範解答</span>`);
      t.html(`<code>${esc(d.solution)}</code>`);
      t.html("&nbsp;");
      d.explanation.forEach((l) => t.html(l ? md(l) : "&nbsp;"));
      t.html("&nbsp;");
      t.html(`<span class="c-purple">▶ 別解</span>`);
      for (const alt of d.alternatives) {
        t.html(`<code>${esc(alt.command)}</code>`);
        t.html(md(alt.note));
        t.html("&nbsp;");
      }
      t.html(`<span class="c-purple">▶ このミッションのコマンド</span>`);
      t.html(`<div class="demo-stats">${d.commands.map(([c, s]) => `<span class="c-cyan">${c}</span><span>${s}</span><span class="c-yellow">NEW</span>`).join("")}</div>`);
      t.html(`<span class="c-yellow">図鑑に ${d.commands.length} 個のコマンドを登録しました。</span>`, "demo-after");
      t.html(ctaHtml("oncall"), "demo-cta-wrap");
    }
  }

  function ctaHtml(which) {
    if (which === "dayone") {
      return (
        `<div class="demo-cta">` +
        `<div class="demo-cta-head">お試し版はここまでです。続きは、ダウンロードしてから。</div>` +
        `<p>次のコマンドは <code>ls</code>。day-one には、<code>ls</code> から <code>vim</code> まで、あと <b>37 個</b> のコマンドがあります。覚えたコマンドは、1 日 → 3 日 → 7 日 → 14 日 → 30 日の間隔で復習が回ってきます。</p>` +
        `<div class="demo-cta-actions"><a class="btn" href="#clone">./clone.sh</a><button type="button" class="btn ghost" data-switch="oncall">oncall のお試しへ ▸</button><button type="button" class="btn ghost" data-restart>もう一度</button></div>` +
        `</div>`
      );
    }
    return (
      `<div class="demo-cta">` +
      `<div class="demo-cta-head">お試し版はここまでです。続きは、ダウンロードしてから。</div>` +
      `<p>oncall には、ディスクの逼迫、暴走プロセス、消えた注文…と、あと <b>6 つ</b> のインシデントがあります。先輩の作業を横で見る「見学」と、コマンド図鑑も、ダウンロード版で使えます。</p>` +
      `<p class="c-dim">別解の 2 つ目(awk の連想配列)は、お試し版のシェルでは動きません。ダウンロード版では本物の bash で試せます。</p>` +
      `<p class="c-dim">コマンドがまだ不安なら、day-one で基礎を固めてから挑むのがおすすめです。</p>` +
      `<div class="demo-cta-actions"><a class="btn" href="#clone">./clone.sh</a><button type="button" class="btn ghost" data-switch="dayone">day-one のお試しへ ▸</button><button type="button" class="btn ghost" data-restart>もう一度</button></div>` +
      `</div>`
    );
  }

  // ================= タブの切り替え =================
  const term = new Term(root.querySelector(".demo-term"));
  const tabs = root.querySelectorAll(".demo-tab");

  // タブを切り替えても、それぞれの続きから再開する
  const saved = {};
  let current = null;

  function show(name) {
    if (current === name) return;
    if (current) {
      saved[current] = {
        app: term.app,
        nodes: [...term.screen.childNodes],
        status: term.status.innerHTML,
        ops: term.ops.innerHTML,
        history: term.history,
      };
    }
    current = name;
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.app === name)));
    const s = saved[name];
    if (s) {
      term.app = s.app;
      term.screen.replaceChildren(...s.nodes);
      term.status.innerHTML = s.status;
      term.ops.innerHTML = s.ops;
      term.history = s.history;
      term.hpos = s.history.length;
      term.setPrompt();
      term.screen.scrollTop = term.screen.scrollHeight;
    } else {
      term.history = [];
      term.hpos = 0;
      new (name === "dayone" ? DayOne : Oncall)(term);
    }
  }

  tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.app)));
  root.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-switch]");
    if (sw) {
      show(sw.dataset.switch);
      term.input.focus({ preventScroll: true });
    }
    if (e.target.closest("[data-restart]")) {
      term.app.start();
      term.input.focus({ preventScroll: true });
    }
  });

  show("dayone");
})();
