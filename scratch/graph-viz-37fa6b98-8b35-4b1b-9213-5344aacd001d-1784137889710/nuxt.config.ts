import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  typescript: {
    strict: true
  },
  devtools: {
    enabled: false
  }
});
