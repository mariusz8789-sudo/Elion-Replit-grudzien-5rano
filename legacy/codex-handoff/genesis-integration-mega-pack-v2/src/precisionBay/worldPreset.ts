export interface WorldDirectorBayPreset {
  id: "GENESIS_PRECISION_INTERVENTION_BAY";
  kind: "SCIENTIFIC_LAB";
  requiredCapabilities: readonly [
    "HUMAN_DIGITAL_TWIN",
    "EVIDENCE",
    "SIMULATION",
    "DEVICE_SHADOW"
  ];
  visualTags: readonly string[];
}

export const PRECISION_INTERVENTION_BAY_PRESET: WorldDirectorBayPreset = {
  id: "GENESIS_PRECISION_INTERVENTION_BAY",
  kind: "SCIENTIFIC_LAB",
  requiredCapabilities: [
    "HUMAN_DIGITAL_TWIN",
    "EVIDENCE",
    "SIMULATION",
    "DEVICE_SHADOW"
  ],
  visualTags: [
    "central-bed-or-platform",
    "scanner-ring",
    "robotic-manipulators",
    "diagnostic-monitors",
    "glass-metal",
    "controlled-lighting"
  ]
};
