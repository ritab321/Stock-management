import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ProductThumb: React.FC<ProductThumbProps> = ({ src, alt, size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const dim =
    size === 'sm' ? 'h-9 w-9 rounded-md' : size === 'lg' ? 'h-16 w-16 rounded-lg' : 'h-11 w-11 rounded-lg';

  if (!src || failed) {
    return (
      <div
        className={`${dim} flex shrink-0 items-center justify-center border border-slate-200 bg-slate-100 text-slate-400`}
        title={alt}
      >
        <Package className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dim} shrink-0 border border-slate-200 bg-slate-50 object-cover`}
    />
  );
};
