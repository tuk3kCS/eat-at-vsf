import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Pencil, Plus, Store, Trash2, Upload, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import { restaurantSchema, type Extraction, type Page, type Restaurant } from '@vsf/shared';
import { api, errorMessage, params, useAction } from '../api';
import { Button, Confirm, Empty, Failure, Field, Filters, Heading, Loading, Modal, Pager, RestaurantIcon, SearchBox, useDebounce, useTitle } from '../ui';

export default function Restaurants({ admin = false }: { admin?: boolean }) {
  useTitle(admin ? 'Quản lý quán ăn' : 'Quán ăn');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Restaurant | 'new'>();
  const [deleting, setDeleting] = useState<Restaurant>();
  const base = admin ? '/admin/restaurants' : '/restaurants';
  const key = admin ? 'admin-restaurants' : 'restaurants';
  const filter = useDebounce(q);
  const query = useQuery({
    queryKey: [key, page, filter, sort],
    queryFn: ({ signal }) => api<Page<Restaurant>>(base + params({ page, q: filter, sort, size: 12 }), { signal }),
  });
  const keys = ['restaurants', 'admin-restaurants', 'order'];
  const remove = useAction((row: Restaurant) => api(base + '/' + row.id, { method: 'DELETE' }), keys, 'Đã xóa quán khỏi danh sách.', () => setDeleting(undefined));
  return <>
    <Heading eyebrow={admin ? 'QUẢN TRỊ' : undefined} title={admin ? 'Quản lý quán ăn' : 'Quán ăn'}>
      {admin && <Button onClick={() => setEditing('new')}><Plus size={18} /> Thêm quán</Button>}
    </Heading>
    <Filters active={!!q.trim() || sort !== 'name'}>
      <SearchBox value={q} onChange={value => { setQ(value); setPage(1); }} placeholder="Tìm tên quán…" />
      <select aria-label="Sắp xếp quán" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="name">Tên A–Z</option><option value="newest">Mới nhất</option></select>
    </Filters>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <>
      {query.data.items.length ? <div className="card-grid">{query.data.items.map(row => <article className="order-card catalog-card" key={row.id}>
        <div className="order-card-top"><RestaurantIcon size="large" image={row.imageUrl} /></div>
        <h3>{row.name}</h3>
        <div className="catalog-meta"><span><Utensils size={15} />{row.menuCount ?? 0} món</span></div>
        <div className="catalog-actions"><Link className="btn btn-neutral btn-small" to={base + '/' + row.id + '/menu'}>Xem thực đơn <ArrowRight size={16} /></Link>
          {admin && <div className="icon-actions"><Button tone="ghost" aria-label={'Sửa ' + row.name} title="Sửa quán" onClick={() => setEditing(row)}><Pencil size={16} /></Button>
            <Button tone="ghost" aria-label={'Xóa ' + row.name} title="Xóa quán" onClick={() => setDeleting(row)}><Trash2 size={16} /></Button></div>}</div>
      </article>)}</div> : <Empty title="Chưa có quán phù hợp">
        {admin && <Button tone="neutral" onClick={() => setEditing('new')}><Store size={17} /> Thêm quán</Button>}
      </Empty>}
      <Pager {...query.data} change={setPage} />
    </>}
    {editing && <RestaurantForm row={editing === 'new' ? undefined : editing} close={() => setEditing(undefined)} keys={keys} />}
    {deleting && <Confirm title="Xóa quán ăn?" text={deleting.name + ' sẽ được ẩn khỏi danh sách. Các đơn đã đặt vẫn được lưu.'} action="Xóa quán" danger busy={remove.isPending} onClose={() => setDeleting(undefined)} onConfirm={() => remove.mutate(deleting)} />}
  </>;
}
function RestaurantForm({ row, close, keys }: { row?: Restaurant; close: () => void; keys: string[] }) {
  const [file, setFile] = useState<File>();
  const [failure, setFailure] = useState('');
  const capability = useQuery({ queryKey: ['capabilities'], queryFn: ({ signal }) => api<Extraction>('/admin/capabilities', { signal }) });
  const form = useForm<z.input<typeof restaurantSchema>>({
    resolver: zodResolver(restaurantSchema), defaultValues: { name: row?.name ?? '', phone: row?.phone ?? '' },
  });
  const save = useAction((data: z.input<typeof restaurantSchema>) => api('/admin/restaurants' + (row ? '/' + row.id : ''), {
    method: row ? 'PATCH' : 'POST', body: data,
  }), keys, 'Đã lưu thông tin quán.', close);
  const { errors, isSubmitting } = form.formState;
  return <Modal title={row ? 'Chỉnh sửa quán ăn' : 'Thêm quán ăn'} onClose={close} busy={save.isPending || isSubmitting}>
    <form className="form-stack" onSubmit={form.handleSubmit(async data => {
      setFailure('');
      try {
        if (file) {
          const payload = new FormData(); payload.set('image', file);
          data.imageUrl = (await api<{ url: string }>('/admin/images', { method: 'POST', body: payload })).url;
          form.setValue('imageUrl', data.imageUrl); setFile(undefined);
        }
      } catch (error) { setFailure(errorMessage(error)); return; }
      save.mutate(data);
    })} noValidate>
      <Field label="Tên quán" required error={errors.name?.message}><input required {...form.register('name')} autoFocus /></Field>
      <Field label="Số điện thoại" error={errors.phone?.message}><input type="tel" {...form.register('phone')} /></Field>
      {capability.data?.storageAvailable && <Field label="Tải ảnh quán lên" hint="JPG, PNG hoặc WebP, tối đa 8 MB."><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0])} /></Field>}
      {failure && <div className="inline-error" role="alert">{failure}</div>}
      <div className="form-actions"><Button tone="neutral" disabled={save.isPending || isSubmitting} onClick={close}>Hủy</Button>
        <Button type="submit" busy={save.isPending || isSubmitting}>{file && <Upload size={16} />} Lưu quán</Button></div>
    </form>
  </Modal>;
}
