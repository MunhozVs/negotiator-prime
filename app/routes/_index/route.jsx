import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Turn discount requests into smart negotiations</h1>
        <p className={styles.text}>
          Negotiator Prime helps Shopify merchants convert price-sensitive
          shoppers while keeping every offer within predefined margin rules.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Rule-based offers.</strong> Define safe discount ranges for
            your store, collections, or individual products.
          </li>
          <li>
            <strong>Conversational storefront.</strong> Let shoppers negotiate
            through a lightweight theme extension.
          </li>
          <li>
            <strong>Actionable analytics.</strong> Track leads, conversions,
            revenue, and negotiation performance from one dashboard.
          </li>
        </ul>
      </div>
    </div>
  );
}
