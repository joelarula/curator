import { defineMiniApp } from '@curator/host/contracts';

export const GalleryConstant = {
  APP_ID: 'gallery',
  DEFAULT_PROJECT_ID: 'artmoments',
  DEFAULT_PROJECT_NAME: 'Artmoments Gallery',
  DEFAULT_ACTOR_NAME: 'Curator',
} as const;

export const GalleryRole = {
  ADMIN: 'gallery_admin',
  CURATOR: 'gallery_curator',
  VIEWER: 'gallery_viewer',
} as const;

export type GalleryRoleType = (typeof GalleryRole)[keyof typeof GalleryRole];

export const GalleryTool = {
  SHOW_RESOURCES: 'gallery_show_resources',
  SEARCH_ITEMS: 'gallery_search_items',
  GET_ITEM: 'gallery_get_item',
  LIST_CATEGORIES: 'gallery_list_categories',
  LIST_AUTHORS: 'gallery_list_authors',
  GET_INFO: 'gallery_get_info',
  GET_STATS: 'gallery_get_stats',
  GET_SEO_INDEX: 'gallery_get_seo_index',
  UPSERT_ITEM: 'gallery_upsert_item',
  DELETE_ITEM: 'gallery_delete_item',
  BULK_UPDATE: 'gallery_bulk_update',
  UPSERT_CATEGORY: 'gallery_upsert_category',
  UPSERT_AUTHOR: 'gallery_upsert_author',
  UPSERT_INFO: 'gallery_upsert_info',
  UPLOAD_AND_INGEST: 'gallery_upload_and_ingest',
  REGENERATE_THUMBNAIL: 'gallery_regenerate_thumbnail',
  DISCOVER_ARTM2: 'gallery_discover_artm2',
  IMPORT_ARTM2_BATCH: 'gallery_import_artm2_batch',
  MIGRATE_ARTM2: 'gallery_migrate_artm2',
  SPEECH: 'gallery_speech',
} as const;

export type GalleryToolName = (typeof GalleryTool)[keyof typeof GalleryTool];

export const GalleryModule = {
  PIPELINE_MIGRATE_ARTM2: 'pipeline_migrate_artm2',
  PIPELINE_INGEST_ARTWORK: 'pipeline_ingest_artwork',
  PIPELINE_REGENERATE_THUMBNAILS: 'pipeline_regenerate_thumbnails',
} as const;

export interface GallerySeoImageDTO {
  loc: string;
  thumbnailLoc?: string | null;
  title: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface GallerySeoMetaDTO {
  title: string;
  description: string;
  keywords: string[];
  canonicalPath: string;
  canonicalUrl: string;
  robots: string;
  ogType: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogImageWidth?: number | null;
  ogImageHeight?: number | null;
  ogImageAlt: string;
  locale: string;
  lastModified: string;
  jsonLd: Record<string, any>;
}

export interface GalleryAuthorDTO {
  key: string;
  name: string;
  link: string;
  bio?: string | null;
  paintingCount: number;
  seo?: GallerySeoMetaDTO;
}

export interface GalleryCategoryDTO {
  key: string;
  name: string;
  nameEn?: string | null;
  link: string;
  published: boolean;
  exposed: boolean;
  sortOrder?: number;
  paintingCount: number;
  seo?: GallerySeoMetaDTO;
}

export interface GalleryItemDTO {
  id: number | string;
  key: string;
  uri: string;
  name: string;
  title: string;
  link: string;
  slug: string;
  projectSlug: string;
  photo: string | null;
  photoSlug?: string | null;
  photoUrl: string | null;
  thumbnailSlug?: string | null;
  thumbnailUrl: string | null;
  published: boolean;
  authorKey: string;
  authorName: string;
  author: GalleryAuthorDTO | null;
  categoryKeys: string[];
  categories: GalleryCategoryDTO[];
  description: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  seo?: GallerySeoMetaDTO;
}

export interface GalleryInfoDTO {
  projectId: string;
  projectSlug: string;
  title: string;
  subtitle: string;
  aboutMarkdown: string;
  orderingMarkdown: string;
  phone: string;
  email: string;
  logoLightUrl: string;
  logoDarkUrl: string;
  structuredData: Record<string, any>;
  seo?: GallerySeoMetaDTO;
}

export interface GalleryStatsDTO {
  projectId: string;
  totalItems: number;
  publishedItems: number;
  draftItems: number;
  totalCategories: number;
  publishedCategories: number;
  totalAuthors: number;
  totalAttachments: number;
}

export interface GalleryPageDTO {
  items: GalleryItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  offset: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  activeCategory: GalleryCategoryDTO | null;
  activeAuthor: GalleryAuthorDTO | null;
  categories: GalleryCategoryDTO[];
  authors: GalleryAuthorDTO[];
  seo?: GallerySeoMetaDTO;
}

export interface GalleryPhotoStepDTO {
  item: GalleryItemDTO;
  position: number;
  totalInSequence: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousItem: GalleryItemDTO | null;
  nextItem: GalleryItemDTO | null;
  firstItem: GalleryItemDTO | null;
  lastItem: GalleryItemDTO | null;
  surroundingItems: GalleryItemDTO[];
  activeCategory: GalleryCategoryDTO | null;
  activeAuthor: GalleryAuthorDTO | null;
  seo?: GallerySeoMetaDTO;
}

export interface GallerySeoRouteDTO {
  path: string;
  canonicalUrl: string;
  type: 'home' | 'category' | 'author' | 'photo';
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  lastModified: string;
  changeFreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
  image: GallerySeoImageDTO | null;
}

export interface GallerySeoItemEntryDTO {
  key: string;
  slug: string;
  photoSlug: string;
  title: string;
  path: string;
  canonicalUrl: string;
  authorKey: string;
  authorSlug: string;
  authorName: string;
  categoryKeys: string[];
  categorySlugs: string[];
  categoryNames: string[];
  photoUrl: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  updatedAt: string;
}

export interface GallerySeoIndexDTO {
  projectId: string;
  projectSlug: string;
  canonicalBaseUrl: string;
  generatedAt: string;
  lastModified: string;
  etag: string;
  totalRoutes: number;
  totalPhotos: number;
  totalCategories: number;
  totalAuthors: number;
  site: GalleryInfoDTO;
  routes: GallerySeoRouteDTO[];
  categories: GalleryCategoryDTO[];
  authors: GalleryAuthorDTO[];
  items: GallerySeoItemEntryDTO[];
  sitemapXmlUrl: string;
  llmsTxtUrl: string;
}

export const galleryAppContract = defineMiniApp({
  manifest: {
    id: GalleryConstant.APP_ID,
    name: 'Curator Generic Gallery',
    version: '1.0.0',
    description: 'Curator Core DB & AST-driven Multi-Gallery Application with MCP & VM Storage',
  },
  roles: GalleryRole,
});

