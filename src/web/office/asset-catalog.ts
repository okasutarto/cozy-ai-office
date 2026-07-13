export type CatalogAsset = {
  id: string;
  file: string;
  label: string;
  category: string;
  width: number;
  height: number;
  floor: boolean;
};

export const catalogUrl = (file: string) => `/local-assets/pixel-life/catalog/${file}`;
export const loadCatalog = async (): Promise<CatalogAsset[]> =>
  fetch(catalogUrl("manifest.json")).then((response) => response.json());
