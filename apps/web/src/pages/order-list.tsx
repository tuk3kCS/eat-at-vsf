import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { statuses } from '@vsf/shared';
import { OrderCard, scopes, useOrders, type Scope } from '../order-ui';
import { Empty, Failure, Filters, Heading, labels, Loading, Pager, SearchBox, useDebounce, useTitle } from '../ui';

export default function OrderList() {
  useTitle('Đơn đặt món');
  const [search, setSearch] = useSearchParams();
  const scope = scopes.find(([key]) => key === search.get('scope'))?.[0] ?? 'open';
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [restaurantName, setRestaurant] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const results = useOrders({ scope, page, q: useDebounce(q), status, restaurantName: useDebounce(restaurantName), from, to });
  function pick(value: Scope) { setPage(1); setStatus(''); setSearch({ scope: value }); }
  const change = (setter: (value: string) => void, value: string) => { setPage(1); setter(value); };
  return <>
    <Heading title="Đơn đặt món">
      <Link className="btn btn-primary" to="/orders/create"><Plus size={18} /> Tạo đơn đặt món</Link>
    </Heading>
    <div className="tabs" role="group" aria-label="Nhóm đơn">{scopes.map(([key, label]) => <button type="button" key={key} aria-pressed={scope === key} className={scope === key ? 'active' : ''} onClick={() => pick(key)}>{label}</button>)}</div>
    <Filters active={!!(q.trim() || status || restaurantName.trim() || from || to)}>
      <SearchBox value={q} onChange={value => change(setQ, value)} placeholder="Quán hoặc người tạo…" />
      <select aria-label="Trạng thái" value={status} onChange={event => change(setStatus, event.target.value)}><option value="">Mọi trạng thái</option>{statuses.map(key => <option key={key} value={key}>{labels[key]}</option>)}</select>
      <SearchBox value={restaurantName} onChange={value => change(setRestaurant, value)} placeholder="Lọc theo tên quán…" />
      <label className="filter-date">Từ ngày<input type="date" value={from} onChange={event => change(setFrom, event.target.value)} /></label>
      <label className="filter-date">Đến ngày<input type="date" value={to} min={from || undefined} onChange={event => change(setTo, event.target.value)} /></label>
    </Filters>
    {results.isPending ? <Loading /> : results.isError ? <Failure error={results.error} retry={() => void results.refetch()} /> : <>
      {results.data.items.length ? <div className="card-grid">{results.data.items.map(order => <OrderCard order={order} key={order.id} join={scope === 'open'} />)}</div>
        : <Empty title="Chưa có đơn phù hợp" />}
      <Pager {...results.data} change={setPage} />
    </>}
  </>;
}
