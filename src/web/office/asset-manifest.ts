export type AssetManifest = {
  version: number;
  tileSize: number;
  office: {
    width: number;
    height: number;
    image: string;
    atlas: string;
  };
  characters: {
    frameWidth: number;
    frameHeight: number;
    image: string;
    atlas: string;
    actors: string[];
  };
  scaleMode: "nearest" | "linear";
};

export const assetManifest: AssetManifest = {
  version: 2,
  tileSize: 16,
  office: {
    width: 768,
    height: 288,
    image: "/assets/office/office-atlas.png",
    atlas: "/assets/office/office-atlas.json",
  },
  characters: {
    frameWidth: 32,
    frameHeight: 32,
    image: "/assets/characters/characters-atlas.png",
    atlas: "/assets/characters/characters-atlas.json",
    actors: ["manager", "worker-1", "worker-2", "worker-3", "worker-4", "advisor", "qa"],
  },
  scaleMode: "nearest",
};
