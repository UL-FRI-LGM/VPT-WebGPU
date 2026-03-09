import os
import sys
import math
import array
import random
import struct
from openTSNE import TSNE
import numpy as np
import hdbscan
from collections import deque
import matplotlib.pyplot as plt
import plotly.graph_objects as go


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

    intensity = (XR + XG + XB + XA) * 0.25
    gradmag   = (gradR + gradG + gradB + gradA) * 0.25

    coords_np = np.stack(
    np.meshgrid(
            np.arange(W, dtype=np.float32) / W,
            np.arange(H, dtype=np.float32) / H,
            np.arange(D, dtype=np.float32) / D,
            indexing="xy"
        ),
        axis=-1
    ).reshape(-1, 3)

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


def main(data, tsnePerp, tsneExag, tsneLearn, tsneNum, hdbsClusterSize, hdbsSampleSize):

    # print("reading data...")
    XR = data[0::4]
    XG = data[1::4]
    XB = data[2::4]
    XA = data[3::4]
    # print("data read!")
    
    W, H, D, Channels = volume.shape

    dataset = []

    # print("calculating integral volumes...")
    IR = integralVolume(XR, W, H, D)
    IG = integralVolume(XG, W, H, D)
    IB = integralVolume(XB, W, H, D)
    IA = integralVolume(XA, W, H, D)


    # print("calculating gradient magnitudes...")
    gradR = gradientMagnitude3D(IR, W, H, D)
    gradG = gradientMagnitude3D(IG, W, H, D)
    gradB = gradientMagnitude3D(IB, W, H, D)
    gradA = gradientMagnitude3D(IA, W, H, D)

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

    indices = uniform_sampling(W, H, D, 0.05)
    sample = dataset[indices]
    input_data = np.array(sample)

    perp = tsnePerp
    exag = tsneExag
    learn = tsneLearn
    n = tsneNum

    # hopefully lhko tole dam usako na svoj core #############

    output = TSNE(n_components=2, perplexity=perp, learning_rate=learn, early_exaggeration=exag, n_iter=n).fit(input_data)

    outhdb = hdbscan.HDBSCAN(
        min_cluster_size=hdbsClusterSize,
        min_samples=hdbsSampleSize
    )

    labels = outhdb.fit_predict(input_data)

    # hopefully lhko tole dam usako na svoj core #############

    values, counts = np.unique(labels, return_counts=True)

    test_labels = nearest_cluster_fill(labels, indices, D, H, W)

    colors = []
    for i in range(len(values)):
        colors.append((int(random.random() * (255 - 1) + 1), int(random.random() * (255 - 1) + 1), int(random.random() * (255 - 1) + 1)))

    minX, maxX = math.inf, -math.inf
    minY, maxY = math.inf, -math.inf

    for x, y in output:
        if x < minX: minX = x
        if x > maxX: maxX = x
        if y < minY: minY = y
        if y > maxY: maxY = y

    scale_x = 255.0 / (maxX - minX)
    scale_y = 255.0 / (maxY - minY)

    # scale + round
    output = [
        (
            round((x - minX) * scale_x),
            round((y - minY) * scale_y),
        )
        for x, y in output
    ]

    # flatten to coords array
    coords = [0] * (len(output) * 2)
    l = 0
    for i in range(len(output)):
        for j in range(2):
            coords[l] = output[i][j]
            l += 1

    # convert to uint8
    coords = bytearray(coords)

    # RGBA buffer
    tf = np.zeros(256 * 256 * 4, dtype=np.uint8)

    for index in range(len(output)):
        if (labels[index]==-1):
            continue
        else:
            x = coords[index * 2]
            y = coords[index * 2 + 1]
            idx = (y * 256 + x) * 4
            tf[idx]     = colors[labels[index]][0]
            tf[idx + 1] = colors[labels[index]][1]
            tf[idx + 2] = colors[labels[index]][2]
            if (tf[idx + 3] <= 240):
                tf[idx + 3] += 15
            else:
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

    samples_np = np.asarray(sample, dtype=np.float32)
    # sanity check
    # samples_np = np.asarray(generate_checkerboard_coords(W, H, D), dtype=np.float32)
    lables_np = np.asarray(test_labels, dtype=np.int32)
    colors_np = np.asarray(colors, dtype=np.uint8)

    with open("./bin/output.bin", "ab") as file:
        write_block(file, 1, tf.tobytes())
        write_block(file, 2, samples_np.tobytes())
        write_block(file, 3, lables_np.tobytes())
        write_block(file, 4, colors_np.tobytes())

data = []
with open("./bin/data.raw") as f:
    data = f.read().split(',')

# raise RuntimeError(data[:10])

W = int(data[0])
H = int(data[1])
D = int(data[2])
Channels = int(data[3])
size = int(data[4])
tsnePerp = int(data[5])
tsneExag = int(data[6])
tsneLearn = int(data[7])
tsneNum = int(data[8])
hdbsClusterSize = int(data[9])
hdbsSampleSize = int(data[10])

volume = np.asarray(data[11:], dtype=np.uint8)
volume = volume.reshape((W, H, D, Channels))
main (volume, tsnePerp, tsneExag, tsneLearn, tsneNum, hdbsClusterSize, hdbsSampleSize)
# main(volume)