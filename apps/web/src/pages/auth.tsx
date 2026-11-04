import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { credentialsSchema, type User } from '@vsf/shared';
import { api, client, errorMessage, sessionKey, useSession } from '../api';
import { Button, Failure, Field, Loading, useTitle } from '../ui';

type Fields = z.input<typeof credentialsSchema>;

export default function Auth() {
  useTitle('Đăng nhập');
  const session = useSession();
  const [search] = useSearchParams();
  const [show, setShow] = useState(false);
  const [failure, setFailure] = useState('');
  const next = search.get('next') ?? '';
  const safeNext = /^\/(?:orders(?:\/[a-zA-Z0-9-]+)?|dashboard|restaurants(?:\/[a-zA-Z0-9-]+\/menu)?|admin(?:\/[a-zA-Z0-9/-]+)?)(?:\?[^#]*)?$/.test(next) ? next : '';
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Fields>({
    resolver: zodResolver(credentialsSchema), defaultValues: { username: '', password: '' },
  });
  async function submit(values: Fields) {
    setFailure('');
    try {
      const user = await api<User>('/auth/login', { method: 'POST', body: values });
      await client.cancelQueries();
      client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
      client.setQueryData(sessionKey, user);
      toast.success('Đăng nhập thành công.');
    } catch (error) { setFailure(errorMessage(error)); }
  }

  if (session.data) return <Navigate replace to={safeNext || (session.data.role === 'ADMIN' ? '/admin/restaurants' : '/dashboard')} />;
  return <main className="auth-shell">
    <div className="panel auth-form">
      <h1 id="login-title">Đăng nhập</h1>
      {session.isPending ? <Loading count={1} /> : session.isError ? <Failure error={session.error} retry={() => void session.refetch()} /> :
        <form className="form-stack" aria-labelledby="login-title" onSubmit={handleSubmit(submit)} noValidate>
          <Field label="Tên đăng nhập" required error={errors.username?.message}>
            <input required autoComplete="username" autoCapitalize="none" spellCheck={false} {...register('username')} />
          </Field>
          <Field label="Mật khẩu" required error={errors.password?.message}>
            <span className="password-field">
              <input required type={show ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
              <button type="button" className="show-password" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </Field>
          {failure && <div className="inline-error" role="alert">{failure}</div>}
          <Button type="submit" busy={isSubmitting}>Đăng nhập</Button>
        </form>}
    </div>
  </main>;
}
