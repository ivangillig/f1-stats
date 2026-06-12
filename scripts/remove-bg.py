"""Remove a solid white background from a PNG via flood-fill from the borders.

Only background pixels connected to the image edges are removed, so white
areas inside the subject (e.g. a white race suit) are preserved.
"""
import sys
from collections import deque

from PIL import Image

THRESHOLD = 235  # min(r, g, b) above this counts as background white
FEATHER = 200    # alpha applied to the 1px boundary ring for softer edges


def is_white(px):
    r, g, b = px[0], px[1], px[2]
    return min(r, g, b) >= THRESHOLD


def main(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()

    background = bytearray(w * h)
    queue = deque()

    for x in range(w):
        for y in (0, h - 1):
            if is_white(px[x, y]) and not background[y * w + x]:
                background[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(px[x, y]) and not background[y * w + x]:
                background[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not background[ny * w + nx]:
                if is_white(px[nx, ny]):
                    background[ny * w + nx] = 1
                    queue.append((nx, ny))

    removed = 0
    for y in range(h):
        for x in range(w):
            if background[y * w + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
                removed += 1

    # Feather: subject pixels touching the removed background get partial alpha
    for y in range(h):
        for x in range(w):
            if background[y * w + x]:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and background[ny * w + nx]:
                    r, g, b, a = px[x, y]
                    px[x, y] = (r, g, b, min(a, FEATHER))
                    break

    img.save(path)
    print(f"{path}: {removed}/{w * h} pixels made transparent ({w}x{h})")


if __name__ == "__main__":
    main(sys.argv[1])
