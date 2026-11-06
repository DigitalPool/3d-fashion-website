# Theme preview

Runs both Shopify themes using the real theme files and a fake store. Run `npm install` and `npm start` from the repo root.

| Theme | Link |
| --- | --- |
| A/P x Deadly Soul | http://localhost:4101 |
| Volume Studio | http://localhost:4102 |

Add `/__pages` to either link for a list of every page, including 404, password and gift card.

## Editing

Edit files in the theme folders as normal. The browser refreshes on save.

- `mock-store.json` holds the fake products, collections, pages and blog.
- To change a theme setting, add its value to that theme's `config/settings_data.json`, as Shopify does. Empty settings use the defaults in `settings_schema.json`.

This folder is not part of either theme, so leave it out when zipping a theme for Shopify.

## What can't run here

- Checkout: the button shows a notice, because Shopify hosts the real checkout.
- Newsletter signup: the form shows its success state, but nothing is saved.
- Image resizing: images are served at full size.
- The cart is kept in a browser cookie for each theme.
