export default function Button({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        padding: "8px 12px",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}
