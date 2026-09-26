function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) {
    return "/";
  }

  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function getPublicAssetUrl(
  path: string,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  return `${normalizeBaseUrl(baseUrl)}${path.replace(/^\/+/, "")}`;
}

export const PUBLIC_ASSET_ROOT = getPublicAssetUrl("assets");
