import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ChevronDown, ClipboardList, House, LogOut, Menu, Shield, Store, Users, X } from 'lucide-react';
import { Toaster } from 'sonner';
import { zone, type User } from '@vsf/shared';
import { api, client, sessionKey, useAction, useSession } from './api';
import { Brand, Button, Empty, Failure, Loading, useTitle } from './ui';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import './style.css';

const Auth = lazy(() => import('./pages/auth'));
const Dashboard = lazy(() => import('./pages/dashboard'));
const OrderList = lazy(() => import('./pages/order-list'));
const CreateOrder = lazy(() => import('./pages/create-order'));
const Order = lazy(() => import('./pages/order'));
const Restaurants = lazy(() => import('./pages/restaurants'));
const RestaurantMenu = lazy(() => import('./pages/restaurant-menu'));
const AdminUsers = lazy(() => import('./pages/admin-users'));

function NotFound({ denied }: { denied?: boolean }) {
  useTitle(denied ? 'Không có quyền' : 'Không tìm thấy');
  return <main className="status-page"><Brand /><Empty title={denied ? 'Bạn không có quyền truy cập' : 'Không tìm thấy trang'}>
    <Link className="btn btn-neutral" to="/dashboard"><ArrowLeft size={17} /> Về tổng quan</Link>
  </Empty></main>;
}
function initials(username: string) {
  return username.slice(0, 2).toUpperCase();
}
function Guard({ admin }: { admin?: boolean }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <div className="status-page"><Brand /><Loading count={1} /></div>;
  if (!session.data && session.isError) return <div className="status-page"><Brand /><Failure error={session.error} retry={() => void session.refetch()} /></div>;
  if (!session.data) return <Navigate replace to={'/login?next=' + encodeURIComponent(location.pathname + location.search)} />;
  if (admin && session.data.role !== 'ADMIN') return <Navigate replace to="/unauthorized" />;
  return admin ? <Outlet /> : <Shell user={session.data} />;
}
const memberNav = [
  { to: '/dashboard', name: 'Tổng quan', icon: House },
  { to: '/orders', name: 'Đơn đặt món', icon: ClipboardList },
  { to: '/restaurants', name: 'Quán ăn', icon: Store },
];
const adminNav = [
  { to: '/admin/restaurants', name: 'Quản lý quán ăn', icon: Store },
  { to: '/admin/users', name: 'Người dùng', icon: Users },
];

function Shell({ user }: { user: User }) {
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);
  const logout = useAction(async () => {
    await api('/auth/logout', { method: 'POST' });
    await client.cancelQueries();
  }, [], 'Đã đăng xuất.', () => {
    client.setQueryData(sessionKey, null);
    client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
  });
  const navigation = (entries: typeof memberNav) => entries.map(({ to, name, icon: Icon }) =>
    <NavLink key={to} to={to}><Icon size={19} strokeWidth={1.9} /><span>{name}</span></NavLink>);
  const section = [...memberNav, ...adminNav].reverse().find(nav => location.pathname === nav.to || location.pathname.startsWith(nav.to + '/'));
  const today = new Intl.DateTimeFormat('vi-VN', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <div className="app-shell">
    <a href="#main" className="skip">Đến nội dung</a>
    <button className={drawer ? 'drawer-overlay visible' : 'drawer-overlay'} aria-label="Đóng điều hướng"
      aria-hidden={!drawer} disabled={!drawer} onClick={() => setDrawer(false)} />
    <aside id="sidebar" className={`sidebar ${drawer ? 'drawer-open' : ''}`}>
      <Link to="/dashboard" className="brand-link"><Brand /></Link>
      <Button className="drawer-close" tone="ghost" onClick={() => setDrawer(false)} aria-label="Đóng điều hướng"><X size={21} /></Button>
      <nav aria-label="Điều hướng chính"><div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>{navigation(memberNav)}
        {user.role === 'ADMIN' && <><div className="nav-label nav-admin"><Shield size={13} /> QUẢN TRỊ</div>{navigation(adminNav)}</>}
      </nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <Button className="drawer-toggle" tone="ghost" aria-controls="sidebar" aria-expanded={drawer} aria-label="Mở điều hướng" onClick={() => setDrawer(!drawer)}><Menu size={22} /></Button>
          <span className="crumb"><span>{location.pathname.startsWith('/admin') ? 'Quản trị' : 'Không gian chung'}</span><span className="slash">/</span><strong>{section?.name ?? 'Tài khoản'}</strong></span>
          <Link className="mobile-brand" to="/dashboard"><Brand /></Link>
        </div>
        <div className="topbar-right"><span className="today"><CalendarDays size={16} /> {today}</span>
          <details className="account"><summary aria-label="Menu tài khoản"><span className="avatar">{initials(user.username)}</span><span className="account-name">{user.username}<small>{user.role === 'ADMIN' ? 'Quản trị viên' : 'Thành viên'}</small></span><ChevronDown size={15} /></summary>
            <div className="account-pop">
              <Button tone="ghost" busy={logout.isPending} onClick={() => logout.mutate(undefined)}><LogOut size={16} /> Đăng xuất</Button></div>
          </details>
        </div>
      </header>
      <main className="content" id="main"><Suspense fallback={<Loading />}>
        <div className="page-enter" key={location.pathname}><Outlet /></div>
      </Suspense></main>
    </div>
  </div>;
}

function App() {
  return <QueryClientProvider client={client}><BrowserRouter><Suspense fallback={<div className="status-page"><Brand /><Loading count={1} /></div>}><Routes>
    <Route path="/" element={<Navigate replace to="/dashboard" />} />
    <Route path="/login" element={<Auth />} />
    <Route path="/unauthorized" element={<NotFound denied />} />
    <Route element={<Guard />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/orders" element={<OrderList />} />
      <Route path="/orders/create" element={<CreateOrder />} />
      <Route path="/orders/:id" element={<Order />} />
      <Route path="/restaurants" element={<Restaurants />} />
      <Route path="/restaurants/:id/menu" element={<RestaurantMenu />} />
      <Route element={<Guard admin />}>
        <Route path="/admin" element={<Navigate replace to="/admin/restaurants" />} />
        <Route path="/admin/restaurants" element={<Restaurants key="admin-restaurants" admin />} />
        <Route path="/admin/restaurants/:id/menu" element={<RestaurantMenu key="admin-menu" admin />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense></BrowserRouter><Toaster richColors closeButton position="bottom-right" /></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
