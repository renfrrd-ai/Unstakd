"use client";

import type { ComponentProps } from "react";

// Submit button that asks first; for destructive actions like restores and deletes.
export function ConfirmButton({ message, onClick, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
        else onClick?.(e);
      }}
    />
  );
}
