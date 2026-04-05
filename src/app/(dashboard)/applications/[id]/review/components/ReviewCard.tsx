interface ReviewCardProps {
  variant: 'error' | 'info' | 'neutral';
  children: React.ReactNode;
}

const variantStyles: Record<'error' | 'info' | 'neutral', string> = {
  error: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20',
  info: 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50',
  neutral: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
};

export function ReviewCard({ variant, children }: ReviewCardProps) {
  return (
    <div className={`rounded-lg border p-6 ${variantStyles[variant]}`}>
      {children}
    </div>
  );
}
