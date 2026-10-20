"""Generate the JARVIS monogram as PNG/ICO without third-party image tools."""

from pathlib import Path
import math
import struct
import zlib


def generate(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    size = 256
    segments = [((91, 69), (165, 69)), ((153, 69), (153, 153))]
    points = [
        (126 + 27 * math.cos(t * math.pi / 32), 153 + 27 * math.sin(t * math.pi / 32))
        for t in range(33)
    ]
    segments.extend(zip(points, points[1:]))

    def distance(x, y, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        ratio = max(
            0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))
        )
        return math.hypot(x - a[0] - ratio * dx, y - a[1] - ratio * dy)

    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            radius = math.hypot(x - 127.5, y - 127.5)
            alpha = round(max(0, min(1, 121 - radius)) * 255)
            ink = max(0, min(1, 9 - min(distance(x, y, a, b) for a, b in segments)))
            color = tuple(
                round(a + (b - a) * ink) for a, b in zip((17, 24, 39), (56, 189, 248))
            )
            pixels.extend((*color, alpha))

    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(pixels, 9))
        + chunk(b"IEND", b"")
    )
    (directory / "jarvis.png").write_bytes(png)
    (directory / "jarvis.ico").write_bytes(
        struct.pack("<HHH", 0, 1, 1)
        + struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22)
        + png
    )


if __name__ == "__main__":
    generate(Path(__file__).resolve().parents[1] / "build/icons")
