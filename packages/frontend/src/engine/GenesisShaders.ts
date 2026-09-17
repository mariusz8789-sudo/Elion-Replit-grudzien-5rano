export const particleVertexShader = `
uniform float uTime;
attribute float aEnergy;
attribute float aW;
varying float vEnergy;
void main() {
  vec3 p = position;
  float t = uTime * (0.16 + aEnergy * 0.08);
  float x = p.x * cos(t) - aW * sin(t);
  float z = p.z * cos(t * 0.71) - aW * sin(t * 0.71);
  p.x = x + sin(t + p.z) * 0.16;
  p.y += cos(t * 0.83 + p.x) * 0.18;
  p.z = z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.2 + aEnergy * 2.6) * (90.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
  vEnergy = aEnergy;
}`;

export const particleFragmentShader = `
varying float vEnergy;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = pow(1.0 - d * 2.0, 2.3);
  vec3 emerald = vec3(0.0, 1.0, 0.255);
  vec3 cyan = vec3(0.0, 0.898, 1.0);
  vec3 color = mix(emerald, cyan, clamp(vEnergy, 0.0, 1.0));
  gl_FragColor = vec4(color, glow * (0.25 + vEnergy * 0.7));
}`;

export const hyperGlowVertexShader = `
varying vec3 vNormal;
void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const hyperGlowFragmentShader = `
varying vec3 vNormal;
void main() { float rim = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4); gl_FragColor = vec4(0.0, 0.9, 1.0, rim * 0.22); }`;
