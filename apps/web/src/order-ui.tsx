import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, Users, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OrderCard as OrderCardType, Page } from '@vsf/shared';
import { api, params } from './api';
import { Badge, dateTime, money, RestaurantIcon } from './ui';

export const scopes = [
  ['open', 'Đơn đang mở'], ['created', 'Đơn tôi tạo'], ['joined', 'Đơn đã tham gia'], ['history', 'Lịch sử'],
] as const;
export type Scope = typeof scopes[number][0];
export function useOrders(filters: { scope: Scope; size?: number; page?: number; q?: string; from?: string; to?: string; status?: string; restaurantName?: string }) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: ({ signal }) => api<Page<OrderCardType>>('/orders' + params(filters), { signal }),
    refetchInterval: 7000,
  });
}

export function OrderCard({ order, join }: { order: OrderCardType; join?: boolean }) {
  return <article className="order-card">
    <div className="order-card-top"><RestaurantIcon image={order.restaurant.imageUrl} /><Badge status={order.status} /></div>
    <h3><Link to={'/orders/' + order.id}>{order.restaurant.name}</Link></h3>
    <div className="card-owner">Tạo bởi {order.owner.name}</div>
    <div className="order-meta"><span><CalendarClock size={15} /> {dateTime(order.deadline)}</span>
      <div><span><Users size={15} /> {order.participantCount} người</span><span><Utensils size={15} /> {order.quantity} món</span></div></div>
    <div className="order-card-foot"><div><small>TỔNG CỘNG</small><strong>{money(order.total)}</strong></div>
      <Link to={'/orders/' + order.id} className="btn btn-neutral btn-small">{join && order.acceptingItems ? 'Xem và tham gia' : 'Xem chi tiết'} <ArrowRight size={15} /></Link></div>
  </article>;
}
