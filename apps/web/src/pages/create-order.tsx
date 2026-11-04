import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CalendarClock, Check, Store } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { idSchema, isFinalized, type OrderDetail, type Page, type Restaurant } from '@vsf/shared';
import { api, ApiError, errorMessage, params } from '../api';
import { Back, Button, Empty, Failure, Field, Heading, Loading, localInput, Pager, RequiredMark, RestaurantIcon, SearchBox, toInstant, useDebounce, useTitle } from '../ui';

const formSchema = z.object({
  restaurantId: idSchema, note: z.string().trim().max(1000),
  deadline: z.string().min(1, 'Chọn hạn chốt đơn.').refine(value => Date.parse(value + ':00+07:00') > Date.now(), 'Hạn chốt đơn phải ở trong tương lai.'),
});
type Fields = z.input<typeof formSchema>;

export default function CreateOrder() {
  const [search] = useSearchParams();
  const reuse = search.get('reuse');
  const valid = idSchema.safeParse(reuse).success;
  const source = useQuery({
    queryKey: ['order', reuse],
    queryFn: ({ signal }) => api<OrderDetail>('/orders/' + reuse, { signal }),
    enabled: valid,
  });
  useTitle(reuse ? 'Đặt lại' : 'Tạo đơn đặt món');
  if (!reuse) {
    const restaurantId = idSchema.safeParse(search.get('restaurant')).data ?? '';
    return <OrderForm key={restaurantId} restaurantId={restaurantId} />;
  }
  if (!valid) return <Failure error={new ApiError(404, 'Không tìm thấy đơn đặt trước.')} />;
  if (source.isPending) return <Loading />;
  if (source.isError) return <Failure error={source.error} retry={() => void source.refetch()} />;
  if (!isFinalized(source.data.status)) return <Failure error={new ApiError(409, 'Chỉ có thể đặt lại từ đơn đã chốt.')} />;
  return <OrderForm key={reuse} restaurantId={source.data.restaurant.id} previous={source.data} />;
}

function OrderForm({ restaurantId, previous }: { restaurantId: string; previous?: OrderDetail }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [failure, setFailure] = useState('');
  const query = useDebounce(q);
  const restaurants = useQuery({
    queryKey: ['restaurants', 'picker', page, query],
    queryFn: ({ signal }) => api<Page<Restaurant>>('/restaurants' + params({ size: 8, page, q: query }), { signal }),
  });
  const fromLink = useQuery({
    queryKey: ['restaurants', restaurantId],
    queryFn: ({ signal }) => api<Restaurant>('/restaurants/' + restaurantId, { signal }),
    enabled: !!restaurantId,
  });
  const form = useForm<Fields>({ resolver: zodResolver(formSchema), defaultValues: {
    restaurantId, note: previous?.note ?? '', deadline: localInput(Date.now() + 45 * 60_000),
  } });
  const selected = form.watch('restaurantId');
  const [picked, setPicked] = useState<Restaurant>();
  const selection = picked ?? fromLink.data;
  const { errors, isSubmitting } = form.formState;
  return <>
    <Back to={previous ? '/orders/' + previous.id : '/orders'}>{previous ? 'Về đơn trước' : 'Về danh sách đơn'}</Back>
    <Heading title={previous ? 'Đặt lại' : 'Tạo đơn đặt món'} />
    <form className="create-form" noValidate onSubmit={form.handleSubmit(async fields => {
      setFailure('');
      try {
        const result = await api<{ id: string }>('/orders', { method: 'POST', body: { ...fields, deadline: toInstant(fields.deadline) } });
        toast.success('Đã tạo đơn mới. Bạn có thể chọn món.');
        navigate('/orders/' + result.id);
      } catch (error) { setFailure(errorMessage(error)); }
    })}>
        <section className="panel form-panel">
          <div className="form-section-head"><span className="stat-icon red"><Store size={19} /></span><h2>Chọn quán ăn<RequiredMark /></h2></div>
          <input type="hidden" {...form.register('restaurantId')} />
          <SearchBox value={q} onChange={value => { setPage(1); setQ(value); }} placeholder="Tìm quán ăn…" />
          {selection && <p className="selected-copy"><Check size={16} /> Đã chọn {selection.name}</p>}
          {fromLink.isError && !picked && <p className="inline-info">Quán này hiện không nhận đơn. Hãy chọn quán khác.</p>}
          {restaurants.isPending ? <Loading count={1} /> : restaurants.isError ? <Failure error={restaurants.error} retry={() => void restaurants.refetch()} /> : <>
            {restaurants.data.items.length ? <div className="picker-grid">{restaurants.data.items.map(row => <button type="button" className={`picker ${selected === row.id ? 'selected' : ''}`} aria-pressed={selected === row.id} key={row.id} onClick={() => {
              form.setValue('restaurantId', row.id, { shouldValidate: true }); setPicked(row);
            }}><RestaurantIcon image={row.imageUrl} /><span>{row.name}</span>{selected === row.id && <Check size={16} />}</button>)}</div> : <Empty title="Chưa tìm thấy quán" />}
            <Pager {...restaurants.data} change={setPage} />
          </>}
          {errors.restaurantId && <small className="field-error">Chọn một quán ăn để tiếp tục.</small>}
        </section>
        <section className="panel form-panel">
          <div className="form-section-head"><span className="stat-icon amber"><CalendarClock size={19} /></span><h2>Thông tin đơn</h2></div>
          <Field label="Hạn chốt đơn" required error={errors.deadline?.message} hint="Giờ Việt Nam (UTC+7)."><input type="datetime-local" required {...form.register('deadline')} /></Field>
          <Field label="Ghi chú (tùy chọn)" error={errors.note?.message}><textarea rows={3} placeholder="Ví dụ: Quán giao ở sảnh tầng 1…" {...form.register('note')} /></Field>
        </section>
        {failure && <div className="inline-error" role="alert">{failure}</div>}
        <div className="form-actions"><Link className="btn btn-neutral" to={previous ? '/orders/' + previous.id : '/orders'}>Hủy</Link><Button type="submit" busy={isSubmitting} disabled={!!restaurantId && !picked && !fromLink.data}>Tạo đơn và chọn món <ArrowRight size={17} /></Button></div>
    </form>
  </>;
}
