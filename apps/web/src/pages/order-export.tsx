import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { OrderSummary } from '@vsf/shared';
import { api, errorMessage } from '../api';
import { receiptData, receiptPng } from '../receipt';
import { Button, Failure, Loading, localInput, Modal, money } from '../ui';

export default function Export({ id, close }: { id: string; close: () => void }) {
  const [snapshot, setSnapshot] = useState<OrderSummary>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const endpoint = '/orders/' + id + '/summary';
  const query = useQuery({ queryKey: ['order-export', id], queryFn: ({ signal }) => api<OrderSummary>(endpoint, { signal }), staleTime: 0, gcTime: 0 });
  const order = snapshot ?? query.data;
  const receipt = order ? receiptData(order) : undefined;
  async function download() {
    if (!receipt) return;
    setBusy(true); setNotice('');
    try {
      const fresh = await api<OrderSummary>(endpoint);
      const next = receiptData(fresh);
      setSnapshot(fresh);
      if (JSON.stringify(receipt) !== JSON.stringify(next)) {
        setNotice('Đơn vừa thay đổi. Hãy kiểm tra bản xem trước mới rồi tải ảnh.');
        return;
      }
      const blob = await receiptPng(next);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'eat-vsf-order-' + localInput(Date.parse(fresh.createdAt)).slice(0, 10).replaceAll('-', '') + '.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice('Đã tạo ảnh đơn hàng.');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <Modal title="Xuất đơn hàng" onClose={close} wide busy={busy}>
    {query.isPending ? <Loading count={1} /> : !receipt ? <Failure error={query.error} retry={() => void query.refetch()} /> : <>
      <div className="export-tools"><Button busy={busy} onClick={() => void download()}><Download size={17} /> Tải ảnh PNG</Button></div>
      {notice && <p className="inline-info" role="status">{notice}</p>}
      <div className="receipt-preview">
        <h2>Đơn đặt đồ ăn trưa</h2>
        <p>{receipt.restaurant}<br />{receipt.date}</p>
        {receipt.note && <p className="receipt-note">Ghi chú: {receipt.note}</p>}
        <table className="receipt-items">
          <thead><tr><th scope="col">Món ăn</th><th scope="col">Số lượng</th></tr></thead>
          <tbody>{receipt.items.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.quantity}</td></tr>)}</tbody>
        </table>
        <dl className="receipt-total">
          <dt>Tổng số lượng</dt><dd>{receipt.quantity}</dd>
          <dt>Tổng tiền</dt><dd>{money(receipt.total)}</dd>
        </dl>
      </div>
    </>}
  </Modal>;
}
