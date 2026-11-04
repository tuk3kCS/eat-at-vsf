import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, History, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { newUserSchema, type OrderCard, type Page, type Role, type User } from '@vsf/shared';
import { api, errorMessage, params, useAction, useSession } from '../api';
import { Badge, Button, Confirm, dateTime, Empty, Failure, Field, Heading, Loading, Modal, Pager, SearchBox, useDebounce, useTitle } from '../ui';

const keys = ['users', 'session'];
export default function AdminUsers() {
  useTitle('Quản lý người dùng');
  const actor = useSession().data!;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [newUser, setNewUser] = useState(false);
  const [editing, setEditing] = useState<User>();
  const [deleting, setDeleting] = useState<User>();
  const [history, setHistory] = useState<User>();
  const filter = useDebounce(q);
  const query = useQuery({
    queryKey: ['users', page, filter],
    queryFn: ({ signal }) => api<Page<User>>('/admin/users' + params({ page, q: filter, size: 16 }), { signal }),
  });
  const remove = useAction((row: User) => api('/admin/users/' + row.id, { method: 'DELETE' }),
    [...keys, 'orders', 'order', 'user-orders'], 'Đã xóa người dùng.', () => setDeleting(undefined));
  return <>
    <Heading eyebrow="QUẢN TRỊ" title="Quản lý người dùng">
      <Button onClick={() => setNewUser(true)}><UserPlus size={18} /> Thêm người dùng</Button>
    </Heading>
    <div className="filters panel"><SearchBox value={q} onChange={value => { setQ(value); setPage(1); }} placeholder="Tìm tên đăng nhập…" /></div>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <>
      {query.data.items.length ? <div className="panel data-list">{query.data.items.map(row => <div className="data-row user-row" key={row.id}>
        <div className="data-primary"><span className="avatar">{row.username.slice(0, 2).toUpperCase()}</span><div><strong>{row.username} {row.id === actor.id && <small className="inline-small">(bạn)</small>}</strong></div></div>
        <span className={row.role === 'ADMIN' ? 'badge badge-admin' : 'badge badge-neutral'}>{row.role === 'ADMIN' ? 'Quản trị viên' : 'Thành viên'}</span>
        <div className="icon-actions"><Button tone="ghost" title="Chỉnh sửa người dùng" aria-label={'Chỉnh sửa ' + row.username} onClick={() => setEditing(row)}><Pencil size={16} /></Button>
          <Button tone="ghost" title="Lịch sử đơn" aria-label={'Lịch sử của ' + row.username} onClick={() => setHistory(row)}><History size={17} /></Button>
          {row.id !== actor.id && <Button tone="ghost" title="Xóa người dùng" aria-label={'Xóa ' + row.username} onClick={() => { remove.reset(); setDeleting(row); }}><Trash2 size={17} /></Button>}
        </div>
      </div>)}</div> : <Empty title="Không tìm thấy người dùng" />}
      <Pager {...query.data} change={setPage} />
    </>}
    {newUser && <NewUsers close={() => setNewUser(false)} />}
    {editing && <EditUser row={editing} own={editing.id === actor.id} close={() => setEditing(undefined)} />}
    {deleting && <Confirm title={'Xóa ' + deleting.username + '?'}
      text="Tài khoản sẽ mất quyền đăng nhập. Đơn đang mở do người này tạo sẽ bị hủy. Món của họ sẽ được gỡ khỏi các đơn đang mở khác."
      action="Xóa người dùng" danger busy={remove.isPending} error={remove.isError ? errorMessage(remove.error) : undefined}
      onClose={() => setDeleting(undefined)} onConfirm={() => remove.mutate(deleting)} />}
    {history && <HistoryDialog row={history} close={() => setHistory(undefined)} />}
  </>;
}

const bulk = z.object({ users: z.array(newUserSchema).min(1).max(25) });
type Bulk = z.input<typeof bulk>;
const emptyUser = { username: '', password: '' };
function NewUsers({ close }: { close: () => void }) {
  const form = useForm<Bulk>({ resolver: zodResolver(bulk), defaultValues: { users: [{ ...emptyUser }] } });
  const { fields, append, remove } = useFieldArray({ name: 'users', control: form.control });
  const save = useAction((data: Bulk) => api('/admin/users', { method: 'POST', body: data }), keys, 'Đã tạo tài khoản.', close);
  const { errors } = form.formState;
  return <Modal title="Thêm người dùng" onClose={close} wide busy={save.isPending}>
    <form className="form-stack" noValidate onSubmit={form.handleSubmit(data => save.mutate(data))}>
      {fields.map((field, index) => <div className="bulk-user" key={field.id}>
        <div className="section-head"><h3>Tài khoản {index + 1}</h3>{fields.length > 1 && <Button tone="ghost" disabled={save.isPending} aria-label={'Bỏ tài khoản ' + (index + 1)} onClick={() => remove(index)}><Trash2 size={17} /></Button>}</div>
        <div className="bulk-user-fields">
          <Field label="Tên đăng nhập" required error={errors.users?.[index]?.username?.message}><input required autoComplete="off" autoCapitalize="none" spellCheck={false} {...form.register(`users.${index}.username`)} /></Field>
          <Field label="Mật khẩu" required error={errors.users?.[index]?.password?.message}><input required type="password" autoComplete="new-password" {...form.register(`users.${index}.password`)} /></Field>
        </div>
      </div>)}
      <div className="form-actions"><Button tone="neutral" disabled={save.isPending || fields.length >= 25} onClick={() => append({ ...emptyUser })}><Plus size={17} /> Thêm tài khoản</Button><Button type="submit" busy={save.isPending}>Lưu người dùng</Button></div>
    </form>
  </Modal>;
}

function EditUser({ row, own, close }: { row: User; own: boolean; close: () => void }) {
  const [role, setRole] = useState<Role>(row.role);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(false);
  const roleChanged = !own && role !== row.role;
  const save = useAction(() => api('/admin/users/' + row.id, {
    method: 'PATCH', body: { role: roleChanged ? role : undefined, password: password || undefined },
  }), keys, 'Đã cập nhật người dùng.', close);
  if (confirm) return <Confirm title="Xác nhận cập nhật người dùng?" text={row.username} action="Lưu thay đổi" busy={save.isPending}
    error={save.isError ? errorMessage(save.error) : undefined} onClose={() => { save.reset(); setConfirm(false); }} onConfirm={() => save.mutate(undefined)} />;
  return <Modal title="Chỉnh sửa người dùng" onClose={close}>
    <p className="muted">{row.username}</p>
    <form className="form-stack" onSubmit={event => { event.preventDefault(); if (roleChanged || password) setConfirm(true); }}>
      <Field label="Vai trò"><select value={role} disabled={own} onChange={event => setRole(event.target.value as Role)}><option value="USER">Thành viên</option><option value="ADMIN">Quản trị viên</option></select></Field>
      <Field label="Mật khẩu mới" hint="Để trống nếu giữ mật khẩu hiện tại."><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
      <div className="form-actions"><Button tone="neutral" onClick={close}>Hủy</Button><Button type="submit" disabled={!roleChanged && !password}>Tiếp tục</Button></div>
    </form>
  </Modal>;
}

function HistoryDialog({ row, close }: { row: User; close: () => void }) {
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ['user-orders', row.id, page],
    queryFn: ({ signal }) => api<Page<OrderCard>>('/admin/users/' + row.id + '/orders' + params({ page, size: 8 }), { signal }),
  });
  return <Modal title={'Lịch sử của ' + row.username} onClose={close} wide>
    {orders.isPending ? <Loading count={1} /> : orders.isError ? <Failure error={orders.error} retry={() => void orders.refetch()} /> : <>
      {orders.data.items.length ? <div className="data-list">{orders.data.items.map(order => <div className="data-row" key={order.id}>
        <div className="data-primary"><div><strong>{order.restaurant.name}</strong><small>{dateTime(order.createdAt)}</small></div></div>
        <Badge status={order.status} /><Link className="btn btn-neutral btn-small" to={'/orders/' + order.id}>Chi tiết <ArrowRight size={16} /></Link>
      </div>)}</div> : <Empty title="Người dùng chưa có đơn" />}
      <Pager {...orders.data} change={setPage} />
    </>}
  </Modal>;
}
