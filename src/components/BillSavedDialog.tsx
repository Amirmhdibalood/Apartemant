import { useEffect, useState } from 'react';
import type { BillWithUnits } from '../models/types';
import { Dialog } from './Dialog';
import { BillImageActions } from './BillImageActions';
import { IconSuccessCircle } from './Icons';
import type { RenderedBillImage } from '../services/billImage';

interface Props {
  saved: BillWithUnits | null;
  onClose: () => void;
}

/** مرحله موفقیت پس از ذخیره قبض: پیش‌نمایش تصویر قبض + اشتراک‌گذاری / ذخیره در گالری */
export function BillSavedDialog({ saved, onClose }: Props) {
  const [image, setImage] = useState<RenderedBillImage | null>(null);

  useEffect(() => {
    setImage(null);
    if (!saved) return;
    let alive = true;
    import('../services/billImage')
      .then((m) => m.renderBillImage(saved))
      .then((img) => { if (alive) setImage(img); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [saved]);

  return (
    <Dialog open={!!saved} onClose={onClose} labelledBy="saved-title" variant="default">
      <div className="dialog__icon dialog__icon--success"><IconSuccessCircle size={46} /></div>
      <h2 id="saved-title" className="dialog__title">قبض با موفقیت ذخیره شد</h2>
      <p className="dialog__text dialog__text--sm">تصویر قبض را برای گروه ساختمان بفرستید یا در گالری ذخیره کنید.</p>
      <div className="bill-preview">
        {image ? <img src={image.dataUrl} alt="پیش‌نمایش تصویر قبض" /> : <div className="bill-preview__loading">در حال ساخت تصویر…</div>}
      </div>
      {saved && <BillImageActions data={saved} image={image} compact />}
      <button type="button" className="btn btn--muted btn--block saved-close" onClick={onClose}>بستن</button>
    </Dialog>
  );
}
