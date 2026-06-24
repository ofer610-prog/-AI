'use client';

import { useEffect, useRef } from 'react';

function fieldKey(el) {
  if (!el) return '';
  const tag = el.tagName;
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return '';
  const wrapper = el.closest('div');
  const label = wrapper?.querySelector('label')?.textContent?.trim()
    || wrapper?.parentElement?.querySelector('label')?.textContent?.trim()
    || el.getAttribute('placeholder')
    || el.getAttribute('name')
    || el.getAttribute('type')
    || tag;
  const form = el.closest('form');
  const formIndex = form ? Array.from(document.querySelectorAll('form')).indexOf(form) : 0;
  return `${formIndex}|${tag}|${label}`;
}

function findByKey(key) {
  const [formIndexRaw, tag, label] = String(key || '').split('|');
  const formIndex = Number(formIndexRaw) || 0;
  const form = document.querySelectorAll('form')[formIndex] || document;
  const candidates = Array.from(form.querySelectorAll('input, textarea, select'));
  return candidates.find(el => fieldKey(el) === key) || null;
}

export default function FormFocusKeeper() {
  const last = useRef(null);
  const restoring = useRef(false);

  useEffect(() => {
    function remember(e) {
      const el = e.target;
      if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const key = fieldKey(el);
      if (!key) return;
      last.current = {
        key,
        start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
        end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null,
      };
    }

    function restoreSoon() {
      if (!last.current || restoring.current) return;
      restoring.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          restoring.current = false;
          const active = document.activeElement;
          if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
          const target = findByKey(last.current?.key);
          if (!target) return;
          target.focus({ preventScroll: true });
          if (last.current.start != null && typeof target.setSelectionRange === 'function') {
            const len = String(target.value || '').length;
            const start = Math.min(last.current.start, len);
            const end = Math.min(last.current.end ?? start, len);
            try { target.setSelectionRange(start, end); } catch {}
          }
        });
      });
    }

    document.addEventListener('focusin', remember, true);
    document.addEventListener('input', remember, true);
    document.addEventListener('input', restoreSoon, true);
    return () => {
      document.removeEventListener('focusin', remember, true);
      document.removeEventListener('input', remember, true);
      document.removeEventListener('input', restoreSoon, true);
    };
  }, []);

  return null;
}
