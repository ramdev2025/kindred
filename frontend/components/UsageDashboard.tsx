'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { fetchUsage, fetchPricingTiers, UsageSummary, PricingTier, createPayPalOrder, capturePayPalOrder } from '@/lib/api';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { toast } from 'react-hot-toast';

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === -1 ? 0 : Math.min((value / max) * 100, 100);
  const isUnlimited = max === -1;

  return (
    <div style={{ width: '100%', background: 'var(--surface-2)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: isUnlimited ? '100%' : `${pct}%`,
          background: isUnlimited
            ? 'var(--accent-gradient, linear-gradient(90deg, #6366f1, #8b5cf6))'
            : pct > 90
              ? '#ef4444'
              : pct > 70
                ? '#f59e0b'
                : color,
          borderRadius: 8,
          transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
}

function UsageCard({ title, used, limit, icon, color }: {
  title: string; used: number; limit: number; icon: string; color: string;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.round((used / limit) * 100);

  return (
    <div style={{
      background: 'var(--surface-1)',
      borderRadius: 16,
      padding: '20px 24px',
      border: '1px solid var(--border)',
      flex: '1 1 220px',
      minWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        {isUnlimited ? '∞' : used.toLocaleString()}
        <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-secondary)' }}>
          {isUnlimited ? '' : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      <ProgressBar value={used} max={limit} color={color} />
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        {isUnlimited ? 'Unlimited' : `${pct}% used`}
      </div>
    </div>
  );
}

function PricingCard({ tier, isCurrentTier, onUpgrade }: { tier: PricingTier; isCurrentTier: boolean; onUpgrade: () => void }) {
  const { getToken } = useAuth();
  
  return (
    <div style={{
      background: isCurrentTier ? 'var(--surface-2)' : 'var(--surface-1)',
      borderRadius: 16,
      padding: '24px',
      border: isCurrentTier ? '2px solid var(--accent)' : '1px solid var(--border)',
      flex: '1 1 240px',
      minWidth: 240,
      position: 'relative',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.15)'; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {isCurrentTier && (
        <div style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: 'white', fontSize: 11, fontWeight: 700,
          padding: '3px 12px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>Current Plan</div>
      )}
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{tier.name}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 16 }}>
        {tier.price === -1 ? 'Custom' : tier.price === 0 ? 'Free' : `$${tier.price}`}
        {tier.price > 0 && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-secondary)' }}>/mo</span>}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, lineHeight: 2, marginBottom: 16 }}>
        <li style={{ color: 'var(--text-secondary)' }}>
          🎯 {tier.tokens === -1 ? 'Unlimited' : `${(tier.tokens / 1000).toFixed(0)}K`} tokens/month
        </li>
        <li style={{ color: 'var(--text-secondary)' }}>
          📦 {tier.sandboxes === -1 ? 'Unlimited' : tier.sandboxes} sandboxes/day
        </li>
        <li style={{ color: 'var(--text-secondary)' }}>
          📁 {tier.projects === -1 ? 'Unlimited' : tier.projects} projects
        </li>
        {tier.features.map((f, i) => (
          <li key={i} style={{ color: 'var(--text-secondary)' }}>✓ {f}</li>
        ))}
      </ul>
      {!isCurrentTier && tier.price > 0 && (
        <div style={{ minHeight: 45 }}>
          {process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? (
             <PayPalButtons
               style={{ layout: "horizontal", color: "blue", height: 40, tagline: false }}
               createOrder={async () => {
                 const token = await getToken();
                 return createPayPalOrder(token!, tier.id);
               }}
               onApprove={async (data) => {
                 try {
                   const token = await getToken();
                   await capturePayPalOrder(token!, data.orderID);
                   toast.success(`Successfully upgraded to ${tier.name}!`);
                   onUpgrade();
                 } catch (err: any) {
                   toast.error('Payment failed: ' + err.message);
                 }
               }}
             />
          ) : (
             <button
               style={{
                 width: '100%', padding: '10px 0', borderRadius: 10,
                 background: 'var(--surface-3)', color: 'var(--text-secondary)', border: 'none',
                 fontWeight: 600, fontSize: 14, cursor: 'not-allowed',
               }}
             >
               PayPal Not Configured
             </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function UsageDashboard() {
  const { getToken } = useAuth();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const [usageData, tiersData] = await Promise.all([
        fetchUsage(token),
        fetchPricingTiers(),
      ]);
      setUsage(usageData);
      setTiers(tiersData);
    } catch (err) {
      console.error('[UsageDashboard] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  if (!usage) return <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Unable to load usage data.</div>;

  const tierBadgeColors: Record<string, string> = {
    free: '#6b7280',
    pro: '#6366f1',
    team: '#8b5cf6',
    enterprise: '#f59e0b',
  };

  return (
    <div style={{ padding: '24px 0', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Usage & Billing</h2>
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: tierBadgeColors[usage.tier] || '#6b7280', color: 'white',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{usage.tier}</span>
      </div>

      {/* Usage Cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 36 }}>
        <UsageCard
          title="Tokens This Month"
          used={usage.tokens.used}
          limit={usage.tokens.limit}
          icon="🎯"
          color="#6366f1"
        />
        <UsageCard
          title="Sandboxes Today"
          used={usage.sandboxes.used}
          limit={usage.sandboxes.limit}
          icon="📦"
          color="#10b981"
        />
        <UsageCard
          title="Projects"
          used={usage.projects.current}
          limit={usage.projects.limit}
          icon="📁"
          color="#f59e0b"
        />
      </div>

      {/* Billing Cycle */}
      <div style={{
        background: 'var(--surface-1)', borderRadius: 12, padding: '14px 20px',
        border: '1px solid var(--border)', marginBottom: 36, fontSize: 13,
        color: 'var(--text-secondary)',
      }}>
        📅 Billing cycle started: <strong style={{ color: 'var(--text-primary)' }}>
          {new Date(usage.billingCycleStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </strong>
        {' • '}Resets monthly. Sandbox quota resets daily.
      </div>

      {/* Pricing Tiers */}
      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Plans</h3>
      <PayPalScriptProvider options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'test', currency: 'USD', intent: 'capture' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} isCurrentTier={tier.id === usage.tier} onUpgrade={loadData} />
          ))}
        </div>
      </PayPalScriptProvider>
    </div>
  );
}
