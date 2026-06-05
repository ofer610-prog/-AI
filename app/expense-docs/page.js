'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Upload, Camera, FileText, CheckCircle, XCircle, Clock, ChevronDown,
  ChevronUp, Download, Trash2, Eye, EyeOff, Plus, Loader2, ArrowRight,
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

export default function ExpenseDocsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedMonths, setExpandedMonths] = useState({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: '', vendor: '', description: '', category: 'general',
    doc_date: new Date().toISOString().slice(0, 10),
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef();
  const cameraInputRef = useRef();

  const [editingNotes, setEditingNotes] = useState({});
  const [notesDraft, setNotesDraft] = useState({});

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
    const res = await fetch(url);
    const json = await res.json();
    if (json.docs) setDocs(json.docs);
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const grouped = docs.reduce((acc, d) => {
    const m = d.month || d.doc_date?.slice(0, 7) || 'ללא תאריך';
    if (!acc[m]) acc[m] = [];
    acc[m].push(d);
    return acc;
  }, {});
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const toggleMonth = (m) => setExpandedMonths(p => ({ ...p, [m]: !p[m] }));

  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) { setError('יש לבחור קובץ'); return; }
    setError(''); setSuccess(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const upRes = await fetch('/api/expense-docs/upload', { method: 'POST', body: fd });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson.error || 'שגיאה בהעלאה');

      const body = {
        file_url: upJson.url, file_name: upJson.name, file_type: upJson.type,
        amount: form.amount ? Number(form.amount) : null,
        vendor: form.vendor || null,
        description: form.description || null,
        category: form.category,
        doc_date: form.doc_date,
      };
      const saveRes = await fetch('/api/expense-docs', {
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
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `הוצאות-${month}.tsv`;
    a.click();
  };

  if (loading) return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowRight size={20} />
            </button>
            <h1 className="text-xl font-bold text-gray-900">🧾 חשבוניות הוצאות</h1>
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

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Upload Form */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">העלאת חשבונית חדשה</h2>

            {/* File drop zone */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition mb-4"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
              ) : selectedFile ? (
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <FileText size={32} />
                  <span>{selectedFile.name}</span>
                </div>
              ) : (
                <div className="text-gray-400">
                  <Upload size={32} className="mx-auto mb-2" />
                  <p className="text-sm">גרור קובץ לכאן או לחץ לבחירה</p>
                  <p className="text-xs mt-1">PNG / JPG / PDF עד 10MB</p>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
              onChange={e => handleFileSelect(e.target.files[0])} />

            {/* Camera button (mobile) */}
            <button
              className="mb-4 flex items-center gap-2 text-sm text-gray-600 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} /> צלם עם המצלמה
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => handleFileSelect(e.target.files[0])} />

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
            {success && <p className="mt-3 text-green-600 text-sm">{success}</p>}

            <div className="mt-4 flex gap-3">
              <button onClick={handleSubmit} disabled={uploading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {uploading ? <><Loader2 size={14} className="animate-spin" /> מעלה...</> : <><Upload size={14} /> העלה</>}
              </button>
              <button onClick={() => { setShowForm(false); setSelectedFile(null); setPreviewUrl(''); }}
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

        {/* Filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">סנן לפי חודש:</label>
          <input type="month" value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          {selectedMonth && (
            <button onClick={() => setSelectedMonth('')} className="text-xs text-blue-600 hover:underline">
              הצג הכל
            </button>
          )}
        </div>

        {/* Grouped by month */}
        {sortedMonths.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <p>אין חשבוניות עדיין</p>
            <p className="text-sm mt-1">לחץ על "העלאת חשבונית" להוספה</p>
          </div>
        ) : sortedMonths.map(month => {
          const monthDocs = grouped[month];
          const expanded = expandedMonths[month] !== false;
          const total = monthTotal(monthDocs);
          const pending = monthDocs.filter(d => d.status === 'pending').length;

          return (
            <div key={month} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Month header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => toggleMonth(month)}
              >
                <div className="flex items-center gap-3">
                  {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  <span className="font-semibold text-gray-800">{monthLabel(month)}</span>
                  <span className="text-sm text-gray-500">({monthDocs.length} חשבוניות)</span>
                  {pending > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      {pending} ממתינים
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">
                    {total > 0 ? `₪${total.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                  </span>
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

              {/* Docs list */}
              {expanded && (
                <div className="divide-y divide-gray-100">
                  {monthDocs.map(doc => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      isAdmin={isAdmin}
                      onStatusUpdate={handleStatusUpdate}
                      editingNotes={editingNotes}
                      setEditingNotes={setEditingNotes}
                      notesDraft={notesDraft}
                      setNotesDraft={setNotesDraft}
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

function DocRow({ doc, isAdmin, onStatusUpdate, editingNotes, setEditingNotes, notesDraft, setNotesDraft }) {
  const [showImg, setShowImg] = useState(false);
  const statusInfo = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
  const catLabel = CATEGORIES.find(c => c.value === doc.category)?.label || doc.category;

  return (
    <div className="px-5 py-4 hover:bg-gray-50 transition">
      <div className="flex items-start gap-4">
        {/* File thumbnail */}
        <div
          className="flex-shrink-0 w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer overflow-hidden border border-gray-200"
          onClick={() => window.open(doc.file_url, '_blank')}
        >
          {doc.file_type?.startsWith('image/') ? (
            <img src={doc.file_url} alt={doc.file_name} className="w-full h-full object-cover" />
          ) : (
            <FileText size={24} className="text-gray-400" />
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-medium text-gray-900 text-sm">{doc.vendor || doc.file_name}</p>
              {doc.description && <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.amount && (
                <span className="font-semibold text-gray-800">
                  ₪{Number(doc.amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            <span>{doc.doc_date}</span>
            <span>{catLabel}</span>
            {doc.profiles?.full_name && <span>הועלה ע״י {doc.profiles.full_name}</span>}
          </div>

          {/* Accountant notes */}
          {doc.accountant_notes && !editingNotes[doc.id] && (
            <p className="mt-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
              💬 {doc.accountant_notes}
            </p>
          )}

          {/* Admin actions */}
          {isAdmin && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {doc.status !== 'approved' && (
                <button
                  onClick={() => onStatusUpdate(doc.id, 'approved', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg hover:bg-green-100"
                >
                  <CheckCircle size={12} /> אשר
                </button>
              )}
              {doc.status !== 'rejected' && (
                <button
                  onClick={() => onStatusUpdate(doc.id, 'rejected', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100"
                >
                  <XCircle size={12} /> דחה
                </button>
              )}
              {doc.status === 'approved' && (
                <button
                  onClick={() => onStatusUpdate(doc.id, 'pending', doc.accountant_notes)}
                  className="flex items-center gap-1 text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-1 rounded-lg hover:bg-yellow-100"
                >
                  <Clock size={12} /> החזר לממתין
                </button>
              )}
              {editingNotes[doc.id] ? (
                <div className="flex items-center gap-1 w-full mt-1">
                  <input
                    type="text"
                    value={notesDraft[doc.id] ?? doc.accountant_notes ?? ''}
                    onChange={e => setNotesDraft(p => ({ ...p, [doc.id]: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    placeholder="הערה לרו״ח..."
                  />
                  <button
                    onClick={() => {
                      onStatusUpdate(doc.id, doc.status, notesDraft[doc.id] ?? doc.accountant_notes ?? '');
                      setEditingNotes(p => ({ ...p, [doc.id]: false }));
                    }}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg"
                  >שמור</button>
                  <button
                    onClick={() => setEditingNotes(p => ({ ...p, [doc.id]: false }))}
                    className="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-200"
                  >ביטול</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingNotes(p => ({ ...p, [doc.id]: true }));
                    setNotesDraft(p => ({ ...p, [doc.id]: doc.accountant_notes ?? '' }));
                  }}
                  className="text-xs text-blue-600 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-50"
                >
                  ✏️ הוסף הערה
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
