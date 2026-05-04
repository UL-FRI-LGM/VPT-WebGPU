"use strict";

export async function parseModelWeights(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const metadataString = await zip.files["metadata.json"].async("string");
    const metadata = JSON.parse(metadataString);

    const positionTablesData = await readEncodingTables(
        zip, metadata, "position",
    );
    const directionTablesData = await readEncodingTables(
        zip, metadata, "direction",
    );
    const fcWeightsData = await readFcLayers(zip, metadata, "weight");
    const fcBiasesData = await readFcLayers(zip, metadata, "bias");

    return {
        positionTablesData,
        directionTablesData,
        fcWeightsData,
        fcBiasesData,
        metadata,
    };
}

async function readEncodingTables(zip, metadata, param) {
    const tables = [];

    for (let level = 0; level < metadata["model_args"]["levels"]; level++) {
        const name = `${param}_encoding_tables_${level}_weight`;
        const content = await zip.files[name + ".bin"].async("arraybuffer");
        const array = new Float32Array(content);
        tables.push(array);
    }

    // Concatenate all levels into a single typed array
    const totalLength = tables.reduce((sum, t) => sum + t.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const table of tables) {
        result.set(table, offset);
        offset += table.length;
    }
    return result;
}

async function readFcLayers(zip, metadata, param) {
    const layers = [];

    for (let layer = 0; layer < metadata["model_args"]["layers"]; layer++) {
        const name = `fc_${layer}_${param}`;
        const content = await zip.files[name + ".bin"].async("arraybuffer");
        let array = new Float32Array(content);

        if (param === "weight") {
            const [outFeatures, inFeatures] = metadata[name]["size"];
            array = padWeightRows(array, inFeatures, outFeatures);
        } else {
            array = padBias(array);
        }

        layers.push(array);
    }

    // Concatenate all layers into a single typed array
    const totalLength = layers.reduce((sum, l) => sum + l.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const layer of layers) {
        result.set(layer, offset);
        offset += layer.length;
    }
    return result;
}

function padWeightRows(array, inFeatures, outFeatures) {
    const paddedInFeatures = Math.ceil(inFeatures / 4) * 4;
    const padded = new Float32Array(outFeatures * paddedInFeatures);

    for (let row = 0; row < outFeatures; row++) {
        const srcOffset = row * inFeatures;
        const dstOffset = row * paddedInFeatures;
        padded.set(
            array.subarray(srcOffset, srcOffset + inFeatures),
            dstOffset,
        );
    }
    return padded;
}

function padBias(array) {
    const paddedLen = Math.ceil(array.length / 4) * 4;
    const padded = new Float32Array(paddedLen);
    padded.set(array);
    return padded;
}
