"""本物のアプリを疑似端末で動かし、画面を pyte で読み取るための小道具。"""

from __future__ import annotations

import os
import pty
import select
import struct
import fcntl
import termios
import time

import pyte


class DimScreen(pyte.Screen):
    """pyte は dim(SGR 2)を覚えないので、使われていない blink の印に置き換えて覚えさせる。"""

    def select_graphic_rendition(self, *attrs, private=False):
        mapped = []
        i = 0
        while i < len(attrs):
            a = attrs[i]
            if a in (38, 48) and i + 1 < len(attrs):
                # 38;5;N(256 色)と 38;2;R;G;B(RGB)の中の数字は、色の指定なので置き換えない
                n = 3 if attrs[i + 1] == 5 else 5 if attrs[i + 1] == 2 else 1
                mapped.extend(attrs[i:i + n])
                i += n
                continue
            mapped.append(5 if a == 2 else 25 if a == 22 else a)
            if a == 22:  # 22 は bold と dim の両方を解除する
                mapped.append(22)
            i += 1
        super().select_graphic_rendition(*mapped)


class App:
    def __init__(self, argv: list[str], cols: int, rows: int, env: dict[str, str], cwd: str | None = None):
        self.screen = DimScreen(cols, rows)
        self.stream = pyte.ByteStream(self.screen)
        pid, fd = pty.fork()
        if pid == 0:
            if cwd:
                os.chdir(cwd)
            os.execvpe(argv[0], argv, {**os.environ, **env, "COLUMNS": str(cols), "LINES": str(rows)})
        self.pid, self.fd = pid, fd
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def pump(self, seconds: float) -> None:
        end = time.time() + seconds
        while True:
            left = end - time.time()
            if left <= 0:
                return
            r, _, _ = select.select([self.fd], [], [], left)
            if r:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                if not data:
                    return
                self.stream.feed(data)

    def send(self, keys: str | bytes, wait: float = 0.6) -> None:
        os.write(self.fd, keys.encode() if isinstance(keys, str) else keys)
        self.pump(wait)

    def type(self, text: str, wait: float = 0.6) -> None:
        for ch in text:
            os.write(self.fd, ch.encode())
            self.pump(0.02)
        self.pump(wait)

    def text(self) -> str:
        return "\n".join(self.screen.display)

    def close(self) -> None:
        try:
            os.kill(self.pid, 9)
        except ProcessLookupError:
            pass
