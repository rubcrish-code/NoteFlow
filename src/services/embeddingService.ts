import { invoke } from "./safeInvoke";

export type EmbeddingProviderType = "ollama" | "openai" | "custom";
export type EmbeddingLocality = "local" | "cloud";
export type EmbeddingProfileStatus = "not_configured" | "success" | "error";
export type EmbeddingIndexStatusCode = "not_configured" | "pending" | "indexing" | "current" | "partial" | "failed";
export type SemanticMatchType = "exact" | "lexical" | "semantic" | "hybrid" | "metadata";

export interface EmbeddingProfile {
  id: string;
  name: string;
  providerType: EmbeddingProviderType;
  baseUrl: string;
  embeddingsEndpoint: string;
  model: string;
  dimensions?: number | null;
  batchSize: number;
  timeoutSeconds: number;
  locality: EmbeddingLocality;
  hasApiKey: boolean;
  hasCloudConsent: boolean;
  enabled: boolean;
  lastStatus: EmbeddingProfileStatus;
  lastCheckedAt?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveEmbeddingProfileInput {
  id?: string;
  name: string;
  providerType: EmbeddingProviderType;
  baseUrl: string;
  embeddingsEndpoint: string;
  model: string;
  batchSize: number;
  timeoutSeconds: number;
  locality: EmbeddingLocality;
  apiKey?: string;
  deleteApiKey?: boolean;
  enabled?: boolean;
}

export interface EmbeddingProviderTestResult {
  status: "success" | "error";
  message: string;
  model: string;
  dimensions?: number | null;
  locality: EmbeddingLocality;
  checkedAt: string;
  errorCode?: string | null;
}

export interface EmbeddingModelListInput {
  profileId?: string;
  providerType: EmbeddingProviderType;
  baseUrl: string;
  timeoutSeconds: number;
  apiKey?: string;
}

export interface EmbeddingModelListResult {
  status: "success" | "manual";
  models: string[];
  options: EmbeddingModelDiscoveryOption[];
  message: string;
}

export interface EmbeddingModelDiscoveryOption {
  id: string;
  supportsChat: boolean | null;
  supportsEmbeddings: boolean | null;
}

interface EmbeddingModelListResultDto {
  status: "success" | "manual";
  models: string[];
  options?: EmbeddingModelDiscoveryOption[];
  message: string;
}

export interface EmbeddingIndexStatus {
  profileId: string;
  status: EmbeddingIndexStatusCode;
  totalChunks: number;
  indexedChunks: number;
  pendingChunks: number;
  failedChunks: number;
  lastCheckedAt?: string | null;
  lastIndexedAt?: string | null;
  lastErrorCode?: string | null;
  updatedAt: string;
}

export interface EmbeddingIndexUpdateResult {
  profileId: string;
  status: EmbeddingIndexStatusCode;
  processedChunks: number;
  indexedChunks: number;
  failedChunks: number;
  skippedChunks: number;
  cancelled: boolean;
  durationMs: number;
}

export interface SemanticSearchTag {
  id: string;
  name: string;
  color: string;
  customColor?: string | null;
  iconKey?: string | null;
}

export interface SemanticSearchInput {
  query: string;
  profileId: string;
  projectId?: string;
  tagId?: string;
  includeArchived?: boolean;
  favoritesOnly?: boolean;
  limit?: number;
  candidateLimit?: number;
  perNoteLimit?: number;
  includeNeighbors?: boolean;
}

export interface SemanticSearchResult {
  chunkId: string;
  noteId: string;
  noteTitle: string;
  headingPath: string[];
  snippet: string;
  project: string;
  projectId?: string | null;
  tags: SemanticSearchTag[];
  archived: boolean;
  favorite: boolean;
  updatedAt: string;
  semanticScore?: number | null;
  matchType: SemanticMatchType;
  neighboringChunkIds: string[];
}

export function listEmbeddingProfiles() {
  return invoke<EmbeddingProfile[]>("list_embedding_profiles");
}

export function saveEmbeddingProfile(input: SaveEmbeddingProfileInput) {
  return invoke<EmbeddingProfile>("save_embedding_profile", {
    request: {
      ...input,
      deleteApiKey: input.deleteApiKey ?? false,
      enabled: input.enabled ?? true,
    },
  });
}

export function deleteEmbeddingProfile(profileId: string) {
  return invoke<void>("delete_embedding_profile", { profileId });
}

export function acceptEmbeddingCloudConsent(profileId: string) {
  return invoke<EmbeddingProfile>("accept_embedding_cloud_consent", { profileId });
}

export function testEmbeddingProvider(profileId: string) {
  return invoke<EmbeddingProviderTestResult>("test_embedding_provider", { profileId });
}

export async function listEmbeddingModels(input: EmbeddingModelListInput): Promise<EmbeddingModelListResult> {
  const result = await invoke<EmbeddingModelListResultDto>("list_embedding_models", { request: input });
  return {
    ...result,
    options: result.options ?? result.models.map((id) => ({ id, supportsChat: null, supportsEmbeddings: null })),
  };
}

export function getEmbeddingIndexStatus(profileId: string) {
  return invoke<EmbeddingIndexStatus>("get_embedding_index_status", { profileId });
}

export function updateEmbeddingIndex(profileId: string) {
  return invoke<EmbeddingIndexUpdateResult>("update_embedding_index", { profileId });
}

export function rebuildEmbeddingIndex(profileId: string) {
  return invoke<EmbeddingIndexUpdateResult>("rebuild_embedding_index", { profileId });
}

export function cancelEmbeddingIndexing(profileId: string) {
  return invoke<boolean>("cancel_embedding_indexing", { profileId });
}

export function semanticSearch(input: SemanticSearchInput) {
  return invoke<SemanticSearchResult[]>("semantic_search", { request: normalizeSearchInput(input) });
}

export function hybridSearch(input: SemanticSearchInput) {
  return invoke<SemanticSearchResult[]>("hybrid_search", { request: normalizeSearchInput(input) });
}

function normalizeSearchInput(input: SemanticSearchInput) {
  return {
    ...input,
    includeArchived: input.includeArchived ?? false,
    favoritesOnly: input.favoritesOnly ?? false,
    limit: input.limit ?? 30,
    candidateLimit: input.candidateLimit ?? 100,
    perNoteLimit: input.perNoteLimit ?? 3,
    includeNeighbors: input.includeNeighbors ?? true,
  };
}
