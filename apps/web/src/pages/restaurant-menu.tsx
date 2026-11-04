import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Power, Sparkles, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { maxPrice, menuItemSchema, type ExtractedItem, type MenuItem, type Page, type Restaurant } from '@vsf/shared';
import { api, errorMessage, params, useAction } from '../api';
import { Back, Button, Confirm, Empty, Failure, Field, Filters, Heading, Loading, Modal, money, Pager, SearchBox, useDebounce, useTitle } from '../ui';

const keys = ['menu', 'restaurants', 'admin-restaurants', 'order'];

export default function RestaurantMenu({ admin = false }: { admin?: boolean }) {
  const { id = '' } = useParams();
  const base = (admin ? '/admin/restaurants/' : '/restaurants/') + id;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [form, setForm] = useState<MenuItem | 'new'>();
  const [deleting, setDeleting] = useState<MenuItem>();
  const name = useQuery({ queryKey: [admin ? 'admin-restaurants' : 'restaurants', id], queryFn: ({ signal }) => api<Restaurant>(base, { signal }) });
  const term = useDebounce(q);
  const menu = useQuery({ queryKey: ['menu', base, page, term, sort], queryFn: ({ signal }) => api<Page<MenuItem>>(base + '/menu' + params({ page, q: term, sort, size: 24 }), { signal }) });
  const flip = useAction((row: MenuItem) => api('/admin/menu-items/' + row.id, { method: 'PATCH', body: { isAvailable: !row.isAvailable } }), keys, 'Đã cập nhật trạng thái món.');
  const remove = useAction((row: MenuItem) => api('/admin/menu-items/' + row.id, { method: 'DELETE' }), keys, 'Đã xóa món khỏi thực đơn.', () => setDeleting(undefined));
  useTitle(name.data?.name ?? 'Thực đơn');
  return <>
    <Back to={admin ? '/admin/restaurants' : '/restaurants'}>Về danh sách quán</Back>
    {name.isPending ? <Loading /> : name.isError ? <Failure error={name.error} retry={() => void name.refetch()} /> : <>
      <Heading eyebrow={admin ? 'QUẢN LÝ THỰC ĐƠN' : 'THỰC ĐƠN QUÁN'} title={name.data.name}>
        {admin ? <Button onClick={() => setForm('new')}><Plus size={18} /> Thêm món</Button>
          : <Link className="btn btn-primary" to={'/orders/create?restaurant=' + id}><Plus size={18} /> Tạo đơn tại quán</Link>}
      </Heading>
      {name.data.phone && <div className="menu-contact"><a href={'tel:' + name.data.phone}>{name.data.phone}</a></div>}
      <Filters active={!!q.trim() || sort !== 'name'}>
        <SearchBox value={q} onChange={value => { setQ(value); setPage(1); }} placeholder="Tìm món ăn…" />
        <select aria-label="Sắp xếp món" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="name">Tên A–Z</option><option value="price">Giá tăng dần</option></select>
      </Filters>
      {menu.isPending ? <Loading /> : menu.isError ? <Failure error={menu.error} retry={() => void menu.refetch()} /> : <>
        {menu.data.items.length ? <div className="panel data-list">{menu.data.items.map(row => <div className="data-row" key={row.id}>
          <div className="data-primary"><strong>{row.name}</strong></div>
          <strong>{money(row.price)}</strong>
          {admin && <><span className={row.isAvailable ? 'badge badge-open' : 'badge badge-neutral'}><i />{row.isAvailable ? 'Còn bán' : 'Ngừng bán'}</span>
            <div className="icon-actions"><Button tone="ghost" aria-label={'Sửa ' + row.name} onClick={() => setForm(row)}><Pencil size={16} /></Button>
              <Button tone="ghost" title={row.isAvailable ? 'Ngừng bán' : 'Bán lại'} aria-label={(row.isAvailable ? 'Ngừng bán ' : 'Bán lại ') + row.name} disabled={flip.isPending} onClick={() => flip.mutate(row)}><Power size={16} /></Button>
              <Button tone="ghost" aria-label={'Xóa ' + row.name} onClick={() => setDeleting(row)}><Trash2 size={16} /></Button></div></>}
        </div>)}</div> : <Empty title="Chưa có món phù hợp" />}
        <Pager {...menu.data} change={setPage} />
      </>}
    </>}
    {form === 'new' && <AddMenu base={base} close={() => setForm(undefined)} />}
    {form && form !== 'new' && <ItemForm row={form} close={() => setForm(undefined)} />}
    {deleting && <Confirm title="Xóa món khỏi thực đơn?" text={deleting.name + ' sẽ bị ẩn. Các đơn đã đặt vẫn giữ tên và giá đã chọn.'} action="Xóa món" danger busy={remove.isPending} onClose={() => setDeleting(undefined)} onConfirm={() => remove.mutate(deleting)} />}
  </>;
}

const editItemSchema = menuItemSchema.pick({ name: true, price: true, isAvailable: true });
function ItemForm({ row, close }: { row: MenuItem; close: () => void }) {
  const form = useForm<z.input<typeof editItemSchema>>({ resolver: zodResolver(editItemSchema), defaultValues: {
    name: row.name, price: row.price, isAvailable: row.isAvailable,
  } });
  const save = useAction((data: z.output<typeof editItemSchema>) => api('/admin/menu-items/' + row.id, {
    method: 'PATCH', body: data,
  }), keys, 'Đã lưu món ăn.', close);
  const { errors } = form.formState;
  return <Modal title="Chỉnh sửa món" onClose={close} busy={save.isPending}>
    <form className="form-stack" onSubmit={form.handleSubmit(data => save.mutate(data))} noValidate>
      <Field label="Tên món" required error={errors.name?.message}><input required {...form.register('name')} autoFocus /></Field>
      <Field label="Giá (VND)" required error={errors.price ? 'Nhập giá nguyên từ 0 đến 10.000.000 đồng.' : undefined}><input required type="number" min={0} max={maxPrice} step={1} {...form.register('price', { valueAsNumber: true })} /></Field>
      <label className="check-label"><input type="checkbox" {...form.register('isAvailable')} /> Đang bán</label>
      <div className="form-actions"><Button tone="neutral" onClick={close}>Hủy</Button><Button type="submit" busy={save.isPending}>Lưu món</Button></div>
    </form>
  </Modal>;
}

const bulk = z.object({ rows: z.array(z.object({
  include: z.boolean(), imported: z.boolean(), name: z.string(), price: z.string(), warnings: z.array(z.string()),
})).max(200) }).superRefine(({ rows }, context) => {
  if (!rows.some(row => row.include)) context.addIssue({ code: 'custom', message: 'Chọn ít nhất một món.', path: ['rows', 'root'] });
  rows.forEach((row, i) => {
    if (!row.include) return;
    if (!row.name.trim() || row.name.trim().length > 150) context.addIssue({ code: 'custom', message: 'Tên món cần từ 1 đến 150 ký tự.', path: ['rows', i, 'name'] });
    if (!/^\d+$/.test(row.price) || Number(row.price) > maxPrice) context.addIssue({ code: 'custom', message: 'Nhập giá nguyên hợp lệ.', path: ['rows', i, 'price'] });
  });
});
type Bulk = z.input<typeof bulk>;
const blank = { include: true, imported: false, name: '', price: '', warnings: [] };
function AddMenu({ base, close }: { base: string; close: () => void }) {
  const imageInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ pending?: boolean; error?: string; empty?: boolean }>({});
  const form = useForm<Bulk>({ resolver: zodResolver(bulk), defaultValues: { rows: [{ ...blank }] } });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'rows' });
  const save = useAction(({ rows }: Bulk) => api(base + '/menu', {
    method: 'POST', body: { items: rows.filter(row => row.include).map(row => ({ name: row.name, price: Number(row.price) })) },
  }), keys, 'Đã thêm món vào thực đơn.', close);
  async function extract(image: File) {
    if (image.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      setStatus({ error: 'Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB.' }); return;
    }
    setStatus({ pending: true });
    try {
      const body = new FormData(); body.set('image', image);
      const { items } = await api<{ items: ExtractedItem[] }>(base + '/menu/extract', { method: 'POST', body });
      if (!items.length) { setStatus({ empty: true }); return; }
      const existing = form.getValues('rows').filter(row => row.name.trim() || row.price.trim());
      if (existing.length + items.length > 200) { setStatus({ error: 'Chỉ có thể lưu tối đa 200 món mỗi lần.' }); return; }
      replace([...existing, ...items.map(item => ({
        include: item.warnings.length === 0, imported: true, name: item.name,
        price: item.price === null ? '' : String(item.price), warnings: item.warnings,
      }))]);
      setStatus({});
    } catch (error) { setStatus({ error: errorMessage(error) }); }
  }
  const { errors } = form.formState;
  const rows = form.watch('rows');
  const busy = save.isPending || status.pending;
  return <Modal title="Thêm món" onClose={close} wide busy={busy}>
    <div className="ai-upload">
      <input ref={imageInput} hidden type="file" aria-label="Ảnh thực đơn" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const image = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (image && !busy) void extract(image);
      }} />
      <Button tone="neutral" disabled={save.isPending} busy={status.pending} onClick={() => imageInput.current?.click()}>
        <Sparkles size={17} /> {status.pending ? 'Đang đọc ảnh…' : 'Import từ ảnh bằng AI'}
      </Button>
      {status.error && <p className="inline-error" role="alert">{status.error}</p>}
      {status.empty && <p className="inline-info" role="status">AI chưa nhận diện được món nào.</p>}
    </div>
    <form className="form-stack" onSubmit={form.handleSubmit(data => save.mutate(data))} noValidate>
      {fields.map((field, index) => <div className="bulk-user" key={field.id}>
        <div className="section-head"><h3>Món {index + 1}</h3>{fields.length > 1 && <Button tone="ghost" disabled={busy} aria-label={'Bỏ món ' + (index + 1)} onClick={() => remove(index)}><Trash2 size={17} /></Button>}</div>
        <div className="bulk-user-fields">
          <Field label="Tên món" required={rows[index]?.include} error={errors.rows?.[index]?.name?.message}><input required={rows[index]?.include} disabled={busy} {...form.register(`rows.${index}.name`)} /></Field>
          <Field label="Giá (VND)" required={rows[index]?.include} error={errors.rows?.[index]?.price?.message}><input required={rows[index]?.include} disabled={busy} inputMode="numeric" {...form.register(`rows.${index}.price`)} /></Field>
        </div>
        {field.imported && <label className="check-label"><input disabled={busy} type="checkbox" {...form.register(`rows.${index}.include`)} /> Lưu món này</label>}
        {field.warnings.length > 0 && <small className="bulk-warnings">{field.warnings.join(' · ')}</small>}
      </div>)}
      {errors.rows?.root?.message && <small className="field-error">{errors.rows.root.message}</small>}
      <div className="form-actions"><Button tone="neutral" disabled={busy || fields.length >= 200} onClick={() => append({ ...blank })}><Plus size={17} /> Thêm dòng</Button>
        <Button type="submit" disabled={status.pending} busy={save.isPending}>Lưu món</Button></div>
    </form>
  </Modal>;
}
