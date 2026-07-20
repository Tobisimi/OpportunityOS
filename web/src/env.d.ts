/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_REGION: string
  readonly VITE_USER_POOL_ID: string
  readonly VITE_USER_POOL_CLIENT_ID: string
  readonly VITE_REFINE_QUERY_URL: string
  readonly VITE_EXTRACT_PASTED_CONTENT_URL: string
  readonly VITE_UPSERT_PROFILE_URL: string
  readonly VITE_GET_OPPORTUNITIES_URL: string
  readonly VITE_UPDATE_STAGE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
