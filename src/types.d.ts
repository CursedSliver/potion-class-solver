// Type declarations for asset imports handled by esbuild's loaders.
declare module '*.png' {
  const url: string;
  export default url;
}

// `src/info.md` is bundled as raw text by esbuild's text loader.
declare module '*.md' {
  const markdown: string;
  export default markdown;
}
