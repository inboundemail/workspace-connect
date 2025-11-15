import type {
  RouteDescriptor,
  WorkspaceProvider,
  WorkspaceConnectRequest,
  WorkspaceConnectContext,
  WorkspaceConnectIdentity,
} from "../types";

export class WorkspaceConnectRouter {
  private routes: Map<string, Map<string, RouteDescriptor["handler"]>> = new Map();

  constructor(providers: WorkspaceProvider[]) {
    for (const provider of providers) {
      for (const route of provider.routes) {
        const key = this.normalizeRoute(route.path);
        if (!this.routes.has(key)) {
          this.routes.set(key, new Map());
        }
        this.routes.get(key)!.set(route.method, route.handler);
      }
    }
  }

  private normalizeRoute(path: string): string {
    // Remove leading/trailing slashes and normalize
    return path.replace(/^\/+|\/+$/g, "");
  }

  async dispatch(
    request: WorkspaceConnectRequest,
    slug: string[],
    identity: WorkspaceConnectIdentity
  ): Promise<Response> {
    const routeKey = this.normalizeRoute(slug.join("/"));
    const method = request.method;

    const methodMap = this.routes.get(routeKey);
    if (!methodMap) {
      return new Response(
        JSON.stringify({
          error: `Route '${routeKey || "(root)"}' not found`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const handler = methodMap.get(method);
    if (!handler) {
      return new Response(
        JSON.stringify({
          error: `Method ${method} not allowed on route '${routeKey}'`,
        }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const context: WorkspaceConnectContext = {
      identity,
      params: { slug },
    };

    try {
      return await handler(request, context);
    } catch (error) {
      console.error("Error handling route:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal server error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
}

export function createRoute(
  method: RouteDescriptor["method"],
  path: string,
  handler: RouteDescriptor["handler"]
): RouteDescriptor {
  return { method, path, handler };
}

export function createProvider(
  name: string,
  routes: RouteDescriptor[]
): WorkspaceProvider {
  return { name, routes };
}

