// Ambient type declarations for CSS imports used by the Expo web (Metro CSS)
// build. These let TypeScript resolve `.css` and `.module.css` imports that
// Metro handles at bundle time.
declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Drizzle's generated SQL migration files are bundled into the app binary as
// strings by babel-plugin-inline-import (see babel.config.js / metro.config.js).
// This declaration lets TypeScript resolve the `.sql` imports inside
// `src/db/migrations/migrations.js`.
declare module '*.sql' {
  const content: string;
  export default content;
}
