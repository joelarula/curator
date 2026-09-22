import { createI18n } from 'vue-i18n';
import { et } from '../locales/et';

const i18n = createI18n({
  legacy: false,       // Composition API mode — enables useI18n() in <script setup>
  locale: 'et',
  fallbackLocale: 'et',
  messages: { et },
});

export default i18n;


