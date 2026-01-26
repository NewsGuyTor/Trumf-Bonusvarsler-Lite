// Type declarations for asset imports (resolved by esbuild plugins at build time)

declare module "*.png" {
  const dataUri: string;
  export default dataUri;
}

declare module "*.css" {
  const css: string;
  export default css;
}
