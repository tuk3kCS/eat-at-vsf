import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, CircleAlert, Clock3, CookingPot, ImageOff, Inbox, ListFilter, LoaderCircle, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Status } from '@vsf/shared';
import { zone } from '@vsf/shared';
import { ApiError, errorMessage } from './api';

export const money = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + ' ₫';
const formatter = new Intl.DateTimeFormat('vi-VN', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' });
export const dateTime = (iso: string | number) => formatter.format(new Date(iso));
export const localInput = (value = Date.now()) => new Date(value + 7 * 3_600_000).toISOString().slice(0, 16);
export const toInstant = (value: string) => new Date(value + ':00+07:00').toISOString();
export const labels: Record<Status, string> = { OPEN: 'Đang mở', CLOSED: 'Đã chốt', CANCELLED: 'Đã hủy' };

export function useTitle(title: string) {
  useEffect(() => { document.title = title + ' · Eat @ VSF'; }, [title]);
}
export function useDebounce(value: string, delay = 250) {
  const [stable, set] = useState(value);
  useEffect(() => { const timer = setTimeout(() => set(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return stable;
}
export function useClock() {
  const [now, set] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => set(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
export function Button({ children, tone = 'primary', busy, disabled, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'neutral' | 'ghost' | 'danger'; busy?: boolean;
}) {
  return <button type="button" {...props} className={`btn btn-${tone} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined}>
    {busy && <LoaderCircle size={17} className="spin" />} {children}
  </button>;
}
export function Brand() {
  return <div className="brand"><img src="/icon.svg" alt="" width="39" height="39" /><span>Eat <i>@</i> VSF<small>GÓC ĂN TRƯA</small></span></div>;
}
export function Badge({ status }: { status: Status }) {
  return <span className={`badge badge-${status.toLowerCase()}`}><i />{labels[status]}</span>;
}
export function RestaurantIcon({ image, size = 'normal' }: { image?: string | null; size?: 'normal' | 'large' }) {
  const [failed, setFailed] = useState('');
  return <span className={`restaurant-icon ${size}`}>
    {image && failed !== image ? <img src={image} alt="" loading="lazy" onError={() => setFailed(image)} />
      : image ? <ImageOff size={20} /> : <CookingPot size={size === 'large' ? 29 : 22} />}
  </span>;
}
export function Heading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div>
    {children && <div className="heading-actions">{children}</div>}</header>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={25} /></span><strong>{title}</strong>{children}</div>;
}
export function Loading({ count = 3 }: { count?: number }) {
  return <div className="skeleton-grid" aria-label="Đang tải" role="status">{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}
export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  return <div className="failure" role="alert"><CircleAlert size={21} /><div><strong>{status === 404 ? 'Không tìm thấy' : status === 403 ? 'Không có quyền truy cập' : 'Đã xảy ra lỗi'}</strong><p>{errorMessage(error)}</p>
    {retry && status !== 404 && status !== 403 && <Button tone="neutral" onClick={retry}>Thử lại</Button>}</div></div>;
}
export function Back({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="back" to={to}><ArrowLeft size={16} />{children}</Link>;
}
export function RequiredMark() {
  return <span className="required-mark" aria-hidden="true" />;
}
export function Field({ label, error, children, hint, required }: { label: string; error?: string; children: ReactNode; hint?: string; required?: boolean }) {
  return <label className="field"><span>{label}{required && <RequiredMark />}</span>{children}{error ? <small className="field-error">{error}</small> : hint && <small>{hint}</small>}</label>;
}
export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search"><Search size={17} /><input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}
export function Filters({ children, active = false }: { children: ReactNode; active?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const fields = useId();
  return <div className="filters panel">
    <div className="filter-toolbar">
      {!expanded && active && <span className="badge badge-neutral">Đang áp dụng</span>}
      <Button tone="neutral" aria-expanded={expanded} aria-controls={fields} onClick={() => setExpanded(!expanded)}>
        <ListFilter size={17} /> Bộ lọc <ChevronDown className="filter-chevron" size={15} />
      </Button>
    </div>
    <div id={fields} className="filter-fields" hidden={!expanded}>{children}</div>
  </div>;
}
export function Pager({ page, total, size, change }: { page: number; total: number; size: number; change: (value: number) => void }) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last === 1 && page === 1) return null;
  return <div className="pager"><span>Trang {page} / {last} · {total} kết quả</span><div>
    <Button tone="neutral" aria-label="Trang trước" disabled={page <= 1} onClick={() => change(page - 1)}><ArrowLeft size={16} /></Button>
    <Button tone="neutral" aria-label="Trang sau" disabled={page >= last} onClick={() => change(page + 1)}><ArrowRight size={16} /></Button>
  </div></div>;
}
export function Modal({ title, children, onClose, wide, busy }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={label} className={wide ? 'modal wide' : 'modal'} onCancel={event => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className="modal-inner"><div className="modal-title"><h2 id={label}>{title}</h2><Button tone="ghost" disabled={busy} aria-label="Đóng hộp thoại" onClick={onClose}><X size={20} /></Button></div>{children}</div>
  </dialog>;
}
export function Confirm({ title, text, action, busy, onClose, onConfirm, danger, error }: { title: string; text: string; action: string; busy?: boolean; onClose: () => void; onConfirm: () => void; danger?: boolean; error?: string }) {
  return <Modal title={title} onClose={onClose} busy={busy}><p className="muted">{text}</p>
  {error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions">
    <Button tone="neutral" disabled={busy} onClick={onClose}>Quay lại</Button><Button tone={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{action}</Button>
  </div></Modal>;
}
export function Countdown({ deadline }: { deadline: string }) {
  const now = useClock();
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  if (seconds === 0) return <span className="countdown"><Clock3 size={15} /> Hết hạn</span>;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return <span className="countdown"><Clock3 size={15} /> Còn {days ? days + ' ngày ' : ''}{hours ? hours + ' giờ ' : ''}{minutes ? minutes + ' phút' : (!days && !hours ? seconds + ' giây' : '')}</span>;
}
