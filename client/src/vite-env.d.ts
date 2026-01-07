/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_MAP_CENTER_LAT: string;
  readonly VITE_MAP_CENTER_LNG: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
