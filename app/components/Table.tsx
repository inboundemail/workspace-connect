import { ReactNode } from "react";

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">{children}</table>
    </div>
  );
}

interface TableHeaderProps {
  children: ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return <thead>{children}</thead>;
}

interface TableHeaderRowProps {
  children: ReactNode;
}

export function TableHeaderRow({ children }: TableHeaderRowProps) {
  return (
    <tr className="border-b border-zinc-200 dark:border-zinc-700">
      {children}
    </tr>
  );
}

interface TableHeaderCellProps {
  children: ReactNode;
  className?: string;
}

export function TableHeaderCell({
  children,
  className = "",
}: TableHeaderCellProps) {
  return (
    <th
      className={`px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 ${className}`}
    >
      {children}
    </th>
  );
}

interface TableBodyProps {
  children: ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return (
    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
      {children}
    </tbody>
  );
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
}

export function TableRow({ children, className = "" }: TableRowProps) {
  return (
    <tr
      className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${className}`}
    >
      {children}
    </tr>
  );
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export function TableCell({ children, className = "" }: TableCellProps) {
  return (
    <td className={`px-4 py-2 ${className}`}>{children}</td>
  );
}

