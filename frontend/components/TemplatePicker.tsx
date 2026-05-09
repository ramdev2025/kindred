'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { fetchTemplates, useTemplate, Template } from '@/lib/api';

const CATEGORY_ICONS: Record<string, string> = {
  frontend: '🎨',
  backend: '⚙️',
  fullstack: '🔗',
  general: '📦',
};

const CATEGORY_COLORS: Record<string, string> = {
  frontend: '#6366f1',
  backend: '#10b981',
  fullstack: '#f59e0b',
  general: '#6b7280',
};

function TemplateCard({ template, onUse }: { template: Template; onUse: (t: Template) => void }) {
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        borderRadius: 16,
        padding: '20px 22px',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 180,
      }}
      onClick={() => onUse(template)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.12)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>{CATEGORY_ICONS[template.category] || '📦'}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{template.name}</div>
          <span style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
            color: CATEGORY_COLORS[template.category] || '#6b7280',
          }}>{template.category}</span>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0, flex: 1 }}>
        {template.description}
      </p>

      {/* Tech stack chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {template.tech_stack.map((tech) => (
          <span key={tech} style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 6,
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            fontWeight: 500,
          }}>{tech}</span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {template.use_count > 0 ? `${template.use_count} uses` : 'New'}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--accent)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          Use template →
        </span>
      </div>
    </div>
  );
}

export default function TemplatePicker({ onClose }: { onClose?: () => void }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchTemplates();
        setTemplates(data);
      } catch (err) {
        console.error('[TemplatePicker] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categories = ['all', ...new Set(templates.map((t) => t.category))];
  const filtered = filter === 'all' ? templates : templates.filter((t) => t.category === filter);

  async function handleUse(template: Template) {
    setCreating(template.id);
    try {
      const token = await getToken();
      if (!token) return;

      const result = await useTemplate(token, template.id);
      onClose?.();
      // Navigate to the new project with the template prompt
      router.push(`/project/${result.project.id}?prompt=${encodeURIComponent(result.initialPrompt)}&mode=build`);
    } catch (err: any) {
      console.error('[TemplatePicker] Failed to use template:', err);
      alert(err?.response?.data?.error || 'Failed to create project from template');
    } finally {
      setCreating(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <div style={{
          width: 28, height: 28, border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer', textTransform: 'capitalize',
              background: filter === cat ? 'var(--accent)' : 'var(--surface-2)',
              color: filter === cat ? 'white' : 'var(--text-secondary)',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {cat === 'all' ? '🔍 All' : `${CATEGORY_ICONS[cat] || ''} ${cat}`}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {filtered.map((tpl) => (
          <div key={tpl.id} style={{ position: 'relative' }}>
            <TemplateCard template={tpl} onUse={handleUse} />
            {creating === tpl.id && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 16,
                background: 'rgba(0,0,0,0.5)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 28, height: 28, border: '3px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
          No templates found for this category.
        </div>
      )}
    </div>
  );
}
