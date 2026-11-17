// Static export for GitHub Pages (https://tanawat40889.github.io/bkk11-utility/registration/)
const basePath = process.env.NODE_ENV === "production" ? "/bkk11-utility/registration" : "";
/** @type {import("next").NextConfig} */
module.exports = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
