import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Zap, Droplet, Hammer, Brush, DoorOpen, Settings2,
  User, BarChart3, MapPin, Clock, Check, AlertCircle,
  Download, ChevronRight, X, LogOut, Loader2,
  CheckCircle2, AlertTriangle, Activity, FileSpreadsheet,
  Calendar, Hash, Eye, EyeOff, ShieldCheck, FileText,
  UserPlus, Users, Trash2, Plus
} from 'lucide-react';

// ================================================================
//  FONT LOADER — Geist (Vercel's premium UI font) + Geist Mono
// ================================================================
function useFonts() {
  useEffect(() => {
    if (document.getElementById('os-fonts')) return;
    const link = document.createElement('link');
    link.id = 'os-fonts';
    link.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);
}

// ================================================================
//  DESIGN TOKENS
// ================================================================
const C = {
  // surfaces
  bg: '#F5F5F3',          // app background — warm off-white
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAF8',
  border: '#EAEAE6',
  borderStrong: '#D9D9D3',

  // text
  ink: '#0A0A0A',
  ink2: '#525252',
  ink3: '#8A8A85',

  // brand — pulled directly from logo
  brand: '#144D29',
  brandDark: '#0A2E18',
  brandSoft: '#EAF1EC',
  brandText: '#144D29',

  // logo accent colors (used sparingly)
  lime: '#C9DB03',
  flame: '#D42E12',

  // semantic
  amber: '#A8610B',
  amberSoft: '#FBF1DE',
  red: '#8B1F1F',
  redSoft: '#FBEAEA',
};

const FONT = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// Company branding
const BRAND_NAME    = 'Pássaro Verde';
const BRAND_TAGLINE = 'Manutenção Predial';

// Persistence keys (window.storage)
const STORAGE_KEYS = {
  employees: 'pv_employees_v1',
  orders:    'pv_orders_v1',
};

// ================================================================
//  MOCK DATA
// ================================================================
const MANAGER_ID  = '11111';
const MANAGER_PWD = 'adm123';

const MANAGER = { id: '11111', name: 'Administrador', role: 'ADM', isManager: true };

// Initial roster — used only on first load when storage is empty
const INITIAL_EMPLOYEES = {
  '13090': { id: '13090', name: 'Diego de Araujo',          role: 'Manutenção Predial'  },
  '13408': { id: '13408', name: 'Ezio de Araujo',           role: 'Manutenção Predial'  },
  '12138': { id: '12138', name: 'Samuel Elias Feliciano',   role: 'Eletricista Predial' },
  '99999': { id: '99999', name: 'Leuanderson Pereira Lins', role: 'Serralheiro'         },
};

// ================================================================
//  GEOLOCATION — real device GPS with reverse geocoding
// ================================================================
async function captureRealLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 'unsupported', message: 'Seu dispositivo não suporta geolocalização' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        // Try reverse-geocoding via Nominatim (OpenStreetMap)
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=pt-BR`;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(t);
          if (res.ok) {
            const data = await res.json();
            const a = data.address || {};
            const street = a.road || a.pedestrian || a.path || a.cycleway || '';
            const number = a.house_number || '';
            const neighborhood = a.suburb || a.neighbourhood || a.quarter || a.residential || '';
            const city = a.city || a.town || a.village || a.municipality || a.county || '';
            const left = [street, number].filter(Boolean).join(', ');
            const right = [neighborhood, city].filter(Boolean).join(' — ');
            const composed = [left, right].filter(Boolean).join(' — ');
            if (composed) address = composed;
            else if (data.display_name) address = data.display_name;
          }
        } catch (e) {
          // ignore; use coords-only address
        }
        resolve({ lat: latitude, lng: longitude, address, accuracy });
      },
      (err) => {
        let message = 'Não foi possível capturar a localização';
        if (err.code === 1) message = 'Permissão de localização negada';
        else if (err.code === 2) message = 'Sinal de GPS indisponível';
        else if (err.code === 3) message = 'Tempo esgotado ao buscar localização';
        reject({ code: err.code, message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const SERVICE_TYPES = [
  { id: 'eletrica',   label: 'Elétrica',   Icon: Zap       },
  { id: 'hidraulica', label: 'Hidráulica', Icon: Droplet   },
  { id: 'alvenaria',  label: 'Alvenaria',  Icon: Hammer    },
  { id: 'pintura',    label: 'Pintura',    Icon: Brush     },
  { id: 'esquadrias', label: 'Esquadrias', Icon: DoorOpen  },
  { id: 'outros',     label: 'Outros',     Icon: Settings2 },
];
const SERVICE_MAP = Object.fromEntries(SERVICE_TYPES.map(s => [s.id, s]));

const YEAR = new Date().getFullYear();

const SEED_ORDERS = [];

// ================================================================
//  UTILS
// ================================================================
const sleep = ms => new Promise(r => setTimeout(r, ms));

function pad(n, w=3) { return String(n).padStart(w, '0'); }

function nextOSNumber(existing) {
  const max = existing
    .map(o => parseInt(o.osNumber.split('-').pop(), 10))
    .reduce((a,b) => Math.max(a,b), 0);
  return `OS-${YEAR}-${pad(max + 1)}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }).replace('.', '');
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}
function timeAgo(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}
function elapsed(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${pad(r,2)}m`;
}
function getInitials(name) {
  return name.split(' ').filter(Boolean).slice(0,2).map(p => p[0]).join('').toUpperCase();
}

// ----- productivity calculations -----

function getDurationMin(o) {
  if (!o.endedAt) return null;
  return Math.max(0, Math.round((new Date(o.endedAt) - new Date(o.startedAt)) / 60000));
}

function formatDurationMin(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${pad(r,2)}`;
}

function formatCoord(value, digits = 6) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '';
}

function avgDurationMin(orders) {
  const ds = orders.map(getDurationMin).filter(v => v != null);
  if (!ds.length) return null;
  return Math.round(ds.reduce((a,b) => a+b, 0) / ds.length);
}

function totalDurationMin(orders) {
  const ds = orders.map(getDurationMin).filter(v => v != null);
  if (!ds.length) return null;
  return ds.reduce((a,b) => a+b, 0);
}

function completionRate(orders) {
  const closed = orders.filter(o => o.status === 'concluido' || o.status === 'parcial');
  if (!closed.length) return null;
  const c = closed.filter(o => o.status === 'concluido').length;
  return Math.round(c / closed.length * 100);
}

// Period helpers — returns {start, end, label}
function getPeriodRange(period, customDate) {
  if (customDate) {
    const start = new Date(customDate + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const end = new Date();
  const start = new Date(end);
  if (period === 'today') {
    start.setHours(0,0,0,0);
  } else if (period === 'week') {
    start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
  } else if (period === 'month') {
    start.setDate(1); start.setHours(0,0,0,0);
  } else { // all
    return { start: new Date(0), end };
  }
  return { start, end };
}

function orderInRange(o, range) {
  const d = new Date(o.startedAt);
  return d >= range.start && d <= range.end;
}

// Daily counts for bar chart — last N days
function getDailySeries(orders, days = 7) {
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const count = orders.filter(o => {
      const od = new Date(o.startedAt);
      return od >= d && od < next;
    }).length;
    out.push({ date: d, count });
  }
  return out;
}

const WEEKDAY_SHORT = ['D','S','T','Q','Q','S','S'];

function generateCSV(orders) {
  const headers = ['Número OS','Funcionário','Matrícula','Tipo de Serviço','Descrição do Serviço','Endereço','Latitude','Longitude','Início','Encerramento','Status','Observações'];
  const statusLabel = { em_andamento:'Em andamento', concluido:'Concluído', parcial:'Parcial' };
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = orders.map(o => [
    o.osNumber,
    o.employeeName,
    o.employeeId,
    SERVICE_MAP[o.serviceType]?.label || o.serviceType,
    o.description || '',
    o.address,
    formatCoord(o.coords?.lat, 6),
    formatCoord(o.coords?.lng, 6),
    o.startedAt ? new Date(o.startedAt).toLocaleString('pt-BR') : '',
    o.endedAt   ? new Date(o.endedAt).toLocaleString('pt-BR')   : '',
    statusLabel[o.status],
    o.observations || '',
  ].map(escape).join(','));
  return [headers.map(escape).join(','), ...rows].join('\n');
}

function downloadCSV(orders) {
  const csv = generateCSV(orders);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ordens-servico-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_META = {
  em_andamento: { label: 'Em andamento', fg: C.amber,    bg: C.amberSoft,  dot: '#D97706' },
  concluido:    { label: 'Concluído',    fg: C.brand,    bg: C.brandSoft,  dot: '#10B981' },
  parcial:      { label: 'Parcial',      fg: C.red,      bg: C.redSoft,    dot: '#D97706' },
};

// ================================================================
//  PERSISTENT STORAGE — uses window.storage when available, falls
//  back gracefully if not. Data is shared across all users of the
//  artifact, simulating a real backend.
// ================================================================
const safeStorage = {
  async get(key) {
    try {
      if (window.storage?.get) {
        const res = await window.storage.get(key, true);
        return res?.value ? JSON.parse(res.value) : null;
      }
      const raw = window.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;  // key doesn't exist or storage unavailable
    }
  },
  async set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      if (window.storage?.set) {
        await window.storage.set(key, serialized, true);
      } else {
        window.localStorage?.setItem(key, serialized);
      }
      return true;
    } catch (e) {
      console.error('Storage save failed:', e);
      return false;
    }
  },
};

function usePersistedState(key, initialValue) {
  const [state, setState]   = useState(initialValue);
  const [loaded, setLoaded] = useState(false);
  const skipNextSave        = useRef(true);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await safeStorage.get(key);
      if (cancelled) return;
      if (stored !== null) {
        skipNextSave.current = true;
        setState(stored);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [key]);

  // Save on changes (but not on initial load)
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    safeStorage.set(key, state);
  }, [state, loaded, key]);

  return [state, setState, loaded];
}

// ================================================================
//  STYLE INJECTION — keyframes & global resets we need
// ================================================================
function GlobalStyles() {
  return (
    <style>{`
      *, *::before, *::after { box-sizing: border-box; }
      .flex { display: flex; }
      .inline-flex { display: inline-flex; }
      .items-center { align-items: center; }
      .items-start { align-items: flex-start; }
      .justify-between { justify-content: space-between; }
      .justify-center { justify-content: center; }
      .gap-1 { gap: 4px; }
      .gap-1\.5 { gap: 6px; }
      .gap-2 { gap: 8px; }
      .gap-3 { gap: 12px; }
      .w-full { width: 100%; }
      .rounded-full { border-radius: 9999px; }
      .rounded-2xl { border-radius: 16px; }
      .font-medium { font-weight: 500; }
      .select-none { user-select: none; }
      .os-root { font-family: ${FONT}; font-feature-settings: "cv11","ss01","ss03"; letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
      .os-mono { font-family: ${MONO}; letter-spacing: 0; font-feature-settings: "zero","ss01"; }
      .os-tap { transition: transform 140ms cubic-bezier(.2,.8,.2,1), background-color 140ms, border-color 140ms, box-shadow 200ms; }
      .os-tap:active { transform: scale(0.97); }
      .os-press { transition: transform 120ms cubic-bezier(.2,.8,.2,1); }
      .os-press:active { transform: scale(0.985); }
      .os-fade-in { animation: osFade 360ms cubic-bezier(.2,.8,.2,1) both; }
      .os-slide-up { animation: osSlide 360ms cubic-bezier(.2,.8,.2,1) both; }
      .os-rise { animation: osRise 480ms cubic-bezier(.2,.8,.2,1) both; }
      @keyframes osFade { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }
      @keyframes osSlide { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform:none; } }
      @keyframes osRise { from { opacity:0; transform: translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
      @keyframes osPulse { 0%,100%{opacity:.4} 50%{opacity:1} }
      .os-pulse { animation: osPulse 1.6s ease-in-out infinite; }
      .os-stagger > * { opacity: 0; animation: osSlide 460ms cubic-bezier(.2,.8,.2,1) forwards; }
      .os-stagger > *:nth-child(1){ animation-delay: 40ms; }
      .os-stagger > *:nth-child(2){ animation-delay: 110ms; }
      .os-stagger > *:nth-child(3){ animation-delay: 180ms; }
      .os-stagger > *:nth-child(4){ animation-delay: 250ms; }
      .os-stagger > *:nth-child(5){ animation-delay: 320ms; }
      .os-stagger > *:nth-child(6){ animation-delay: 390ms; }
      .os-stagger > *:nth-child(7){ animation-delay: 460ms; }
      .os-stagger > *:nth-child(8){ animation-delay: 530ms; }
      @keyframes checkDraw { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
      @keyframes checkCircle { from { stroke-dashoffset: 188; } to { stroke-dashoffset: 0; } }
      .check-circle { stroke-dasharray: 188; animation: checkCircle 520ms cubic-bezier(.5,.2,.3,1.1) forwards; }
      .check-path { stroke-dasharray: 60; stroke-dashoffset: 60; animation: checkDraw 320ms cubic-bezier(.5,.2,.3,1) 320ms forwards; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .os-spin { animation: spin 0.9s linear infinite; }
      .os-card-shadow { box-shadow: 0 1px 2px rgba(15,23,18,.04), 0 4px 14px rgba(15,23,18,.04); }
      .os-card-shadow-lg { box-shadow: 0 1px 2px rgba(15,23,18,.06), 0 8px 28px rgba(15,23,18,.07); }
      .os-wallet-shadow { box-shadow: 0 1px 2px rgba(7,34,24,.18), 0 18px 40px -8px rgba(7,34,24,.42); }
      .os-input:focus { outline: none; border-color: ${C.brand}; box-shadow: 0 0 0 4px ${C.brandSoft}; }
      .os-tab-btn { transition: color 180ms ease; }
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      .os-divider { background: linear-gradient(to right, transparent, ${C.border}, transparent); }
      .os-noise { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px); background-size: 4px 4px; }
      .os-gradient-line { background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); }
    `}</style>
  );
}

// ================================================================
//  ATOMS
// ================================================================
function Avatar({ name, size = 40, tone = 'light' }) {
  const initials = name ? getInitials(name) : '—';
  const isDark = tone === 'dark';
  return (
    <div
      className="flex items-center justify-center rounded-full font-medium select-none"
      style={{
        width: size, height: size,
        background: isDark ? 'rgba(255,255,255,.12)' : C.brandSoft,
        color: isDark ? '#fff' : C.brand,
        fontSize: size * 0.36,
        letterSpacing: '-0.02em',
        border: isDark ? '1px solid rgba(255,255,255,.18)' : `1px solid ${C.border}`,
      }}
    >
      {initials}
    </div>
  );
}

function StatusBadge({ status, size = 'sm' }) {
  const m = STATUS_META[status];
  if (!m) return null;
  const pad = size === 'lg' ? '6px 12px' : '4px 10px';
  const fs = size === 'lg' ? 13 : 12;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-medium"
      style={{ background: m.bg, color: m.fg, padding: pad, fontSize: fs, letterSpacing:'-0.005em' }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 999, background: m.fg,
        boxShadow: status === 'em_andamento' ? `0 0 0 3px ${m.bg}` : 'none',
      }} className={status === 'em_andamento' ? 'os-pulse' : ''} />
      {m.label}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, tone = 'brand', loading, type='button' }) {
  const isLight = tone === 'light';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="os-tap inline-flex items-center justify-center gap-2 w-full rounded-2xl font-medium"
      style={{
        height: 56,
        background: disabled ? '#C9C9C4' : (isLight ? '#fff' : C.brand),
        color: isLight ? C.brand : '#fff',
        border: isLight ? `1px solid ${C.border}` : 'none',
        fontSize: 16,
        letterSpacing: '-0.01em',
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        boxShadow: isLight ? 'none' : '0 1px 2px rgba(7,34,24,.18), 0 6px 14px -4px rgba(7,34,24,.28)',
      }}
    >
      {loading
        ? <Loader2 size={18} className="os-spin" />
        : children}
    </button>
  );
}

function Spinner({ size = 18, color = C.brand }) {
  return <Loader2 size={size} className="os-spin" style={{ color }} />;
}

// ================================================================
//  LOGO — inline SVG of the company bird mark
//  Colors: dark green body+tail, lime wing, flame red crest line
// ================================================================
function Logo({ width = 80, tone = 'color' }) {
  // viewBox tightly cropped to the actual logo geometry
  const VB = '5400 13300 9500 3300';
  const ASPECT = 9500 / 3300;
  const height = width / ASPECT;

  const monoColor = tone === 'white' ? '#FFFFFF' : tone === 'mono' ? C.brand : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={VB}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display:'block', flexShrink: 0 }}
      aria-label={`Logotipo ${BRAND_NAME}`}
    >
      {/* dark green tail */}
      <path
        d="M12247.53 16478.75c0,0 -488.87,-1120.12 2478.66,-1937.57l-644.26 0.01c0,0 -170.14,-184.96 -438.41,-184.96l-2216.16 0 228.38 1882.6 510.3 218.79 81.49 21.13z"
        fill={monoColor || '#144D29'}
      />
      {/* lime body */}
      <path
        d="M12247.53 16478.75c0,0 -814.53,-450.94 -454.7,-1283.27 1292.38,-2989.42 -5533.27,-1693.8 -5533.27,-1693.8 914.03,-44.82 2597.68,100.98 3545.61,1501.62 947.94,1400.65 2442.37,1475.45 2442.37,1475.45l-0.01 0z"
        fill={monoColor || '#C9DB03'}
      />
      {/* flame red crest */}
      <path
        d="M7926.47 13682.29c2810.31,-227 3549.33,486.5 3549.33,486.5 -1013.21,-1145.57 -5216.25,-667.1 -5216.25,-667.1 435.3,-21.35 1045.13,0.54 1666.92,180.6l0 0z"
        fill={monoColor || '#D42E12'}
      />
    </svg>
  );
}

// Brand lockup: logo + wordmark (for header bars)
function BrandLockup({ size = 'sm', tone = 'color' }) {
  const isLg = size === 'lg';
  const logoW = isLg ? 110 : 64;
  const isDark = tone === 'white';
  return (
    <div className="flex items-center" style={{ gap: isLg ? 14 : 10 }}>
      <Logo width={logoW} tone={tone} />
      <div style={{ display:'flex', flexDirection:'column', lineHeight: 1 }}>
        <span style={{
          fontSize: isLg ? 22 : 15,
          fontWeight: 600,
          color: isDark ? '#fff' : C.ink,
          letterSpacing: '-0.025em',
        }}>{BRAND_NAME}</span>
        {isLg && (
          <span style={{
            fontSize: 12,
            color: isDark ? 'rgba(255,255,255,.65)' : C.ink3,
            marginTop: 4,
            fontWeight: 500,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}>{BRAND_TAGLINE}</span>
        )}
      </div>
    </div>
  );
}

// Time-aware greeting
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function SuccessCheck({ size = 84 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" style={{ display:'block' }}>
      <circle
        cx="44" cy="44" r="30" fill="none"
        stroke={C.brand} strokeWidth="3.5" strokeLinecap="round"
        className="check-circle"
        transform="rotate(-90 44 44)"
      />
      <path
        d="M30 45 L40 55 L58 35"
        fill="none" stroke={C.brand} strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round"
        className="check-path"
      />
    </svg>
  );
}

function ServiceIconChip({ id, size = 44, tone = 'light' }) {
  const meta = SERVICE_MAP[id];
  const Icon = meta?.Icon || Settings2;
  const dark = tone === 'dark';
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{
        width: size, height: size,
        background: dark ? 'rgba(255,255,255,.10)' : C.brandSoft,
        border: dark ? '1px solid rgba(255,255,255,.14)' : `1px solid ${C.border}`,
      }}
    >
      <Icon size={size * 0.45} color={dark ? '#fff' : C.brand} strokeWidth={1.8} />
    </div>
  );
}

// ================================================================
//  HEADER (worker view) — brand on left, identity + logout on right
// ================================================================
function WorkerHeader({ employee, onLogout }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '8px 20px 0' }}>
      <BrandLockup size="sm" />
      <div className="flex items-center gap-2">
        <Avatar name={employee.name} size={32} />
        <button
          onClick={onLogout}
          className="os-tap rounded-full flex items-center justify-center"
          style={{ width: 32, height: 32, background: C.surface, border: `1px solid ${C.border}`, cursor:'pointer' }}
          aria-label="Sair"
        >
          <LogOut size={14} color={C.ink2} />
        </button>
      </div>
    </div>
  );
}

// ================================================================
//  LOGIN VIEW
// ================================================================
function LoginView({ onLogin, employees }) {
  const [matricula, setMatricula]     = useState('');
  const [password, setPassword]       = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const inputRef  = useRef(null);
  const pwdRef    = useRef(null);

  const isManagerMatricula = matricula === MANAGER_ID;

  useEffect(() => { inputRef.current?.focus(); }, []);

  // When manager matricula typed, jump focus to password
  useEffect(() => {
    if (isManagerMatricula) {
      setTimeout(() => pwdRef.current?.focus(), 80);
    }
  }, [isManagerMatricula]);

  async function submit() {
    const canSubmit = isManagerMatricula
      ? matricula.length >= 4 && password.length >= 1
      : matricula.length >= 4;
    if (!canSubmit) return;
    setLoading(true); setError('');
    await sleep(700);

    if (isManagerMatricula) {
      if (password !== MANAGER_PWD) {
        setError('Senha incorreta');
        setLoading(false);
        return;
      }
      onLogin(MANAGER);
      return;
    }

    const emp = employees[matricula];
    if (!emp) {
      setError('Matrícula não encontrada');
      setLoading(false);
      return;
    }
    onLogin(emp);
  }

  const canContinue = isManagerMatricula
    ? matricula.length >= 4 && password.length >= 1
    : matricula.length >= 4;

  return (
    <div className="os-fade-in" style={{ padding: '56px 24px 28px', flex:1, display:'flex', flexDirection:'column' }}>
      <div style={{ marginBottom: 36 }}>
        <div style={{ marginBottom: 32 }}>
          <BrandLockup size="lg" tone="color" />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, color: C.ink, lineHeight: 1.1, letterSpacing: '-0.025em', margin: 0 }}>
          {getGreeting()}.
        </h1>
        <p style={{ fontSize: 17, color: C.ink2, marginTop: 10, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
          Informe sua matrícula para continuar.
        </p>
      </div>

      {/* Matricula */}
      <div>
        <label style={{ fontSize: 12, color: C.ink3, fontWeight: 500, textTransform:'uppercase', letterSpacing:'.08em' }}>
          Matrícula
        </label>
        <input
          ref={inputRef}
          className="os-input os-mono"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={matricula}
          onChange={(e) => { setMatricula(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); setPassword(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (isManagerMatricula) { pwdRef.current?.focus(); }
              else { submit(); }
            }
          }}
          placeholder="00000"
          style={{
            width: '100%',
            marginTop: 10,
            fontSize: 28,
            fontWeight: 500,
            color: C.ink,
            padding: '20px 22px',
            border: `1.5px solid ${error && !isManagerMatricula ? C.red : isManagerMatricula ? C.brand : C.border}`,
            borderRadius: 16,
            background: C.surface,
            letterSpacing: '0.1em',
            transition: 'border-color 180ms, box-shadow 180ms',
          }}
        />
      </div>

      {/* Password — only for manager */}
      {isManagerMatricula && (
        <div className="os-fade-in" style={{ marginTop: 16 }}>
          <div className="flex items-center gap-2" style={{
            padding: '8px 12px', borderRadius: 10,
            background: C.brandSoft, marginBottom: 12,
            border: `1px solid ${C.brand}22`,
          }}>
            <ShieldCheck size={14} color={C.brand} />
            <span style={{ fontSize: 12, color: C.brandText, fontWeight: 500 }}>
              Acesso restrito — Painel do Administrador
            </span>
          </div>
          <label style={{ fontSize: 12, color: C.ink3, fontWeight: 500, textTransform:'uppercase', letterSpacing:'.08em' }}>
            Senha
          </label>
          <div style={{ position:'relative', marginTop: 10 }}>
            <input
              ref={pwdRef}
              className="os-input"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="••••••••"
              style={{
                width: '100%',
                fontSize: 18,
                fontWeight: 500,
                color: C.ink,
                padding: '18px 50px 18px 20px',
                border: `1.5px solid ${error ? C.red : C.border}`,
                borderRadius: 16,
                background: C.surface,
                letterSpacing: '0.18em',
                transition: 'border-color 180ms, box-shadow 180ms',
              }}
            />
            <button
              onClick={() => setShowPwd(v => !v)}
              style={{
                position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color: C.ink3,
                padding: 4,
              }}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="os-fade-in flex items-center gap-2" style={{ marginTop: 12, color: C.red, fontSize: 13 }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <PrimaryButton onClick={submit} loading={loading} disabled={!canContinue}>
          {isManagerMatricula ? 'Entrar no Painel' : 'Continuar'}
          <ChevronRight size={18} />
        </PrimaryButton>
      </div>

      {/* Footer mark */}
      <div style={{ marginTop: 'auto', paddingTop: 36, textAlign:'center' }}>
        <div className="os-mono" style={{ fontSize: 11, color: C.ink3, letterSpacing:'.08em' }}>
          {BRAND_NAME.toUpperCase()} · v1.0
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  ACTIVE OS — WALLET-STYLE CARD
// ================================================================
function ActiveOSCard({ order, onEnd, tick }) {
  const meta = SERVICE_MAP[order.serviceType];
  return (
    <div className="os-rise os-wallet-shadow" style={{
      borderRadius: 24,
      background: `linear-gradient(155deg, ${C.brand} 0%, ${C.brandDark} 100%)`,
      color: '#fff',
      padding: '22px 22px 18px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* texture overlay */}
      <div className="os-noise" style={{
        position:'absolute', inset:0, opacity:.5, pointerEvents:'none',
      }} />
      <div className="os-gradient-line" style={{
        position:'absolute', top:0, left:0, right:0, height:1,
      }} />

      {/* logo watermark — bottom right, low opacity (Apple Wallet style) */}
      <div style={{
        position:'absolute', bottom: 84, right: 18, opacity: .22,
        pointerEvents:'none',
      }}>
        <Logo width={80} tone="white" />
      </div>
      <div className="flex items-start justify-between" style={{ position:'relative' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.12em', fontWeight: 500 }}>
            Ordem de serviço
          </div>
          <div className="os-mono" style={{ fontSize: 17, fontWeight: 500, marginTop: 4, color:'#fff', letterSpacing: '0.02em' }}>
            {order.osNumber}
          </div>
        </div>
        <ServiceIconChip id={order.serviceType} size={44} tone="dark" />
      </div>

      <div style={{ position:'relative', marginTop: 28 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.12em', fontWeight: 500 }}>
          Tipo de serviço
        </div>
        <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6, letterSpacing: '-0.02em', color:'#fff' }}>
          {meta?.label}
        </div>
        {order.description && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', marginTop: 8, lineHeight: 1.45 }}>
            {order.description}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2" style={{ position:'relative', marginTop: 18, color:'rgba(255,255,255,.85)' }}>
        <MapPin size={14} strokeWidth={1.8} />
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{order.address}</div>
      </div>

      <div className="flex items-center justify-between" style={{
        position:'relative', marginTop: 18, paddingTop: 16,
        borderTop: '1px solid rgba(255,255,255,.14)',
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.12em', fontWeight: 500 }}>
            Início
          </div>
          <div className="os-mono" style={{ fontSize: 14, color:'#fff', marginTop: 4 }}>
            {formatTime(order.startedAt)}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', textTransform:'uppercase', letterSpacing:'.12em', fontWeight: 500 }}>
            Em andamento
          </div>
          <div className="os-mono" style={{ fontSize: 14, color:'#fff', marginTop: 4 }}>
            {elapsed(order.startedAt)}
          </div>
        </div>
      </div>

      <button
        onClick={onEnd}
        className="os-tap"
        style={{
          marginTop: 18, width:'100%', position:'relative',
          background: '#fff', color: C.brand, fontWeight: 600,
          fontSize: 15, height: 50, borderRadius: 14, border: 'none',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap: 8,
          letterSpacing: '-0.01em',
        }}
      >
        Encerrar serviço
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ================================================================
//  WORKER HOME
// ================================================================
function WorkerHome({ employee, orders, onStart, onEnd, onLogout, tick }) {
  const myOrders = orders.filter(o => o.employeeId === employee.id);
  const active = myOrders.find(o => o.status === 'em_andamento');
  const history = myOrders.filter(o => o.status !== 'em_andamento')
    .sort((a,b) => new Date(b.endedAt) - new Date(a.endedAt));

  const completedToday = history.filter(o => {
    const d = new Date(o.endedAt);
    const t = new Date();
    return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
  }).length;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
      <WorkerHeader employee={employee} onLogout={onLogout} />

      <div style={{ padding: '24px 20px 6px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.ink3, letterSpacing:'.1em', textTransform:'uppercase', fontWeight: 500 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })}
          </span>
          <span style={{ color: C.borderStrong }}>·</span>
          <span className="os-mono" style={{ fontSize: 11, color: C.ink3, fontWeight: 500 }}>
            #{employee.id}
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.1, letterSpacing: '-0.025em', margin: 0 }}>
          {getGreeting()}, {employee.name.split(' ')[0]}.
        </h1>
        <p style={{ fontSize: 15, color: C.ink2, marginTop: 6, lineHeight: 1.45 }}>
          {active ? 'Você tem uma ordem em andamento.' : 'Pronto para começar um novo atendimento?'}
        </p>
      </div>

      <div style={{ padding: '8px 20px 0' }}>
        <div className="os-rise os-card-shadow flex items-center justify-between" style={{
          background: C.surface, border:`1px solid ${C.border}`,
          borderRadius: 18, padding: '14px 16px',
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>Hoje</div>
            <div style={{ fontSize: 14, color: C.ink, marginTop: 2 }}>
              <span className="os-mono" style={{ fontSize: 18, fontWeight: 600 }}>{completedToday}</span>
              <span style={{ color: C.ink2, fontSize: 13, marginLeft: 6 }}>encerradas</span>
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: C.border }} />
          <div>
            <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>Total</div>
            <div style={{ fontSize: 14, color: C.ink, marginTop: 2 }}>
              <span className="os-mono" style={{ fontSize: 18, fontWeight: 600 }}>{myOrders.length}</span>
              <span style={{ color: C.ink2, fontSize: 13, marginLeft: 6 }}>ordens</span>
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: C.border }} />
          <div>
            <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>Status</div>
            <div style={{ fontSize: 13, color: active ? C.amber : C.brand, marginTop: 4, fontWeight: 500 }}>
              {active ? 'Em campo' : 'Disponível'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '22px 20px 0' }}>
        {active ? (
          <ActiveOSCard order={active} onEnd={() => onEnd(active)} tick={tick} />
        ) : (
          <button
            onClick={onStart}
            className="os-tap os-card-shadow"
            style={{
              width:'100%', background: C.brand, color:'#fff',
              borderRadius: 20, padding: '22px 22px',
              border:'none', textAlign:'left', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'space-between',
              position:'relative', overflow:'hidden',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.12em', fontWeight: 500 }}>
                Nova ordem
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color:'#fff', marginTop: 8, letterSpacing:'-0.02em' }}>
                Iniciar serviço
              </div>
              <div style={{ fontSize: 13, color:'rgba(255,255,255,.7)', marginTop: 6 }}>
                Capturamos a localização automaticamente.
              </div>
            </div>
            <div className="flex items-center justify-center rounded-full" style={{
              width: 44, height: 44, background: 'rgba(255,255,255,.16)',
            }}>
              <ChevronRight size={20} color="#fff" />
            </div>
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div style={{ padding: '32px 20px 24px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, margin: 0 }}>
              Suas ordens recentes
            </h2>
            <span className="os-mono" style={{ fontSize: 12, color: C.ink3 }}>{history.length}</span>
          </div>
          <div className="os-stagger" style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {history.slice(0, 8).map(o => (
              <HistoryRow key={o.id} order={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ order }) {
  const meta = SERVICE_MAP[order.serviceType];
  return (
    <div className="os-card-shadow flex items-center gap-3" style={{
      background: C.surface, border:`1px solid ${C.border}`,
      borderRadius: 16, padding: '12px 14px',
    }}>
      <ServiceIconChip id={order.serviceType} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
          <div style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>{meta?.label}</div>
          <span className="os-mono" style={{ fontSize: 11, color: C.ink3 }}>{order.osNumber}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div style={{ fontSize: 12, color: C.ink3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {order.address}
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  START SERVICE FLOW (modal sheet) — real GPS
// ================================================================
function StartServiceSheet({ open, onClose, onConfirm, employee }) {
  const [selected, setSelected]         = useState(null);
  const [description, setDescription]   = useState('');
  const [step, setStep]                 = useState('select'); // select | locating | location-error | success
  const [location, setLocation]         = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [manualAddress, setManualAddress] = useState('');
  const DESC_MAX = 300;

  useEffect(() => {
    if (open) {
      setSelected(null); setDescription(''); setStep('select');
      setLocation(null); setLocationError(null); setManualAddress('');
    }
  }, [open]);

  const canStart = selected && description.trim().length >= 5;

  async function start() {
    if (step === 'select' && !canStart) return;
    setStep('locating');
    setLocationError(null);
    try {
      const loc = await captureRealLocation();
      setLocation(loc);
      setStep('success');
      await sleep(1100);
      onConfirm({ serviceType: selected, description: description.trim(), location: loc });
    } catch (err) {
      setLocationError(err.message || 'Erro de localização');
      setStep('location-error');
    }
  }

  async function useManualAddress() {
    const addr = manualAddress.trim();
    if (addr.length < 5) return;
    const loc = { lat: null, lng: null, address: addr, manual: true };
    setLocation(loc);
    setStep('success');
    await sleep(1100);
    onConfirm({ serviceType: selected, description: description.trim(), location: loc });
  }

  if (!open) return null;

  return (
    <Sheet onClose={step === 'select' ? onClose : undefined} title="Iniciar ordem de serviço">
      {step === 'select' && (
        <div className="os-fade-in" style={{ display:'flex', flexDirection:'column', flex:1 }}>
          <p style={{ fontSize: 14, color: C.ink2, lineHeight: 1.5, margin: '4px 0 18px' }}>
            Selecione o tipo e descreva o serviço a ser realizado.
          </p>

          {/* Service type grid */}
          <div style={{ fontSize: 12, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 10 }}>
            Tipo de serviço
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
            {SERVICE_TYPES.map(s => {
              const active = selected === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className="os-tap"
                  style={{
                    padding: '14px 12px', borderRadius: 14,
                    background: active ? C.brand : C.surface,
                    color: active ? '#fff' : C.ink,
                    border: `1.5px solid ${active ? C.brand : C.border}`,
                    cursor:'pointer',
                    display:'flex', alignItems:'center', gap: 10,
                    transition: 'all 200ms',
                  }}
                >
                  <s.Icon size={18} strokeWidth={1.8} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Description field */}
          <div style={{ marginTop: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
                Descrição do serviço
              </span>
              <span className="os-mono" style={{ fontSize: 11, color: description.length > DESC_MAX ? C.red : C.ink3 }}>
                {description.length}/{DESC_MAX}
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
              placeholder="Ex.: Substituição do disjuntor geral e revisão do quadro elétrico do 3º andar."
              rows={4}
              style={{
                width:'100%',
                padding: '12px 14px', fontSize: 14, lineHeight: 1.5,
                border:`1.5px solid ${C.border}`, borderRadius: 14,
                background: C.surfaceAlt, color: C.ink,
                fontFamily: FONT, resize:'none',
                transition: 'border-color 180ms',
              }}
              className="os-input"
            />
            <div style={{ fontSize: 11, color: C.ink3, marginTop: 6 }}>
              Mínimo 5 caracteres. Será registrado junto com a OS.
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 20 }}>
            <PrimaryButton onClick={start} disabled={!canStart}>
              Iniciar agora
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 'locating' && (
        <div className="os-fade-in" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px' }}>
          <div style={{ position:'relative', width: 88, height: 88, marginBottom: 28 }}>
            <div style={{
              position:'absolute', inset:0, borderRadius:'50%',
              background: C.brandSoft,
            }} />
            <div style={{
              position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <MapPin size={32} color={C.brand} strokeWidth={1.8} />
            </div>
            <Spinner size={88} />
          </div>
          <div style={{ fontSize: 17, color: C.ink, fontWeight: 600, letterSpacing:'-0.02em' }}>
            Capturando localização
          </div>
          <div style={{ fontSize: 14, color: C.ink2, marginTop: 6, textAlign:'center', maxWidth: 280 }}>
            Permita o acesso ao GPS no seu navegador. Pode levar alguns segundos…
          </div>
        </div>
      )}

      {step === 'location-error' && (
        <div className="os-fade-in" style={{ flex:1, display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 16px 24px' }}>
            <div style={{ position:'relative', width: 72, height: 72, marginBottom: 18 }}>
              <div style={{
                position:'absolute', inset:0, borderRadius:'50%',
                background: C.amberSoft,
              }} />
              <div style={{
                position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <AlertCircle size={30} color={C.amber} strokeWidth={1.8} />
              </div>
            </div>
            <div style={{ fontSize: 16, color: C.ink, fontWeight: 600, textAlign:'center', letterSpacing:'-0.01em' }}>
              {locationError}
            </div>
            <div style={{ fontSize: 13, color: C.ink2, marginTop: 6, textAlign:'center', maxWidth: 290, lineHeight: 1.5 }}>
              Tente novamente ou informe o endereço manualmente abaixo.
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.08em', fontWeight: 500 }}>
                Endereço (digite manualmente)
              </label>
              <input
                type="text"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="Ex.: Av. Paulista, 1500 — São Paulo"
                className="os-input"
                style={{
                  width:'100%', marginTop: 6,
                  padding: '12px 14px', fontSize: 14,
                  border:`1.5px solid ${C.border}`, borderRadius: 12,
                  background: C.surfaceAlt, color: C.ink,
                  fontFamily: FONT,
                  transition: 'border-color 180ms',
                }}
              />
            </div>
            <div style={{ display:'flex', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => setStep('select')}
                className="os-tap"
                style={{
                  flex: 1, padding: '14px',
                  borderRadius: 14, border:`1px solid ${C.border}`,
                  background: C.surface, color: C.ink2, fontWeight: 500,
                  fontSize: 14, cursor:'pointer',
                }}
              >
                Voltar
              </button>
              <button
                onClick={start}
                className="os-tap"
                style={{
                  flex: 1, padding: '14px',
                  borderRadius: 14, border:'none',
                  background: C.ink, color:'#fff', fontWeight: 500,
                  fontSize: 14, cursor:'pointer',
                }}
              >
                Tentar GPS de novo
              </button>
            </div>
            {manualAddress.trim().length >= 5 && (
              <button
                onClick={useManualAddress}
                className="os-tap os-fade-in"
                style={{
                  width:'100%', padding: '14px',
                  borderRadius: 14, border:`1.5px solid ${C.brand}`,
                  background: C.brand, color:'#fff', fontWeight: 600,
                  fontSize: 14, cursor:'pointer',
                }}
              >
                Usar endereço informado
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="os-fade-in" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px' }}>
          <SuccessCheck />
          <div style={{ fontSize: 20, color: C.ink, fontWeight: 600, marginTop: 24, letterSpacing:'-0.02em' }}>
            Ordem iniciada
          </div>
          {location && (
            <div className="flex items-center gap-1.5" style={{ marginTop: 10, color: C.ink2, fontSize: 13, textAlign:'center', maxWidth: 290 }}>
              <MapPin size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {(location.address || '').split('—')[0].trim() || 'Localização registrada'}
              </span>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ================================================================
//  END SERVICE FLOW (modal sheet)
// ================================================================
function EndServiceSheet({ open, onClose, onConfirm, order }) {
  const [status, setStatus] = useState(null);
  const [obs, setObs] = useState('');
  const [step, setStep] = useState('form'); // 'form' | 'saving' | 'success'
  const MAX = 240;

  useEffect(() => {
    if (open) { setStatus(null); setObs(''); setStep('form'); }
  }, [open]);

  async function save() {
    if (!status) return;
    setStep('saving');
    await sleep(800);
    setStep('success');
    await sleep(1000);
    onConfirm({ status, observations: obs.trim() });
  }

  if (!open) return null;

  return (
    <Sheet onClose={step === 'form' ? onClose : undefined} title="Encerrar ordem de serviço">
      {step === 'form' && order && (
        <div className="os-fade-in" style={{ display:'flex', flexDirection:'column', flex:1 }}>
          <div className="flex items-center gap-3" style={{
            background: C.surfaceAlt, border:`1px solid ${C.border}`,
            borderRadius: 14, padding: '12px 14px', marginBottom: 22,
          }}>
            <ServiceIconChip id={order.serviceType} size={36} />
            <div style={{ flex:1, minWidth:0 }}>
              <div className="os-mono" style={{ fontSize: 11, color: C.ink3 }}>{order.osNumber}</div>
              <div style={{ fontSize: 14, color: C.ink, fontWeight: 500, marginTop: 1 }}>
                {SERVICE_MAP[order.serviceType]?.label}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.ink2 }} className="os-mono">{elapsed(order.startedAt)}</div>
          </div>

          <div style={{ fontSize: 12, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 10 }}>
            Status do serviço
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap: 10, marginBottom: 22 }}>
            {[
              { id:'concluido', label:'Concluído',  desc:'Serviço finalizado com sucesso.',           Icon: CheckCircle2, color: C.brand },
              { id:'parcial',   label:'Parcial',    desc:'Serviço iniciado, retorno necessário.',     Icon: AlertTriangle, color: C.amber },
            ].map(opt => {
              const active = status === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setStatus(opt.id)}
                  className="os-tap"
                  style={{
                    padding: '14px 16px',
                    borderRadius: 16,
                    background: active ? C.brandSoft : C.surface,
                    border: `1.5px solid ${active ? C.brand : C.border}`,
                    cursor:'pointer', textAlign:'left',
                    display:'flex', alignItems:'center', gap: 14,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: active ? '#fff' : C.surfaceAlt,
                    border: `1px solid ${active ? C.brand : C.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <opt.Icon size={20} color={opt.color} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: C.ink, letterSpacing:'-0.01em' }}>{opt.label}</div>
                    <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 2 }}>{opt.desc}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: `1.5px solid ${active ? C.brand : C.borderStrong}`,
                    background: active ? C.brand : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 180ms',
                  }}>
                    {active && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 10 }}>
            Observações <span style={{ textTransform:'none', letterSpacing:0, color: C.ink3, fontWeight: 400 }}>(opcional)</span>
          </div>
          <div style={{ position:'relative' }}>
            <textarea
              className="os-input"
              value={obs}
              onChange={(e) => setObs(e.target.value.slice(0, MAX))}
              placeholder="Detalhes adicionais sobre o serviço…"
              rows={4}
              style={{
                width: '100%', padding: '14px 16px', paddingBottom: 32,
                border: `1.5px solid ${C.border}`, borderRadius: 14,
                fontFamily: FONT, fontSize: 14, color: C.ink, resize:'none',
                background: C.surface, lineHeight: 1.5,
                transition: 'border-color 180ms, box-shadow 180ms',
              }}
            />
            <div className="os-mono" style={{
              position:'absolute', bottom: 10, right: 14,
              fontSize: 11, color: C.ink3, letterSpacing:'0.02em',
            }}>
              {obs.length}/{MAX}
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 22 }}>
            <PrimaryButton onClick={save} disabled={!status}>
              Encerrar serviço
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="os-fade-in" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 24px' }}>
          <Spinner size={40} />
          <div style={{ fontSize: 15, color: C.ink2, marginTop: 18 }}>Encerrando ordem…</div>
        </div>
      )}

      {step === 'success' && (
        <div className="os-fade-in" style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 24px' }}>
          <SuccessCheck />
          <div style={{ fontSize: 20, color: C.ink, fontWeight: 600, marginTop: 24, letterSpacing:'-0.02em' }}>
            Serviço encerrado
          </div>
          <div style={{ fontSize: 14, color: C.ink2, marginTop: 8 }}>
            Os dados foram enviados ao painel.
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ================================================================
//  SHEET (bottom modal)
// ================================================================
function Sheet({ children, onClose, title }) {
  return (
    <div
      onClick={onClose}
      style={{
        position:'absolute', inset:0, zIndex: 60,
        background: 'rgba(10,10,10,.32)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        animation: 'osFade 200ms ease both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="os-slide-up"
        style={{
          width: '100%', maxHeight: '94%',
          background: C.surfaceAlt, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          display:'flex', flexDirection:'column',
          boxShadow: '0 -10px 40px rgba(0,0,0,.2)',
          overflow:'hidden',
        }}
      >
        <div className="flex items-center justify-between" style={{ padding: '14px 18px 6px' }}>
          <div style={{
            width: 38, height: 4, borderRadius: 999, background: C.borderStrong,
            margin: '4px auto 8px', position:'absolute', left:'50%', transform:'translateX(-50%)',
          }} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: C.ink, margin: '12px 0 0', letterSpacing:'-0.02em' }}>
            {title}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="os-tap"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: 'none', background: C.surface,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', marginTop: 12,
              }}
              aria-label="Fechar"
            >
              <X size={16} color={C.ink2} />
            </button>
          )}
        </div>
        <div style={{ flex:1, padding: '12px 20px 28px', overflowY:'auto', display:'flex', flexDirection:'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  MANAGER VIEW
// ================================================================
// ================================================================
//  PRODUCTIVITY SUB-COMPONENTS
// ================================================================
function FilterChip({ active, onClick, children, icon }) {
  return (
    <button
      onClick={onClick}
      className="os-tap"
      style={{
        padding: '7px 13px', borderRadius: 999, whiteSpace:'nowrap',
        background: active ? C.ink : C.surface,
        color: active ? '#fff' : C.ink2,
        border: `1px solid ${active ? C.ink : C.border}`,
        fontSize: 12.5, fontWeight: 500, cursor:'pointer',
        letterSpacing:'-0.005em',
        display:'inline-flex', alignItems:'center', gap: 6,
        flexShrink: 0,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function DailyBarChart({ orders, days = 7, range }) {
  const series = useMemo(() => {
    // If range is supplied (custom day or single-day period), use it.
    // Otherwise show last 'days' days.
    const out = [];
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const count = orders.filter(o => {
        const od = new Date(o.startedAt);
        return od >= d && od < next;
      }).length;
      out.push({ date: d, count });
    }
    return out;
  }, [orders, days]);

  const max = Math.max(...series.map(d => d.count), 1);
  const todayMs = new Date(); todayMs.setHours(0,0,0,0);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
          Produção · últimos {days} dias
        </span>
        <span className="os-mono" style={{ fontSize: 11, color: C.ink3 }}>
          {series.reduce((a,b) => a + b.count, 0)} OSs
        </span>
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', height: 78, gap: 8 }}>
        {series.map((d, i) => {
          const isToday = d.date.getTime() === todayMs.getTime();
          const pct = (d.count / max) * 100;
          return (
            <div key={i} style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', gap: 5, minWidth: 0,
            }}>
              <div className="os-mono" style={{
                fontSize: 10.5, color: d.count > 0 ? C.ink : C.ink3,
                fontWeight: 600, height: 14, lineHeight: 1,
              }}>
                {d.count > 0 ? d.count : ''}
              </div>
              <div style={{
                width:'100%', flex:1, display:'flex', alignItems:'flex-end',
              }}>
                <div style={{
                  width:'100%',
                  height: d.count > 0 ? `${Math.max(pct, 6)}%` : 2,
                  background: d.count > 0
                    ? (isToday ? C.brand : `${C.brand}88`)
                    : C.border,
                  borderRadius: 4,
                  transition: 'height 360ms cubic-bezier(.2,.8,.2,1)',
                }} />
              </div>
              <div style={{
                fontSize: 10, color: isToday ? C.brand : C.ink3,
                fontWeight: isToday ? 600 : 500,
                letterSpacing: '.04em',
              }}>
                {WEEKDAY_SHORT[d.date.getDay()]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeProductivityRow({ employee, orders, isActive, onClick }) {
  const total = orders.length;
  const totalMinutes = orders
    .map(getDurationMin)
    .filter(v => v != null)
    .reduce((a, b) => a + b, 0);
  const totalHours = totalMinutes > 0 ? formatDurationMin(totalMinutes) : '—';
  const rate = completionRate(orders);

  return (
    <button
      onClick={onClick}
      className="os-press flex items-center gap-3"
      style={{
        width:'100%', textAlign:'left',
        padding: '11px 12px',
        background: isActive ? C.brandSoft : C.surface,
        border: `1px solid ${isActive ? `${C.brand}55` : C.border}`,
        borderRadius: 14, cursor:'pointer',
        transition: 'background 180ms, border-color 180ms',
      }}
    >
      <Avatar name={employee.name} size={36} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 500,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          letterSpacing:'-0.01em',
        }}>
          {employee.name}
        </div>
        <div className="os-mono" style={{ fontSize: 11, color: C.ink3, marginTop: 1 }}>
          {employee.role}
        </div>
      </div>
      <div style={{ textAlign:'right', flexShrink: 0 }}>
        <div className="os-mono" style={{ fontSize: 15, fontWeight: 600, color: C.ink, letterSpacing:'-0.02em' }}>
          {totalHours}
        </div>
        <div style={{ fontSize: 10.5, color: C.ink3, marginTop: 1 }}>
          {total} OS{total === 1 ? '' : 's'}
          {rate != null && (
            <>
              <span style={{ margin:'0 4px', color: C.borderStrong }}>·</span>
              <span style={{ color: rate >= 80 ? C.brand : C.amber, fontWeight: 600 }}>{rate}%</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// ================================================================
//  MANAGER VIEW — productivity dashboard
// ================================================================
function ManagerView({ orders, employees, onAddEmployee, onDeleteEmployee }) {
  const [period, setPeriod]                 = useState('week');
  const [customDate, setCustomDate]         = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [selectedOS, setSelectedOS]         = useState(null);
  const [empManagerOpen, setEmpManagerOpen] = useState(false);
  const [exporting, setExporting]           = useState(false);
  const [exportSuccess, setExportSuccess]   = useState(false);

  const range = useMemo(() => getPeriodRange(period, customDate), [period, customDate]);

  // Orders filtered by period only (used for per-employee summary)
  const periodOrders = useMemo(() =>
    orders.filter(o => orderInRange(o, range)),
    [orders, range]);

  // Fully filtered orders (period + employee + status) → drives metrics & list
  const fullyFiltered = useMemo(() => {
    let r = periodOrders;
    if (employeeFilter !== 'all') r = r.filter(o => o.employeeId === employeeFilter);
    if (statusFilter !== 'all')   r = r.filter(o => o.status === statusFilter);
    return [...r].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  }, [periodOrders, employeeFilter, statusFilter]);

  const metrics = useMemo(() => ({
    count:      fullyFiltered.length,
    totalMin:   totalDurationMin(fullyFiltered),
    completion: completionRate(fullyFiltered),
    active:     fullyFiltered.filter(o => o.status === 'em_andamento').length,
  }), [fullyFiltered]);

  const employeeList = useMemo(() =>
    Object.values(employees).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')),
    [employees]);

  const periodLabel = customDate
    ? new Date(customDate + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year: 'numeric' })
    : ({ today:'Hoje', week:'Últimos 7 dias', month:'Este mês', all:'Tudo' })[period];

  async function handleExport() {
    setExporting(true);
    await sleep(800);
    downloadCSV(fullyFiltered);
    setExporting(false);
    setExportSuccess(true);
    await sleep(2000);
    setExportSuccess(false);
  }

  function selectCustomDate() {
    if (!customDate) {
      setCustomDate(new Date().toISOString().slice(0,10));
    }
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
      {/* App bar */}
      <div className="flex items-center justify-between" style={{ padding: '8px 20px 0' }}>
        <BrandLockup size="sm" />
        <div className="flex items-center gap-1.5" style={{
          padding: '5px 10px', borderRadius: 999,
          background: C.brandSoft, color: C.brand, fontSize: 11, fontWeight: 500,
        }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background: C.brand }} className="os-pulse" />
          ao vivo
        </div>
      </div>

      {/* Title */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: 11, color: C.ink3, letterSpacing:'.1em', textTransform:'uppercase', fontWeight: 500 }}>
          Painel do administrador
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: C.ink, lineHeight: 1.15, margin: '4px 0 0', letterSpacing:'-0.025em' }}>
          Produtividade
        </h1>
      </div>

      {/* PERIOD FILTER */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 8 }}>
          Período
        </div>
        <div className="scrollbar-hide" style={{ display:'flex', gap: 7, overflowX:'auto', paddingBottom: 4 }}>
          <FilterChip active={period==='today' && !customDate} onClick={() => { setPeriod('today'); setCustomDate(null); }}>Hoje</FilterChip>
          <FilterChip active={period==='week'  && !customDate} onClick={() => { setPeriod('week');  setCustomDate(null); }}>7 dias</FilterChip>
          <FilterChip active={period==='month' && !customDate} onClick={() => { setPeriod('month'); setCustomDate(null); }}>Este mês</FilterChip>
          <FilterChip active={period==='all'   && !customDate} onClick={() => { setPeriod('all');   setCustomDate(null); }}>Tudo</FilterChip>
          <FilterChip
            active={!!customDate}
            icon={<Calendar size={12} />}
            onClick={selectCustomDate}
          >
            {customDate ? periodLabel : 'Dia específico'}
          </FilterChip>
        </div>
        {customDate && (
          <div className="os-fade-in flex items-center gap-2" style={{ marginTop: 10 }}>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value || null)}
              max={new Date().toISOString().slice(0,10)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 12,
                border: `1.5px solid ${C.brand}`,
                background: C.brandSoft, color: C.brand,
                fontSize: 13, fontFamily: FONT, fontWeight: 500,
                cursor:'pointer',
              }}
            />
            <button
              onClick={() => setCustomDate(null)}
              className="os-tap"
              style={{
                padding: '10px 14px', borderRadius: 12,
                background: C.surface, border:`1px solid ${C.border}`,
                fontSize: 13, color: C.ink2, cursor:'pointer',
                fontWeight: 500,
              }}
            >
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* METRICS CARD + CHART */}
      <div style={{ padding: '14px 20px 0' }}>
        <div className="os-card-shadow os-rise" style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: '16px 18px',
        }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
              {periodLabel}
              {employeeFilter !== 'all' && employees[employeeFilter] && (
                <span style={{ marginLeft: 8, color: C.brand }}>
                  · {employees[employeeFilter].name.split(' ')[0]}
                </span>
              )}
            </span>
            {metrics.active > 0 && (
              <span className="flex items-center gap-1" style={{ fontSize: 11, color: C.amber, fontWeight: 500 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background: C.amber }} className="os-pulse" />
                {metrics.active} em andamento
              </span>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 4, marginBottom: 18 }}>
            <Metric label="OSs" value={pad(metrics.count, 2)} primary />
            <Metric label="Horas trabalhadas" value={formatDurationMin(metrics.totalMin)} />
            <Metric
              label="Conclusão"
              value={metrics.completion != null ? `${metrics.completion}%` : '—'}
              color={metrics.completion != null ? (metrics.completion >= 80 ? C.brand : C.amber) : C.ink}
            />
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <DailyBarChart
              orders={employeeFilter === 'all'
                ? orders
                : orders.filter(o => o.employeeId === employeeFilter)}
              days={7}
            />
          </div>
        </div>
      </div>

      {/* PER-EMPLOYEE PRODUCTIVITY */}
      {employeeList.length > 0 && (
        <div style={{ padding: '22px 20px 0' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
              Por funcionário · {periodLabel.toLowerCase()}
            </span>
            <span className="os-mono" style={{ fontSize: 11, color: C.ink3 }}>
              {employeeList.length}
            </span>
          </div>
          <div className="os-stagger" style={{ display:'flex', flexDirection:'column', gap: 7 }}>
            {employeeList.map(emp => (
              <EmployeeProductivityRow
                key={emp.id}
                employee={emp}
                orders={periodOrders.filter(o => o.employeeId === emp.id)}
                isActive={employeeFilter === emp.id}
                onClick={() => setEmployeeFilter(employeeFilter === emp.id ? 'all' : emp.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* FILTER ROW — employee + status */}
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 8 }}>
          Funcionário
        </div>
        <div className="scrollbar-hide" style={{ display:'flex', gap: 7, overflowX:'auto', paddingBottom: 6 }}>
          <FilterChip active={employeeFilter==='all'} onClick={() => setEmployeeFilter('all')}>
            Todos
          </FilterChip>
          {employeeList.map(emp => (
            <FilterChip
              key={emp.id}
              active={employeeFilter===emp.id}
              onClick={() => setEmployeeFilter(emp.id)}
            >
              {emp.name.split(' ')[0]}
            </FilterChip>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginTop: 12, marginBottom: 8 }}>
          Status
        </div>
        <div className="scrollbar-hide" style={{ display:'flex', gap: 7, overflowX:'auto', paddingBottom: 4 }}>
          {[
            { id:'all',          label:'Todos' },
            { id:'em_andamento', label:'Em andamento' },
            { id:'concluido',    label:'Concluído' },
            { id:'parcial',      label:'Parcial' },
          ].map(s => (
            <FilterChip
              key={s.id}
              active={statusFilter === s.id}
              onClick={() => setStatusFilter(s.id)}
            >
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* OS LIST */}
      <div style={{ padding: '22px 20px 8px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, margin: 0 }}>
            Registros
          </h2>
          <span className="os-mono" style={{ fontSize: 12, color: C.ink3 }}>{fullyFiltered.length}</span>
        </div>

        {fullyFiltered.length === 0 ? (
          <div style={{
            padding: '40px 20px', borderRadius: 20,
            background: C.surface, border: `1px dashed ${C.border}`,
            textAlign:'center', color: C.ink3,
          }}>
            <Activity size={24} style={{ marginBottom: 12, opacity: .4 }} />
            <div style={{ fontSize: 14 }}>Nenhuma ordem encontrada</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tente ajustar os filtros acima.</div>
          </div>
        ) : (
          <div className="os-stagger" style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {fullyFiltered.map(o => (
              <ManagerOSCard key={o.id} order={o} onClick={() => setSelectedOS(o)} />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM ACTIONS */}
      <div style={{ padding: '8px 20px 28px', display:'flex', gap: 8 }}>
        <button
          onClick={() => setEmpManagerOpen(true)}
          className="os-tap os-card-shadow flex items-center gap-2"
          style={{
            flex:1, padding: '12px 14px', borderRadius: 14,
            background: C.surface, border:`1px solid ${C.border}`,
            cursor:'pointer', justifyContent:'center',
          }}
        >
          <Users size={15} color={C.ink2} />
          <span style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
            Funcionários · {employeeList.length}
          </span>
        </button>
        <button
          onClick={handleExport}
          className="os-tap os-card-shadow flex items-center gap-2"
          style={{
            flex:1, padding: '12px 14px', borderRadius: 14,
            background: (exporting || exportSuccess) ? C.brandSoft : C.surface,
            border:`1px solid ${(exporting || exportSuccess) ? C.brand : C.border}`,
            cursor:'pointer', justifyContent:'center',
          }}
        >
          {exporting ? <Spinner size={15} /> :
            exportSuccess ? <Check size={15} color={C.brand} /> :
            <Download size={15} color={C.ink2} />}
          <span style={{ fontSize: 13, fontWeight: 500,
            color: (exporting || exportSuccess) ? C.brand : C.ink,
          }}>
            {exportSuccess ? 'Exportado' : exporting ? 'Exportando…' : 'Exportar CSV'}
          </span>
        </button>
      </div>

      {selectedOS && (
        <OSDetailSheet order={selectedOS} onClose={() => setSelectedOS(null)} />
      )}

      {empManagerOpen && (
        <EmployeeManagerSheet
          employees={employees}
          onClose={() => setEmpManagerOpen(false)}
          onAdd={onAddEmployee}
          onDelete={onDeleteEmployee}
        />
      )}
    </div>
  );
}

function Metric({ label, value, primary = false, color = null }) {
  return (
    <div style={{ padding: '0 6px' }}>
      <div style={{ fontSize: 10.5, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
        {label}
      </div>
      <div className="os-mono" style={{
        fontSize: primary ? 28 : 21,
        fontWeight: 600,
        color: color || C.ink,
        marginTop: 4,
        letterSpacing:'-0.025em',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

function ManagerOSCard({ order, onClick }) {
  const meta = SERVICE_MAP[order.serviceType];
  return (
    <button
      onClick={onClick}
      className="os-press os-card-shadow"
      style={{
        width:'100%', background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 18, padding: '14px 14px 14px 16px',
        cursor:'pointer', textAlign:'left',
        position:'relative', overflow:'hidden',
      }}
    >
      {/* status accent stripe */}
      <div style={{
        position:'absolute', left:0, top: 14, bottom: 14, width: 3,
        borderRadius: 4,
        background: STATUS_META[order.status]?.fg,
      }} />
      <div className="flex items-start gap-3" style={{ paddingLeft: 6 }}>
        <ServiceIconChip id={order.serviceType} size={40} />
        <div style={{ flex:1, minWidth:0 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span className="os-mono" style={{ fontSize: 12, color: C.ink3, fontWeight: 500 }}>
              {order.osNumber}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <div style={{ fontSize: 15, color: C.ink, fontWeight: 500, letterSpacing:'-0.01em' }}>
            {meta?.label}
          </div>
          {order.description && (
            <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 3, lineHeight: 1.4,
              overflow:'hidden', display:'-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient:'vertical',
            }}>
              {order.description}
            </div>
          )}
          <div className="flex items-center gap-1.5" style={{ marginTop: 4, color: C.ink2 }}>
            <User size={11} strokeWidth={2} />
            <span style={{ fontSize: 12.5 }}>{order.employeeName}</span>
          </div>
          <div className="flex items-center gap-1.5" style={{ marginTop: 4, color: C.ink3 }}>
            <MapPin size={11} strokeWidth={2} />
            <span style={{ fontSize: 12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {order.address}
            </span>
          </div>
          <div className="flex items-center justify-between" style={{
            marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`,
          }}>
            <div className="flex items-center gap-1.5">
              <Clock size={11} strokeWidth={2} color={C.ink3} />
              <span className="os-mono" style={{ fontSize: 12, color: C.ink2 }}>
                {formatTime(order.startedAt)}
                {order.endedAt && <span style={{ color: C.ink3 }}> → {formatTime(order.endedAt)}</span>}
                {!order.endedAt && <span style={{ color: C.amber }}> · {elapsed(order.startedAt)}</span>}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.ink3 }}>{timeAgo(order.startedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function OSDetailSheet({ order, onClose }) {
  const meta = SERVICE_MAP[order.serviceType];
  return (
    <Sheet onClose={onClose} title="Detalhes da ordem">
      <div className="os-fade-in" style={{ display:'flex', flexDirection:'column', gap: 16 }}>
        <div className="flex items-center justify-between" style={{
          background: C.surface, border:`1px solid ${C.border}`,
          borderRadius: 16, padding: '14px 16px',
        }}>
          <div className="flex items-center gap-3">
            <ServiceIconChip id={order.serviceType} size={44} />
            <div>
              <div className="os-mono" style={{ fontSize: 12, color: C.ink3 }}>{order.osNumber}</div>
              <div style={{ fontSize: 17, color: C.ink, fontWeight: 600, marginTop: 2, letterSpacing:'-0.02em' }}>
                {meta?.label}
              </div>
            </div>
          </div>
          <StatusBadge status={order.status} size="lg" />
        </div>

        <DetailRow icon={<User size={14} />} label="Funcionário" value={`${order.employeeName} · ${order.employeeId}`} />
        {order.description && (
          <div style={{
            background: C.brandSoft, border: `1px solid ${C.brand}22`,
            borderRadius: 14, padding: '14px 16px',
          }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <FileText size={13} color={C.brand} />
              <div style={{ fontSize: 11, color: C.brandText, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
                Descrição do serviço
              </div>
            </div>
            <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}>
              {order.description}
            </div>
          </div>
        )}
        <DetailRow icon={<MapPin size={14} />} label="Endereço" value={order.address} />
        {typeof order.coords?.lat === 'number' && typeof order.coords?.lng === 'number' && (
          <DetailRow
            icon={<Hash size={14} />}
            label="Coordenadas"
            value={<span className="os-mono">{formatCoord(order.coords.lat, 5)}, {formatCoord(order.coords.lng, 5)}</span>}
          />
        )}
        <DetailRow icon={<Calendar size={14} />} label="Início" value={formatDateTime(order.startedAt)} />
        {order.endedAt && (
          <DetailRow icon={<CheckCircle2 size={14} />} label="Encerramento" value={formatDateTime(order.endedAt)} />
        )}
        {order.observations && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500, marginBottom: 6 }}>
              Observações
            </div>
            <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}>
              {order.observations}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ================================================================
//  EMPLOYEE MANAGER SHEET — admin adds / removes workers
// ================================================================
function EmployeeManagerSheet({ employees, onClose, onAdd, onDelete }) {
  const [formOpen, setFormOpen]     = useState(false);
  const [matricula, setMatricula]   = useState('');
  const [name, setName]             = useState('');
  const [role, setRole]             = useState('');
  const [error, setError]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [confirmId, setConfirmId]   = useState(null);

  const list = Object.values(employees).sort((a,b) =>
    a.name.localeCompare(b.name, 'pt-BR'));

  function resetForm() {
    setMatricula(''); setName(''); setRole(''); setError(''); setFormOpen(false);
  }

  async function submit() {
    const m = matricula.trim();
    const n = name.trim();
    const r = role.trim();

    if (m.length < 4) { setError('Matrícula deve ter no mínimo 4 dígitos'); return; }
    if (m === MANAGER_ID)     { setError('Esta matrícula é reservada ao administrador'); return; }
    if (employees[m])         { setError('Já existe um funcionário com esta matrícula'); return; }
    if (n.length < 3)         { setError('Informe o nome completo'); return; }
    if (r.length < 2)         { setError('Informe a função'); return; }

    setSaving(true);
    await sleep(500);
    onAdd({ id: m, name: n, role: r });
    setSaving(false);
    resetForm();
  }

  function handleDelete(id) {
    onDelete(id);
    setConfirmId(null);
  }

  return (
    <Sheet onClose={onClose} title="Gerenciar funcionários">
      <div className="os-fade-in" style={{ display:'flex', flexDirection:'column', flex:1 }}>
        {/* Header row */}
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: C.ink2 }}>
            <span className="os-mono" style={{ fontSize: 15, color: C.ink, fontWeight: 600 }}>
              {list.length}
            </span>
            <span style={{ marginLeft: 6 }}>cadastrados</span>
          </div>
          {!formOpen && (
            <button
              onClick={() => setFormOpen(true)}
              className="os-tap inline-flex items-center gap-1.5"
              style={{
                padding: '8px 14px', borderRadius: 999,
                background: C.brand, color:'#fff', border:'none',
                fontSize: 13, fontWeight: 500, cursor:'pointer',
                letterSpacing:'-0.005em',
              }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Adicionar
            </button>
          )}
        </div>

        {/* Add form */}
        {formOpen && (
          <div className="os-rise" style={{
            background: C.surface, border: `1.5px solid ${C.brand}`,
            borderRadius: 18, padding: '16px', marginBottom: 16,
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="flex items-center gap-2">
                <UserPlus size={16} color={C.brand} />
                <span style={{ fontSize: 14, color: C.ink, fontWeight: 600, letterSpacing:'-0.01em' }}>
                  Novo funcionário
                </span>
              </div>
              <button
                onClick={resetForm}
                className="os-tap"
                style={{
                  width: 26, height: 26, borderRadius: '50%', border:'none',
                  background: C.surfaceAlt, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}
              >
                <X size={14} color={C.ink3} />
              </button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.08em', fontWeight: 500 }}>
                  Matrícula
                </label>
                <input
                  className="os-input os-mono"
                  type="text"
                  inputMode="numeric"
                  value={matricula}
                  onChange={(e) => { setMatricula(e.target.value.replace(/\D/g,'').slice(0,6)); setError(''); }}
                  placeholder="00000"
                  style={{
                    width:'100%', marginTop: 6,
                    padding: '12px 14px', fontSize: 16, fontWeight: 500,
                    border:`1.5px solid ${C.border}`, borderRadius: 12,
                    background: C.surfaceAlt, color: C.ink,
                    letterSpacing:'0.08em',
                    transition: 'border-color 180ms, box-shadow 180ms',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.08em', fontWeight: 500 }}>
                  Nome completo
                </label>
                <input
                  className="os-input"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(''); }}
                  placeholder="Ex.: João da Silva"
                  style={{
                    width:'100%', marginTop: 6,
                    padding: '12px 14px', fontSize: 15,
                    border:`1.5px solid ${C.border}`, borderRadius: 12,
                    background: C.surfaceAlt, color: C.ink,
                    fontFamily: FONT,
                    transition: 'border-color 180ms, box-shadow 180ms',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.08em', fontWeight: 500 }}>
                  Função
                </label>
                <input
                  className="os-input"
                  type="text"
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setError(''); }}
                  placeholder="Ex.: Pedreiro, Pintor, Eletricista"
                  list="role-suggestions"
                  style={{
                    width:'100%', marginTop: 6,
                    padding: '12px 14px', fontSize: 15,
                    border:`1.5px solid ${C.border}`, borderRadius: 12,
                    background: C.surfaceAlt, color: C.ink,
                    fontFamily: FONT,
                    transition: 'border-color 180ms, box-shadow 180ms',
                  }}
                />
                <datalist id="role-suggestions">
                  <option value="Manutenção Predial" />
                  <option value="Eletricista Predial" />
                  <option value="Encanador" />
                  <option value="Pedreiro" />
                  <option value="Pintor" />
                  <option value="Serralheiro" />
                  <option value="Auxiliar" />
                </datalist>
              </div>
            </div>

            {error && (
              <div className="os-fade-in flex items-center gap-2" style={{ marginTop: 10, color: C.red, fontSize: 12.5 }}>
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <PrimaryButton onClick={submit} loading={saving}>
                Cadastrar funcionário
                <Check size={16} />
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Employee list */}
        {list.length === 0 ? (
          <div style={{
            padding: '40px 20px', borderRadius: 20,
            background: C.surface, border: `1px dashed ${C.border}`,
            textAlign:'center', color: C.ink3,
          }}>
            <Users size={22} style={{ marginBottom: 10, opacity: .4 }} />
            <div style={{ fontSize: 14 }}>Nenhum funcionário cadastrado</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Toque em <strong>Adicionar</strong> para começar.</div>
          </div>
        ) : (
          <div className="os-stagger" style={{ display:'flex', flexDirection:'column', gap: 8 }}>
            {list.map(emp => {
              const isConfirming = confirmId === emp.id;
              return (
                <div
                  key={emp.id}
                  className="os-card-shadow flex items-center gap-3"
                  style={{
                    background: isConfirming ? C.redSoft : C.surface,
                    border: `1px solid ${isConfirming ? C.red + '44' : C.border}`,
                    borderRadius: 14, padding: '11px 12px',
                    transition: 'background 180ms, border-color 180ms',
                  }}
                >
                  <Avatar name={emp.name} size={38} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize: 14, color: C.ink, fontWeight: 500, letterSpacing:'-0.01em' }}>
                      {emp.name}
                    </div>
                    <div className="flex items-center gap-1.5" style={{ marginTop: 1 }}>
                      <span style={{ fontSize: 12, color: C.ink3 }}>{emp.role}</span>
                      <span style={{ color: C.borderStrong, fontSize: 10 }}>·</span>
                      <span className="os-mono" style={{ fontSize: 11.5, color: C.ink3 }}>#{emp.id}</span>
                    </div>
                  </div>
                  {isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setConfirmId(null)}
                        className="os-tap"
                        style={{
                          padding: '6px 10px', borderRadius: 8,
                          background: C.surface, border: `1px solid ${C.border}`,
                          fontSize: 12, color: C.ink2, cursor:'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleDelete(emp.id)}
                        className="os-tap"
                        style={{
                          padding: '6px 10px', borderRadius: 8,
                          background: C.red, border:'none',
                          fontSize: 12, color:'#fff', cursor:'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(emp.id)}
                      className="os-tap"
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: C.surfaceAlt, border:'none', cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}
                      aria-label={`Remover ${emp.name}`}
                    >
                      <Trash2 size={14} color={C.ink3} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <div style={{ marginTop: 20, padding: '12px 14px',
          background: C.brandSoft, borderRadius: 12,
          border: `1px solid ${C.brand}22`,
        }}>
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} color={C.brand} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: C.brandText, lineHeight: 1.5 }}>
              Apenas o administrador (matrícula <span className="os-mono" style={{ fontWeight: 600 }}>{MANAGER_ID}</span>) pode cadastrar ou remover funcionários. Funcionários não usam senha.
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3" style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: '12px 14px',
    }}>
      <div style={{ color: C.ink3, marginTop: 2 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize: 11, color: C.ink3, textTransform:'uppercase', letterSpacing:'.1em', fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color: C.ink, marginTop: 3, lineHeight: 1.4 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ================================================================
//  BOTTOM NAV
// ================================================================
function BottomNav({ tab, onChange, isManager }) {
  const tabs = isManager
    ? [
        { id: 'worker',  label: 'Funcionário', Icon: User },
        { id: 'manager', label: 'Painel',      Icon: BarChart3 },
      ]
    : [
        { id: 'worker',  label: 'Funcionário', Icon: User },
      ];

  // No nav needed if only one tab (worker-only)
  if (!isManager) return null;

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`,
      background: 'rgba(255,255,255,.85)',
      backdropFilter: 'saturate(160%) blur(20px)',
      WebkitBackdropFilter: 'saturate(160%) blur(20px)',
      padding: '8px 12px 14px',
      display:'flex', gap: 4,
    }}>
      {tabs.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="os-tab-btn os-press"
            style={{
              flex:1, padding: '8px 4px', border:'none', background:'transparent',
              cursor:'pointer', display:'flex', flexDirection:'column',
              alignItems:'center', gap: 3, color: active ? C.brand : C.ink3,
            }}
          >
            <t.Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
            <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing:'-0.005em' }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ================================================================
//  MAIN APP
// ================================================================
export default function App() {
  useFonts();
  const [tab, setTab]               = useState('worker');
  const [employee, setEmployee]     = useState(null);

  // Persisted state — survives reloads via window.storage
  const [orders, setOrders]                = usePersistedState(STORAGE_KEYS.orders, SEED_ORDERS);
  const [employees, setEmployees]          = usePersistedState(STORAGE_KEYS.employees, INITIAL_EMPLOYEES);

  const [startOpen, setStartOpen]   = useState(false);
  const [endOpen, setEndOpen]       = useState(false);
  const [endingOrder, setEndingOrder] = useState(null);
  const [tick, setTick]             = useState(0);

  const isManager = employee?.isManager === true;

  // refresh elapsed times every 30 s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  function handleLogin(emp) {
    setEmployee(emp);
    // Manager lands on panel by default
    setTab(emp.isManager ? 'manager' : 'worker');
  }

  function handleLogout() {
    setEmployee(null);
    setTab('worker');
  }

  function handleAddEmployee(emp) {
    setEmployees(prev => ({ ...prev, [emp.id]: emp }));
  }

  function handleDeleteEmployee(id) {
    setEmployees(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleStartConfirm({ serviceType, description, location }) {
    const newOrder = {
      id: `os-${Date.now()}`,
      osNumber: nextOSNumber(orders),
      employeeId: employee.id,
      employeeName: employee.name,
      serviceType,
      description,
      address: location.address,
      coords: { lat: location.lat, lng: location.lng },
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'em_andamento',
      observations: '',
    };
    setOrders(prev => [...prev, newOrder]);
    setStartOpen(false);
  }

  function handleEndRequest(order) {
    setEndingOrder(order);
    setEndOpen(true);
  }

  function handleEndConfirm({ status, observations }) {
    setOrders(prev => prev.map(o =>
      o.id === endingOrder.id
        ? { ...o, status, observations, endedAt: new Date().toISOString() }
        : o
    ));
    setEndOpen(false);
    setEndingOrder(null);
  }

  return (
    <div className="os-root" style={{
      width: '100%', minHeight: '100vh',
      background: '#E8E8E4',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding: '0',
    }}>
      <GlobalStyles />

      {/* Phone frame */}
      <div style={{
        width: '100%', maxWidth: 440,
        minHeight: '100vh',
        background: C.bg,
        display:'flex', flexDirection:'column',
        position:'relative',
        boxShadow: '0 0 0 1px rgba(0,0,0,.04), 0 30px 60px -20px rgba(0,0,0,.18)',
        overflow:'hidden',
      }}>
        {/* status bar mock — just the time */}
        <div className="flex items-center justify-center" style={{
          padding: '14px 22px 4px',
          fontSize: 13, color: C.ink, fontWeight: 600,
        }}>
          <span className="os-mono">{new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</span>
        </div>

        {/* content */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', position:'relative', overflow:'hidden' }}>
          <div style={{ flex:1, overflowY:'auto' }} key={tab + (employee?.id || 'nouser')}>
            {tab === 'worker' && !employee && (
              <LoginView onLogin={handleLogin} employees={employees} />
            )}
            {tab === 'worker' && employee && (
              <WorkerHome
                employee={employee}
                orders={orders}
                onStart={() => setStartOpen(true)}
                onEnd={handleEndRequest}
                onLogout={handleLogout}
                tick={tick}
              />
            )}
            {tab === 'manager' && isManager && (
              <ManagerView
                orders={orders}
                employees={employees}
                onAddEmployee={handleAddEmployee}
                onDeleteEmployee={handleDeleteEmployee}
              />
            )}
            {tab === 'manager' && !isManager && <LoginView onLogin={handleLogin} employees={employees} />}
          </div>

          {/* Sheets */}
          <StartServiceSheet
            open={startOpen}
            onClose={() => setStartOpen(false)}
            onConfirm={handleStartConfirm}
            employee={employee}
          />
          <EndServiceSheet
            open={endOpen}
            onClose={() => setEndOpen(false)}
            onConfirm={handleEndConfirm}
            order={endingOrder}
          />
        </div>

        {/* Bottom Nav */}
        <BottomNav tab={tab} onChange={setTab} isManager={isManager} />
      </div>
    </div>
  );
}