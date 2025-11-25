// frontend/src/components/ui/button.jsx
export function Button({ className = "", ...props }) {
  return (
    <button
      className={
        "px-3 py-2 rounded-md bg-black text-white hover:bg-neutral-800 transition " +
        className
      }
      {...props}
    />
  );
}
