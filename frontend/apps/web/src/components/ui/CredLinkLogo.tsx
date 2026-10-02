import React from 'react';
import Image from 'next/image';

interface CredLinkLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  subtitle?: string;
}

export function CredLinkLogo({
  size = 'sm',
  showText = false,
  className = '',
  subtitle = 'Life-Stage Digital Identity',
}: CredLinkLogoProps) {
  const sizeMap = {
    xs: { img: 24, box: 'w-6 h-6', title: 'text-sm', sub: 'text-[9px]' },
    sm: { img: 32, box: 'w-8 h-8', title: 'text-base', sub: 'text-xs' },
    md: { img: 44, box: 'w-11 h-11', title: 'text-lg', sub: 'text-xs' },
    lg: { img: 56, box: 'w-14 h-14', title: 'text-2xl', sub: 'text-sm' },
    xl: { img: 72, box: 'w-20 h-20', title: 'text-3xl', sub: 'text-base' },
  };

  const dim = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${dim.box} relative shrink-0 rounded-lg overflow-hidden border border-slate-700/60 shadow-xs bg-[#090D16] transition-transform duration-200 hover:scale-105`}
      >
        <Image
          src="/logo.jpg"
          alt="CredLink Verified Chain Logo"
          width={dim.img}
          height={dim.img}
          className="w-full h-full object-cover"
          priority
        />
      </div>

      {showText && (
        <div className="flex flex-col">
          <span
            className={`${dim.title} font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center leading-none`}
          >
            Cred<span className="text-teal-500 dark:text-teal-400">Link</span>
          </span>
          <span className={`${dim.sub} text-slate-500 dark:text-slate-400 mt-1 font-medium`}>
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
}
