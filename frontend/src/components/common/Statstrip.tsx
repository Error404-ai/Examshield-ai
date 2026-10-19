import React from "react";

interface StatStripProps {
  items: { label: string; value: string | number }[];
}

/** One bordered strip with thin dividers, instead of a row of coloured boxes */
export const StatStrip: React.FC<StatStripProps> = ({ items }) => (
  <dl className="grid grid-cols-2 gap-y-4 rounded-lg border border-gray-200 bg-white sm:grid-cols-4 sm:gap-y-0">
    {items.map((item) => (
      <div key={item.label} className="border-gray-200 px-5 py-4 sm:border-l sm:first:border-l-0">
        <dt className="text-sm text-gray-500">{item.label}</dt>
        <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-gray-900">{item.value}</dd>
      </div>
    ))}
  </dl>
);