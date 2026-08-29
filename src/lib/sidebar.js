// Shared side navigation (shkolo-style): a fixed left menu on desktop and a
// slide-in drawer on mobile. Injected on every logged-in app page. Role-aware.
import { supabase } from './supabaseClient.js';

const NAV_SECTIONS = [
  {
    label: 'Основно',
    items: [
      { href: 'dashboard.html', icon: 'bi-grid-1x2-fill', label: 'Табло', roles: '*' },
      { href: 'groups.html', icon: 'bi-people-fill', label: 'Групи', roles: '*' },
      { href: 'schedule.html', icon: 'bi-calendar-week-fill', label: 'Разписание', roles: '*' },
      { href: 'calendar.html', icon: 'bi-calendar-event-fill', label: 'Календар', roles: '*' },
    ],
  },
  {
    label: 'Преподаване',
    items: [
      { href: 'my-hours.html', icon: 'bi-journal-check', label: 'Моят час', roles: ['teacher', 'admin'] },
    ],
  },
  {
    label: 'Управление',
    items: [
      { href: 'parent-links.html', icon: 'bi-shield-lock-fill', label: 'Администрация', roles: ['admin'] },
    ],
  },
];

const currentFile = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

function itemVisibleFor(item, role) {
  if (item.roles === '*') return true;
  return Array.isArray(item.roles) && item.roles.includes(role);
}

function linkHtml(item) {
  const active = item.href.toLowerCase() === currentFile ? ' active' : '';
  return `<a class="elite-side-link${active}" href="${item.href}">
    <i class="bi ${item.icon}"></i><span>${item.label}</span>
  </a>`;
}

function render(role) {
  const links = NAV_SECTIONS.map((section) => {
    const visible = section.items.filter((i) => itemVisibleFor(i, role));
    if (visible.length === 0) return '';
    return `<div class="elite-nav-label">${escapeHtml(section.label)}</div>${visible.map(linkHtml).join('')}`;
  }).join('');

  // Hide the old top navbar if present.
  document.querySelectorAll('.elite-appbar').forEach((n) => { n.style.display = 'none'; });
  document.body.classList.add('has-sidebar');

  const roleLabel = { admin: 'Администратор', teacher: 'Учител', student: 'Ученик', parent: 'Родител' }[role] || '';

  const markup = `
    <header class="elite-mobilebar d-lg-none">
      <button class="elite-burger" id="elite-burger" aria-label="Меню"><i class="bi bi-list"></i></button>
      <a class="elite-mobilebar-brand" href="dashboard.html">
        <img src="logoEliteLingua.jpg" alt="Elite Class" /><span>Elite Class</span>
      </a>
    </header>
    <div class="elite-side-backdrop" id="elite-side-backdrop"></div>
    <nav class="elite-sidebar" id="elite-sidebar" aria-label="Основна навигация">
      <a class="elite-side-brand" href="dashboard.html">
        <img src="logoEliteLingua.jpg" alt="Elite Class" />
        <div>
          <div class="elite-side-title">Elite Class</div>
          <div class="elite-side-sub">${roleLabel ? escapeHtml(roleLabel) : 'дневник'}</div>
        </div>
      </a>
      <div class="elite-side-links">${links}</div>
      <button class="elite-side-link elite-side-logout" id="elite-side-logout" type="button">
        <i class="bi bi-box-arrow-right"></i><span>Изход</span>
      </button>
    </nav>`;

  document.body.insertAdjacentHTML('afterbegin', markup);

  const sidebar = document.getElementById('elite-sidebar');
  const backdrop = document.getElementById('elite-side-backdrop');
  const burger = document.getElementById('elite-burger');

  const open = () => { sidebar.classList.add('open'); backdrop.classList.add('show'); };
  const close = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };

  burger?.addEventListener('click', open);
  backdrop?.addEventListener('click', close);
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));

  document.getElementById('elite-side-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

(async function initSidebar() {
  // Render immediately with common items; refine once the role is known.
  render(null);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    const role = profile?.role || null;
    // Re-render role-specific links (remove the first-render sidebar first).
    document.getElementById('elite-sidebar')?.remove();
    document.getElementById('elite-side-backdrop')?.remove();
    document.querySelector('.elite-mobilebar')?.remove();
    render(role);
  } catch {
    // keep the common menu
  }
})();
