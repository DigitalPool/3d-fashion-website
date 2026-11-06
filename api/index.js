// Vercel entry point. Each Vercel project serves one theme, chosen by the THEME variable: "ap" or "volume".
import { createTheme, THEMES } from '../Shopify-Themes/local-preview/server.js';

const theme = THEMES.find((item) => item.key === process.env.THEME) || THEMES[0];
const site = createTheme(theme);

export default function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex'); // a preview with a fake store should stay out of search results
  return site.handler(req, res);
}
