import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <ShopifyAppProvider embedded apiKey={apiKey}>
        <ui-nav-menu>
          <a href="/app" rel="home">
            General Settings
          </a>
          <a href="/app/dashboard">Dashboard</a>
          <a href="/app/negotiation-rules">Negotiation Rules</a>
        </ui-nav-menu>
        <Outlet />
      </ShopifyAppProvider>
    </PolarisAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
