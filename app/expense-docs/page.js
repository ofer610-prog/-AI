'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Upload, Camera, FileText, CheckCircle, XCircle, Clock, ChevronDown,
  ChevronUp, Download, Plus, Loader2, ArrowRight, Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'general',      label: 'כללי' },
  { value: 'rent',         label: 'שכר דירה' },
  { value: 'utilities',    label: 'חשמל/מים/גז' },
  { value: 'salary',       label: 'שכר עובדים' },
  { value: 'office',       label: 'ציוד משרדי' },
  { value: 'legal',        label: 'אגרות/רישום' },
  { value: 'travel',       label: 'נסיעות' },
  { value: 'marketing',    label: 'שיווק' },
  { value: 'professional', label: 'שירותים מקצועיים' },
  { value: 'other',        label: 'אחר' },
];

const STATUS_LABELS = {
  pending:  { label: 'ממתין',   color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'אושר',    color: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה',    color: 'bg-red-100 text-red-800' },
};

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const names = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

const fmtMoney = v => v ? `₪${Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

export default function ExpenseDocsPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [profile,       setProfile]       = useState(null);
  const [docs,          setDocs]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [extracting,    setExtracting]    = useState(false);
  const [error,         setError]         = useState('');
  const [success,       setSuccess]       = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedMonths,setExpandedMonths]= useState({});
  const [showForm,      setShowForm]      = useState(false);
  const [form, setForm] = useState({
    amount: '', vendor: '', description: '', category: 'general',
    doc_date: new Date().toISOString().slice(0, 10),
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl,   setPreviewUrl]   = useState('');
  const [aiNote,       setAiNote]       = useState('');
  const fileInputRef   = useRef();
  const cameraInputRef = useRef();
  const [editingNotes, setEditingNotes] = useState({});
  const [notesDraft,   setNotesDraft]   = useState({});

  const isAdmin = profile?.role === 'admin' || profile?.role === 'accountant';

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);
    })();
  }, []);

  const fetchDocs = useCallback(async () => {
    const url = selectedMonth ? `/api/expense-docs?month=${selectedMonth}` : '/api/expense-docs';
    const res  = await fetch(url);
    const json = await res.json();
    if (json.docs) setDocs(json.docs);
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const grouped      = docs.reduce((acc, d) => {
    const m = d.month || d.doc_date?.slice(0, 7) || 'ללא תאריך';
    if (!acc[m]) acc[m] = [];
    acc[m].push(d);
    return acc;
  }, {});
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const toggleMonth  = (m) => setExpandedMonths(p => ({ ...p, [m]: !p[m] }));

  // ── File selection + AI extraction ──────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setAiNote('');
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
      // Auto-extract with AI
      setExtracting(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res  = await fetch('/api/expense-docs/extract', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.extracted) {
          const ex = json.extracted;
          setForm(f => ({
            ...f,
            amount:      ex.amount      != null  ? String(ex.amount) : f.amount,
            vendor:      ex.vendor      || f.vendor,
            description: ex.description || f.description,
            category:    ex.category    || f.category,
            doc_date:    ex.date        || f.doc_date,
          }));
          setAiNote(json.note || '✨ AI חילץ את הפרטים מהחשבונית — אנא בדוק');
        }
      } catch { /* silent — user fills manually */ }
      setExtracting(false);
    } else {
      setPreviewUrl('');
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedFile) { setError('יש לבחור קובץ'); return; }
    setError(''); setSuccess(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const upRes  = await fetch('/api/expense-docs/upload', { method: 'POST', body: fd });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson.error || 'שגיאה בהעלאה');

      const body = {
        file_url: upJson.url, file_name: upJson.name, file_type: upJson.type,
        amount:      form.amount      ? Number(form.amount) : null,
        vendor:      form.vendor      || null,
        description: form.description || null,
        category:    form.category,
        doc_date:    form.doc_date,
      };
      const saveRes  = await fetch('/api/expense-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveJson.error || 'שגיאה בשמירה');

      setSuccess('החשבונית הועלתה בהצלחה!');
      setShowForm(false);
      setSelectedFile(null);
      setPreviewUrl('');
      setAiNote('');
      setForm({ amount: '', vendor: '', description: '', category: 'general', doc_date: new Date().toISOString().slice(0, 10) });
      fetchDocs();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleStatusUpdate = async (id, status, notes) => {
    const res = await fetch('/api/expense-docs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, accountant_notes: notes }),
    });
    if (res.ok) fetchDocs();
  };

  const monthTotal = (monthDocs) =>
    monthDocs.filter(d => d.status !== 'rejected').reduce((s, d) => s + Number(d.amount || 0), 0);

  const exportMonth = (month) => {
    const rows = grouped[month] || [];
    const lines = [
      ['תאריך', 'ספק', 'תיאור', 'קטגוריה', 'סכום', 'סטטוס', 'הערות רו״ח'].join('\t'),
      ...rows.map(d => [
        d.doc_date || '', d.vendor || '', d.description || '',
        CATEGORIES.find(c => c.value === d.category)?.label || d.category,
        d.amount || '',
        STATUS_LABELS[d.status]?.label || d.status,
        d.accountant_notes || '',
      ].join('\t')),
      '',
      `סה"כ (ללא נדחים)\t\t\t\t${monthTotal(rows).toFixed(2)}`,
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `הוצאות-${month}.tsv`;
    a.click();
  };

  if (loading) return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  // Grand totals (all months, non-rejected)
  const grandTotal   = docs.filter(d => d.status !== 'rejected').reduce((s,d)=>s+Number(d.amount||0),0);
  const pendingCount = docs.filter(d => d.status === 'pending').length;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-12 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowRight size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">🧾 חשבוניות הוצאות</h1>
              <p className="text-xs text-gray-400">
                {docs.length} חשבוניות | סה"כ {fmtMoney(grandTotal)}
                {pendingCount > 0 && <span className="mr-2 text-yellow-600">• {pendingCount} ממתינים לאישור</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(v => !v); setError(''); setSuccess(''); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            העלאת חשבונית
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Upload Form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">העלאת חשבונית חדשה</h2>

            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition mb-4 relative"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
            >
              {extracting && (
                <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center gap-2 text-blue-600 text-sm font-medium">
                  <Sparkles size={18} className="animate-pulse" />
                  AI מנתח את החשבונית...
                </div>
              )}
              {previewUrl ? (
                <img src={previewUrl} alt="preview" className="max-h-52 mx-auto rounded-lg object-contain" />
              ) : selectedFile ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <FileText size={32} />
                  <span>{selectedFile.name}</span>
                </div>
              ) : (
                <div className="text-gray-400">
                  <Upload size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-medium">גרור קובץ לכאן או לחץ לבחירה</p>
                  <p className="text-xs mt-1 text-blue-500">✨ AI יחלץ פרטים מתמונות אוטומטית</p>
                  <p className="text-xs mt-0.5">PNG / JPG / PDF עד 10MB</p>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => handleFileSelect(e.target.files[0])} />

            {/* Camera button */}
            <button
              className="mb-4 flex items-center gap-2 text-sm text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} /> צלם עם המצלמה
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => handleFileSelect(e.target.files[0])} />

            {/* AI note */}
            {aiNote && (
              <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-lg text-sm">
                <Sparkles size={14} className="flex-shrink-0" />
                {aiNote}
              </div>
            )}

            {/* Form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">סכום (₪)</label>
                <input type="number" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ספק / שם עסק</label>
                <input type="text" value={form.vendor}
                  onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="שם הספק" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">תאריך מסמך</label>
                <input type="date" value={form.doc_date}
                  onChange={e => setForm(f => ({ ...f, doc_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">קטגוריה</label>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">תיאור</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="תיאור קצר של ההוצאה" />
              </div>
            </div>

            {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

            <div className="mt-4 flex gap-3">
              <button onClick={handleSubmit} disabled={uploading || extracting}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {uploading ? <><Loader2 size={14} className="animate-spin" /> מעלה...</> : <><Upload size={14} /> העלה</>}
              </button>
              <button onClick={() => { setShowForm(false); setSelectedFile(null); setPreviewUrl(''); setAiNote(''); }}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                ביטול
              </button>
            </div>
          </div>
        )}

        {success && !showForm && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
            ✅ {success}
          </div>
        )}

        {/* Filter + summary bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-600">סנן לפי חודש:</label>
          <input type="month" value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          {selectedMonth && (
            <button onClick={() => setSelectedMonth('')} className="text-xs text-blue-600 hover:underline">
              הצג הכל
            </button>
          )}
          {isAdmin && docs.length > 0 && (
            <button
              onClick={() => {
                const month = selectedMonth || new Date().toISOString().slice(0, 7);
                exportMonth(month);
              }}
              className="mr-auto flex items-center gap-1.5 text-xs text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50"
            >
              <Download size={13} />
              {selectedMonth ? `ייצא ${monthLabel(selectedMonth)}` : 'ייצא חודש נוכחי'}
            </button>
          )}
        </div>

        {/* Category summary */}
        {isAdmin && docs.length > 0 && (
          <CategorySummary docs={docs.filter(d => d.status !== 'rejected')} />
        )}

        {/* Grouped docs */}
        {sortedMonths.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <p>אין חשבוניות עדיין</p>
            <p className="text-sm mt-1">לחץ על "העלאת חשבונית" להוספה</p>
          </div>
        ) : sortedMonths.map(month => {
          const monthDocs = grouped[month];
          const expanded  = expandedMonths[month] !== false;
          const total     = monthTotal(monthDocs);
          const pending   = monthDocs.filter(d => d.status === 'pending').length;
          const approved  = monthDocs.filter(d => d.status === 'approved').length;

          return (
            <div key={month} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => toggleMonth(month)}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  <span className="font-semibold text-gray-800">{monthLabel(month)}</span>
                  <span className="text-sm text-gray-500">({monthDocs.length} חשבוניות)</span>
                  {pending > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">{pending} ממתינים</span>
                  )}
                  {approved > 0 && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">{approved} אושרו</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">{total > 0 ? fmtMoney(total) : ''}</span>
                  {isAdmin && (
                    <button
                      onClick={e => { e.stopPropagation(); exportMonth(month); }}
                      className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50"
                    >
                      <Download size={12} /> ייצא
                    </button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="divide-y divide-gray-100">
                  {monthDocs.map(doc => (
                    <DocRow key={doc.id} doc={doc} isAdmin={isAdmin}
                      onStatusUpdate={handleStatusUpdate}
                      editingNotes={editingNotes} setEditingNotes={setEditingNotes}
                      notesDraft={notesDraft} setNotesDraft={setNotesDraft}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Category summary ──────────────────────────────────────────────────────────
function CategorySummary({ docs }) {
  const LABELS = {
    general: 'כללי', rent: 'שכ"ד', utilities: 'חשמל/מים', salary: 'שכר',
    office: 'ציוד', legal: 'אגרות', travel: 'נסיעות',
    marketing: 'שיווק', professional: 'מקצועי', other: 'אחר',
  };
  const byCategory = docs.reduce((acc, d) => {
    const c = d.category || 'general';
    acc[c] = (acc[c] || 0) + Number(d.amount || 0);
    return acc;
  }, {});
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">סיכום לפי קטגוריה</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {entries.map(([cat, total]) => (
          <div key={cat} className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">{LABELS[cat] || cat}</div>
            <div className="font-bold text-gray-800 mt-1 text-sm">
              ₪{total.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Doc Row ───────────────────────────────────────────────────────────────────
function DocRow({ doc, isAdmin, onStatusUpdate, editingNotes, setEditingNotes, notesDraft, setNotesDraft }) {
  const statusInfo = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
  const catLabel   = { general:'כללי',rent:'שכ"ד',utilities:'חשמל/מים',salary:'שכר',office:'ציוד',legal:'אגרות',travel:'נסיעות',marketing:'שיווק',professional:'מקצועי',other:'אחר' }[doc.category] || doc.category;

  return (
    <div className="px-5 py-4 hover:bg-gray-50 transition">
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div
          className="flex-shrink-0 w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer overflow-hidden border border-gray-200"
          onClick={() => window.open(doc.file_url, '_blank')}
          title="לחץ לפתיחה"
        >
          {doc.file_type?.startsWith('image/') ? (
            <img src={doc.file_url} alt={doc.file_name} className="w-full h-full object-cover" />
          ) : (
            <FileText size={24} className="text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-medium text-gray-900 text-sm">{doc.vendor || doc.file_name}</p>
              {doc.description && <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.amount && <span className="font-semibold text-gray-800">{`₪${Number(doc.amount).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
            <span>{doc.doc_date}</span>
            <span className="bg-gray-100 px-1.5 py-0.5 rounded">{catLabel}</span>
            {doc.profiles?.full_name && <span>הועלה ע״י {doc.profiles.full_name}</span>}
          </div>

          {doc.accountant_notes && !editingNotes[doc.id] && (
            <p className="mt-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
              💬 {doc.accountant_notes}
            </p>
          )}

          {isAdmin && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {doc.status !== 'approved' && (
                <button onClick={() => onStatusUpdate(doc.id, 'approved', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100">
                  <CheckCircle size={12} /> אשר
                </button>
              )}
              {doc.status !== 'rejected' && (
                <button onClick={() => onStatusUpdate(doc.id, 'rejected', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100">
                  <XCircle size={12} /> דחה
                </button>
              )}
              {doc.status === 'approved' && (
                <button onClick={() => onStatusUpdate(doc.id, 'pending', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100">
                  <Clock size={12} /> החזר לממתין
                </button>
              )}
              {editingNotes[doc.id] ? (
                <div className="flex items-center gap-1 w-full mt-1">
                  <input type="text"
                    value={notesDraft[doc.id] ?? doc.accountant_notes ?? ''}
                    onChange={e => setNotesDraft(p => ({ ...p, [doc.id]: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    placeholder="הערה לרו״ח..." />
                  <button onClick={() => { onStatusUpdate(doc.id, doc.status, notesDraft[doc.id] ?? ''); setEditingNotes(p=>({...p,[doc.id]:false})); }}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg">שמור</button>
                  <button onClick={() => setEditingNotes(p=>({...p,[doc.id]:false}))}
                    className="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-200">ביטול</button>
                </div>
              ) : (
                <button onClick={() => { setEditingNotes(p=>({...p,[doc.id]:true})); setNotesDraft(p=>({...p,[doc.id]:doc.accountant_notes??''})); }}
                  className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50">
                  ✏️ הערה
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
