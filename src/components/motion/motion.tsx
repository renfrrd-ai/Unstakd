"use client";

import { animate, AnimatePresence, motion, MotionConfig, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps, type Variants } from "motion/react";
import { useEffect, type ReactNode } from "react";

// Small motion vocabulary for server-rendered pages: wrap server markup, pass plain props only.
// Entrances run once on mount; live refreshes (router.refresh) keep the components mounted, so after
// that only what actually changed moves: new items fade in, removed ones fade out, bars and numbers ease.

export const ease = [0.22, 1, 0.36, 1] as const;

// Honours the OS "reduce motion" setting: transforms are dropped, opacity fades stay.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease }}>
      {children}
    </MotionConfig>
  );
}

const tags = { div: motion.div, section: motion.section, aside: motion.aside, ol: motion.ol, ul: motion.ul, li: motion.li } as const;
type Tag = keyof typeof tags;
type Props = { as?: Tag } & HTMLMotionProps<"div">;

// One block fading up into place.
export function Reveal({ as = "div", delay = 0, ...props }: Props & { delay?: number }) {
  const C = tags[as] as typeof motion.div;
  return <C initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay }} {...props} />;
}

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};
// An object, not a variant label: any label prop (exit="…") makes the item stop inheriting
// hidden/show from its Stagger, and it would render visible on the server and then snap.
const leave = { opacity: 0, scale: 0.97, transition: { duration: 0.2 } };

// A list or grid whose StaggerItem children arrive one after another. Children need keys:
// items added later (a live refresh) animate in, removed ones animate out, the rest slide over.
export function Stagger({ as = "div", delay = 0, step = 0.05, children, ...props }: Props & { delay?: number; step?: number; children: ReactNode }) {
  const C = tags[as] as typeof motion.div;
  return (
    <C initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }} {...props}>
      <AnimatePresence>{children}</AnimatePresence>
    </C>
  );
}

export function StaggerItem({ as = "div", lift, ...props }: Props & { lift?: boolean }) {
  const C = tags[as] as typeof motion.div;
  return <C variants={item} exit={leave} layout="position" whileHover={lift ? { y: -3 } : undefined} {...props} />;
}

// A bar that grows to `width` on mount and eases to new widths after that.
export function Grow({ width, className, delay = 0 }: { width: string; className?: string; delay?: number }) {
  return <motion.div className={className} initial={{ width: 0 }} animate={{ width }} transition={{ duration: 0.8, ease, delay }} />;
}

// A number that counts up on mount and eases between values on refresh.
export function Count({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => `${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    if (reduce) return mv.set(value);
    const run = animate(mv, value, { duration: 0.9, ease });
    return () => run.stop();
  }, [mv, value, reduce]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

// Cross-fades its content when `k` changes, e.g. a status pill going Building → Live.
export function Swap({ k, children }: { k: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={k}
        className="inline-flex"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.18, ease }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
