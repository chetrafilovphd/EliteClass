import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

function fromRoot(path) {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: fromRoot('./index.html'),
        login: fromRoot('./login.html'),
        register: fromRoot('./register.html'),
        forgotPassword: fromRoot('./forgot-password.html'),
        resetPassword: fromRoot('./reset-password.html'),
        dashboard: fromRoot('./dashboard.html'),
        myHours: fromRoot('./my-hours.html'),
        groups: fromRoot('./groups.html'),
        groupDetails: fromRoot('./group-details.html'),
        calendar: fromRoot('./calendar.html'),
        parentLinks: fromRoot('./parent-links.html'),
      },
    },
  },
});
