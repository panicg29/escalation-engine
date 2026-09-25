import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * @param {...(string|object|Array)} classes - Classes to merge
 * @returns {string} Merged class string
 */
export function cn(...classes) {
  return twMerge(clsx(...classes));
}