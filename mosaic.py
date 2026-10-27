import json
import numpy as np
from scipy.spatial import cKDTree
import cv2 as cv
from skimage.color import rgb2lab


GRID_SIZE = 60

def precompute_resized_albums(album_images, bw, bh):
    resized = {}
    for album_id, img in album_images.items():
        print(f"Resizing Img: {album_id}")
        resized[album_id] = cv.resize(
            img, (bw, bh), interpolation=cv.INTER_AREA
        )
    return resized

def album_mosaic(frame_rgb, tree, album_ids, resized_albums, grid=GRID_SIZE):
    H, W, _ = frame_rgb.shape
    bh = H // grid
    bw = W // grid


    small = cv.resize(frame_rgb, (grid, grid), interpolation=cv.INTER_AREA).astype(np.float32)


    small_lab = rgb2lab(small / 255.0)

 
    flat_lab = small_lab.reshape(-1, 3)
    _, idxs = tree.query(flat_lab)
    idxs = idxs.reshape(grid, grid)

    output = np.zeros_like(frame_rgb)

 
    for i in range(grid):
        y0 = i * bh
        y1 = y0 + bh
        for j in range(grid):
            x0 = j * bw
            x1 = x0 + bw

            album_id = album_ids[idxs[i, j]]
            output[y0:y1, x0:x1] = resized_albums[album_id]

    return output


def main():

    with open("album_colors.json", "r") as f:
        album_colors = json.load(f)

    album_ids = []
    palette = []

    for album_id, d in album_colors.items():
        album_ids.append(album_id)
        palette.append(d["lab"])

    palette = np.array(palette, dtype=np.float32)
    tree = cKDTree(palette)


    album_images = {}

    for album_id, d in album_colors.items():
    
        img = cv.imread(d["file_path"])

        if img is None:
            continue

        print(f"Loading Image From: {d["file_path"]}")

        img = img[..., ::-1] 
        album_images[album_id] = img



    capture = cv.VideoCapture(0)
    capture.set(cv.CAP_PROP_FRAME_WIDTH, 1280)
    capture.set(cv.CAP_PROP_FRAME_HEIGHT, 720)
    cv.namedWindow("Album Mosaic", cv.WINDOW_NORMAL)
    cv.resizeWindow("Album Mosaic", 1280, 1280)

    print("Starting Capture!")

    ret, frame = capture.read()
    H, W, _ = frame.shape

    grid = GRID_SIZE
    bh = H // grid
    bw = W // grid

    resized_albums = precompute_resized_albums(album_images, bw, bh)

    while True:
        ret, frame = capture.read()
        if not ret:
            break

        frame_rgb = frame[..., ::-1]

        mosaic = album_mosaic(
            frame_rgb,
            tree,
            album_ids,
            resized_albums,
            grid=GRID_SIZE
        )

        cv.imshow("Album Mosaic", mosaic[..., ::-1])

        if cv.waitKey(1) & 0xFF == ord('q'):
            break




if __name__ == "__main__":
    main()