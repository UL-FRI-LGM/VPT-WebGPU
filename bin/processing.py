import os
import sys
import math
import time
import glob
import array
import random
import struct
import psutil
import threading
from openTSNE import TSNE
import numpy as np
import hdbscan
import umap
import json
from collections import deque
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import sklearn.preprocessing as preprocessing
from scipy.ndimage import gaussian_filter


def integralVolume(X, W, H, D):

    X = np.asarray(X, dtype=np.float32).reshape(D, H, W)
    I = X.cumsum(axis=2).cumsum(axis=1).cumsum(axis=0)

    return I.ravel()


def idx(x, y, z, Width, Height):
    return x + y * Width + z * Width * Height


def gradientMagnitude3D(volume, Width, Height, Depth, spacing = [1, 1, 1]):

    sx, sy, sz = spacing

    V = np.asarray(volume, dtype=np.float32).reshape(Depth, Height, Width)
    grad = np.zeros_like(V)

    gx = (V[:, :, 2:] - V[:, :, :-2]) / (2 * sx)
    gy = (V[:, 2:, :] - V[:, :-2, :]) / (2 * sy)
    gz = (V[2:, :, :] - V[:-2, :, :]) / (2 * sz)

    grad[1:-1, 1:-1, 1:-1] = np.sqrt(
        gx[1:-1, 1:-1, :]**2 +
        gy[1:-1, :, 1:-1]**2 +
        gz[:, 1:-1, 1:-1]**2
    )

    return grad.ravel()


def zScore(X, eps=1e-8):
    X = np.asarray(X, dtype=np.float32)

    mean = X.mean(axis=0)
    std = X.std(axis=0)

    std[std < eps] = 1.0   # prevent divide-by-zero

    return (X - mean) / std


def isNaN(num):
    return num != num


def assemble_dataset(XR, XG, XB, XA, gradR, gradG, gradB, gradA, W, H, D):
    n = W * H * D

    XR = np.asarray(XR, dtype=np.float32).reshape(D, H, W)
    XG = np.asarray(XG, dtype=np.float32).reshape(D, H, W)
    XB = np.asarray(XB, dtype=np.float32).reshape(D, H, W)
    XA = np.asarray(XA, dtype=np.float32).reshape(D, H, W)

    gradR = np.asarray(gradR, dtype=np.float32).reshape(D, H, W)
    gradG = np.asarray(gradG, dtype=np.float32).reshape(D, H, W)
    gradB = np.asarray(gradB, dtype=np.float32).reshape(D, H, W)
    gradA = np.asarray(gradA, dtype=np.float32).reshape(D, H, W)

    activeChan = [c for c in [XR, XG, XB, XA] if c.max() > 0]
    activeGrad = [g for c, g in zip([XR, XG, XB, XA], [gradR, gradG, gradB, gradA]) if c.max() > 0]

    intensity = np.zeros((D, H, W), dtype=np.float32)
    gradmag = np.zeros((D, H, W), dtype=np.float32)

    for c, g in zip(activeChan, activeGrad):
        intensity += c
        gradmag += g

    intensity /= len(activeChan)
    gradmag /= len(activeChan)

    # intensity = (XR + XG + XB + XA) * 0.25
    # gradmag   = (gradR + gradG + gradB + gradA) * 0.25

    coords_np = np.stack(
    np.meshgrid(
            np.arange(W, dtype=np.float32),
            np.arange(H, dtype=np.float32),
            np.arange(D, dtype=np.float32),
            indexing="xy"
        ),
        axis=-1
    ).reshape(-1, 3)

    # normalized_coords_np = np.stack(
    # np.meshgrid(
    #         np.arange(W, dtype=np.float32)/W,
    #         np.arange(H, dtype=np.float32)/H,
    #         np.arange(D, dtype=np.float32)/D,
    #         indexing="xy"
    #     ),
    #     axis=-1
    # ).reshape(-1, 3)

    neighbors = np.zeros((6, D, H, W), dtype=np.float32)

    neighbors[0, :, :, :-1] = intensity[:, :, 1:]   # +x
    neighbors[1, :, :, 1:]  = intensity[:, :, :-1]  # -x
    neighbors[2, :, :-1, :] = intensity[:, 1:, :]   # +y
    neighbors[3, :, 1:, :]  = intensity[:, :-1, :]  # -y
    neighbors[4, :-1, :, :] = intensity[1:, :, :]   # +z
    neighbors[5, 1:, :, :]  = intensity[:-1, :, :]  # -z

    # Flatten neighbors per voxel
    neighbors_flat = neighbors.reshape(6, n).T  # shape: (n,6)

    dataset = np.column_stack([
        intensity.ravel(),
        gradmag.ravel(),
        coords_np,
        # normalized_coords_np,
        neighbors_flat
    ])

    return dataset


# def stratified_sample(w, h, d, fraction):
#     total = w * h * d
#     k = int(total * fraction)

#     n = round(k ** (1/3))  # cube root → grid resolution

#     xs, ys, zs = [], [], []

#     for i in range(n):
#         for j in range(n):
#             for k in range(n):
#                 x = int((i + np.random.rand()) * w / n)
#                 y = int((j + np.random.rand()) * h / n)
#                 z = int((k + np.random.rand()) * d / n)

#                 xs.append(x)
#                 ys.append(y)
#                 zs.append(z)

#     indices = np.array(xs) + np.array(ys) * w + np.array(zs) * w * h
#     return indices


def uniform_sampling(W, H, D, p):
    full_size = W*H*D
    arr_size = round(full_size * p)
    
    x = np.random.randint(0, W, arr_size)
    y = np.random.randint(0, H, arr_size)
    z = np.random.randint(0, D, arr_size)

    voxelIndex = (x + y * W + z * W * H)
    return voxelIndex


def nearest_cluster_fill(cluster_samples, indices, D, H, W):
    cluster_volume = np.zeros(D*H*W, dtype=np.int32)
    cluster_volume[indices] = cluster_samples
    np_cluster = np.array(cluster_volume, dtype=np.int32)
    reshape_cluster = np_cluster.reshape(D, H, W)

    z, y, x = reshape_cluster.shape
    
    dist = np.full(reshape_cluster.shape, np.inf)
    result = reshape_cluster.copy()

    q = deque()

    # initialize seeds
    for k in range(z):
        for j in range(y):
            for i in range(x):
                if reshape_cluster[k,j,i] != 0:
                    dist[k,j,i] = 0
                    q.append((k,j,i))

    directions = [
        (1,0,0),(-1,0,0),
        (0,1,0),(0,-1,0),
        (0,0,1),(0,0,-1)
    ]

    while q:
        z0,y0,x0 = q.popleft()

        for dz,dy,dx in directions:
            nz,ny,nx = z0+dz, y0+dy, x0+dx

            if 0<=nz<z and 0<=ny<y and 0<=nx<x:
                if dist[nz,ny,nx] > dist[z0,y0,x0] + 1:
                    dist[nz,ny,nx] = dist[z0,y0,x0] + 1
                    result[nz,ny,nx] = result[z0,y0,x0]
                    q.append((nz,ny,nx))

    return result


def generate_checkerboard_coords(W, H, D, block_size=16):
    # sanity check
    x = np.arange(W)
    y = np.arange(H)
    z = np.arange(D)

    X, Y, Z = np.meshgrid(x, y, z, indexing='ij')

    checker = ((X // block_size + Y // block_size + Z // block_size) % 2)

    coords = np.stack((X[checker == 1],
                       Y[checker == 1],
                       Z[checker == 1]), axis=1)

    return coords.astype(np.float32)


def write_block(file_obj, type_id: int, payload: bytes):
    file_obj.write(struct.pack("<II", type_id, len(payload)))
    file_obj.write(payload)


def run_with_profiling(func, output_file="profile.txt", *args, **kwargs):
    process = psutil.Process(os.getpid())
    
    # memory tracking
    memory_samples = []
    tracking = True
    
    def track_memory():
        while tracking:
            mem = process.memory_info().rss / (1024 * 1024)  # MB
            memory_samples.append(mem)
            time.sleep(0.1)
    
    # start memory tracking thread
    tracker = threading.Thread(target=track_memory)
    tracker.daemon = True
    tracker.start()
    
    # run function
    start_time = time.time()
    try:
        result = func(*args, **kwargs)
    finally:
        elapsed = time.time() - start_time
        tracking = False
        tracker.join()
    
    # compute stats
    peak_memory = max(memory_samples)
    avg_memory = sum(memory_samples) / len(memory_samples)
    
    # write to file
    with open(output_file, "w") as f:
        f.write(f"Runtime:        {elapsed:.2f} seconds\n")
        f.write(f"Peak memory:    {peak_memory:.2f} MB\n")
        f.write(f"Average memory: {avg_memory:.2f} MB\n")
    
    print(f"Profile saved to {output_file}")
    return result


def main(data, Channels, params):
    
    tsnePerp = 0
    tsneExag = 0
    tsneLearn = 0
    tsneNum = 0
    umapNeighbor = 0
    umapDistance = 0
    sampleSize = 0
    sigmaValue = 0
    hdbsClusterSize = 0
    hdbsSampleSize = 0

    if (params[0] == 0):
        tsnePerp = params[1]
        tsneExag = params[2]
        tsneLearn = params[3]
        tsneNum = params[4]
        sampleSize = params[5]/100
        sigmaValue = params[6]
        hdbsClusterSize = params[7]
        hdbsSampleSize = params[8]
    else:
        umapNeighbor = params[1]
        umapDistance = params[2]
        sampleSize = params[3]/100
        sigmaValue = params[4]
        hdbsClusterSize = params[5]
        hdbsSampleSize = params[6]

    # print("reading data...")
    flat = data.ravel()
    XR = flat[0::4]
    XG = flat[1::4]
    XB = flat[2::4]
    XA = flat[3::4]
    # XR = data[0::4]
    # XG = data[1::4]
    # XB = data[2::4]
    # XA = data[3::4]
    # print("data read!")

    # raise RuntimeError(str(len(XR)) + " " + str(len(XG)) + " " + str(len(XB)) + " " + str(len(XA)))
    
    W, H, D, Channels = volume.shape

    dataset = []

    # print("calculating integral volumes...")
    # IR = integralVolume(XR, W, H, D)
    # IG = integralVolume(XG, W, H, D)
    # IB = integralVolume(XB, W, H, D)
    # IA = integralVolume(XA, W, H, D)

    # raise RuntimeError(str(len(IR)) + " " + str(len(IG)) + " " + str(len(IB)) + " " + str(len(IA)))


    # print("calculating gradient magnitudes...")
    gradR = gradientMagnitude3D(XR, W, H, D)
    gradG = gradientMagnitude3D(XG, W, H, D)
    gradB = gradientMagnitude3D(XB, W, H, D)
    gradA = gradientMagnitude3D(XA, W, H, D)
    # gradR = gradientMagnitude3D(IR, W, H, D)
    # gradG = gradientMagnitude3D(IG, W, H, D)
    # gradB = gradientMagnitude3D(IB, W, H, D)
    # gradA = gradientMagnitude3D(IA, W, H, D)

    index = 0
    # print("begin assembling dataset...")

    dataset = assemble_dataset(XR, XG, XB, XA, gradR, gradG, gradB, gradA, W, H, D)

    # raise RuntimeError(dataset[:33])

    # bad = 0
    # for data in dataset:
    #     for number in data:
    #         if isNaN(number):
    #             bad += 1

    # print(str(bad) + " NaN values present in dataset")

    zset = zScore(dataset)

    # bad = 0
    # for data in zset:
    #     for number in data:
    #         if isNaN(number):
    #             bad += 1

    # print(str(bad) + " NaN values present in zset")

    # k = math.floor(len(zset) * 0.001)

    indices = uniform_sampling(W, H, D, sampleSize) # treba napelat v VPT, fajn bi blo da od oka poračunam % volumna za sampling glede na to kaj vržeš notr da bo kulkr tulku konsistentno pri vizualizaciji
    sample = zset[indices]
    input_data = np.array(sample)

    # hopefully lhko tole dam usako na svoj core #############
    uv_volume = np.zeros((2, 2, 2, 2), dtype=np.float32)
    # # probam umap
    if (params[0] == 0):
        uv_tsne = TSNE(perplexity=tsnePerp, learning_rate=tsneLearn, early_exaggeration=tsneExag, n_iter=tsneNum).fit(input_data)
        uv_volume = np.zeros((D * H * W, 2), dtype=np.float32)
        uv_volume[indices] = uv_tsne
        uv_volume = uv_volume.reshape(D, H, W, 2)
    else:
        # probam vrčt ceu volume notr v umap, po slicih, dobim vn uv koordinate, tiste mapiram na voxle in vidm kam me to prpelje
        reducer = umap.UMAP(n_components=2, n_neighbors=umapNeighbor, min_dist=umapDistance) # to je treba napelat v VPT input fielde, razn n_components
        uv_volume = np.zeros((D, H, W, 2), dtype=np.float32)
        reducer.fit(input_data)
        for z in range(D):
            uv_slice = zset[(z*H*W):((z+1)*H*W)]
            uv_volume[z, :, : ,:] = reducer.transform(uv_slice).reshape(H,W,2)

    uv_volume[..., 0] = gaussian_filter(uv_volume[..., 0], sigma=sigmaValue)
    uv_volume[..., 1] = gaussian_filter(uv_volume[..., 1], sigma=sigmaValue)
    
    uv_min = uv_volume.min()
    uv_max = uv_volume.max()

    rgba_volume = np.zeros((D, H, W, 4), dtype=np.uint8)
    rgba_volume[..., 0] = ((uv_volume[..., 0] - uv_min) / (uv_max - uv_min) * 255).astype(np.uint8)  # R = U
    rgba_volume[..., 1] = ((uv_volume[..., 1] - uv_min) / (uv_max - uv_min) * 255).astype(np.uint8)  # G = V

    # rgba_volume = np.ascontiguousarray(rgba_volume)

    # raise RuntimeError(rgba_volume)
    # output = reducer.fit_transform(dataset)
    # probam vrčt ceu volume notr v umap, po slicih, dobim vn uv koordinate, tiste mapiram na voxle in vidm kam me to prpelje

    outhdb = hdbscan.HDBSCAN(
        min_cluster_size=hdbsClusterSize,
        min_samples=hdbsSampleSize
    )

    uv_flat = uv_volume.reshape(-1, 2)
    labels = outhdb.fit_predict(uv_flat)

    # hopefully lhko tole dam usako na svoj core #############

    values, counts = np.unique(labels, return_counts=True)

    # test_labels = nearest_cluster_fill(labels, indices, D, H, W)

    colors = []
    for i in range(len(values)):
        colors.append((int(random.random() * (255 - 1) + 1), int(random.random() * (255 - 1) + 1), int(random.random() * (255 - 1) + 1)))

    minX, maxX = math.inf, -math.inf
    minY, maxY = math.inf, -math.inf

    for x, y in uv_flat:
        if x < minX: minX = x
        if x > maxX: maxX = x
        if y < minY: minY = y
        if y > maxY: maxY = y

    scale_x = 255.0 / (maxX - minX)
    scale_y = 255.0 / (maxY - minY)

    # scale + round, prej je bil output
    uv_flat = [
        (
            round((x - minX) * scale_x),
            round((y - minY) * scale_y),
        )
        for x, y in uv_flat
    ]

    uv_gauss = np.asarray(uv_flat, dtype=np.float32)
    uv_gauss /= 255

    centroids = {}
    radii = {}
    for label in set(labels):
        if label == -1:  # skip noise
            continue
        cluster_points = uv_gauss[labels == label]
        centroids[label] = cluster_points.mean(axis=0)  # shape (2,) — UV centroid
        distances = np.linalg.norm(cluster_points - centroids[label], axis=1)
        radii[label] = distances.mean()
    
    # raise RuntimeError(radii)

    bumps = []
    for label in centroids:
        bumps.append({
            "position": {
                "x": float(centroids[label][0]),
                "y": 1 - float(centroids[label][1])
            },
            "size": {
                "x": float(radii[label]),
                "y": float(radii[label])
            },
            "color": {
                "r": colors[label][0]/255,
                "g": colors[label][1]/255,
                "b": colors[label][2]/255,
                "a": 1
            }
        })

    with open("./bin/bumps.json", "w") as f:
        json.dump(bumps, f, indent=2)

    # flatten to coords array
    coords = [0] * (len(uv_flat) * 2)
    l = 0
    for i in range(len(uv_flat)):
        for j in range(2):
            coords[l] = uv_flat[i][j]
            l += 1

    # convert to uint8
    coords = bytearray(coords)

    # RGBA buffer
    tf = np.zeros(256 * 256 * 4, dtype=np.uint8)

    for index in range(len(uv_flat)):
        if (labels[index]==-1):
            continue
        else:
            x = coords[index * 2]
            y = coords[index * 2 + 1]
            idx = (y * 256 + x) * 4
            tf[idx]     = colors[labels[index]][0]
            tf[idx + 1] = colors[labels[index]][1]
            tf[idx + 2] = colors[labels[index]][2]
            # if (tf[idx + 3] <= 240):
            #     tf[idx + 3] += 15
            # else:
            tf[idx + 3] = 255

    # # ZA ZAPIS PODATKOV V PGM SLIKE
    # name = "params:_" + str(perp) + "_" + str(exag) + "_" + str(learn) + "_" + str(n)

    # path = "./parameter_testing/Neuroni/tsne_hdbscan_11dim_1024"
    # os.makedirs(path, exist_ok=True)

    # filename = os.path.join(path, f"{name}.pgm")

    # header = (
    #     "P7\n"
    #     "WIDTH 256\n"
    #     "HEIGHT 256\n"
    #     "DEPTH 4\n"
    #     "MAXVAL 255\n"
    #     "TUPLTYPE RGB_ALPHA\n"
    #     "ENDHDR\n"
    # )

    # with open(filename, "wb") as f:
    #     f.write(header.encode("ascii"))
    #     f.write(bytes(tf))

    # treba še popravit da bom poslu ceu uv_volume notr v VPT da ga mappam u 3d texturo in nucam kot mapping na prenosno funkcijo
    # samples_np = np.asarray(sample, dtype=np.float32)
    # sanity check
    # samples_np = np.asarray(generate_checkerboard_coords(W, H, D), dtype=np.float32)
    # lables_np = np.asarray(labels, dtype=np.int32)
    # colors_np = np.asarray(colors, dtype=np.uint8)

    with open("./bin/output.bin", "ab") as file:
        write_block(file, 1, rgba_volume.tobytes())
        write_block(file, 2, tf.tobytes())


# raw_files = glob.glob("./bin/*.raw")  # or whatever folder they're in

# for raw_file in raw_files:
#     print(f"Processing {raw_file}...")
    
#     data = []
#     with open(raw_file) as f:
#         data = f.read().split(',')

#     params = []
#     volume = None
#     W = int(data[0])
#     H = int(data[1])
#     D = int(data[2])
#     Channels = int(data[3])
#     size = int(data[4])

#     if (int(data[5]) == 0):
#         params.append(int(data[5]))
#         for i in range(6, 14):
#             params.append(int(data[i]))
#         volume = np.asarray(data[14:], dtype=np.uint8)
#         volume = volume.reshape((W, H, D, Channels))
#     else:
#         params.append(int(data[5]))
#         for i in range(6, 12):
#             params.append(int(data[i]))
#         volume = np.asarray(data[12:], dtype=np.uint8)
#         volume = volume.reshape((W, H, D, Channels))

#     # name output profile after the input file
#     profile_name = raw_file.replace(".raw", "_profile.txt")
    
#     run_with_profiling(main, profile_name, volume, Channels, params)
#     print(f"Done: {raw_file} → {profile_name}")

data = []
with open("./bin/data.raw") as f:
    data = f.read().split(',')

# raise RuntimeError(data[:10])
params = []
volume = None
W = int(data[0])
H = int(data[1])
D = int(data[2])
Channels = int(data[3])
size = int(data[4])
if (int(data[5]) == 0):
    params.append(int(data[5]))
    for i in range(6, 14):
        params.append(int(data[i]))
    volume = np.asarray(data[14:], dtype=np.uint8)
    volume = volume.reshape((W, H, D, Channels))
else:
    params.append(int(data[5]))
    for i in range(6, 12):
        params.append(int(data[i]))
    volume = np.asarray(data[12:], dtype=np.uint8)
    volume = volume.reshape((W, H, D, Channels))

main (volume, Channels, params)