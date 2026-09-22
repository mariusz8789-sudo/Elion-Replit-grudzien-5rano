import type { AssetCatalogCandidate, AssetCatalogPort } from "./ports.js";
import type { AssetRequirement } from "./types.js";

function scoreCandidate(req: AssetRequirement, candidate: AssetCatalogCandidate): number {
  let score = 0;
  if (req.allowedLicenses.includes(candidate.license)) score += 100;
  if (candidate.formats.some((x) => req.formatPreferences.includes(x))) score += 20;
  if (req.preferredSources.includes(candidate.source)) score += 10;
  if (req.maxTrianglesHint !== undefined && candidate.triangleCount !== undefined && candidate.triangleCount <= req.maxTrianglesHint) score += 5;
  if (req.maxTextureSizeHint !== undefined && candidate.textureSize !== undefined && candidate.textureSize <= req.maxTextureSizeHint) score += 5;
  return score;
}

export async function resolveAssets(
  requirements: readonly AssetRequirement[],
  catalog: AssetCatalogPort
): Promise<Record<string, AssetCatalogCandidate | null>> {
  const out: Record<string, AssetCatalogCandidate | null> = {};
  for (const req of requirements) {
    const candidates = (await catalog.search(req))
      .filter((x) => req.allowedLicenses.includes(x.license))
      .sort((a, b) => scoreCandidate(req, b) - scoreCandidate(req, a));
    out[req.id] = candidates[0] ?? null;
  }
  return out;
}
