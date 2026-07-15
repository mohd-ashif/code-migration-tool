# Expense Tracker

Senior folder structure:
src/
  components/
  composables/
  pages/
  services/
  types/
  utils/

Features:
- Nuxt 3 + TypeScript + Nuxt 3
- LocalStorage persistence
- Add/Delete expenses
- Running total

Suggested production improvements:
- Pinia State Management or Pinia Stores
- Nuxt useFetch / useAsyncData
- Form validation (VeeValidate Form Builder + Zod)
- Charts
- Authentication
- Backend (FastAPI/Node)
- Unit tests


## Nuxt 3 Architecture & Migration Notes
- **Auto-Imports**: All custom composables located in the `composables/` folder (e.g., `useExpenses`) and standard Vue APIs (`ref`, `computed`, `watch`) are auto-imported by Nuxt. No explicit import statements are required in your component files.
- **Routing**: React Router declarations have been migrated to Nuxt's filesystem-based routing located in the `pages/` directory.
- **State Management**: Redux/Zustand slice states are migrated to Pinia Stores.
- **SSR & Hydration**: Nuxt 3 supports Server-Side Rendering (SSR) out of the box. Ensure any browser-only APIs (like `window` or `localStorage`) are safely wrapped in client-only checks (e.g. `import.meta.client` or within composable triggers).
- **Layouts**: General layouts are placed in the `layouts/` directory and can be used declaratively.
