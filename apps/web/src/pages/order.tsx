import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, CircleStop, ClipboardCheck, CopyPlus, Download, Link2, LogOut, Minus, Plus, RotateCcw, ShoppingBag, Trash2, Users, Utensils, XCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { idSchema, isFinalized, maxQuantity, type Line, type MenuItem, type OrderDetail } from '@vsf/shared';
import { api, ApiError, errorMessage, useAction, useSession } from '../api';
import { Back, Badge, Button, Confirm, Countdown, dateTime, Empty, Failure, Field, Loading, localInput, Modal, money, RestaurantIcon, SearchBox, toInstant, useTitle } from '../ui';

const Export = lazy(() => import('./order-export'));
const actions = {
  close: { label: 'Chốt đơn', title: 'Chốt đơn ngay?', text: 'Sau khi chốt, mọi người sẽ dừng thêm hoặc chỉnh sửa món.', notice: 'Đã chốt đơn. Bạn có thể xuất ảnh đơn hàng.' },
  cancel: { label: 'Hủy đơn', title: 'Hủy đơn đặt món?', text: 'Mọi người sẽ thấy đơn đã hủy.', notice: 'Đã hủy đơn.' },
  leave: { label: 'Rời đơn', title: 'Rời đơn đặt món?', text: 'Phần món bạn đã chọn sẽ được xóa khỏi đơn.', notice: 'Đã rời đơn.' },
};
type Action = keyof typeof actions;

export default function OrderPage() {
  const { id = '' } = useParams();
  const valid = idSchema.safeParse(id).success;
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: ({ signal }) => api<OrderDetail>('/orders/' + id, { signal }),
    refetchInterval: 7000,
    enabled: valid,
  });
  useTitle(order.data?.restaurant.name ?? 'Chi tiết đơn');
  if (!valid) return <><Back to="/orders">Về danh sách đơn</Back><Failure error={new ApiError(404, 'Đường dẫn đơn không hợp lệ.')} /></>;
  if (order.isPending) return <Loading />;
  if (order.isError && !order.data) return <><Back to="/orders">Về danh sách đơn</Back><Failure error={order.error} retry={() => void order.refetch()} /></>;
  return <OrderContent key={id} order={order.data!} stale={order.isError} />;
}

function OrderContent({ order, stale }: { order: OrderDetail; stale: boolean }) {
  const user = useSession().data!;
  const navigate = useNavigate();
  const [tab, setTab] = useState<'menu' | 'mine' | 'summary'>(order.status === 'OPEN' ? 'menu' : 'summary');
  const [filter, setFilter] = useState('');
  const [summaryMode, setSummaryMode] = useState<'dish' | 'people'>('dish');
  const [dialog, setDialog] = useState<Action | 'deadline' | 'reopen' | 'export' | 'share'>();
  const [deadline, setDeadline] = useState('');
  const [deadlineError, setDeadlineError] = useState('');
  const [remove, setRemove] = useState<Line>();
  const base = '/orders/' + order.id;
  const shareUrl = new URL(base, window.location.origin).href;
  const isOpen = order.status === 'OPEN';
  const finalized = isFinalized(order.status);
  const canManage = order.owner.id === user.id;
  const action = useAction((input: { path: string; method: string; body?: unknown; notice: string }) =>
    api(base + input.path, { method: input.method, body: input.body }), ['order', 'orders'], input => input.notice,
  input => {
    if (input.path === '/leave') navigate('/orders?scope=open', { replace: true });
    setDialog(undefined); setRemove(undefined);
  });
  const actionError = action.isError ? errorMessage(action.error) : undefined;
  function openActionDialog(next: Action | 'deadline' | 'reopen') {
    action.reset();
    setDeadlineError('');
    setDialog(next);
  }
  const quantity = order.myLines.reduce((sum, row) => sum + row.quantity, 0);
  const search = filter.trim().toLocaleLowerCase('vi');
  const menu = order.menu.filter(item => item.name.toLocaleLowerCase('vi').includes(search));
  const submit = (key: Action) => action.mutate({ path: '/' + key, method: 'POST', notice: actions[key].notice });
  const confirm = dialog && dialog in actions ? actions[dialog as Action] : undefined;
  async function share() {
    try { await navigator.clipboard.writeText(shareUrl); toast.success('Đã sao chép đường dẫn.'); }
    catch { setDialog('share'); }
  }
  const actionable = !stale && !action.isPending;
  const allConfirmed = order.confirmedCount === order.participantCount;
  const canEditItems = order.acceptingItems && order.joined && !order.myConfirmed && actionable;
  const needsConfirmation = isOpen && order.joined && !order.myConfirmed && order.myLines.length > 0;
  const confirmItems = isOpen && order.joined && <Button
    tone={order.myConfirmed ? 'neutral' : 'primary'} disabled={!actionable || !order.myLines.length}
    onClick={() => action.mutate({
      path: '/confirmation', method: 'PATCH', body: { confirmed: !order.myConfirmed },
      notice: order.myConfirmed ? 'Đã bỏ chốt món. Bạn có thể sửa phần món của mình.' : 'Đã chốt món.',
    })}
  ><ClipboardCheck size={17} /> {order.myConfirmed ? 'Bỏ chốt món' : 'Chốt món'}</Button>;
  return <>
    <Back to="/orders">Về danh sách đơn</Back>
    {stale && <div className="inline-error" role="alert">Chưa đồng bộ được đơn. Thông tin dưới đây là lần tải gần nhất. Hệ thống sẽ tự thử lại.</div>}
    <section className="panel order-banner">
      <div className="order-heading">
        <div className="order-banner-main"><RestaurantIcon image={order.restaurant.imageUrl} size="large" /><div>
          <div className="order-banner-kicker"><Badge status={order.status} /></div>
          <h1>{order.restaurant.name}</h1><p>Tạo bởi {order.owner.name}</p>
        </div></div>
        <div className="order-facts">
          <div><CalendarClock size={19} /><span><small>HẠN CHỐT</small><strong>{dateTime(order.deadline)}</strong></span></div>
          {order.acceptingItems && <Countdown deadline={order.deadline} />}
        </div>
      </div>
      {order.note && <div className="order-note">{order.note}</div>}
      <div className="order-actions">
        {order.acceptingItems && !order.joined && <Button disabled={stale} busy={action.isPending} onClick={() => action.mutate({ path: '/join', method: 'POST', notice: 'Đã tham gia đơn. Bạn có thể chọn món.' })}><Plus size={17} /> Tham gia đơn</Button>}
        {isOpen && order.joined && !canManage && <Button tone="neutral" disabled={!actionable} onClick={() => openActionDialog('leave')}><LogOut size={17} /> Rời đơn</Button>}
        <Button tone="neutral" className="order-share" aria-label="Sao chép liên kết" title="Sao chép liên kết" onClick={() => void share()}><Link2 size={17} /><span>Sao chép liên kết</span></Button>
        {canManage && <>
          {finalized && <>
            <Button disabled={!actionable} aria-label="Xuất đơn hàng" onClick={() => setDialog('export')}>
              <Download size={17} /><span className="full-label">Xuất đơn hàng</span><span className="compact-label">Xuất ảnh</span>
            </Button>
            <Button tone="neutral" disabled={!actionable} aria-label="Mở lại đơn" onClick={() => {
              setDeadline(localInput(Date.now() + 45 * 60_000)); openActionDialog('reopen');
            }}><RotateCcw size={17} /><span className="full-label">Mở lại đơn</span><span className="compact-label">Mở lại</span></Button>
          </>}
          {isOpen && <Button tone="primary" disabled={!actionable || !allConfirmed} onClick={() => openActionDialog('close')}><CircleStop size={17} /> Chốt đơn</Button>}
          {isOpen && <details className="account order-more"><summary className="btn btn-neutral">Tùy chọn <ChevronDown size={15} /></summary>
            <div className="account-pop"><Button tone="ghost" disabled={!actionable} onClick={event => {
              event.currentTarget.closest('details')?.removeAttribute('open');
              setDeadline(localInput(Math.max(Date.parse(order.deadline), Date.now() + 15 * 60_000))); openActionDialog('deadline');
            }}><CalendarClock size={16} /> Đổi hạn chốt</Button>
              <Button tone="ghost" disabled={!actionable} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); openActionDialog('cancel'); }}><XCircle size={16} /> Hủy đơn</Button></div>
          </details>}
        </>}
        {finalized && <Link className="btn btn-neutral" to={'/orders/create?reuse=' + order.id}><CopyPlus size={17} /> Đặt lại</Link>}
      </div>
    </section>
    <div className="tabs order-tabs" role="group" aria-label="Chi tiết đơn">
      <button type="button" className={tab === 'menu' ? 'active' : ''} aria-pressed={tab === 'menu'} onClick={() => setTab('menu')}><Utensils size={16} /> Thực đơn</button>
      <button type="button" className={tab === 'mine' ? 'active' : ''} aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}><ShoppingBag size={16} /> Đơn của tôi <span>{quantity}</span></button>
      <button type="button" className={tab === 'summary' ? 'active' : ''} aria-pressed={tab === 'summary'}
        aria-label={`Tổng hợp đơn, ${order.confirmedCount} trên ${order.participantCount} người đã chốt`} onClick={() => setTab('summary')}>
        <ClipboardCheck size={16} /> Tổng hợp đơn <span aria-hidden="true">{`${order.confirmedCount}/${order.participantCount}`}</span>
      </button>
    </div>
    {tab === 'menu' && <div className="order-layout tab-enter">
      <section className="panel form-panel">
        <div className="section-head menu-heading">
          <h2>Thực đơn</h2>
          {needsConfirmation && <p className="menu-confirm-reminder" role="status"><ClipboardCheck size={15} /> Hãy chốt món để hoàn tất.</p>}
        </div>
        {order.acceptingItems && <SearchBox value={filter} onChange={setFilter} placeholder="Tìm món ăn…" />}
        {menu.length ? <div className="menu-list">{menu.map(item => <Dish key={item.id} item={item} enabled={canEditItems} add={quantity => action.mutate({
          path: '/items', method: 'POST', body: { menuItemId: item.id, quantity }, notice: 'Đã thêm ' + item.name + ' vào đơn của bạn.',
        })} />)}</div> : <Empty title={!order.acceptingItems ? 'Đơn đã ngừng nhận món' : filter ? 'Không tìm thấy món' : 'Quán chưa có món để đặt'} />}
      </section>
      <aside className="panel cart">
        <div className="section-head"><h2><ShoppingBag size={19} /> Đơn của tôi</h2></div>
        {!order.myLines.length ? <p className="muted">{order.joined ? 'Chưa có món nào được chọn.' : 'Tham gia đơn để chọn món của bạn.'}</p> :
          <ul>{order.myLines.map(line => <li key={line.id}><span>{line.name} ×{line.quantity}</span><strong>{money(line.total)}</strong></li>)}</ul>}
        <div className="cart-footer">
          <div className="cart-total"><span>Tạm tính</span><strong>{money(order.myTotal)}</strong></div>
          <div className="cart-actions">
            {confirmItems}
            <Button tone="neutral" onClick={() => setTab('mine')}>Xem đơn của tôi</Button>
          </div>
        </div>
      </aside>
    </div>}
    {tab === 'mine' && <section className="panel form-panel tab-enter">
      <div className="section-head"><h2>Món bạn đã chọn</h2></div>
      {order.myLines.length ? <>
        <div className="menu-list">{order.myLines.map(line => <div className="menu-line" key={line.id}>
          <div className="menu-line-name"><strong>{line.name}</strong><small>{money(line.unitPrice)} / món</small></div>
          {canEditItems ? <div className="menu-line-actions">
            <Stepper name={line.name} quantity={line.quantity} set={quantity => action.mutate({
              path: '/items/' + line.id, method: 'PATCH', body: { version: line.version, quantity },
              notice: 'Đã cập nhật số lượng món.',
            })} />
            <Button tone="ghost" aria-label={'Xóa ' + line.name} onClick={() => { action.reset(); setRemove(line); }}><Trash2 size={17} /></Button>
          </div> : <span>×{line.quantity}</span>}
          <strong>{money(line.total)}</strong>
        </div>)}</div>
        <div className="cart-total"><span>Tổng của tôi</span><strong>{money(order.myTotal)}</strong></div>
        {confirmItems && <div className="form-actions">{confirmItems}</div>}
      </> : <Empty title="Bạn chưa chọn món"><Button tone="neutral" onClick={() => setTab('menu')}>Xem thực đơn</Button></Empty>}
    </section>}
    {tab === 'summary' && <section className="panel form-panel tab-enter">
      <div className="section-head summary-heading"><h2>Tổng hợp đơn</h2>
        {order.people && <div className="segmented"><Button tone={summaryMode === 'dish' ? 'primary' : 'ghost'} onClick={() => setSummaryMode('dish')}>Theo món</Button><Button tone={summaryMode === 'people' ? 'primary' : 'ghost'} onClick={() => setSummaryMode('people')}>Theo người</Button></div>}</div>
      {summaryMode === 'people' && order.people ? <div className="people-list">{order.people.map(person => <article key={person.id}>
        <div className="people-title">
          <div className="people-identity">
            <strong><Users size={17} /> <span>{person.name}</span></strong>
            {isOpen && <span className={'badge ' + (person.confirmed ? 'badge-open' : 'badge-neutral')}>{person.confirmed ? 'Đã chốt món' : person.lines.length ? 'Chưa chốt món' : 'Chưa chọn món'}</span>}
          </div>
          <strong>{money(person.total)}</strong>
        </div>
        {person.lines.length > 0 && <SummaryTable rows={person.lines.map(line => ({ ...line, key: line.id }))} />}
      </article>)}</div> : order.groups.length ? <SummaryTable rows={order.groups} /> : <Empty title="Chưa có món nào trong đơn" />}
      <div className="cart-total"><span>Tổng cộng</span><strong>{money(order.total)}</strong></div>
    </section>}
    {confirm && <Confirm title={confirm.title} text={dialog === 'leave' && !order.myLines.length ? 'Bạn sẽ được gỡ khỏi danh sách tham gia.' : confirm.text}
      action={confirm.label} busy={action.isPending} error={actionError} danger={dialog === 'cancel' || dialog === 'leave'} onClose={() => setDialog(undefined)} onConfirm={() => submit(dialog as Action)} />}
    {remove && <Confirm title="Xóa món khỏi đơn của bạn?" text={remove.name} action="Xóa món" danger busy={action.isPending} error={actionError}
      onClose={() => setRemove(undefined)} onConfirm={() => action.mutate({
        path: '/items/' + remove.id + '?version=' + remove.version, method: 'DELETE', notice: 'Đã xóa ' + remove.name + ' khỏi đơn của bạn.',
      })} />}
    {(dialog === 'deadline' || dialog === 'reopen') && <Modal title={dialog === 'reopen' ? 'Mở lại đơn' : 'Đổi hạn chốt đơn'} onClose={() => setDialog(undefined)} busy={action.isPending}>
      <form className="form-stack" onSubmit={event => {
        event.preventDefault();
        const value = toInstant(deadline);
        if (Date.parse(value) <= Date.now()) { setDeadlineError('Hạn chốt đơn phải ở trong tương lai.'); return; }
        action.mutate(dialog === 'reopen'
          ? { path: '/reopen', method: 'POST', body: { deadline: value }, notice: 'Đã mở lại đơn.' }
          : { path: '', method: 'PATCH', body: { deadline: value }, notice: 'Đã cập nhật hạn chốt đơn.' });
      }}>
        <Field label="Hạn chốt mới" required hint="Giờ Việt Nam (UTC+7)." error={deadlineError}><input type="datetime-local" required disabled={action.isPending} value={deadline} onChange={event => {
          setDeadline(event.target.value);
          setDeadlineError('');
          if (action.isError) action.reset();
        }} /></Field>
        {actionError && <p className="inline-error" role="alert">{actionError}</p>}
        <div className="form-actions"><Button type="submit" busy={action.isPending}>{dialog === 'reopen' ? 'Mở lại đơn' : 'Lưu hạn chốt'}</Button></div>
      </form></Modal>}
    {dialog === 'share' && <Modal title="Chia sẻ đơn đặt món" onClose={() => setDialog(undefined)}>
      <Field label="Đường dẫn tham gia"><input readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /></Field>
    </Modal>}
    {dialog === 'export' && finalized && <Suspense fallback={<Modal title="Đang mở bản xem trước" onClose={() => setDialog(undefined)}><Loading count={1} /></Modal>}><Export id={order.id} close={() => setDialog(undefined)} /></Suspense>}
  </>;
}

function Stepper({ name, quantity, set, disabled }: { name: string; quantity: number; set: (value: number) => void; disabled?: boolean }) {
  return <div className="stepper">
    <Button tone="ghost" aria-label={'Giảm số lượng ' + name} disabled={disabled || quantity <= 1} onClick={() => set(quantity - 1)}><Minus size={15} /></Button>
    <span aria-label="Số lượng">{quantity}</span>
    <Button tone="ghost" aria-label={'Tăng số lượng ' + name} disabled={disabled || quantity >= maxQuantity} onClick={() => set(quantity + 1)}><Plus size={15} /></Button>
  </div>;
}

function Dish({ item, enabled, add }: { item: MenuItem; enabled: boolean; add: (quantity: number) => void }) {
  const [quantity, set] = useState(1);
  return <div className="menu-line dish-line">
    <div className="menu-line-name"><strong>{item.name}</strong><b>{money(item.price)}</b></div>
    <div className="menu-line-actions">
      <Stepper name={item.name} quantity={quantity} disabled={!enabled} set={set} />
      <Button className="btn-small" tone="neutral" disabled={!enabled} aria-label={'Thêm ' + item.name} onClick={() => add(quantity)}><Plus size={16} /> Thêm</Button>
    </div>
  </div>;
}
function SummaryTable({ rows }: { rows: { key: string; name: string; quantity: number; unitPrice: number; total: number }[] }) {
  return <div className="summary-table" role="table" aria-label="Danh sách món">
    <div role="row" className="summary-header"><span role="columnheader">Món ăn</span><span role="columnheader">SL</span><span role="columnheader">Đơn giá</span><span role="columnheader">Thành tiền</span></div>
    {rows.map(row => <div role="row" key={row.key}><span role="cell">{row.name}</span><span role="cell">{row.quantity}</span><span role="cell">{money(row.unitPrice)}</span><strong role="cell">{money(row.total)}</strong></div>)}
  </div>;
}
