export type CatalogAsset = {
  id: string;
  file: string;
  label: string;
  category: string;
  width: number;
  height: number;
  floor: boolean;
};

const FALLBACK_CATALOG: CatalogAsset[] = [
  {
    id: "fallback-floor",
    file: "/assets/office/editor/floor.svg",
    label: "Office floor",
    category: "Fallback",
    width: 32,
    height: 32,
    floor: true,
  },
  {
    id: "fallback-desk",
    file: "/assets/office/editor/desk.svg",
    label: "desk mahogany small front",
    category: "Fallback",
    width: 32,
    height: 24,
    floor: false,
  },
  {
    id: "fallback-monitor",
    file: "/assets/office/editor/monitor.svg",
    label: "Monitor1 F",
    category: "Fallback",
    width: 32,
    height: 24,
    floor: false,
  },
];

export const catalogUrl = (file: string) =>
  file.startsWith("/") ? file : `/local-assets/pixel-life/catalog/${file}`;
export const loadCatalog = async (): Promise<CatalogAsset[]> => {
  const response = await fetch(catalogUrl("manifest.json"));
  if (response.status === 404) return FALLBACK_CATALOG;
  if (!response.ok) throw new Error(`Failed to load asset catalog (${response.status})`);
  const catalog: unknown = await response.json();
  if (!Array.isArray(catalog)) throw new Error("Invalid asset catalog");
  return catalog as CatalogAsset[];
};
