"""
fetch.py — the benchmark's data (into .handbench/, never into git):

  * COCO-WholeBody v1.0 val marks (hands marked by people: 21 points each; for research,
    not shipped with the game — see README.md), checked by SHA-256;
  * only the COCO val2017 photos that have a well-seen hand (each photo fetched alone,
    images.cocodataset.org via S3; COCO's photos are Flickr's, under their own licences).

Then the hands for the tests are chosen: both points of the hand and the arm (wrist, elbow)
seen, the hand at least 45 px in the photo (it is only ever made smaller), ≥ 18 of 21 points marked.
"""

import hashlib
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import DATA  # noqa: E402

import numpy as np  # noqa: E402

# COCO-WholeBody v1.0 val (Jin et al., ECCV 2020) in the openpifpaf layout: 133 points a person
# (17 body, 6 feet, 68 face, 21 left hand, 21 right hand) — the same people's marks, one file
ANN = {
    "url": "https://github.com/DuncanZauss/openpifpaf_assets/releases/download/v0.1.0/person_keypoints_val2017_wholebody_pifpaf_style.json",
    "sha256": "7de48fa8fddb7dc467a65d727c5d8e1ce47bc7ce5d80d2567f81504a43492dbe",
    "file": "coco_wholebody_val.json",
}
HAND0 = {"left": 91, "right": 112}  # where each hand's 21 points start among the 133
IMG_URL = "https://s3.amazonaws.com/images.cocodataset.org/val2017/{:012d}.jpg"
MAX_CASES = int(os.environ.get("HANDBENCH_MAX", "600"))
MIN_HAND = 45


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def get(url, path, sha=None):
    if os.path.exists(path) and (not sha or sha256_of(path) == sha):
        return path
    tmp = path + ".part"
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    if sha and sha256_of(tmp) != sha:
        os.remove(tmp)
        raise RuntimeError(f"SHA-256 не совпал: {url}")
    os.replace(tmp, path)
    return path


def annotations():
    path = os.path.join(DATA, ANN["file"])
    if not os.path.exists(path):
        get(ANN["url"], path, ANN["sha256"])
    with open(path) as f:
        return json.load(f)


def choose(ann):
    cases = []
    for a in ann["annotations"]:
        if a.get("iscrowd"):
            continue
        allk = np.array(a["keypoints"], np.float64).reshape(-1, 3)
        if len(allk) != 133:
            continue
        body = allk[:17]
        for side, wr, el in (("left", 9, 7), ("right", 10, 8)):
            kp = allk[HAND0[side]:HAND0[side] + 21].copy()
            vis = kp[:, 2] > 0
            if vis.sum() < 18 or not vis[0] or not vis[9] or body[wr, 2] <= 0 or body[el, 2] <= 0:
                continue
            v = kp[vis]
            size = max(v[:, 0].max() - v[:, 0].min(), v[:, 1].max() - v[:, 1].min())
            if size < MIN_HAND:
                continue
            kp[:, 2] = vis.astype(np.float64)
            cases.append({"image_id": a["image_id"], "file": f"{a['image_id']:012d}.jpg", "side": side,
                          "kp": kp.round(2).tolist(), "body": body.round(2).tolist(), "person": [round(x, 1) for x in a["bbox"]]})
    cases.sort(key=lambda c: (c["image_id"], c["side"]))
    return cases[:MAX_CASES]


def main():
    os.makedirs(os.path.join(DATA, "images"), exist_ok=True)
    cases = choose(annotations())
    ids = sorted({c["image_id"] for c in cases})
    print(f"кистей: {len(cases)}, фото: {len(ids)}")

    def one(i):
        try:
            get(IMG_URL.format(i), os.path.join(DATA, "images", f"{i:012d}.jpg"))
            return True
        except Exception as e:  # noqa: BLE001
            print("  нет фото", i, e)
            return False

    with ThreadPoolExecutor(8) as pool:
        ok = dict(zip(ids, pool.map(one, ids)))
    cases = [c for c in cases if ok.get(c["image_id"])]
    with open(os.path.join(DATA, "cases.json"), "w") as f:
        json.dump(cases, f)
    print(f"готово: {len(cases)} кистей → {DATA}")


if __name__ == "__main__":
    main()
