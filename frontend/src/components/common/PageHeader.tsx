import React from "react";
import { Reveal } from "./Motion";

interface PageHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Large display heading with a small eyebrow label, in the landing page's voice */
export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "",
}) => (
  <header className={`flex flex-wrap items-end justify-between gap-6 ${className}`}>
    <div>
      {eyebrow && (
        <Reveal>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-indigo-700">
            <span className="h-px w-6 bg-indigo-600" aria-hidden />
            {eyebrow}
          </p>
        </Reveal>
      )}
      <Reveal delay={0.05}>
        <h1 className="font-display text-4xl font-medium leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
          {title}
        </h1>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.12}>
          <p className="mt-3 max-w-xl text-lg text-gray-600">{subtitle}</p>
        </Reveal>
      )}
    </div>
    {actions && <Reveal delay={0.18}>{actions}</Reveal>}
  </header>
);
