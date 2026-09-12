import { type RouteConfig, index, route } from "@react-router/dev/routes";
export default [index("routes/home.tsx"), route("features/tokon", "routes/tokon.tsx"), route("*", "routes/not-found.tsx")] satisfies RouteConfig;
