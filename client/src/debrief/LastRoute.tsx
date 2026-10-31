import { useState } from 'react';
import type { RouteReview as Review } from '@game/shared';
import { RouteReview } from './RouteReview';

export function LastRoute({ token }: { token: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  async function load() {
    setMessage('Загрузка…');
    try {
      const response = await fetch('/api/me/route', { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      const data = await response.json() as { review: Review | null };
      setReview(data.review); setOpen(Boolean(data.review));
      setMessage(data.review ? '' : 'Сначала завершите прохождение, чтобы увидеть маршрут.');
    } catch { setMessage('Не удалось загрузить маршрут. Попробуйте ещё раз.'); }
  }
  return <div><button className="btn" onClick={() => open ? setOpen(false) : void load()}>{open ? 'Скрыть маршрут' : 'Маршрут последнего прохождения'}</button>
    {message && <p role="status">{message}</p>}{open && review && <RouteReview review={review}/>}</div>;
}
