import { available, failure } from "./contracts";
const bundled = import.meta.glob("../../../content/production-generated/*/*.json", { eager: true, query: "?url&no-inline", import: "default" }) as Record<string, string>;

/** Static asset IO only; shared ContentCatalog owns search and resolution. */
export class BundledContentSource {
  constructor(private readonly fetchAsset: typeof fetch = fetch, private readonly assets = bundled) {}
  readonly call = async (operation: string, json: string): Promise<string> => {
    try {
      const load = async (path: string) => {
        const url = this.assets[path];
        if (!url) {
          throw new Error(`Bundled content not found: ${path}`);
        }
        const response = await this.fetchAsset(url);
        if (!response.ok) {
          throw new Error(`Content load failed (${response.status}): ${path}`);
        }
        return response.json();
      };
      if (operation === "listPackages") {
        return JSON.stringify(available(await Promise.all(Object.keys(this.assets).filter(path => path.endsWith("/manifest.json")).sort().map(load))));
      }
      if (operation !== "loadIndex" && operation !== "loadChunk") {
        return JSON.stringify(failure("content.operation", "Unknown content operation."));
      }
      const [packageId, assetId] = JSON.parse(json);
      return JSON.stringify(available(await load(`../../../content/production-generated/${packageId}/${assetId}.json`)));
    } catch (error) {
      return JSON.stringify(failure("content.load", error));
    }
  };
}
