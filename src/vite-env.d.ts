/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Base path of the OAuth Pages Functions. Defaults to "/auth"; set "" to disable sign-in. */
  readonly VITE_AUTH_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
