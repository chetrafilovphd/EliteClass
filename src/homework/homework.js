// "Домашни" — a dedicated page listing homework, for students (their own groups)
// and parents (their children's groups). Homework is stored per group; RLS lets a
// student read their group's homework and a parent read their child's group's homework.
import { supabase } from '../lib/supabaseClient.js';

const subEl = document.getElementById('hw-sub');
const bodyEl = document.getElementById('homework-body');
const msgEl = document.getElementById('msg');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function showMessage(text, ok = false) {
  if (!msgEl) return;
  msgEl.textContent = text || '';
  msgEl.className = `msg small mb-0 mt-2 ${ok ? 'text-success' : 'text-danger'}`;
}

async function groupIdsForStudent(studentId) {
  const { data } = await supabase.from('group_students').select('group_id').eq('student_id', studentId);
  return [...new Set((data || []).map((r) => r.group_id).filter(Boolean))];
}

async function homeworksForGroups(groupIds) {
  if (!groupIds.length) return [];
  const { data } = await supabase.from('homeworks')
    .select('title, due_date, lesson_date, description, groups(name)')
    .in('group_id', groupIds)
    .order('lesson_date', { ascending: false, nullsFirst: false })
    .limit(80);
  return data || [];
}

function hwTable(list) {
  const rows = list.length
    ? list.map((h) => `
      <tr>
        <td>${esc(h.due_date || '—')}</td>
        <td>${esc(h.groups?.name || '')}</td>
        <td>${esc(h.title || '')}${h.description ? `<div class="elite-muted small">${esc(h.description)}</div>` : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="text-muted py-3">Още няма зададени домашни.</td></tr>';
  return `<div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light"><tr><th>Срок</th><th>Група</th><th>Домашно</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function card(title, inner) {
  return `<div class="elite-daycard mb-3">
    <div class="elite-daycard-head"><div class="elite-daycard-title"><i class="bi bi-house-check"></i>${esc(title)}</div></div>
    <div class="elite-daycard-body">${inner}</div>
  </div>`;
}

(async function init() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) { window.location.href = 'login.html'; return; }

  const { data: profile, error } = await supabase
    .from('profiles').select('role, full_name').eq('id', session.user.id).single();
  if (error) { showMessage(`Грешка при профил: ${error.message}`); return; }
  const role = profile?.role;

  try {
    if (role === 'student') {
      subEl.textContent = 'Домашните, зададени на твоите групи.';
      const gids = await groupIdsForStudent(session.user.id);
      const list = await homeworksForGroups(gids);
      bodyEl.innerHTML = card('Моите домашни', hwTable(list));
    } else if (role === 'parent') {
      subEl.textContent = 'Домашните на детето/децата ти.';
      const { data: links } = await supabase.from('parent_students')
        .select('student_id, profiles!parent_students_student_id_fkey(full_name)')
        .eq('parent_id', session.user.id);
      const kids = [...new Map((links || []).map((l) => [l.student_id, { id: l.student_id, name: l.profiles?.full_name || l.student_id }])).values()];
      if (!kids.length) {
        bodyEl.innerHTML = card('Домашни', '<div class="text-muted">Няма свързани ученици.</div>');
        return;
      }
      let html = '';
      for (const kid of kids) {
        const gids = await groupIdsForStudent(kid.id);
        const list = await homeworksForGroups(gids);
        html += card(kid.name, hwTable(list));
      }
      bodyEl.innerHTML = html;
    } else {
      subEl.textContent = '';
      bodyEl.innerHTML = card('Домашни', '<div class="text-muted">Домашните се задават от „Моят час“. Тази страница е за ученици и родители.</div>');
    }
  } catch (e) {
    showMessage(`Грешка при зареждане: ${e.message}`);
  }
})();
