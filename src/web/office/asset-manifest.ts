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
  version: 1,
  tileSize: 16,
  office: {
    width: 352,
    height: 240,
    image: "/assets/office/office-atlas.png",
    atlas: "/assets/office/office-atlas.json",
  },
  characters: {
    frameWidth: 16,
    frameHeight: 24,
    image: "/assets/characters/characters-atlas.png",
    atlas: "/assets/characters/characters-atlas.json",
    actors: ["manager", "worker-1", "worker-2", "worker-3", "worker-4", "advisor", "qa"],
  },
  scaleMode: "nearest",
};
