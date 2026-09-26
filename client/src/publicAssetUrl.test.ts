import { describe, expect, it } from "vitest";
import { getPublicAssetUrl, PUBLIC_ASSET_ROOT } from "./publicAssetUrl";

describe("public asset URLs", () => {
  it("keeps root-hosted development assets at the domain root", () => {
    expect(getPublicAssetUrl("assets/example.png", "/")).toBe(
      "/assets/example.png",
    );
  });

  it("prefixes assets with the GitHub Pages project base", () => {
    expect(
      getPublicAssetUrl("/assets/example.png", "/MMOPartySimulator/"),
    ).toBe("/MMOPartySimulator/assets/example.png");
  });

  it("normalizes a base URL without a trailing slash", () => {
    expect(getPublicAssetUrl("assets/example.png", "/preview")).toBe(
      "/preview/assets/example.png",
    );
  });

  it("uses Vite's default test base for the shared asset root", () => {
    expect(PUBLIC_ASSET_ROOT).toBe("/assets");
  });
});
