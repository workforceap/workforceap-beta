import 'server-only';
import catalog from '@/data/api-docs/catalog.json';
import openApi from '@/data/api-docs/openapi.json';

// These artifacts belong in server bundles, never in public/ or a client import.
export const apiDocsCatalog = catalog;
export const apiDocsOpenApi = openApi;
