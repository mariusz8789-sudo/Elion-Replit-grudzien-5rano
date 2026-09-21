import type * as THREE_NS from 'three';

export type HighFidelityWeather = 'CLEAR' | 'CLOUDY' | 'RAIN' | 'STORM' | 'FOG' | 'SNOW' | 'DUST' | 'HEAT_HAZE' | 'NIGHT';

export interface WeatherProfile { density: number; speed: number; color: THREE_NS.ColorRepresentation; size: number; gravity: number; opacity: number; fogDensity: number; }

export function weatherProfile(weather?: string): WeatherProfile {
  switch ((weather ?? 'CLEAR').toUpperCase()) {
    case 'RAIN': return { density: 2600, speed: 16, color: 0xcfe8ff, size: 0.032, gravity: 0, opacity: 0.58, fogDensity: 0.018 };
    case 'STORM': return { density: 4200, speed: 24, color: 0xaec9e8, size: 0.045, gravity: 0, opacity: 0.64, fogDensity: 0.028 };
    case 'SNOW': return { density: 1600, speed: 1.5, color: 0xffffff, size: 0.06, gravity: 0, opacity: 0.78, fogDensity: 0.014 };
    case 'DUST': return { density: 1800, speed: 4, color: 0xd7a36d, size: 0.05, gravity: 0, opacity: 0.35, fogDensity: 0.034 };
    case 'FOG': return { density: 500, speed: 0.4, color: 0xe2edf7, size: 0.08, gravity: 0, opacity: 0.18, fogDensity: 0.034 };
    case 'NIGHT': return { density: 350, speed: 0.4, color: 0x6882a6, size: 0.04, gravity: 0, opacity: 0.18, fogDensity: 0.008 };
    default: return { density: 0, speed: 0, color: 0xffffff, size: 0.0, gravity: 0, opacity: 0, fogDensity: 0.008 };
  }
}

export interface WeatherRig { group: THREE_NS.Group; update(dt: number, camera?: THREE_NS.Camera): void; dispose(): void; }

export function createHighFidelityWeatherRig(THREE: typeof THREE_NS, scene: THREE_NS.Scene, weather?: string): WeatherRig {
  const profile = weatherProfile(weather);
  const group = new THREE.Group(); group.name = `genesis-weather-${(weather ?? 'CLEAR').toLowerCase()}`;
  if (profile.density <= 0) return { group, update: () => {}, dispose: () => {} };

  const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(profile.density * 3); const velocities = new Float32Array(profile.density * 3);
  for (let i = 0; i < profile.density; i += 1) {
    positions[i*3] = ((i * 17) % 400) / 10 - 20; positions[i*3+1] = ((i * 29) % 220) / 10; positions[i*3+2] = ((i * 41) % 400) / 10 - 20;
    velocities[i*3] = 0.15 + ((i * 7) % 10) / 30; velocities[i*3+1] = -profile.speed * (0.7 + ((i * 11) % 10) / 25); velocities[i*3+2] = 0.05 + ((i * 13) % 10) / 50;
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: profile.color, size: profile.size, transparent: true, opacity: profile.opacity, depthWrite: false });
  const particles = new THREE.Points(geometry, material); group.add(particles); scene.add(group);

  return {
    group,
    update(dt, camera) {
      if (camera) group.position.copy(camera.position).multiplyScalar(0.35);
      const attr = geometry.getAttribute('position') as THREE_NS.BufferAttribute;
      for (let i = 0; i < profile.density; i += 1) {
        attr.array[i*3] += velocities[i*3] * dt;
        attr.array[i*3+1] += velocities[i*3+1] * dt;
        attr.array[i*3+2] += velocities[i*3+2] * dt;
        if (attr.array[i*3+1] < 0) attr.array[i*3+1] = 20 + (i % 30) * 0.1;
        if (Math.abs(attr.array[i*3]) > 22) attr.array[i*3] *= -0.94;
        if (Math.abs(attr.array[i*3+2]) > 22) attr.array[i*3+2] *= -0.94;
      }
      attr.needsUpdate = true;
    },
    dispose() { scene.remove(group); geometry.dispose(); material.dispose(); },
  };
}
