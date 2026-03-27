// #part /wgsl/mixins/intersectCube

fn intersectCube(origin: vec3f, direction: vec3f) -> vec2f {
	let tmin: vec3f = (vec3f(0.0) - origin) / direction;
	let tmax: vec3f = (vec3f(1.0) - origin) / direction;
	let t1: vec3f = min(tmin, tmax);
	let t2: vec3f = max(tmin, tmax);
	let tnear: f32 = max(max(t1.x, t1.y), t1.z);
	let tfar: f32 = min(min(t2.x, t2.y), t2.z);
	return vec2f(tnear, tfar);
}

fn cutIntersectCube(origin: vec3f, direction: vec3f, minCutPlane: vec3f, maxCutPlane: vec3f) -> vec2f {
	let tmin: vec3f = (minCutPlane - origin) / direction;
	let tmax: vec3f = (maxCutPlane - origin) / direction;
	let t1: vec3f = min(tmin, tmax);
	let t2: vec3f = max(tmin, tmax);
	let tnear: f32 = max(max(t1.x, t1.y), t1.z);
	let tfar: f32 = min(min(t2.x, t2.y), t2.z);
	return vec2f(tnear, tfar);
}
