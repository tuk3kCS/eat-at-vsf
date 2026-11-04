import { ArrowRight, ChefHat, CircleCheck, ClipboardList, Plus, Radio, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../api';
import { OrderCard, useOrders } from '../order-ui';
import { Empty, Failure, Loading, useTitle } from '../ui';

export default function Dashboard() {
  useTitle('Tổng quan');
  const user = useSession().data!;
  const open = useOrders({ scope: 'open', size: 3 });
  const created = useOrders({ scope: 'created', size: 2 });
  const joined = useOrders({ scope: 'joined', size: 2 });
  return <div className="dashboard">
    <div className="page-kicker"><span className="page-kicker-icon"><ChefHat size={15} /></span> KHÔNG GIAN ĂN TRƯA</div>
    <section className="hero">
      <div className="hero-content">
        <span className="hero-label"><Sparkles size={15} /> BỮA TRƯA CÙNG NHAU</span>
        <h1>Xin chào, {user.username}!</h1>
        <div className="hero-actions"><Link className="btn btn-primary" to="/orders/create"><Plus size={19} /> Tạo đơn đặt món</Link>
          <Link className="btn btn-hero" to="/restaurants">Khám phá quán <ArrowRight size={17} /></Link></div>
      </div>
      <img className="hero-art" src="/lunch.svg" alt="" />
    </section>
    <div className="stats-row">
      {([
        ['Đơn đang mở', open.data?.total, Radio, 'green', '/orders?scope=open', 'Có thể tham gia'],
        ['Đơn tôi tạo', created.data?.total, ClipboardList, 'red', '/orders?scope=created', 'Do bạn tổ chức'],
        ['Đơn đã tham gia', joined.data?.total, CircleCheck, 'amber', '/orders?scope=joined', 'Đặt cùng đồng nghiệp'],
      ] as const).map(([name, count, Icon, color, to, sub]) => <Link to={to} className="stat" key={name}>
        <div className={`stat-icon ${color}`}><Icon size={20} /></div>
        <div className="stat-body"><span>{name}</span><strong>{count ?? '—'}</strong><small>{sub}</small></div><ArrowRight className="stat-arrow" size={17} />
      </Link>)}
    </div>
    <section className="dash-section">
      <header className="section-head"><h2>Đơn đang mở <span className="live-dot" /></h2>
        <Link className="text-link" to="/orders?scope=open">Tất cả đơn <ArrowRight size={17} /></Link></header>
      {open.isPending ? <Loading /> : open.isError ? <Failure error={open.error} retry={() => void open.refetch()} /> : open.data.items.length ?
        <div className="card-grid">{open.data.items.map(order => <OrderCard key={order.id} order={order} join />)}</div>
        : <Empty title="Chưa có đơn đang mở" />}
    </section>
  </div>;
}
