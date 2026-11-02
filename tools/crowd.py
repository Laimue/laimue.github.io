"""Offline: scanned Thai handwriting (Burapha-TH, ALICE-THI, KVIS) -> averaged centre lines per letter -> tools/crowd.json.
Only averages of 15+ samples are written: never one person's writing, never an image. Needs Pillow + numpy.
Run: python tools/crowd.py   then   node tools/fonts.js   (which merges crowd.json into refs.json)."""
import io, json, os, re, sys, tarfile, urllib.request, zipfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache', 'crowd')
os.makedirs(CACHE, exist_ok=True)
SRC = {
    'burapha-test.zip': 'https://services.informatics.buu.ac.th/datasets/Burapha-TH/character/20210306-test.zip',
    'alice.tar.gz': 'https://www.ai.rug.nl/~mrolarik/ALICE-THI/ALICE-THI-Dataset.tar.gz',
    'kvis.zip': 'https://data.mendeley.com/public-files/datasets/8nr3pbdk5c/files/e5730ffa-527c-4e06-ac76-aab758f63ae0/file_downloaded',
}
N, IN = 64, 56          # canvas and letter size in cells (0.02 box units each, like hand.js)
MIN_GROUP, K = 15, 8


def fetch(name):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        try:
            req = urllib.request.Request(SRC[name], headers={'User-Agent': 'Mozilla/5.0'})
            open(p, 'wb').write(urllib.request.urlopen(req, timeout=120).read())
        except Exception as e:  # a dataset that can't be reached is skipped
            print('skip', name, e)
            return None
    return p


def tis(h):  # TIS-620 code (hex) -> Thai character
    return chr(0x0E00 + int(h, 16) - 0xA0)


def samples():
    """yield (char, image bytes) from every dataset that could be fetched"""
    p = fetch('burapha-test.zip')
    if p:
        z = zipfile.ZipFile(p)
        for n in z.namelist():
            m = re.match(r'[^/]+/\d+-\d+-([0-9A-F]{2})-[^/]+/[^/]+\.(jpg|png)$', n, re.I)
            if m: yield tis(m.group(1)), z.read(n)
    p = fetch('alice.tar.gz')
    if p:
        outer = tarfile.open(p)
        inner = tarfile.open(fileobj=io.BytesIO(outer.extractfile('ALICE-THI Dataset/ALICE-THI Dataset.tar.gz').read()))
        for m in inner.getmembers():
            g = re.match(r'Thai_(?:char|digit)_sqr/\d+/\d+-\d+-([0-9A-F]{2})-', m.name)
            if g and m.isfile(): yield tis(g.group(1)), inner.extractfile(m).read()
    p = fetch('kvis.zip')
    if p:
        z = zipfile.ZipFile(p)
        for n in z.namelist():
            parts = n.split('/')
            if len(parts) == 3 and parts[2] and '฀' <= parts[1][:1] <= '๿': yield parts[1][0], z.read(n)


def clean(data):
    """binarize (Otsu, ink = the smaller class), drop lone specks, crop by the trimmed ink box, fit into the canvas"""
    a = np.asarray(Image.open(io.BytesIO(data)).convert('L'), dtype=np.float32)
    h = np.histogram(a, 256, (0, 256))[0].astype(np.float64)
    w0 = np.cumsum(h); m0 = np.cumsum(h * np.arange(256)); tot = w0[-1]
    between = (m0[-1] * w0 / tot - m0) ** 2 / np.maximum(w0 * (tot - w0), 1)
    t = np.argmax(between)
    ink = a <= t
    if ink.mean() > 0.5: ink = ~ink
    nb = sum(np.roll(np.roll(ink, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - ink
    ink &= nb >= 2
    ys, xs = np.nonzero(ink)
    if len(xs) < 20: return None
    x0, x1 = np.quantile(xs, [0.01, 0.99]); y0, y1 = np.quantile(ys, [0.01, 0.99])
    crop = ink[int(y0):int(y1) + 1, int(x0):int(x1) + 1]
    hh, ww = crop.shape; s = IN / max(hh, ww)
    im = Image.fromarray((crop * 255).astype(np.uint8)).resize((max(1, round(ww * s)), max(1, round(hh * s))), Image.BILINEAR)
    out = np.zeros((N, N), bool); b = np.asarray(im) >= 128
    oy, ox = (N - b.shape[0]) // 2, (N - b.shape[1]) // 2
    out[oy:oy + b.shape[0], ox:ox + b.shape[1]] = b
    return out


def shift(d, dy, dx, fill):
    o = np.full_like(d, fill)
    ys = slice(max(dy, 0), N + min(dy, 0)); yd = slice(max(-dy, 0), N + min(-dy, 0))
    xs = slice(max(dx, 0), N + min(dx, 0)); xd = slice(max(-dx, 0), N + min(-dx, 0))
    o[..., ys, xs] = d[..., yd, xd]
    return o


def distance(ink):  # distance to the nearest ink cell, in cells, capped at 10 (batch: [n, N, N])
    d = np.where(ink, 0.0, 10.0)
    for _ in range(10):
        for dy, dx, c in ((0, 1, 1), (0, -1, 1), (1, 0, 1), (-1, 0, 1), (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)):
            d = np.minimum(d, shift(d, dy, dx, 10.0) + c)
    return d


def thin(m):  # Zhang-Suen, same as hand.js
    m = m.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            p = [shift(m, *o, 0) for o in ((1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1))]  # N NE E SE S SW W NW
            B = sum(p)
            A = sum(((p[i] == 0) & (p[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            c = (p[0] * p[2] * p[6] == 0) & (p[0] * p[4] * p[6] == 0) if step else (p[0] * p[2] * p[4] == 0) & (p[2] * p[4] * p[6] == 0)
            dele = (m == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if dele.any(): m[dele] = 0; changed = True
        if not changed: return m


def kmeans(X, k, seed=1):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    for _ in range(1, k):  # k-means++ start
        d = np.min([((X - c) ** 2).sum(1) for c in C], 0)
        C.append(X[rng.choice(len(X), p=d / d.sum())])
    C = np.array(C)
    for _ in range(30):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(2), 1)
        C = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
    return lab


def main():
    by = {}
    for ch, data in samples():
        try:
            m = clean(data)
        except Exception:
            m = None
        if m is not None: by.setdefault(ch, []).append(m)
    print(len(by), 'letters,', sum(len(v) for v in by.values()), 'samples')
    out = {}
    for ch, ms in sorted(by.items()):
        D = distance(np.array(ms))
        k = min(K, len(ms) // MIN_GROUP)
        if k < 1: continue
        X = D[:, ::4, ::4].reshape(len(ms), -1)
        lab = kmeans(X, k) if k > 1 else np.zeros(len(ms), int)
        for j in range(k):
            if (lab == j).sum() < MIN_GROUP: continue
            sk = thin(D[lab == j].mean(0) <= 1.6)
            idx = np.flatnonzero(sk).tolist()
            if len(idx) >= 10: out.setdefault(ch, []).append([j, {'x0': 0, 'y0': 0, 'nx': N, 'ny': N, 'sk': idx}])
    refs = [{'name': 'Thai handwriting average %d (Burapha-TH, ALICE-THI, KVIS)' % (j + 1), 'kind': 'crowd', 'w': 3} for j in range(K)]
    json.dump({'refs': refs, 'g': out}, open(os.path.join(HERE, 'crowd.json'), 'w'))
    print(len(out), 'letters with averages,', sum(len(v) for v in out.values()), 'groups')


if __name__ == '__main__':
    main()
