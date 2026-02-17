import os
import sys
import math
import array
import random
import struct
from openTSNE import TSNE
import numpy as np
import hdbscan

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

    # coordinates
    z, y, x = np.meshgrid(
        np.arange(D, dtype=np.float32),
        np.arange(H, dtype=np.float32),
        np.arange(W, dtype=np.float32),
        indexing="ij"
    )

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
        x.ravel(),
        y.ravel(),
        z.ravel(),
        neighbors_flat
    ])

    return dataset

def write_block(type_id: int, payload: bytes):
    sys.stdout.buffer.write(struct.pack("<II", type_id, len(payload)))
    sys.stdout.buffer.write(payload)

def main(data):

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

    k = math.floor(len(zset) * 0.01)

    indices = np.random.choice(dataset.shape[0], size=k, replace=False)
    sample = dataset[indices]

    input_data = np.array(sample)

    perp = random.random() * (50.0 - 35.0) + 35.0
    exag = random.random() * (50.0 - 1.0) + 1.0
    learn = random.random() * (1000.0 - 200.0) + 200.0
    n = int(random.random() * (1000 - 200) + 200)

    output = TSNE(n_components=2, perplexity=perp, learning_rate=learn, early_exaggeration=exag, n_iter=n).fit(input_data)

    outhdb = hdbscan.HDBSCAN(
        min_cluster_size=1000,
        min_samples=100
    )

    labels = outhdb.fit_predict(output)

    values, counts = np.unique(labels, return_counts=True)

    colors = []
    for i in range(len(values)):
        colors.append((random.random() * (255 - 1) + 1, random.random() * (255 - 1) + 1, random.random() * (255 - 1) + 1))

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
            # tf[idx]     = 0
            # tf[idx + 1] = 0
            # tf[idx + 2] = 0
            # if (tf[idx + 3] <= 240):
            #     tf[idx + 3] += 15
            # else:
            tf[idx + 3] = 255

    # # ZA IZRISOVANJE PODATKOV V SLIKE
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

    write_block(1, tf.tobytes())

    samples_np = np.asarray(sample, dtype=np.float32)
    write_block(2, samples_np.tobytes())

    lables_np = np.asarray(labels, dtype=np.int32)
    write_block(3, lables_np.tobytes())

data = []
with open("./bin/data.raw") as f:
    data = f.read().split(',')

W = int(data[0])
H = int(data[1])
D = int(data[2])
Channels = int(data[3])
size = int(data[4])

volume = np.asarray(data[5:], dtype=np.uint8)
volume = volume.reshape((W, H, D, Channels))

main(volume)