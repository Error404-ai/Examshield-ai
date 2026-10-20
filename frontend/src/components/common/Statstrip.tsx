import React from "react";
import { CountUp, Reveal } from "./Motion";

interface StatStripProps {
  items: { label: string; value: string | number; hint?: string }[];
}

/** One bordered strip: big numbers that count up, an accent line on hover */
export const StatStrip: React.FC<StatStripProps> = ({ items }) => (
  <Reveal delay={0.1}>
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md sm:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`group relative px-6 py-5 ${i > 0 ? "sm:border-l sm:border-gray-200" : ""} ${
            i >= 2 ? "border-t border-gray-200 sm:border-t-0" : ""
          } ${i % 2 === 1 ? "border-l border-gray-200 sm:border-l" : ""}`}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-indigo-600 transition-transform duration-300 group-hover:scale-x-100"
          />
          <dt className="text-sm text-gray-500">{item.label}</dt>
          <dd className="mt-2 font-display text-4xl font-medium tabular-nums text-gray-900">
            <CountUp value={item.value} />
          </dd>
          {item.hint && <p className="mt-1 text-xs text-gray-500">{item.hint}</p>}
        </div>
      ))}
    </dl>
  </Reveal>
);
