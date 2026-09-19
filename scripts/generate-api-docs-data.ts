/**
 * generate-api-docs-data.ts
 *
 * Parses docs/API-REFERENCE.md into:
 * - data/api-docs/catalog.json (server-only structured route catalog)
 * - data/api-docs/openapi.json (server-only OpenAPI 3.0.3 spec)
 *
 * Run: npx tsx scripts/generate-api-docs-data.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface ApiRoute {
  route: string;
  methods: string[];
  auth: string;
  description: string;
  category: string;
}

interface ApiCategory {
  name: string;
  count: number;
  routes: ApiRoute[];
}

function parseApiReference(md: string): ApiCategory[] {
  const categories: ApiCategory[] = [];
  const lines = md.split('\n');

  let currentCategory: ApiCategory | null = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Category header: ## Category (count)
    const catMatch = line.match(/^##\s+(.+?)\s+\((\d+)\)\s*$/);
    if (catMatch) {
      currentCategory = {
        name: catMatch[1].trim(),
        count: parseInt(catMatch[2], 10),
        routes: [],
      };
      categories.push(currentCategory);
      inTable = false;
      continue;
    }

    // Table header or separator
    if (line.startsWith('| Route') || line.startsWith('|-------')) {
      inTable = true;
      continue;
    }

    // Data row
    if (inTable && line.startsWith('|') && currentCategory) {
      const parts = line.split('|').map((p) => p.trim());
      // parts[0] is empty before first |
      if (parts.length >= 5) {
        const route = parts[1];
        const methodsRaw = parts[2];
        const auth = parts[3];
        const description = parts.slice(4).join('|').trim();

        if (route && route !== 'Route') {
          const cleanRoute = route.replace(/^`|`$/g, '').trim();
          const cleanDescription = description.replace(/\|+$/, '').trim();
          const methods = methodsRaw
            .split(/[,\s]+/)
            .map((m) => m.trim().toUpperCase())
            .filter((m) => m.length > 0 && m !== '—');

          currentCategory.routes.push({
            route: cleanRoute,
            methods,
            auth,
            description: cleanDescription,
            category: currentCategory.name,
          });
        }
      }
    }
  }

  return categories;
}

function generateOpenApi(categories: ApiCategory[]): object {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const cat of categories) {
    for (const route of cat.routes) {
      if (!paths[route.route]) {
        paths[route.route] = {};
      }

      for (const method of route.methods) {
        const lowerMethod = method.toLowerCase();
        if (lowerMethod === '—' || !lowerMethod) continue;

        paths[route.route][lowerMethod] = {
          tags: [cat.name],
          summary: route.description.slice(0, 80) + (route.description.length > 80 ? '…' : ''),
          description: route.description,
          security: route.auth === 'public' || route.auth === 'webhook' || route.auth === 'cron'
            ? []
            : [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '401': {
              description: 'Unauthorized',
            },
            '403': {
              description: 'Forbidden',
            },
            '404': {
              description: 'Not found',
            },
            '500': {
              description: 'Internal server error',
            },
          },
        };
      }
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'WorkforceAP API',
      description: 'Auto-generated from docs/API-REFERENCE.md',
      version: '1.0.0',
      contact: {
        name: 'WorkforceAP',
        url: 'https://www.workforceap.org',
        email: 'michael.brown2@workforceap.org',
      },
    },
    servers: [
      { url: 'https://www.workforceap.org', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  };
}

function main() {
  const mdPath = resolve(process.cwd(), 'docs/API-REFERENCE.md');
  const md = readFileSync(mdPath, 'utf-8');
  const categories = parseApiReference(md);

  // Write structured data
  mkdirSync(resolve(process.cwd(), 'data/api-docs'), { recursive: true });
  const dataPath = resolve(process.cwd(), 'data/api-docs/catalog.json');
  writeFileSync(dataPath, JSON.stringify({ categories, totalRoutes: categories.reduce((sum, c) => sum + c.routes.length, 0), generatedAt: new Date().toISOString() }, null, 2));
  console.log(`✓ Wrote ${dataPath} (${categories.reduce((sum, c) => sum + c.routes.length, 0)} routes)`);

  // Write OpenAPI spec
  const openApi = generateOpenApi(categories);
  const openApiPath = resolve(process.cwd(), 'data/api-docs/openapi.json');
  writeFileSync(openApiPath, JSON.stringify(openApi, null, 2));
  console.log(`✓ Wrote ${openApiPath}`);
}

main();
